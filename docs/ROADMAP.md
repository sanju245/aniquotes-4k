# 12-Part Roadmap

1. Android app foundation — navigation, theme, starter data models.
2. Admin panel — single-owner authentication, dashboard, content management.
3. Backend and database — Supabase schema, RLS, storage, catalog API, and private lead records with source-app attribution.
4. Wallpaper library — Normal, Wallpapers with Quotes, Live, Best (ratings + set activity), New (publish time), favorites, search and detail preview.
5. Normal wallpapers — image preview, crop and apply to home/lock/both.
6. Live wallpapers — videos/animations through Android WallpaperService and a user-confirmed activation flow.
7. Daily rotation — WorkManager best-effort scheduling, retry and repeat prevention.
8. Cloud content updates — published catalog sync, caching and offline access.
9. Security, privacy and rights — admin authorization, storage policies, protected lead capture, explicit cross-app marketing opt-in, unsubscribe/deletion handling, rating abuse controls, subscription verification and license records.
10. Testing — Android device/OS, background scheduling, storage, network and security tests.
11. GitHub and deployment — CI, backend setup and APK/AAB release pipeline.
12. Launch and future features — Play Store readiness, privacy/Data safety disclosures, analytics, provider-neutral ads, ₹49/month Premium billing, device personalization and future apps using consent-eligible leads only.

## Confirmed decisions
- One owner/admin account initially.
- Upload both static images and live wallpaper video/animation assets.
- Free at launch; architecture may support optional ads later.
- Kotlin Android app + Next.js admin + Supabase backend, maintained in one GitHub monorepo.

## Additional confirmed requirements
- First-launch name/email collection is planned, with a privacy notice and a clear explanation of purpose. Do not collect more information than needed.
- Cross-app marketing consent must be separate, optional, and unchecked by default. A signup alone is not permission to market other apps.
- Lead records must include a `source_app` identifier, consent timestamps, unsubscribe/suppression state, and deletion-request state.
- Leads remain private in Supabase; public clients must not have direct read access. Registration must be implemented through a protected server-side endpoint with validation and rate limiting.
- Admin lead export and email marketing are not launch-ready until unsubscribe/deletion workflows and applicable privacy requirements are implemented.
- Advertising remains provider-neutral until an ad network is selected; app-open ads must follow applicable network and Play policies and should not interrupt wallpaper activation.

## First implementation pass (2026-10-23)
- Added a three-page onboarding UI: name/email + privacy acknowledgement and optional cross-app marketing consent; phone brand/model + detected screen pixels; favorite character selection.
- Added five-tab navigation: Discover, Best, New, Favorite Character, Settings. Discover filters Normal, With Quotes, and Live.
- Added sample wallpaper cards, star-rating dialog, a Bayesian-style demo Best ranking, new-by-publication ordering, Premium promotion at ₹49/month, blurred Premium-only Favorite Character preview, Premium-only download affordance, and contact details.
- Added Supabase migration for content sections, device metadata, character preferences, ratings, set events, subscription entitlements, and an admin-only stats view. Added a server-side registration Edge Function skeleton.
- **Not yet production connected:** Android onboarding currently stores data locally; the Edge Function is not deployed or called by Android. Google Play Billing, server-side purchase verification, ad SDK, remote catalog/media delivery, actual image download, real Android static/live wallpaper application, synced ratings/set events, and admin lead/analytics screens remain to be implemented and tested.


## Follow-up implementation pass (2026-10-23)
- Updated Android visible branding to AniQuotes 4K.
- Added local persistence for favorites and rating updates, plus a Favorites filter in Discover.
- Rating and favorite data is currently device-local; remote sync and protected write APIs remain pending.
- Wallpaper activation remains unimplemented until actual rights-cleared image/video assets are supplied and catalog URLs are connected. Do not present the sample gradient preview as a real 4K anime image.


## Phase 3 progress — cloud catalog and static wallpaper setting (2026-10-23)
- Added a server-side `wallpaper-catalog` Edge Function that filters for published, commercially cleared native-4K content and issues one-hour signed URLs from private storage.
- Added a service-role-only catalog stats view migration.
- Added Android catalog fetch support configured through ignored `android/local.properties`.
- Added static wallpaper target selection (home, lock, both) and `WallpaperManager` application for published HTTPS image URLs.
- Remaining: deploy Supabase migrations/function, publish rights-cleared media, test Android build/device behavior, implement live wallpaper playback and verified billing.


## Phase 4 update (2026-10-23)
- Added MP4 live wallpaper playback via Android `WallpaperService` and system confirmation UI.
- Added Premium-only download implementation for published media.
- Added Google Play Billing client and server verification function/migration; real checkout remains configuration-dependent and requires Play Console + Supabase setup.
- Remaining before release: run Gradle build, configure and deploy Supabase, create the ₹49 monthly Play subscription, test real purchase/restore/expiry/refund flows, and test live playback on physical devices.

## Phase 7 update — local image generation
- Added a server-side 9Router image-generation CLI with image capability discovery, dry-run validation, and a one-image smoke mode.
- Added a resumable, cost-capped 900-image normal wallpaper job and local draft storage with strict resolution and duplicate checks.
- The pipeline does not publish assets, bypass rights review, or claim native 4K when a provider returns fewer pixels. Setup and limits are in `docs/9ROUTER_WALLPAPER_PIPELINE.md`.
