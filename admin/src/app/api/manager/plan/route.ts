import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 503 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(values) {
          try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components may be read-only. */ }
        },
      },
    });

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const { data: admin } = await supabase.from("app_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!admin) return NextResponse.json({ error: "Owner admin access is required." }, { status: 403 });

    const { data: tasks, error: taskError } = await supabase
      .from("production_tasks")
      .select("task_key,title,description,team_role,category,status,priority,asset_number,blocker,completion_notes")
      .order("priority", { ascending: false })
      .limit(120);
    if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });

    const counts = {
      queued: (tasks ?? []).filter(t => t.status === "queued").length,
      active: (tasks ?? []).filter(t => t.status === "in_progress").length,
      blocked: (tasks ?? []).filter(t => t.status === "blocked").length,
      completed: (tasks ?? []).filter(t => t.status === "completed").length,
    };

    const apiKey = process.env.AI_GATEWAY_API_KEY;
    const model = process.env.AI_GATEWAY_MODEL;
    if (!apiKey || !model) {
      return NextResponse.json({
        mode: "rules_only",
        counts,
        message: "The task board is connected, but the AI Manager is not configured yet.",
        setup: ["Set AI_GATEWAY_API_KEY as a server-only environment variable.", "Set AI_GATEWAY_MODEL to an exact model ID available in Vercel AI Gateway.", "Restart/redeploy the admin app, then run Ask AI Manager again."],
        nextSteps: buildFallbackPlan(tasks ?? []),
      });
    }

    const prompt = `You are the production manager for AniQuotes 4K. The owner wants premium quality and a content target of 900 normal static wallpapers, 700 quote wallpapers, and 80 live MP4 wallpapers. Be autonomous about routine planning, but never claim work is done without evidence. Flag commercial rights for famous anime characters; require rights clearance before publishing. Distinguish concept prompts from finished files, and never label upscaled art native 4K. Review these real task records and return concise JSON with keys: statusSummary (string), immediatePriorities (array of 3 objects with taskKey, action, reason, acceptanceCriteria), risks (array of strings), managerDecision (string). Do not invent task IDs or completed assets. Tasks: ${JSON.stringify(tasks ?? [])}`;
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: "Return valid JSON only. Do not use markdown fences." }, { role: "user", content: prompt }], temperature: 0.2 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json({ error: `AI Gateway request failed (${response.status}). Check model, key, credits, and Gateway logs.`, detail: detail.slice(0, 400), counts }, { status: 502 });
    }
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return NextResponse.json({ error: "AI Manager returned an unexpected response shape." }, { status: 502 });
    let plan: unknown;
    try { plan = JSON.parse(content); } catch { return NextResponse.json({ error: "AI Manager response was not valid JSON.", raw: content.slice(0, 1200), counts }, { status: 502 }); }
    return NextResponse.json({ mode: "ai", counts, plan, model: result?.model ?? model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown manager error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildFallbackPlan(tasks: Array<{ task_key: string; title: string; team_role: string; status: string; priority: number; description: string }>) {
  const queued = tasks.filter(t => t.status === "queued").sort((a, b) => b.priority - a.priority);
  const activeRoles = new Set(tasks.filter(t => t.status === "in_progress").map(t => t.team_role));
  return queued.filter(t => !activeRoles.has(t.team_role)).slice(0, 3).map(t => ({
    taskKey: t.task_key,
    action: t.title,
    reason: "Highest-priority queued task for a role without an active assignment.",
    acceptanceCriteria: t.description,
  }));
}
