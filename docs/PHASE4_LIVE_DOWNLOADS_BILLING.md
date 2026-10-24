# Phase 4 — Live wallpapers, Premium downloads, and Play Billing

## Implemented in source

- `VideoWallpaperService` loops a locally cached MP4 silently on the wallpaper surface and pauses when the wallpaper is not visible.
- The app fetches a fresh signed catalog URL before preparing live media, stores the MP4 in private app storage, and opens Android's native live-wallpaper confirmation flow.
- Premium download actions save static/quote images to `Pictures/AniQuotes4K` and MP4 media to `Movies/AniQuotes4K` on Android 10+. Older Android versions use app-specific external storage.
- Google Play Billing client uses product ID `aniquotes_premium_monthly`, queries the subscription product, opens checkout, restores purchases, acknowledges verified purchases, and only updates the UI to Premium after the verification Edge Function responds `premium: true`.
- Migration `202610230005_play_subscription_verification.sql` stores hashed purchase tokens and server-verified entitlement expiry/state. Raw purchase tokens are not stored in the database.
- Edge Function `verify-play-purchase` verifies subscription tokens with Google Play Developer API using a service account secret on the server.

## Required configuration before testing billing

1. Create a Google Play subscription product with ID `aniquotes_premium_monthly` and configure the India price to ₹49/month in Play Console. Google Play returns the localized price to the client.
2. Link the Play Console app to a Google Cloud project, enable Google Play Android Developer API, create a service account, and grant it the required Play Console access.
3. Apply migration `202610230005_play_subscription_verification.sql`.
4. Set Supabase Edge Function secrets:
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — full service account JSON value (keep private).
   - `GOOGLE_PLAY_PACKAGE_NAME` — currently `com.animequotes.wallpaper`.
5. Deploy `verify-play-purchase` and `wallpaper-catalog` to the same Supabase project.
6. Set Android `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the untracked `android/local.properties` and build from Android Studio.
7. Test using a Play internal-testing track and licensed tester account. Billing is not fully testable by installing a random debug APK.

## Important limits and security notes

- No service-account JSON, Google credentials, service-role key, or purchase token may be put in the Android app.
- Premium stays locked when the verification endpoint is unreachable or returns an error. This intentionally fails closed.
- The current onboarding has not yet created a Supabase Auth identity. Entitlements are associated with a generated app-installation UUID; a future authenticated account-linking flow is recommended for robust cross-device restore and reinstall recovery.
- Because free users need the same wallpaper media to set it, a determined user may be able to extract a short-lived signed catalog URL. The Premium download button is gated in the UI, but stronger anti-extraction controls would require a different media-delivery architecture and still cannot prevent screen capture.
- Live wallpapers require a published MP4 asset. No bundled sample MP4 is included. The user must confirm Android's system preview to apply it.
- The full Android build and real-device tests are not run in this environment. Verify APK behavior, low-memory handling, lock-screen behavior, and battery use before release.
