# Phase 3 — Cloud Catalog and Static Wallpaper Setting

## Delivered in source
- Public Edge Function returns only published, commercially cleared, native-4K wallpapers.
- Storage remains private; the Edge Function issues short-lived signed URLs for eligible media.
- Aggregate rating and confirmed-set statistics are read only by the server-side service role.
- Android catalog repository fetches the Edge Function using the Supabase URL and anon key from ignored `android/local.properties`.
- Android supports selecting home screen, lock screen, or both, then downloading the signed HTTPS image into memory and applying it with `WallpaperManager`.
- Image fetch has connection/read timeouts, a 50 MB download cap, image decode validation and a pixel-count guard.
- Signed URL is refreshed before applying a static wallpaper.

## Configure
1. Apply migrations 001 through 004 in order.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Supabase Edge Function secrets (the platform normally supplies these automatically).
3. Deploy `supabase/functions/wallpaper-catalog`.
4. Add these properties to `android/local.properties`:
   - `SUPABASE_URL=https://YOUR_PROJECT.supabase.co`
   - `SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY`
5. Upload and publish original or properly licensed native-4K assets in the admin panel.
6. Open the Android project in Android Studio, sync Gradle, then test applying a static wallpaper on a real device.

## Current limitations
- The cloud catalog is fetched on app launch. If a signed URL expires while the app remains open, the user may need to reopen the app to refresh the catalog.
- Sample entries have no real image URLs; the Set action is intentionally unavailable for them.
- Live wallpaper service/playback, real subscription verification, server-side rating writes, and server-side set-event writes are still pending.
- The full Android build was not verified in this environment because Gradle/Android SDK are unavailable.
