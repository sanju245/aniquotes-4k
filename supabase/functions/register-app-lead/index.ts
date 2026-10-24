// Server-side registration endpoint. Deploy with Supabase CLI after setting secrets.
// Keep SUPABASE_SERVICE_ROLE_KEY server-side only; never put it in Android or web code.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Replace with an allowlist before production if using a web client.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Registration service is not configured" }, 503);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const sourceApp = typeof body.source_app === "string" ? body.source_app.trim() : "anime_quotes_wallpaper";
  const privacyVersion = typeof body.privacy_notice_version === "string" ? body.privacy_notice_version.trim() : "2026-10-23-v1";
  const marketingOptIn = body.cross_app_marketing_opt_in === true;
  const brand = typeof body.device_brand === "string" ? body.device_brand.trim().slice(0, 100) : null;
  const model = typeof body.device_model === "string" ? body.device_model.trim().slice(0, 160) : null;
  const width = Number.isInteger(body.screen_width_px) ? Number(body.screen_width_px) : null;
  const height = Number.isInteger(body.screen_height_px) ? Number(body.screen_height_px) : null;
  const characters = Array.isArray(body.favorite_character_names)
    ? body.favorite_character_names.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean).slice(0, 30)
    : [];

  if (fullName.length < 1 || fullName.length > 120) return json({ error: "Name must be 1–120 characters" }, 400);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(sourceApp)) return json({ error: "Invalid source app" }, 400);
  if (!privacyVersion || privacyVersion.length > 80) return json({ error: "Invalid privacy notice version" }, 400);
  if (width !== null && (width < 1 || width > 20000)) return json({ error: "Invalid screen width" }, 400);
  if (height !== null && (height < 1 || height > 30000)) return json({ error: "Invalid screen height" }, 400);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await supabase
    .from("app_leads").select("id,cross_app_marketing_opt_in,cross_app_marketing_consent_at,marketing_opt_out_at")
    .eq("source_app", sourceApp).eq("email", email).maybeSingle();
  if (lookupError) return json({ error: "Could not save registration" }, 500);

  // Never silently opt an existing person in or re-subscribe someone who opted out.
  const keepExistingOptIn = Boolean(existing?.cross_app_marketing_opt_in) && !existing?.marketing_opt_out_at;
  const finalOptIn = marketingOptIn || keepExistingOptIn;
  const row = {
    full_name: fullName,
    email,
    source_app: sourceApp,
    privacy_notice_version: privacyVersion,
    privacy_notice_acknowledged_at: now,
    cross_app_marketing_opt_in: finalOptIn,
    cross_app_marketing_consent_at: marketingOptIn ? now : (existing?.cross_app_marketing_consent_at ?? null),
    marketing_opt_out_at: marketingOptIn ? null : (existing?.marketing_opt_out_at ?? null),
    device_brand: brand,
    device_model: model,
    screen_width_px: width,
    screen_height_px: height,
    favorite_character_names: characters,
    updated_at: now,
  };
  const { error: saveError } = await supabase.from("app_leads").upsert(row, { onConflict: "source_app,email" });
  if (saveError) return json({ error: "Could not save registration" }, 500);

  // Generic response avoids exposing whether an email was already registered.
  return json({ ok: true, message: "Registration saved" }, 201);
});
