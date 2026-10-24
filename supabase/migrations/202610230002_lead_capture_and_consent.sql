-- Lead capture for AniQuotes 4K and future apps.
-- Submit registrations through a Supabase Edge Function/server endpoint using
-- the service role key stored server-side only. Never expose that key in Android
-- or browser code. Do not add anon/authenticated INSERT/SELECT policies here.

create table if not exists public.app_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  email text not null check (
    char_length(email) between 3 and 254 and
    email = lower(trim(email)) and
    email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  source_app text not null check (source_app ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  privacy_notice_version text not null,
  privacy_notice_acknowledged_at timestamptz not null default now(),
  cross_app_marketing_opt_in boolean not null default false,
  cross_app_marketing_consent_at timestamptz,
  marketing_opt_out_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_app, email),
  check (not cross_app_marketing_opt_in or cross_app_marketing_consent_at is not null)
);

create index if not exists app_leads_source_created_idx
  on public.app_leads(source_app, created_at desc);
create index if not exists app_leads_marketing_eligible_idx
  on public.app_leads(created_at desc)
  where cross_app_marketing_opt_in = true and marketing_opt_out_at is null
    and deletion_requested_at is null;

alter table public.app_leads enable row level security;

-- Only authenticated owner/admin users may view/manage leads in the admin UI.
-- Public app registrations must go through a server-side endpoint with validation,
-- rate limiting, abuse protection, and the service role key held in secrets.
drop policy if exists "admins can manage leads" on public.app_leads;
create policy "admins can manage leads" on public.app_leads
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.app_leads is
  'Private contact records. Cross-app marketing requires a separately recorded opt-in. Do not expose this table publicly.';
comment on column public.app_leads.source_app is
  'Stable app identifier, e.g. anime_quotes_wallpaper, to attribute the signup source.';
comment on column public.app_leads.cross_app_marketing_opt_in is
  'True only when the person explicitly opted in to marketing from other apps/services; false by default.';
comment on column public.app_leads.cross_app_marketing_consent_at is
  'Timestamp of explicit cross-app marketing opt-in; null unless opted in.';
