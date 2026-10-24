# Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `migrations/202610230001_initial_schema.sql`.
3. In Supabase Auth, create your owner user (use a strong password and enable MFA if available).
4. Copy that user's UUID from Authentication > Users.
5. Run the following SQL with the actual UUID:
   ```sql
   insert into public.app_admins (user_id)
   values ('REPLACE-WITH-OWNER-USER-UUID');
   ```
6. Create a private storage bucket named `wallpaper-assets` or run the migration storage bucket statement if supported in your project.
7. Configure `admin/.env.local` with project URL and anon/publishable key.

The migration uses Row Level Security. Only users listed in `app_admins` can manage admin data or upload assets. Published wallpaper metadata is readable to unauthenticated app users. Storage objects are private; the Android app should later use an authenticated/catalog endpoint or signed URLs to download published assets. Never put the Supabase service-role key in the Android app or browser environment.

## Current feature migrations
After the initial schema, run these migrations in order:
8. `migrations/202610230002_lead_capture_and_consent.sql`
9. `migrations/202610230003_personalization_ratings_and_subscriptions.sql`

The third migration adds Normal/Quote/Live content classification, source dimensions/4K metadata, device and favorite-character preferences, star ratings, wallpaper-set events, subscription entitlement records, and an admin-only catalog stats view. The Edge Function `functions/register-app-lead/index.ts` is a starter; do not deploy it publicly until rate limiting/abuse protection and the privacy/opt-out workflows have been completed. Android does not yet sync onboarding data or rating/set events to Supabase.
