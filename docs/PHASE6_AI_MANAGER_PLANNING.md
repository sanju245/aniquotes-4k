# Phase 6 — AI Manager Planning

## What's new

- Adds an owner-admin-authenticated `/api/manager/plan` endpoint.
- Adds an **Ask AI Manager** control to `/tasks`.
- The endpoint reads the actual production task queue and asks a configured Vercel AI Gateway model for a concise status summary, top three priorities, acceptance criteria, risks, and manager decision.
- If AI Gateway credentials are not configured, the endpoint returns a transparent rules-based fallback plan from the real queued tasks. It does not pretend an LLM ran.
- The manager recommendation never marks tasks complete, uploads assets, changes task states, or publishes content. The existing dispatcher remains a separate explicit action.
- The route checks Supabase authentication and `app_admins` membership on the server before reading task data.

## Setup

1. Apply the Phase 5 Supabase migration first.
2. Copy `admin/.env.example` to `admin/.env.local` and configure the Supabase URL and anon/publishable key.
3. To enable AI plans, set server-only `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL`. Use an exact model identifier available in the Vercel AI Gateway model catalogue. Never expose the API key through a `NEXT_PUBLIC_` variable or commit it.
4. Restart the admin app and open `/tasks` while signed in as an owner admin.
5. Click **Ask AI Manager** to produce a plan; click **Manager: assign next tasks** separately to run the deterministic dispatcher.

## Important limitations

- This is an AI planning endpoint, not a fully autonomous worker team. It does not generate images/video, execute task work, create storage assets, or mark tasks complete.
- AI Gateway calls may incur costs, and the model must be enabled for the configured key/team.
- The route has not been tested against a live Supabase or AI Gateway account in this environment. Verify authentication, model availability, and costs in a development deployment before production use.
- Asset rights and QC remain mandatory. Famous anime character artwork requires appropriate commercial permissions; an AI-generated image does not automatically grant those rights.
