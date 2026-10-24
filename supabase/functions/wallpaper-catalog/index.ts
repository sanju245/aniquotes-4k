import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const allowedRights = new Set([
  "original_created",
  "licensed_for_commercial_use",
  "public_domain_verified",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Catalog service is not configured" }, 503);
  }

  // The service-role key stays in Supabase Edge Function secrets only.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: wallpapers, error } = await supabase
    .from("wallpapers")
    .select("id,title,character_name,series_name,quote_text,media_type,content_section,storage_path,mime_type,source_width_px,source_height_px,is_native_4k,published_at,rights_status,commercial_use_allowed")
    .eq("status", "published")
    .eq("commercial_use_allowed", true)
    .eq("is_native_4k", true)
    .in("rights_status", [...allowedRights])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) return json({ error: "Could not load published catalog" }, 500);
  if (!wallpapers?.length) return json({ items: [], generated_at: new Date().toISOString() });

  const ids = wallpapers.map((wallpaper) => wallpaper.id);
  const { data: statsRows } = await supabase
    .from("wallpaper_catalog_stats")
    .select("wallpaper_id,rating_count,average_rating,confirmed_set_count,bayesian_rating")
    .in("wallpaper_id", ids);
  const stats = new Map((statsRows ?? []).map((row) => [row.wallpaper_id, row]));

  // Short-lived signed URLs let the bucket remain private. Limit each request to
  // 100 items to constrain signing work; the service-role key and raw paths are never returned.
  const items = await Promise.all(wallpapers.map(async (wallpaper) => {
    const { data: signed, error: signedError } = await supabase.storage
      .from("wallpaper-assets")
      .createSignedUrl(wallpaper.storage_path, 60 * 60);
    if (signedError || !signed?.signedUrl) return null;
    const stat = stats.get(wallpaper.id);
    const isLive = wallpaper.media_type === "live";
    return {
      id: wallpaper.id,
      title: wallpaper.title,
      character_name: wallpaper.character_name,
      series_name: wallpaper.series_name,
      quote_text: wallpaper.quote_text,
      media_type: wallpaper.media_type,
      content_section: wallpaper.content_section,
      source_width_px: wallpaper.source_width_px,
      source_height_px: wallpaper.source_height_px,
      is_native_4k: wallpaper.is_native_4k,
      rights_status: wallpaper.rights_status,
      published_at: wallpaper.published_at,
      image_url: isLive ? null : signed.signedUrl,
      media_url: signed.signedUrl,
      average_rating: Number(stat?.average_rating ?? 0),
      rating_count: Number(stat?.rating_count ?? 0),
      set_count: Number(stat?.confirmed_set_count ?? 0),
      bayesian_rating: Number(stat?.bayesian_rating ?? 0),
    };
  }));

  return json({
    items: items.filter((item) => item !== null),
    generated_at: new Date().toISOString(),
    signed_url_ttl_seconds: 3600,
  });
});
