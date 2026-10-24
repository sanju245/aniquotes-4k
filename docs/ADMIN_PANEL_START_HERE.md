# AniQuotes 4K — Admin Panel First Setup

This is the first web component to configure for AniQuotes 4K. The admin app lives in `admin/` and uses Next.js, React, and Supabase.

## Included in this panel

- Owner sign-in through Supabase Auth; no public sign-up form
- Owner allow-list check against `public.app_admins`
- Dashboard counts for total items, published items, and drafts
- Upload form for static wallpaper images and live wallpaper media
- Source-dimension check for native 4K media (portrait 2160×3840 or landscape 3840×2160, or larger)
- Catalog metadata including character, quote, source, creator, license, and commercial-use flag
- Draft-first workflow with publish/archive controls
- Link to the production task board at `/tasks`
- AI-assisted manager planning endpoint, with a rules-based fallback

## Run locally

1. Install Node.js LTS.
2. In a terminal, enter the `admin/` directory.
3. Copy `.env.example` to `.env.local`.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your Supabase project values. Never place a service-role key in a `NEXT_PUBLIC_` variable or commit secrets.
5. Install dependencies with `npm install`.
6. Apply the SQL migrations in `../supabase/migrations/` to the Supabase project, in numeric order, using the Supabase SQL editor or CLI.
7. Create the owner account in Supabase Auth, then register that user's UUID in `public.app_admins` as described in `../supabase/README.md`.
8. Start the app with `npm run dev`, then open `http://localhost:3000`.

## Before production

- Configure and verify the Supabase project, migrations, auth redirect URLs, and private `wallpaper-assets` bucket.
- Set a strong owner password and enable MFA in Supabase where available.
- Review RLS policies and test unauthorized access with a non-admin account.
- Configure AI Gateway credentials server-side only if you want AI-assisted manager planning.
- Run `npm run lint` and `npm run build` after dependencies are installed, fix all errors, and test uploads/status changes end-to-end.
- Configure Vercel from the Git repository once the repository exists; deployment has not been performed by this package.
- Publish only content with documented distribution/commercial rights.

## Current verification status

The source files are included. A local lint attempt without installed dependencies cannot pass because packages such as Next.js and React are not present in this environment. This is a source bundle, not a deployed or production-verified service.
