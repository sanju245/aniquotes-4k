# Phase 5 — Production Manager and Task Queue

## What this adds

- Owner-admin-only production task board at `/tasks` in the existing Next.js admin app.
- A persistent task queue and manager activity log in Supabase.
- A deterministic manager dispatcher that assigns at most one active task per specialist role.
- Completion notes, blocker reporting, and a manager activity log.
- Seeded initial work covering research, prompt direction, static asset production, quote design, live video concepts, quality control, storage/catalog operations, Android integration, and marketing.
- The stated library targets are 900 normal wallpapers, 700 quote wallpapers, and 80 live wallpapers (1,680 total).

## Important limitation

This is a real workflow/task board, but it is **not a set of autonomous AI agents**. The specialist roles are work queues assigned by the manager rules. A person or separately configured AI worker must actually perform the task, attach output evidence, and mark it complete. The manager does not generate images/videos, call an image/video model, or publish assets on its own. Do not report a task as complete merely because it was assigned.

## Setup

1. Apply migrations in order, including `202610230006_production_manager_workflow.sql`, in Supabase SQL Editor.
2. Ensure your signed-in Supabase user is listed in `public.app_admins`.
3. Configure `admin/.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Run `cd admin && npm install && npm run dev` and open `http://localhost:3000`.
5. Sign in on the owner admin page, then choose **Production manager** or open `/tasks`.
6. Press **Manager: assign next tasks**. The dispatcher activates the highest-priority queued task for each role that does not already have an active task.
7. When a task is actually delivered, add notes and mark it complete. The page then automatically runs the dispatcher and assigns next queued tasks to available roles. If blocked, provide a reason; the manager log records it.

## Security and publishing

- Task rows and manager log are restricted to authenticated owner admins by RLS and RPC checks.
- This workflow does not grant content rights. Famous anime characters require appropriate rights for commercial distribution; use original/licensed assets and preserve rights metadata.
- The target counters are goals, not live completed-asset counts. Approved/published asset counters will be connected only when asset approval and storage evidence are implemented.
- The SQL and TypeScript source have not been tested against a live Supabase project. Apply in a development project first and verify RPC/RLS behavior before production use.
