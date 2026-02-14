// supabase/functions/send-absence-email/index.ts
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

function buildBody(studentName: string, absenceLabel: string) {
  return `Estimados padres de ${studentName},
Queríamos informarles de que hoy su hijo/a no ha asistido a ${absenceLabel}.

Muchas gracias de antemano por su atención,

Un saludo.

Sus catequistas.

NOTA: NO RESPONDA ESTE CORREO ELECTRÓNICO. HA SIDO ENVIADO DE MANERA AUTOMÁTICA. PARA DUDAS O CONSULTAS, CONTACTE AL SIGUIENTE CORREO ELECTRÓNICO: preconfirmacion@sanpas.es`;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Solo POST
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    // Debug mínimo (no imprime token completo)
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    console.log("AUTH present?", Boolean(authHeader));
    console.log("AUTH bearer?", authHeader.startsWith("Bearer "));
    console.log("AUTH token length", token.length);

    // Extraer userId del JWT
    const userId = getJwtSubFromAuthHeader(authHeader);
    if (!userId) {
      return jsonResponse({ ok: false, error: "invalid_or_missing_jwt" }, 401);
    }

    const { student_id, date, absence_label } = await req.json().catch(() => ({} as any));
    if (!student_id || !date || !absence_label) {
      return jsonResponse({ ok: false, error: "missing_fields" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Comprobar rol (catechist o coordinator)
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (pErr || !profile) {
      return jsonResponse(
        { ok: false, error: "profile_not_found", details: pErr?.message ?? null },
        403
      );
    }

    const role = profile.role;
    if (role !== "coordinator" && role !== "catechist") {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    // 2) Leer student + email padres
    const { data: st, error: sErr } = await admin
      .from("students")
      .select("name,parent_email")
      .eq("id", student_id)
      .single();

    if (sErr || !st?.parent_email) {
      return jsonResponse({ ok: false, error: "no_parent_email" }, 400);
    }

    const subject = `Ausencia registrada - ${st.name} - ${date}`;
    const text = buildBody(st.name, absence_label);

    // 3) Enviar por SMTP (Gmail Workspace) - puerto 465 (TLS)
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return jsonResponse({ ok: false, error: "smtp_not_configured" }, 500);
    }

    const smtp = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    try {
      await smtp.send({
        from: smtpFrom,
        to: st.parent_email,
        subject,
        content: text,
      });
    } finally {
      await smtp.close();
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.log("Unhandled error:", e);
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});