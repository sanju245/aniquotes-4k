-- AniQuotes 4K initial schema.
-- Run in Supabase SQL Editor. The owner must be explicitly inserted into app_admins.

create extension if not exists pgcrypto;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.wallpaper_media_type as enum ('static', 'live');
create type public.wallpaper_status as enum ('draft', 'scheduled', 'published', 'archived');
create type public.artwork_rights_status as enum (
  'unreviewed', 'original_created', 'licensed_for_commercial_use',
  'public_domain_verified', 'permission_required', 'do_not_distribute'
);

create table if not exists public.wallpapers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  character_name text,
  series_name text,
  quote_text text check (quote_text is null or char_length(quote_text) <= 1000),
  quote_attribution_source text,
  quote_attribution_verified boolean not null default false,
  category_id uuid references public.categories(id) on delete set null,
  media_type public.wallpaper_media_type not null,
  status public.wallpaper_status not null default 'draft',
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  artwork_creator text,
  artwork_source_url text,
  license_name text,
  license_reference text,
  commercial_use_allowed boolean not null default false,
  modification_allowed boolean not null default false,
  attribution_required text,
  rights_status public.artwork_rights_status not null default 'unreviewed',
  featured boolean not null default false,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (status <> 'published' or rights_status in ('original_created', 'licensed_for_commercial_use', 'public_domain_verified')),
  check (status <> 'published' or commercial_use_allowed = true)
);

create index if not exists wallpapers_status_published_idx
  on public.wallpapers(status, published_at desc);
create index if not exists wallpapers_category_idx on public.wallpapers(category_id);
create index if not exists wallpapers_media_type_idx on public.wallpapers(media_type);
create index if not exists wallpapers_featured_idx on public.wallpapers(featured) where featured = true;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
alter table public.categories enable row level security;
alter table public.wallpapers enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "admins can read admin list" on public.app_admins;
create policy "admins can read admin list" on public.app_admins
  for select to authenticated using (public.is_app_admin());

drop policy if exists "public can read active categories" on public.categories;
create policy "public can read active categories" on public.categories
  for select to anon, authenticated using (is_active = true);

drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories" on public.categories
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "public can read published wallpapers" on public.wallpapers;
create policy "public can read published wallpapers" on public.wallpapers
  for select to anon, authenticated using (status = 'published');

drop policy if exists "admins manage wallpapers" on public.wallpapers;
create policy "admins manage wallpapers" on public.wallpapers
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log" on public.admin_audit_log
  for select to authenticated using (public.is_app_admin());

drop policy if exists "admins insert audit log" on public.admin_audit_log;
create policy "admins insert audit log" on public.admin_audit_log
  for insert to authenticated with check (public.is_app_admin() and actor_user_id = auth.uid());

-- Private storage bucket; upload limits and allowed MIME types should also be
-- configured in Supabase Storage settings for the deployed project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallpaper-assets',
  'wallpaper-assets',
  false,
  83886080,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload wallpaper assets" on storage.objects;
create policy "admins upload wallpaper assets" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'wallpaper-assets' and public.is_app_admin()
  );

drop policy if exists "admins read wallpaper assets" on storage.objects;
create policy "admins read wallpaper assets" on storage.objects
  for select to authenticated using (
    bucket_id = 'wallpaper-assets' and public.is_app_admin()
  );

drop policy if exists "admins update wallpaper assets" on storage.objects;
create policy "admins update wallpaper assets" on storage.objects
  for update to authenticated using (
    bucket_id = 'wallpaper-assets' and public.is_app_admin()
  ) with check (
    bucket_id = 'wallpaper-assets' and public.is_app_admin()
  );

drop policy if exists "admins delete wallpaper assets" on storage.objects;
create policy "admins delete wallpaper assets" on storage.objects
  for delete to authenticated using (
    bucket_id = 'wallpaper-assets' and public.is_app_admin()
  );
