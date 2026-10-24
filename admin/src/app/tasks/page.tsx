"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Task = {
  id: string; task_key: string; title: string; description: string; team_role: string;
  category: string; status: "queued" | "in_progress" | "blocked" | "completed" | "needs_review";
  priority: number; asset_number: number | null; completion_notes: string | null; blocker: string | null;
  created_at: string; assigned_at: string | null; completed_at: string | null;
};
type Log = { id: number; action: string; message: string; created_at: string };

const TARGETS = [
  { label: "Normal 4K wallpapers", target: 900, color: "#8b5cf6" },
  { label: "Anime quote wallpapers", target: 700, color: "#ec4899" },
  { label: "Live wallpapers", target: 80, color: "#06b6d4" },
];

export default function ProductionTasksPage() {
  const supabase = useMemo(() => { try { return createSupabaseBrowserClient(); } catch { return null; } }, []);
  const [email, setEmail] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("all");
  const [managerPlan, setManagerPlan] = useState<any>(null);
  const [planning, setPlanning] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setBusy(true); setError("");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setEmail(null); setTasks([]); setLogs([]); setBusy(false); return; }
    const { data: admin } = await supabase.from("app_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!admin) { setEmail(null); setError("Owner admin access is required. Sign in from the main admin page first."); setBusy(false); return; }
    setEmail(auth.user.email ?? "Owner admin");
    const [taskResult, logResult] = await Promise.all([
      supabase.from("production_tasks").select("id,task_key,title,description,team_role,category,status,priority,asset_number,completion_notes,blocker,created_at,assigned_at,completed_at").order("priority", { ascending: false }).order("created_at", { ascending: true }),
      supabase.from("production_manager_log").select("id,action,message,created_at").order("created_at", { ascending: false }).limit(12),
    ]);
    if (taskResult.error) setError(taskResult.error.message + " — apply migration 202610230006_production_manager_workflow.sql first.");
    else setTasks((taskResult.data ?? []) as Task[]);
    if (logResult.error) setLogs([]); else setLogs((logResult.data ?? []) as Log[]);
    setBusy(false);
  }, [supabase]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function askManager() {
    setPlanning(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/manager/plan", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Manager planning failed.");
      setManagerPlan(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Manager planning failed."); }
    finally { setPlanning(false); }
  }

  async function dispatch() {
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    const { data, error } = await supabase.rpc("manager_dispatch_tasks");
    if (error) setError(error.message + " — ensure migration 202610230006 is applied and your user is in app_admins.");
    else setNotice(data ? `Manager dispatched ${data} task(s). Each specialist has at most one active task.` : "No tasks could be dispatched. Complete or unblock active tasks first.");
    await refresh();
  }

  async function complete(task: Task) {
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    const { error } = await supabase.rpc("manager_complete_task", { p_task_id: task.id, p_notes: notes[task.id] ?? "" });
    if (error) setError(error.message);
    else {
      const { data: dispatched, error: dispatchError } = await supabase.rpc("manager_dispatch_tasks");
      if (dispatchError) setNotice(`Task marked complete. Manager auto-dispatch needs attention: ${dispatchError.message}`);
      else setNotice(`Completed “${task.title}”. Manager automatically dispatched ${dispatched ?? 0} next task(s) to available specialists.`);
    }
    await refresh();
  }

  async function block(task: Task) {
    if (!supabase) return;
    const reason = (blockers[task.id] ?? "").trim();
    if (!reason) { setError("Enter the blocker before asking the manager to review it."); return; }
    setBusy(true); setError(""); setNotice("");
    const { error } = await supabase.rpc("manager_block_task", { p_task_id: task.id, p_blocker: reason });
    if (error) setError(error.message); else setNotice(`“${task.title}” is blocked and has been added to the manager log.`);
    await refresh();
  }

  const completed = tasks.filter(t => t.status === "completed").length;
  const active = tasks.filter(t => t.status === "in_progress").length;
  const blocked = tasks.filter(t => t.status === "blocked").length;
  const visibleTasks = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  if (!supabase) return <main className="shell"><Link href="/">← Back to admin</Link><section className="panel"><h1>Production manager</h1><p className="subtle">Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to connect the production task board.</p></section></main>;

  return <main className="shell">
    <header className="topbar">
      <div><div className="brand">ANIQUOTES 4K / PRODUCTION</div><p className="subtle">Manager-led wallpaper production workflow</p></div>
      <div className="row"><Link href="/" className="btn secondary" style={{ textDecoration: "none" }}>Wallpaper admin</Link><button className="btn secondary" onClick={() => void refresh()} disabled={busy}>Refresh</button></div>
    </header>
    {!email ? <section className="panel"><h1>Sign in required</h1><p className="subtle">Sign in on the main admin page, then open this task board. Only the owner admin can access production tasks.</p><Link href="/" className="btn" style={{ display: "inline-block", textDecoration: "none" }}>Open admin sign-in</Link></section> : <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><div><div className="pill">PROJECT MANAGER · RULE-BASED DISPATCH</div><h1 style={{ marginBottom: 6 }}>Production control room</h1><p className="subtle" style={{ marginTop: 0 }}>Signed in as {email}. Each role receives no more than one active task. Complete or flag work, then the manager dispatches the next queued task.</p></div><div className="row"><button className="btn secondary" onClick={() => void askManager()} disabled={planning || busy}>{planning ? "Manager thinking…" : "Ask AI Manager"}</button><button className="btn" onClick={() => void dispatch()} disabled={busy}>Manager: assign next tasks</button></div></div>
        <div className="grid" style={{ marginTop: 18 }}>
          {[{ label: "Queued tasks", value: tasks.filter(t => t.status === "queued").length }, { label: "Active tasks", value: active }, { label: "Completed tasks", value: completed }, { label: "Blocked tasks", value: blocked }].map(m => <div className="panel" key={m.label}><div className="subtle">{m.label}</div><div className="metric">{m.value}</div></div>)}
        </div>
      </section>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Library targets</h2><p className="subtle">Targets are project goals. Progress below counts completed tasks, not approved or published wallpaper files.</p>
        <div className="grid">{TARGETS.map(t => <div key={t.label} className="panel"><div className="subtle">{t.label}</div><div className="metric">{t.target.toLocaleString()}</div><div style={{ height: 8, background: "#393542", borderRadius: 99, overflow: "hidden" }}><div style={{ width: "0%", height: 8, background: t.color }} /></div><p className="subtle" style={{ marginBottom: 0 }}>0 approved assets recorded in this phase</p></div>)}</div>
      </section>
      {error && <p className="notice error">{error}</p>}{notice && <p className="notice">{notice}</p>}
      {managerPlan && <section className="panel" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Manager decision & next steps</h2><span className="pill">{managerPlan.mode === "ai" ? `AI · ${managerPlan.model}` : "Rules fallback"}</span></div>
        {managerPlan.message && <p className="subtle">{managerPlan.message}</p>}
        {managerPlan.counts && <p className="subtle">Queue: {managerPlan.counts.queued} queued · {managerPlan.counts.active} active · {managerPlan.counts.blocked} blocked · {managerPlan.counts.completed} completed</p>}
        {managerPlan.plan?.statusSummary && <p>{managerPlan.plan.statusSummary}</p>}
        {managerPlan.plan?.managerDecision && <p><strong>Manager decision:</strong> {managerPlan.plan.managerDecision}</p>}
        {(managerPlan.plan?.immediatePriorities ?? managerPlan.nextSteps ?? []).map((item: any, index: number) => <article className="panel" key={item.taskKey ?? index}><div className="pill">{item.taskKey ?? "NEXT STEP"}</div><h3>{item.action}</h3><p className="subtle">{item.reason}</p><p>{item.acceptanceCriteria}</p></article>)}
        {managerPlan.plan?.risks?.length > 0 && <><h3>Risks to manage</h3><ul>{managerPlan.plan.risks.map((risk: string, i: number) => <li key={i}>{risk}</li>)}</ul></>}
        {managerPlan.setup && <><h3>AI setup required</h3><ol>{managerPlan.setup.map((step: string, i: number) => <li key={i}>{step}</li>)}</ol></>}
      </section>}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Team task queue</h2><select value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 210 }}><option value="all">All statuses</option><option value="queued">Queued</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></div>
        <div className="grid">{visibleTasks.map(task => <article className="panel" key={task.id}>
          <div className="row" style={{ justifyContent: "space-between" }}><span className="pill">{task.team_role}</span><span className="pill">{task.status.replace("_", " ")}</span></div>
          <h3>{task.title}</h3><p className="subtle">{task.description}</p><p className="subtle" style={{ fontSize: 12 }}>Task {task.task_key} · Priority {task.priority}{task.asset_number ? ` · Asset #${task.asset_number}` : ""}</p>
          {task.blocker && <p className="notice error">Blocker: {task.blocker}</p>}
          {task.status === "in_progress" && <><label>Completion notes (optional)<textarea value={notes[task.id] ?? ""} onChange={e => setNotes(s => ({ ...s, [task.id]: e.target.value }))} placeholder="What was delivered? Link output paths or test evidence." /></label><div className="row" style={{ marginTop: 10 }}><button className="btn" disabled={busy} onClick={() => void complete(task)}>Mark complete</button><button className="btn secondary" disabled={busy} onClick={() => void block(task)}>Flag blocker</button></div><label style={{ marginTop: 10 }}>Blocker reason<textarea value={blockers[task.id] ?? ""} onChange={e => setBlockers(s => ({ ...s, [task.id]: e.target.value }))} placeholder="Missing source, rights, failed test, etc." /></label></>}
          {task.status === "completed" && <p className="notice">Completed {task.completed_at ? new Date(task.completed_at).toLocaleString() : ""}{task.completion_notes ? ` — ${task.completion_notes}` : ""}</p>}
        </article>)}</div>
        {!visibleTasks.length && <p className="subtle">No tasks in this status.</p>}
      </section>
      <section className="panel"><h2>Manager activity log</h2>{logs.length ? <div className="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Manager note</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString()}</td><td><span className="pill">{log.action}</span></td><td>{log.message}</td></tr>)}</tbody></table></div> : <p className="subtle">The manager log will appear after the first task dispatch or status change.</p>}</section>
    </>}
    <p className="subtle" style={{ marginTop: 18, fontSize: 12 }}>Important: this board coordinates tasks and records status. It does not create autonomous AI workers, generate artwork, or publish media by itself. Generated assets must pass rights and quality checks before publication.</p>
  </main>;
}
