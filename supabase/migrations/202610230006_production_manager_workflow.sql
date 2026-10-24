-- Phase 5: manager-led production queue for the AniQuotes 4K content team.
-- The manager is a deterministic workflow coordinator, not a deployed generative AI agent.

create table if not exists public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  task_key text not null unique,
  title text not null,
  description text not null,
  team_role text not null check (team_role in (
    'Research Lead','Prompt & Concept Artist','Static Wallpaper Artist','Quote Design Artist',
    'Live Wallpaper Artist','Quality Control','Upload & Database','Android App','Marketing & Growth'
  )),
  category text not null check (category in ('planning','normal','quote','live','quality','infrastructure','app','marketing')),
  status text not null default 'queued' check (status in ('queued','in_progress','blocked','completed','needs_review')),
  priority integer not null default 50 check (priority between 1 and 100),
  batch_number integer not null default 1,
  asset_number integer,
  output_checklist jsonb not null default '[]'::jsonb,
  completion_notes text,
  blocker text,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_tasks_status_priority_idx
  on public.production_tasks(status, priority desc, created_at asc);
create index if not exists production_tasks_role_status_idx
  on public.production_tasks(team_role, status);

alter table public.production_tasks enable row level security;
drop policy if exists "admins manage production tasks" on public.production_tasks;
create policy "admins manage production tasks" on public.production_tasks
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

create table if not exists public.production_manager_log (
  id bigint generated always as identity primary key,
  action text not null,
  message text not null,
  task_id uuid references public.production_tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.production_manager_log enable row level security;
drop policy if exists "admins read manager log" on public.production_manager_log;
create policy "admins read manager log" on public.production_manager_log
  for select to authenticated using (public.is_app_admin());
drop policy if exists "admins write manager log" on public.production_manager_log;
create policy "admins write manager log" on public.production_manager_log
  for insert to authenticated with check (public.is_app_admin());

insert into public.production_tasks(task_key,title,description,team_role,category,priority,batch_number,asset_number,output_checklist)
values
('P5-RESEARCH-001','Build the first-batch character and style list','Define a varied, non-duplicative visual brief for the first 10 static, 5 quote, and 5 live concepts. Flag famous-character rights requirements.','Research Lead','planning',100,1,null,'["Character/style list","Duplicate-avoidance notes","Rights flags"]'::jsonb),
('P5-CONCEPT-001','Write premium visual prompts for first batch','Prepare consistent portrait prompts, negative prompts, composition guidance, and naming conventions for the first batch.','Prompt & Concept Artist','planning',95,1,null,'["Prompt pack","Negative prompt","Naming convention"]'::jsonb),
('P5-STATIC-001','Create static wallpaper asset 001','Produce one original or properly licensed portrait wallpaper; inspect composition and source resolution.','Static Wallpaper Artist','normal',90,1,1,'["Separate image file","Portrait crop","Rights/source metadata"]'::jsonb),
('P5-QUOTE-001','Create quote wallpaper asset 001','Create one quote design with verified attribution or original text, readable typography, and clear source/rights metadata.','Quote Design Artist','quote',90,1,1,'["Separate image file","Proofread text","Quote attribution/source"]'::jsonb),
('P5-LIVE-001','Create live wallpaper concept 001','Prepare one loopable live wallpaper concept with a motion plan; final delivery must be a separately encoded MP4.','Live Wallpaper Artist','live',90,1,1,'["Motion storyboard","Loop plan","MP4 export specification"]'::jsonb),
('P5-QC-001','Define media quality acceptance checklist','Document checks for resolution, aspect ratio, artifacts, typography, loop seam, file size, playback, and rights.','Quality Control','quality',85,1,null,'["Static QC checklist","Quote QC checklist","Live-video QC checklist"]'::jsonb),
('P5-INFRA-001','Prepare storage and metadata workflow','Document R2 upload path convention and Supabase metadata fields; do not publish assets with unverified rights.','Upload & Database','infrastructure',80,1,null,'["Object naming scheme","Required metadata","Draft-only publishing rule"]'::jsonb),
('P5-APP-001','Define catalog integration acceptance test','Specify how new approved catalog entries appear in the Android app without an app update.','Android App','app',75,1,null,'["Catalog refresh test","Set-wallpaper test","Live MP4 playback test"]'::jsonb),
('P5-MARKETING-001','Prepare first-batch preview brief','Create a preview plan that clearly labels concept art vs finished assets and avoids unlicensed claims.','Marketing & Growth','marketing',60,1,null,'["Preview layout brief","Accurate asset counts","Rights-safe copy"]'::jsonb),
('P5-STATIC-002','Create static wallpaper asset 002','Produce the next distinct static wallpaper after asset 001 is reviewed.','Static Wallpaper Artist','normal',70,1,2,'["Separate image file","No near-duplicate","Rights/source metadata"]'::jsonb),
('P5-STATIC-003','Create static wallpaper asset 003','Produce the next distinct static wallpaper after asset 002 is reviewed.','Static Wallpaper Artist','normal',69,1,3,'["Separate image file","No near-duplicate","Rights/source metadata"]'::jsonb),
('P5-STATIC-004','Create static wallpaper asset 004','Produce the next distinct static wallpaper after asset 003 is reviewed.','Static Wallpaper Artist','normal',68,1,4,'["Separate image file","No near-duplicate","Rights/source metadata"]'::jsonb),
('P5-STATIC-005','Create static wallpaper asset 005','Produce the next distinct static wallpaper after asset 004 is reviewed.','Static Wallpaper Artist','normal',67,1,5,'["Separate image file","No near-duplicate","Rights/source metadata"]'::jsonb),
('P5-STATIC-006','Create static wallpaper asset 006','Produce the next distinct static wallpaper after asset 005 is reviewed.','Static Wallpaper Artist','normal',66,1,6,'["Separate image file","No near-duplicate","Rights/source metadata"]'::jsonb),
('P5-QUOTE-002','Create quote wallpaper asset 002','Produce a second distinct quote wallpaper; verify attribution and readability.','Quote Design Artist','quote',70,1,2,'["Separate image file","Proofread text","Quote attribution/source"]'::jsonb),
('P5-QUOTE-003','Create quote wallpaper asset 003','Produce a third distinct quote wallpaper; verify attribution and readability.','Quote Design Artist','quote',69,1,3,'["Separate image file","Proofread text","Quote attribution/source"]'::jsonb),
('P5-LIVE-002','Create live wallpaper concept 002','Prepare a distinct second live wallpaper concept and loop plan.','Live Wallpaper Artist','live',70,1,2,'["Motion storyboard","Loop plan","MP4 export specification"]'::jsonb),
('P5-LIVE-003','Create live wallpaper concept 003','Prepare a distinct third live wallpaper concept and loop plan.','Live Wallpaper Artist','live',69,1,3,'["Motion storyboard","Loop plan","MP4 export specification"]'::jsonb),
('P5-QC-002','Review first static and quote drafts','Review first available drafts; return specific fixes instead of approving incomplete assets.','Quality Control','quality',65,1,null,'["Resolution checked","Typography checked","Rights metadata checked"]'::jsonb),
('P5-INFRA-002','Document publishing gate and rollback steps','Ensure only reviewed, rights-cleared assets can be published and define how to archive a faulty item.','Upload & Database','infrastructure',55,1,null,'["Publishing gate","Rollback steps","Audit notes"]'::jsonb)
on conflict (task_key) do nothing;

create or replace function public.manager_dispatch_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  dispatched integer := 0;
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  for t in
    select candidate.id, candidate.team_role, candidate.title
    from (
      select q.id, q.team_role, q.title,
        row_number() over (partition by q.team_role order by q.priority desc, q.created_at asc) as role_rank
      from public.production_tasks q
      where q.status = 'queued'
        and not exists (
          select 1 from public.production_tasks active
          where active.team_role = q.team_role and active.status = 'in_progress'
        )
    ) candidate
    where candidate.role_rank = 1
    order by candidate.title
  loop
    update public.production_tasks
      set status='in_progress', assigned_at=now(), started_at=now(), updated_at=now()
      where id=t.id and status='queued';
    if found then
      insert into public.production_manager_log(action,message,task_id)
      values ('assigned', 'Manager assigned "' || t.title || '" to ' || t.team_role || '.', t.id);
      dispatched := dispatched + 1;
    end if;
  end loop;
  return dispatched;
end;
$$;
revoke all on function public.manager_dispatch_tasks() from public;
grant execute on function public.manager_dispatch_tasks() to authenticated;

create or replace function public.manager_complete_task(p_task_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.production_tasks%rowtype;
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  update public.production_tasks
    set status='completed', completion_notes=nullif(trim(p_notes),''), completed_at=now(), updated_at=now()
    where id=p_task_id and status in ('in_progress','blocked','needs_review')
    returning * into t;
  if not found then raise exception 'Task not found or not completable'; end if;
  insert into public.production_manager_log(action,message,task_id)
  values ('completed', 'Task completed: "' || t.title || '". Manager may dispatch the next queued task for ' || t.team_role || '.', t.id);
  return jsonb_build_object('id',t.id,'task_key',t.task_key,'team_role',t.team_role,'status',t.status);
end;
$$;
revoke all on function public.manager_complete_task(uuid,text) from public;
grant execute on function public.manager_complete_task(uuid,text) to authenticated;

create or replace function public.manager_block_task(p_task_id uuid, p_blocker text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.production_tasks%rowtype;
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  update public.production_tasks set status='blocked', blocker=left(trim(p_blocker),1000), updated_at=now()
   where id=p_task_id and status='in_progress' returning * into t;
  if not found then raise exception 'Active task not found'; end if;
  insert into public.production_manager_log(action,message,task_id)
  values ('blocked','Task blocked: "' || t.title || '". Manager review required. Reason: ' || coalesce(t.blocker,'not provided'),t.id);
end;
$$;
revoke all on function public.manager_block_task(uuid,text) from public;
grant execute on function public.manager_block_task(uuid,text) to authenticated;

comment on table public.production_tasks is 'Owner-admin task board for AniQuotes 4K. Status tracking does not imply autonomous content generation.';
