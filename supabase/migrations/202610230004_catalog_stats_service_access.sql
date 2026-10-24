-- Permit the server-side wallpaper-catalog Edge Function to read aggregate stats.
-- The view remains unavailable to anon/authenticated clients; the service role is
-- used only inside the Edge Function and must never be shipped in the Android app.
create or replace view public.wallpaper_catalog_stats as
select
  w.id as wallpaper_id,
  w.title,
  w.content_section,
  coalesce(r.rating_count, 0)::bigint as rating_count,
  coalesce(r.average_rating, 0)::numeric(3,2) as average_rating,
  coalesce(s.confirmed_set_count, 0)::bigint as confirmed_set_count,
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
where w.status = 'published';

revoke all on public.wallpaper_catalog_stats from anon, authenticated;
grant select on public.wallpaper_catalog_stats to service_role;
