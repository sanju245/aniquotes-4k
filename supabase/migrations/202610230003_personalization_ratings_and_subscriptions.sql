-- Personalization, rating, popularity and Premium entitlement schema.
-- Apply after 001_initial_schema.sql and 002_lead_capture_and_consent.sql.
-- Public clients must use a validated server/Edge Function for writes; never expose
-- the Supabase service-role key in Android or the browser.

create type public.wallpaper_content_section as enum ('normal', 'quote', 'live');

alter table public.wallpapers
  add column if not exists content_section public.wallpaper_content_section not null default 'normal',
  add column if not exists source_width_px integer,
  add column if not exists source_height_px integer,
  add column if not exists is_native_4k boolean not null default false;

update public.wallpapers
set content_section = case
  when media_type = 'live' then 'live'::public.wallpaper_content_section
  when quote_text is not null and length(trim(quote_text)) > 0 then 'quote'::public.wallpaper_content_section
  else 'normal'::public.wallpaper_content_section
end;

create index if not exists wallpapers_content_section_published_idx
  on public.wallpapers(content_section, published_at desc)
  where status = 'published';

-- Store only information the onboarding flow explains to the user.
alter table public.app_leads
  add column if not exists device_brand text check (device_brand is null or char_length(device_brand) <= 100),
  add column if not exists device_model text check (device_model is null or char_length(device_model) <= 160),
  add column if not exists screen_width_px integer check (screen_width_px is null or screen_width_px between 1 and 20000),
  add column if not exists screen_height_px integer check (screen_height_px is null or screen_height_px between 1 and 30000),
  add column if not exists favorite_character_names text[] not null default '{}';

create table if not exists public.wallpaper_ratings (
  id uuid primary key default gen_random_uuid(),
  wallpaper_id uuid not null references public.wallpapers(id) on delete cascade,
  lead_id uuid not null references public.app_leads(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallpaper_id, lead_id)
);
create index if not exists wallpaper_ratings_wallpaper_idx on public.wallpaper_ratings(wallpaper_id);

create table if not exists public.wallpaper_set_events (
  id bigint generated always as identity primary key,
  wallpaper_id uuid not null references public.wallpapers(id) on delete cascade,
  lead_id uuid references public.app_leads(id) on delete set null,
  installation_key_hash text,
  result text not null default 'requested' check (result in ('requested','confirmed','failed','unknown')),
  created_at timestamptz not null default now(),
  check (lead_id is not null or installation_key_hash is not null)
);
create index if not exists wallpaper_set_events_confirmed_idx
  on public.wallpaper_set_events(wallpaper_id, created_at desc) where result = 'confirmed';

-- Server-maintained subscription status; never trust a client-supplied premium flag.
create table if not exists public.subscription_entitlements (
  lead_id uuid primary key references public.app_leads(id) on delete cascade,
  provider text not null default 'google_play' check (provider in ('google_play','test')),
  product_id text not null,
  status text not null check (status in ('active','grace_period','canceled','expired','revoked','pending')),
  started_at timestamptz,
  expires_at timestamptz,
  last_verified_at timestamptz not null default now(),
  provider_purchase_token_hash text,
  updated_at timestamptz not null default now()
);

alter table public.wallpaper_ratings enable row level security;
alter table public.wallpaper_set_events enable row level security;
alter table public.subscription_entitlements enable row level security;

drop policy if exists "admins read wallpaper ratings" on public.wallpaper_ratings;
create policy "admins read wallpaper ratings" on public.wallpaper_ratings
  for select to authenticated using (public.is_app_admin());
drop policy if exists "admins manage wallpaper ratings" on public.wallpaper_ratings;
create policy "admins manage wallpaper ratings" on public.wallpaper_ratings
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "admins read wallpaper set events" on public.wallpaper_set_events;
create policy "admins read wallpaper set events" on public.wallpaper_set_events
  for select to authenticated using (public.is_app_admin());
drop policy if exists "admins read subscription entitlements" on public.subscription_entitlements;
create policy "admins read subscription entitlements" on public.subscription_entitlements
  for select to authenticated using (public.is_app_admin());
drop policy if exists "admins manage subscription entitlements" on public.subscription_entitlements;
create policy "admins manage subscription entitlements" on public.subscription_entitlements
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

-- No anonymous/authenticated write policies are created for ratings, set events,
-- leads or entitlements. Submit and verify these through server-side functions.

create or replace view public.wallpaper_catalog_stats as
select
  w.id as wallpaper_id,
  w.title,
  w.content_section,
  coalesce(r.rating_count, 0)::bigint as rating_count,
  coalesce(r.average_rating, 0)::numeric(3,2) as average_rating,
  coalesce(s.confirmed_set_count, 0)::bigint as confirmed_set_count,
  -- Bayesian adjustment prevents a single high rating from dominating Best.
  ((coalesce(r.average_rating, 4.0) * coalesce(r.rating_count, 0) + 4.0 * 12.0)
    / (coalesce(r.rating_count, 0) + 12.0))::numeric(5,3) as bayesian_rating
from public.wallpapers w
left join (
  select wallpaper_id, count(*) as rating_count, avg(stars)::numeric as average_rating
  from public.wallpaper_ratings group by wallpaper_id
) r on r.wallpaper_id = w.id
left join (
  select wallpaper_id, count(*) as confirmed_set_count
  from public.wallpaper_set_events where result = 'confirmed' group by wallpaper_id
) s on s.wallpaper_id = w.id
where w.status = 'published' and public.is_app_admin();

-- The stats view is admin-only until a reviewed public catalog endpoint is added.
revoke all on public.wallpaper_catalog_stats from anon, authenticated;
grant select on public.wallpaper_catalog_stats to authenticated;
