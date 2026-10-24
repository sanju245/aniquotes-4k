"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Wallpaper = {
  id: string;
  title: string;
  character_name: string | null;
  quote_text: string | null;
  media_type: "static" | "live";
  content_section: "normal" | "quote" | "live";
  status: "draft" | "published" | "archived" | "scheduled";
  created_at: string;
  storage_path: string;
  rights_status: string;
  commercial_use_allowed: boolean;
};

export default function AdminHome() {
  const supabase = useMemo(() => {
    try { return createSupabaseBrowserClient(); } catch { return null; }
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [items, setItems] = useState<Wallpaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [character, setCharacter] = useState("");
  const [quote, setQuote] = useState("");
  const [mediaType, setMediaType] = useState<"static" | "live">("static");
  const [contentSection, setContentSection] = useState<"normal" | "quote" | "live">("normal");
  const [file, setFile] = useState<File | null>(null);
  const [rightsStatus, setRightsStatus] = useState<"unreviewed" | "original_created" | "licensed_for_commercial_use" | "public_domain_verified" | "permission_required" | "do_not_distribute">("unreviewed");
  const [commercialUseAllowed, setCommercialUseAllowed] = useState(false);
  const [creator, setCreator] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseName, setLicenseName] = useState("");
  const [licenseReference, setLicenseReference] = useState("");

  async function refresh() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSessionEmail(null);
      setItems([]);
      setLoading(false);
      return;
    }
    const { data: admin, error: adminError } = await supabase
      .from("app_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (adminError || !admin) {
      setSessionEmail(null);
      setError("This account is not registered as the owner admin. Add its user UUID to public.app_admins using the Supabase setup guide.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    setSessionEmail(auth.user.email ?? "Owner");
    const { data, error: listError } = await supabase
      .from("wallpapers")
      .select("id,title,character_name,quote_text,media_type,content_section,status,created_at,storage_path,rights_status,commercial_use_allowed")
      .order("created_at", { ascending: false });
    if (listError) setError(listError.message);
    else setItems((data ?? []) as Wallpaper[]);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // Session changes are also reflected by the explicit sign-in/out actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true); setError(""); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else await refresh();
    setLoading(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSessionEmail(null); setItems([]); setMessage("Signed out.");
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !file) { setError("Choose a file first."); return; }
    if (contentSection === "quote" && !quote.trim()) { setError("Quote wallpapers require quotation text."); return; }
    if (mediaType === "live" && contentSection !== "live") { setError("Live media must be published to the Live section."); return; }
    const allowed = mediaType === "static"
      ? ["image/jpeg", "image/png", "image/webp", "image/avif"]
      : ["video/mp4", "video/webm", "image/gif"];
    if (!allowed.includes(file.type)) {
      setError(mediaType === "static" ? "Static wallpapers must be JPG, PNG, WEBP or AVIF." : "Live wallpaper assets must be MP4, WEBM or GIF in this starter.");
      return;
    }
    if (file.size > 80 * 1024 * 1024) { setError("File is over the current 80 MB upload limit."); return; }
    setLoading(true); setError(""); setMessage("");
    let sourceWidth: number;
    let sourceHeight: number;
    try {
      if (file.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(file);
        sourceWidth = bitmap.width; sourceHeight = bitmap.height; bitmap.close();
      } else {
        const objectUrl = URL.createObjectURL(file);
        try {
          const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
            video.onerror = () => reject(new Error("Could not read video dimensions"));
            video.src = objectUrl;
          });
          sourceWidth = dimensions.width; sourceHeight = dimensions.height;
        } finally { URL.revokeObjectURL(objectUrl); }
      }
    } catch {
      setError("Could not read the source dimensions. Please use a supported image or video file."); setLoading(false); return;
    }
    const isNative4k = (sourceWidth >= 2160 && sourceHeight >= 3840) || (sourceWidth >= 3840 && sourceHeight >= 2160);
    if (!isNative4k) {
      setError(`This project accepts native 4K source media only. Detected ${sourceWidth} × ${sourceHeight}px. Use portrait 2160 × 3840 or landscape 3840 × 2160 (or larger).`);
      setLoading(false); return;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${crypto.randomUUID()}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from("wallpaper-assets").upload(storagePath, file, { upsert: false, contentType: file.type });
    if (uploadError) { setError(uploadError.message); setLoading(false); return; }
    const { error: insertError } = await supabase.from("wallpapers").insert({
      title, character_name: character || null, quote_text: quote || null,
      media_type: mediaType, content_section: mediaType === "live" ? "live" : contentSection,
      source_width_px: sourceWidth, source_height_px: sourceHeight,
      is_native_4k: isNative4k,
      status: "draft", storage_path: storagePath,
      mime_type: file.type, file_size_bytes: file.size,
      rights_status: rightsStatus, commercial_use_allowed: commercialUseAllowed,
      artwork_creator: creator || null, artwork_source_url: sourceUrl || null,
      license_name: licenseName || null, license_reference: licenseReference || null
    });
    if (insertError) {
      setError(`Metadata save failed: ${insertError.message}. The uploaded file may remain in storage and can be cleaned up later.`);
    } else {
      setMessage("Uploaded as a draft. Add and verify rights metadata before publishing.");
      setTitle(""); setCharacter(""); setQuote(""); setFile(null);
      setContentSection("normal");
      setCreator(""); setSourceUrl(""); setLicenseName(""); setLicenseReference("");
      setRightsStatus("unreviewed"); setCommercialUseAllowed(false);
      const form = document.getElementById("upload-form") as HTMLFormElement | null;
      form?.reset();
      await refresh();
    }
    setLoading(false);
  }

  async function setStatus(item: Wallpaper, status: Wallpaper["status"]) {
    if (!supabase) return;
    setLoading(true); setError(""); setMessage("");
    const { error } = await supabase.from("wallpapers").update({ status }).eq("id", item.id);
    if (error) setError(error.message);
    else { setMessage(`Updated “${item.title}” to ${status}.`); await refresh(); }
    setLoading(false);
  }

  if (!supabase) {
    return <main className="shell"><header className="topbar"><div><div className="brand">ANIME QUOTES / ADMIN</div><p className="subtle">Owner control center</p></div></header><section className="panel"><h1>Connect Supabase</h1><p className="subtle">Copy admin/.env.example to admin/.env.local and set your Supabase project URL and anon/publishable key, then restart the dev server.</p></section></main>;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div><div className="brand">ANIME QUOTES / ADMIN</div><p className="subtle">Wallpaper catalog · Owner access only</p></div>
        {sessionEmail && <div className="row"><span className="pill">{sessionEmail}</span><a className="btn secondary" href="/tasks" style={{ textDecoration: "none" }}>Production manager</a><button className="btn secondary" onClick={signOut}>Sign out</button></div>}
      </header>

      {error && <p className="notice error">{error}</p>}
      {message && <p className="notice">{message}</p>}

      {!sessionEmail ? (
        <section className="panel" style={{ maxWidth: 480, margin: "30px auto" }}>
          <h1>Owner sign in</h1>
          <p className="subtle">Only the user explicitly registered in <code>app_admins</code> can manage the catalog.</p>
          <form className="form" onSubmit={signIn}>
            <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            <button className="btn" disabled={loading}>{loading ? "Please wait…" : "Sign in"}</button>
          </form>
          <p className="subtle">Create the first owner account through Supabase Auth, then register its UUID using the SQL setup guide. Public sign-up is not provided here.</p>
        </section>
      ) : (
        <>
          <section className="grid">
            <div className="panel"><div className="subtle">Total catalog items</div><div className="metric">{items.length}</div><div className="subtle">Static images and live assets</div></div>
            <div className="panel"><div className="subtle">Published</div><div className="metric">{items.filter(x => x.status === "published").length}</div><div className="subtle">Visible to app clients</div></div>
            <div className="panel"><div className="subtle">Drafts</div><div className="metric">{items.filter(x => x.status === "draft").length}</div><div className="subtle">Not yet available to users</div></div>
          </section>

          <section className="panel" style={{ marginTop: 18 }}>
            <h2>Upload wallpaper</h2>
            <p className="subtle">Files are uploaded privately. New items start as drafts until rights and metadata are reviewed.</p>
            <form id="upload-form" className="form" onSubmit={upload}>
              <div className="grid">
                <label>Wallpaper title<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} /></label>
                <label>Character name (optional)<input value={character} onChange={e => setCharacter(e.target.value)} maxLength={120} /></label>
              </div>
              <label>Quote (optional)<textarea value={quote} onChange={e => setQuote(e.target.value)} maxLength={1000} /></label>
              <label>Content section<select value={contentSection} onChange={e => setContentSection(e.target.value as "normal" | "quote" | "live")}><option value="normal">Normal anime wallpaper</option><option value="quote">Wallpaper with quotation</option><option value="live">Live wallpaper</option></select></label>
              <label>Media type<select value={mediaType} onChange={e => { const value = e.target.value as "static" | "live"; setMediaType(value); if (value === "live") setContentSection("live"); else if (contentSection === "live") setContentSection("normal"); }}><option value="static">Static image</option><option value="live">Live wallpaper asset (video/animation)</option></select></label>
              <p className="subtle">The upload form reads the actual source dimensions and rejects media below native 4K: portrait 2160 × 3840 or landscape 3840 × 2160 (or larger). Do not upscale lower-resolution art and label it native 4K.</p>
              <label>Artwork file<input type="file" accept={mediaType === "static" ? "image/jpeg,image/png,image/webp,image/avif" : "video/mp4,video/webm,image/gif"} onChange={e => setFile(e.target.files?.[0] ?? null)} required /></label>
              <div className="grid">
                <label>Artwork creator<input value={creator} onChange={e => setCreator(e.target.value)} maxLength={200} /></label>
                <label>Source URL<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" /></label>
              </div>
              <div className="grid">
                <label>License name<input value={licenseName} onChange={e => setLicenseName(e.target.value)} maxLength={200} placeholder="e.g. commercial license" /></label>
                <label>License / contract reference<input value={licenseReference} onChange={e => setLicenseReference(e.target.value)} maxLength={300} /></label>
              </div>
              <label>Rights review status<select value={rightsStatus} onChange={e => setRightsStatus(e.target.value as typeof rightsStatus)}>
                <option value="unreviewed">Unreviewed — keep as draft</option>
                <option value="original_created">Original artwork created</option>
                <option value="licensed_for_commercial_use">Licensed for commercial use</option>
                <option value="public_domain_verified">Public domain verified</option>
                <option value="permission_required">Permission required</option>
                <option value="do_not_distribute">Do not distribute</option>
              </select></label>
              <label style={{ display: "flex", gridTemplateColumns: "auto 1fr", alignItems: "center", flexDirection: "row" }}>
                <input type="checkbox" checked={commercialUseAllowed} onChange={e => setCommercialUseAllowed(e.target.checked)} style={{ width: 18 }} />
                I have verified commercial-use and app-distribution rights for this asset
              </label>
              <button className="btn" disabled={loading}>{loading ? "Working…" : "Upload as draft"}</button>
            </form>
          </section>

          <section className="panel" style={{ marginTop: 18 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><h2>Wallpaper catalog</h2><button className="btn secondary" onClick={() => void refresh()} disabled={loading}>Refresh</button></div>
            {loading && <p className="subtle">Loading…</p>}
            {!loading && items.length === 0 && <p className="subtle">No wallpapers yet. Upload the first one above.</p>}
            {items.length > 0 && <div className="table-wrap"><table><thead><tr><th>Title</th><th>Section / media</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
              {items.map(item => <tr key={item.id}><td><strong>{item.title}</strong><br/><span className="subtle">{item.character_name ?? "No character set"}</span><br/><span className="subtle">Rights: {item.rights_status.replaceAll("_", " ")}{item.commercial_use_allowed ? " · commercial use checked" : " · commercial use not checked"}</span></td><td>{item.content_section.replaceAll("_", " ")} / {item.media_type}</td><td><span className="pill">{item.status}</span></td><td>{new Date(item.created_at).toLocaleDateString()}</td><td><div className="row">{item.status !== "published" && <button className="btn" disabled={loading || !["original_created", "licensed_for_commercial_use", "public_domain_verified"].includes(item.rights_status) || !item.commercial_use_allowed} onClick={() => void setStatus(item, "published")}>Publish</button>}{item.status === "published" && <button className="btn secondary" disabled={loading} onClick={() => void setStatus(item, "draft")}>Unpublish</button>}<button className="btn secondary" disabled={loading} onClick={() => void setStatus(item, "archived")}>Archive</button></div></td></tr>)}
            </tbody></table></div>}
          </section>
          <p className="subtle" style={{ marginTop: 20 }}>Admin foundation: full editing, scheduled publishing, asset preview, deletion, analytics and secure subscription/lead management remain follow-ups. Live asset upload is not yet an Android live-wallpaper playback implementation.</p>
        </>
      )}
    </main>
  );
}
