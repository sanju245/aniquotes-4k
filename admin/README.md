# Admin dashboard

Next.js + Supabase browser client. Intended for one owner account initially.

## Setup
1. Copy `.env.example` to `.env.local`.
2. Add the Supabase project URL and anon/publishable key.
3. Run `npm install && npm run dev`.
4. Create an owner account in Supabase Auth using the Supabase dashboard (public sign-up is not exposed in this UI).
5. Follow `../supabase/README.md` to register that user in `public.app_admins`.

The UI supports owner sign-in, upload of static images or live media files to private storage, saving catalog metadata as draft, and draft/publish/archive status changes. It is a scaffold and still needs stronger server-side session handling, metadata editing, scheduled publishing, audit logs, preview, and integration tests before production use.
