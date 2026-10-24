import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const PRODUCT_ID = "aniquotes_premium_monthly";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function googleAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Google Play verification is not configured");
  const account = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience(account.token_uri || "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error("Google OAuth token request failed");
  const data = await response.json();
  if (typeof data.access_token !== "string") throw new Error("Google OAuth response was invalid");
  return data.access_token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || "com.animequotes.wallpaper";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server is not configured" }, 503);

  let body: { action?: string; installation_id?: string; product_id?: string; purchase_token?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const installationId = body.installation_id || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)) {
    return json({ error: "A valid installation ID is required" }, 400);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.action === "status") {
    const { data, error } = await supabase.from("play_subscription_entitlements")
      .select("product_id,subscription_state,expires_at")
      .eq("installation_id", installationId)
      .eq("product_id", PRODUCT_ID);
    if (error) return json({ error: "Could not read subscription status" }, 500);
    const now = Date.now();
    const active = (data || []).some((row) => row.expires_at && Date.parse(row.expires_at) > now &&
      ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(row.subscription_state));
    return json({ premium: active });
  }

  if (body.action !== "verify") return json({ error: "Unsupported action" }, 400);
  const productId = body.product_id || "";
  const purchaseToken = body.purchase_token || "";
  if (productId !== PRODUCT_ID || purchaseToken.length < 20 || purchaseToken.length > 5000) {
    return json({ error: "Invalid product or purchase token" }, 400);
  }

  try {
    const accessToken = await googleAccessToken();
    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const response = await fetch(verifyUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return json({ premium: false, error: "Google Play could not verify this purchase" }, 200);
    const purchase = await response.json();
    const lineItems = Array.isArray(purchase.lineItems) ? purchase.lineItems : [];
    const matching = lineItems.find((line: { productId?: string }) => line.productId === PRODUCT_ID);
    if (!matching) return json({ premium: false }, 200);
    const expiresAt = typeof matching.expiryTime === "string" ? matching.expiryTime : null;
    const state = String(purchase.subscriptionState || "UNKNOWN");
    const entitledStates = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"];
    const active = !!expiresAt && Date.parse(expiresAt) > Date.now() && entitledStates.includes(state);
    const tokenHash = await sha256(purchaseToken);
    const { error } = await supabase.from("play_subscription_entitlements").upsert({
      purchase_token_hash: tokenHash,
      installation_id: installationId,
      product_id: PRODUCT_ID,
      package_name: packageName,
      subscription_state: state,
      expires_at: expiresAt,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "purchase_token_hash" });
    if (error) return json({ error: "Purchase was verified but entitlement storage failed" }, 500);
    return json({ premium: active, expires_at: expiresAt, subscription_state: state });
  } catch (error) {
    console.error("Play verification error", error);
    return json({ error: "Google Play verification is not configured correctly" }, 503);
  }
});
