import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer/mod.ts";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlDecodeToString(input: string): string {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = decodeBase64(b64);
  return new TextDecoder().decode(bytes);
}

function getJwtSubFromAuthHeader(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payloadJson = base64UrlDecodeToString(parts[1]);
    const payload = JSON.parse(payloadJson);
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

function getAbsenceLabel(cat: string, mass: string) {
  const catAbsent = cat === "absent";
  const massAbsent = mass === "absent";
  if (catAbsent && massAbsent) return "ni a catequesis ni a misa";
  if (catAbsent) return "catequesis";
  return "misa";
}

function buildBody(studentName: string, absenceLabel: string) {
  return `Estimados padres de ${studentName},
Queríamos informarles de que hoy su hijo/a no ha asistido a ${absenceLabel}.

Muchas gracias de antemano por su atención,

Un saludo.

Sus catequistas.

NOTA: NO RESPONDA ESTE CORREO ELECTRÓNICO. HA SIDO ENVIADO DE MANERA AUTOMÁTICA. PARA DUDAS O CONSULTAS, CONTACTE AL SIGUIENTE CORREO ELECTRÓNICO: preconfirmacion@sanpas.es`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    const callerId = getJwtSubFromAuthHeader(authHeader);
    if (!callerId) return jsonResponse({ ok: false, error: "invalid_or_missing_jwt" }, 401);

    const { date, student_ids } = await req.json().catch(() => ({} as any));
    if (!date || !Array.isArray(student_ids)) {
      return jsonResponse({ ok: false, error: "missing_date_or_student_ids" }, 400);
    }

    // Salvaguarda: evitar envíos masivos accidentales por bug del frontend
    // Ajusta el límite si quieres (por ejemplo 60-120)
    if (student_ids.length > 30) {
      return jsonResponse({ ok: false, error: "too_many_recipients", max: 80, got: student_ids.length }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Rol caller
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (pErr || !profile) {
      return jsonResponse({ ok: false, error: "profile_not_found", details: pErr?.message ?? null }, 403);
    }
    if (profile.role !== "coordinator" && profile.role !== "catechist") {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    // 2) SMTP config
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return jsonResponse({ ok: false, error: "smtp_not_configured" }, 500);
    }

    // 3) Leer SOLO esos alumnos (por seguridad)
    const { data: students, error: stErr } = await admin
      .from("students")
      .select("id,name,parent_email")
      .in("id", student_ids);

    if (stErr || !students) {
      return jsonResponse({ ok: false, error: "students_read_failed", details: stErr?.message ?? null }, 500);
    }

    // OJO: si el frontend mandó IDs, pero en BD no existen (o son de otro sitio), aquí se filtra solo a los reales.
    const withEmail = students.filter((s: any) => Boolean(s.parent_email));
    const skipped_no_email = (students.length - withEmail.length);

    // 4) Leer asistencia del día para esos alumnos
    const ids = withEmail.map((s: any) => s.id);
    const attendanceByStudent = new Map<string, { catechism: string; mass: string }>();

    if (ids.length > 0) {
      const { data: rows, error: aErr } = await admin
        .from("student_attendance")
        .select("student_id,catechism,mass")
        .eq("date", date)
        .in("student_id", ids);

      if (aErr) {
        return jsonResponse({ ok: false, error: "attendance_read_failed", details: aErr.message }, 500);
      }

      for (const r of rows ?? []) {
        attendanceByStudent.set(r.student_id, {
          catechism: r.catechism ?? "absent",
          mass: r.mass ?? "absent",
        });
      }
    }

    // 5) Enviar 1 a 1 (solo si falta a algo)
    let sent = 0;
    let skipped_present_both = 0;
    let errors = 0;

    const smtp = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    try {
      for (const s of withEmail) {
        const rec = attendanceByStudent.get(s.id) ?? { catechism: "absent", mass: "absent" };

        const shouldSend = (rec.catechism === "absent" || rec.mass === "absent");
        if (!shouldSend) {
          skipped_present_both++;
          continue;
        }

        const absenceLabel = getAbsenceLabel(rec.catechism, rec.mass);
        const subject = `Ausencia registrada - ${s.name} - ${date}`;
        const text = buildBody(s.name, absenceLabel);

        try {
          await smtp.send({
            from: smtpFrom,
            to: s.parent_email,
            subject,
            content: text,
          });
          sent++;
        } catch (e) {
          console.log("SMTP send error for student", s.id, String(e));
          errors++;
        }
      }
    } finally {
      await smtp.close();
    }

    return jsonResponse({
      ok: true,
      sent,
      skipped_no_email,
      skipped_present_both,
      errors,
      total_students_in_payload: student_ids.length,
      total_students_found: students.length,
    });
  } catch (e) {
    console.log("Unhandled error:", e);
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});