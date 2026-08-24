// Client Hub — the shared task-mutation core. Every caller (dashboard API
// routes now; Slack commands/mentions, the AI sweep, the recurring engine,
// and the MCP server later) goes through these functions, never raw
// Supabase calls, so the revision-bump rule and activity logging can never
// be bypassed. Ported function-for-function from the source app's
// taskops.js (originally synchronous better-sqlite3; now async Supabase).

import { supabase } from "./supabase";
import { HttpError } from "./client-hub-http";
import { todayPacific, daysAgoPacific } from "./client-hub-config";
import { TASK_STATUSES } from "./client-hub-types";
import type { ActivityAction, Task, TaskSource, TaskStatus, TaskWithNames } from "./client-hub-types";

const TASKS = "client_hub_tasks";
const ACTIVITY = "client_hub_activity_log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTaskRow(row: any): TaskWithNames {
  const { client_hub_clients, client_hub_team, ...rest } = row;
  return {
    ...rest,
    client_name: client_hub_clients?.name ?? null,
    assignee_name: client_hub_team?.name ?? null,
  };
}

const TASK_SELECT = "*, client_hub_clients(name), client_hub_team(name)";

export async function logActivity(
  taskId: number,
  actor: string | null | undefined,
  action: ActivityAction,
  opts: { from_status?: TaskStatus | null; to_status?: TaskStatus | null; note?: string | null } = {}
): Promise<void> {
  const { error } = await supabase.from(ACTIVITY).insert({
    task_id: taskId,
    actor: actor ?? null,
    action,
    from_status: opts.from_status ?? null,
    to_status: opts.to_status ?? null,
    note: opts.note ?? null,
  });
  if (error) console.error("[client-hub] activity log insert failed:", error.message);
}

async function getTaskRaw(id: number): Promise<Task> {
  const { data, error } = await supabase.from(TASKS).select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new HttpError(404, "Task not found.");
  return data as Task;
}

export async function getTask(id: number): Promise<TaskWithNames> {
  const { data, error } = await supabase.from(TASKS).select(TASK_SELECT).eq("id", id).maybeSingle();
  if (error || !data) throw new HttpError(404, "Task not found.");
  return mapTaskRow(data);
}

export async function createTask(input: {
  client_id?: number | null;
  title: string;
  details?: string | null;
  assignee_id?: number | null;
  due_date?: string | null;
  status?: TaskStatus;
  source: TaskSource;
  slack_permalink?: string | null;
  recurring_template_id?: number | null;
  actor?: string | null;
}): Promise<TaskWithNames> {
  const finalStatus: TaskStatus = input.status && TASK_STATUSES.includes(input.status) ? input.status : "todo";
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from(TASKS)
    .insert({
      client_id: input.client_id ?? null,
      title: input.title,
      details: input.details ?? null,
      assignee_id: input.assignee_id ?? null,
      due_date: input.due_date ?? null,
      status: finalStatus,
      source: input.source ?? null,
      slack_permalink: input.slack_permalink ?? null,
      recurring_template_id: input.recurring_template_id ?? null,
      completed_at: finalStatus === "completed" ? nowIso : null,
    })
    .select("id")
    .single();
  if (error || !data) throw new HttpError(500, `Failed to create task: ${error?.message}`);

  await logActivity(data.id, input.actor, "created", { note: `via ${input.source}` });
  return getTask(data.id);
}

export async function moveTask(
  id: number,
  toStatus: TaskStatus,
  actor?: string | null,
  note?: string | null
): Promise<{ task: TaskWithNames; bumped: boolean; unchanged: boolean }> {
  if (!TASK_STATUSES.includes(toStatus)) throw new HttpError(400, "Unknown status.");
  const current = await getTaskRaw(id);

  if (current.status === toStatus) {
    return { task: await getTask(id), bumped: false, unchanged: true };
  }

  // Sending a task backward from QC/Completed into In Progress counts as a
  // revision, not a plain status change — preserved exactly from the source.
  const bump = toStatus === "in_progress" && (current.status === "qc" || current.status === "completed");
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from(TASKS)
    .update({
      status: toStatus,
      updated_at: nowIso,
      // Cleared on every transition away from completed, including into
      // another non-completed status — intentional, matches the source.
      completed_at: toStatus === "completed" ? nowIso : null,
      ...(bump ? { revision_count: current.revision_count + 1 } : {}),
    })
    .eq("id", id);
  if (error) throw new HttpError(500, `Failed to move task: ${error.message}`);

  await logActivity(id, actor, bump ? "revision" : "status_change", {
    from_status: current.status,
    to_status: toStatus,
    note,
  });

  return { task: await getTask(id), bumped: bump, unchanged: false };
}

const UPDATABLE_FIELDS = ["title", "details", "assignee_id", "due_date", "client_id"] as const;
type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

export async function updateTask(
  id: number,
  fields: Partial<Record<UpdatableField, string | number | null>> & { status?: TaskStatus },
  actor?: string | null
): Promise<TaskWithNames> {
  const current = await getTaskRaw(id);

  // A status change embedded in a PATCH must go through moveTask so the
  // revision-bump rule can't be bypassed by editing status via updateTask.
  if (fields.status != null && fields.status !== current.status) {
    await moveTask(id, fields.status, actor);
  }

  const patch: Record<string, string | number | null> = {};
  const changedNames: string[] = [];
  for (const key of UPDATABLE_FIELDS) {
    if (key in fields) {
      const raw = fields[key];
      const value = raw === "" ? null : raw ?? null;
      if (value !== (current as unknown as Record<string, unknown>)[key]) {
        patch[key] = value;
        changedNames.push(key);
      }
    }
  }

  if (changedNames.length) {
    const { error } = await supabase
      .from(TASKS)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new HttpError(500, `Failed to update task: ${error.message}`);
    await logActivity(id, actor, "updated", { note: changedNames.join(", ") });
  }

  return getTask(id);
}

export async function listTasks(
  opts: {
    client_id?: number;
    status?: TaskStatus;
    assignee_id?: number;
    openOnly?: boolean;
    completedSinceDays?: number;
  } = {}
): Promise<TaskWithNames[]> {
  let query = supabase.from(TASKS).select(TASK_SELECT);
  if (opts.client_id != null) query = query.eq("client_id", opts.client_id);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.assignee_id != null) query = query.eq("assignee_id", opts.assignee_id);

  if (opts.completedSinceDays != null) {
    const cutoff = new Date(Date.now() - opts.completedSinceDays * 24 * 60 * 60 * 1000).toISOString();
    // Open tasks, PLUS anything completed within the window — not a plain
    // AND filter, matches the source's dashboard-feed semantics.
    query = query.or(`status.neq.completed,and(status.eq.completed,completed_at.gte.${cutoff})`);
  } else if (opts.openOnly) {
    query = query.neq("status", "completed");
  }

  query = query.order("due_date", { ascending: true, nullsFirst: false }).order("id", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("[client-hub] listTasks error:", error.message);
    return [];
  }
  return (data || []).map(mapTaskRow);
}

export async function overdueTasks(): Promise<TaskWithNames[]> {
  const today = todayPacific();
  const tasks = await listTasks({ openOnly: true });
  return tasks.filter((t) => t.due_date && t.due_date < today);
}

export async function dueTodayTasks(): Promise<TaskWithNames[]> {
  const today = todayPacific();
  const tasks = await listTasks({ openOnly: true });
  return tasks.filter((t) => t.due_date === today);
}

// A task's `updated_at` is stamped by every mutation that also logs
// activity, so it's an accurate proxy for "most recent activity" without a
// separate correlated query against activity_log.
export async function inactiveTasks(status: TaskStatus, days: number): Promise<TaskWithNames[]> {
  const tasks = await listTasks({ status });
  return tasks.filter((t) => daysAgoPacific(t.updated_at) >= days);
}

export async function staleTasks(days = 5): Promise<TaskWithNames[]> {
  return inactiveTasks("in_progress", days);
}
