# AniQuotes 4K

Monorepo for a free-first Android anime wallpaper app, owner-only web admin dashboard, and Supabase backend.

## Architecture
- `android/` — Kotlin + Jetpack Compose Android app
- `admin/` — Next.js admin panel for a single owner account
- `supabase/` — database migration, row-level security, storage policies, and setup notes
- `docs/` — roadmap, content-rights checklist, and lead-capture/privacy requirements

## Project status
This repository contains the first interactive UI implementation and admin/backend scaffolding. It is not yet production-ready. No deployment is configured, and no live Supabase project is connected.

## Prerequisites
- Android Studio with Android SDK 35 and JDK 17
- Node.js 20+ and npm
- A Supabase project for admin authentication, database, and media storage

## Run the admin app
```bash
cd admin
cp .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```
Open http://localhost:3000. Create the owner account in Supabase Auth, then add that user's UUID to `public.app_admins` using the SQL instructions in `supabase/README.md`.

## Open Android
Open `android/` in Android Studio and allow Gradle sync. The Gradle wrapper is not included in this starter; Android Studio can generate/manage it. The app has not been compiled in this environment because the Android SDK and Gradle are unavailable here.

## Content rights
Do not publish copyrighted anime artwork unless usage rights are confirmed. Each catalog entry needs source and rights metadata. Read `docs/CONTENT_RIGHTS_POLICY.md`.

## Lead capture and privacy
Migrations `202610230002` and `202610230003` add private lead capture, device/favorite-character metadata, ratings, set-event counts, and subscription entitlement schema. `supabase/functions/register-app-lead/` contains a server-side registration endpoint skeleton. Read `docs/LEAD_CAPTURE_AND_PRIVACY.md`. The Android onboarding currently saves to local preferences only; it is not yet connected to the registration endpoint. Do not collect real user data until rate limiting/abuse controls, the deployed endpoint, published privacy policy, unsubscribe/deletion workflows, and admin lead-management UI are implemented and tested.

## Roadmap
See `docs/ROADMAP.md` for the 12-part plan.


### Professional contact section

The Android Settings tab includes a styled support card displaying the app contact name, Sanjay, and `Sanjay200123@gmail.com`, with a tappable email action. The mail action opens an installed email app when available.

## First interactive feature pass
The Android UI now includes three-page onboarding, device details, favorite-character selection, five navigation tabs (Discover, Best, New, Favorite Character, Settings), category filters for Normal/With Quotes/Live, rating dialogs, demo popularity ranking, a Premium upsell at ₹49/month, blurred Free-user previews for Favorite Character, and a Premium-only download affordance. These are UI/demo states: actual Google Play Billing, server subscription verification, remote content, ratings synchronization, download handling, and Android wallpaper activation are not yet connected. See `docs/ROADMAP.md`.


## Next core-app pass (2026-10-23)
- Updated Android visible branding to AniQuotes 4K.
- Added local persistence for favorites, per-wallpaper rating updates, and local aggregate rating/count values using SharedPreferences.
- Added a Favorites filter to Discover and favorite toggle controls on wallpaper cards.
- These remain device-local demo interactions until a protected backend write API is deployed. Real wallpaper assets, actual Android wallpaper activation, live wallpaper playback, Play Billing, and remote sync remain pending.

## Phase 3: cloud catalog and static wallpaper setting
- `supabase/functions/wallpaper-catalog/` serves only published, commercially cleared, native-4K catalog items with one-hour signed media URLs. The Supabase service-role key is used only inside the Edge Function.
- Apply migration `202610230004_catalog_stats_service_access.sql` after the first three migrations, then deploy the function with `supabase functions deploy wallpaper-catalog`.
- In `android/local.properties` (not committed), add `SUPABASE_URL=https://YOUR_PROJECT.supabase.co` and `SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY`. The anon key is client-facing; never put a service-role key here.
- When configured, Android fetches the published catalog on launch. Static/quote entries with a valid signed `image_url` can be applied to the home screen, lock screen, or both using Android's WallpaperManager. The app refreshes the signed URL before applying.
- Sample wallpapers intentionally have no source image URLs, so their Set button stays disabled until real, rights-cleared assets are uploaded and published. Live video playback is not implemented in this phase.
- This source change has not been built with Gradle/Android SDK in this environment. Test in Android Studio and on a physical device before release.


## Phase 4: live wallpapers, Premium downloads, and Play Billing
- Added an Android `WallpaperService` for looping muted MP4 live wallpapers, plus a native Android live-wallpaper confirmation flow. Live media is cached privately because signed URLs expire.
- Added Premium-gated download handling for static/quote images and MP4s. Android 10+ saves into user-visible Pictures/Movies folders; Android 8/9 uses app-specific external storage.
- Added Google Play Billing client scaffolding for the `aniquotes_premium_monthly` subscription, purchase restoration, acknowledgement after verification, and fail-closed Premium entitlement state.
- Added migration `202610230005_play_subscription_verification.sql` and Edge Function `verify-play-purchase` to verify subscription tokens with Google Play Developer API. Follow `docs/PHASE4_LIVE_DOWNLOADS_BILLING.md` for Play Console and Supabase setup.
- Billing cannot work until the Play subscription is created, Supabase secrets are configured, migrations/functions are deployed, and the app is installed from a licensed Play test track. The complete Android build has not been verified in this environment.

## Phase 5: manager-led production task board
- Open `/tasks` in the admin app to use the owner-only production queue.
- Migration `supabase/migrations/202610230006_production_manager_workflow.sql` creates task tracking, manager logs, and RPCs for role-based dispatch, completion, and blocker reporting.
- Completing a task triggers the manager dispatcher to assign the next queued task(s) to available roles; each role has at most one active task.
- Apply migration 006 in Supabase before using this page. See `docs/PHASE5_PRODUCTION_MANAGER.md`.
- This is a deterministic task coordinator, not a deployed multi-agent AI team. Actual image/video generation and output evidence still require workers/tools to be configured. Task counts are not wallpaper asset counts.

## Phase 6: AI Manager planning

- Added an owner-authenticated `/api/manager/plan` endpoint and **Ask AI Manager** button on `/tasks`.
- Configure server-only `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL` in `admin/.env.local` to enable AI-generated task planning. Without these values, the endpoint returns an explicitly labeled rules-based fallback.
- The AI manager recommends priorities and acceptance criteria; it does not claim tasks are complete, generate files, or publish media. See `docs/PHASE6_AI_MANAGER_PLANNING.md`.

## Phase 7: local 9Router wallpaper generation
- Added read-only model capability discovery and an explicit one-image smoke command; chat-only models are not accepted as image models.
- Added a resumable 900-normal-wallpaper batch tool with an atomic job manifest, cost ceilings, duplicate/hash checks, image-size checks, retry limits, and review-only handling for outputs that miss 2160 × 3840.
- Generated files remain local drafts by default. Optional Supabase Storage upload requires a server-only service-role key and does not publish assets or create catalog rows.
- Configure and validate the local router from `admin/.env.local`; follow `docs/9ROUTER_WALLPAPER_PIPELINE.md`. The full batch is deliberately not started by dry-run or smoke mode.


## Optional Colab + Drive wallpaper batch
- `colab/aniquotes_4k_batch.ipynb` adds a separate resumable 900-still Colab + Drive draft batch and 80 1080p looping MP4 drafts from the first 80 stills.
- Stills are rendered below 4K then upscaled to 2160 × 3840 and labeled as upscaled drafts; videos use FFmpeg pan/zoom from stills.
- Drive manifests, per-session caps, deterministic seeds, SHA-256 checks, bounded retries, and a job lock support recovery.
- This path leaves the local 9Router workflow unchanged and does not publish to Supabase or the app catalog. Free Colab sessions are temporary, not 24/7. See [`docs/COLAB_DRIVE_WALLPAPER_BATCH.md`](docs/COLAB_DRIVE_WALLPAPER_BATCH.md).
