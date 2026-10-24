-- Server-verified Google Play subscription entitlements for AniQuotes 4K.
-- The Android app must never be trusted to set Premium status on its own.

create table if not exists public.play_subscription_entitlements (
  purchase_token_hash text primary key,
  installation_id uuid not null,
  product_id text not null,
  package_name text not null,
  subscription_state text not null,
  expires_at timestamptz,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists play_subscription_installation_idx
  on public.play_subscription_entitlements(installation_id, expires_at desc);

alter table public.play_subscription_entitlements enable row level security;
revoke all on public.play_subscription_entitlements from anon, authenticated;
grant all on public.play_subscription_entitlements to service_role;
