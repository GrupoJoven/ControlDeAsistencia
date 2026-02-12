// supabase/functions/create-catechist/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  email: string;
  password: string;
  name: string;
  birth_date?: string | null;
  group_ids?: string[];
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Faltan variables de entorno de Supabase" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    // 1) Validar que quien llama está logueado y es coordinator
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado (sin token)" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "No autorizado (token inválido)" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    const callerId = userData.user.id;

    const { data: profile, error: profErr } = await caller
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: "No se pudo leer el perfil del caller" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    if (profile.role !== "coordinator") {
      return new Response(JSON.stringify({ error: "Prohibido: solo coordinator" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    // 2) Crear usuario con Admin API (service role)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });


    const body = (await req.json()) as Body;

    if (!body?.email || !body?.password || !body?.name) {
      return new Response(JSON.stringify({ error: "Faltan email/password/name" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { name: body.name, role: "catechist" },
    });

    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "No se pudo crear" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    const newUserId = created.user.id;

    const groupIds = Array.isArray(body.group_ids) ? body.group_ids.filter(Boolean) : [];
    const uniqueGroupIds = Array.from(new Set(groupIds));

    if (uniqueGroupIds.length > 0) {
      const rows = uniqueGroupIds.map(group_id => ({
        group_id,
        profile_id: newUserId,
      }));

      // Si tu tabla tiene PK (group_id, profile_id), evita errores si hay duplicados:
      const { error: linkErr } = await admin
        .from("group_catechist")
        .upsert(rows, { onConflict: "group_id,profile_id" });

      if (linkErr) {
        // Usuario creado, pero devolvemos warning
        return new Response(
          JSON.stringify({ ok: true, userId: newUserId, warn: "Grupo(s) no asignados: " + linkErr.message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }


    // 3) Completar profiles (tu trigger probablemente ya creó la fila; esto la actualiza)
    // Ajusta los campos a tu esquema real. Si no tienes birth_date o email en profiles, quítalos.
    const updatePayload: Record<string, any> = {
      name: body.name,
      role: "catechist",
      email: body.email,               
      birth_date: body.birth_date ?? null,
    };


    const { error: updErr } = await admin.from("profiles").update(updatePayload).eq("id", newUserId);
    if (updErr) {
      // El usuario ya existe en auth, devolvemos ok con warning
      return new Response(JSON.stringify({ ok: true, userId: newUserId, warn: updErr.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
    }

    return new Response(JSON.stringify({ ok: true, userId: newUserId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, });
  }
});
