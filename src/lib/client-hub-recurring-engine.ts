// Client Hub — recurring task spawner. Evaluates each active template's
// due_rule against today, and creates a task once today falls inside
// [due - lead_time_days, due]. Idempotent: skips if a task already exists
// for that template + due date, so re-running (manual trigger, cron retry)
// is always safe.

import { supabase } from "./supabase";
import { listRecurring } from "./client-hub-recurring";
import { createTask } from "./client-hub-taskops";
import { todayPacific } from "./client-hub-config";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function lastWeekdayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0); // last calendar day of `month` (0-indexed)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// 'day:25' | 'last_weekday' | 'weekday:mon' -> the next applicable due date
// on or after today, as "YYYY-MM-DD".
function nextDueForRule(rule: string, todayStr: string): string {
  const today = new Date(`${todayStr}T00:00:00`);

  if (rule.startsWith("day:")) {
    const day = Number(rule.slice(4));
    let candidate = new Date(today.getFullYear(), today.getMonth(), day);
    if (candidate < today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
    return candidate.toISOString().slice(0, 10);
  }

  if (rule === "last_weekday") {
    let candidate = lastWeekdayOfMonth(today.getFullYear(), today.getMonth());
    if (candidate < today) candidate = lastWeekdayOfMonth(today.getFullYear(), today.getMonth() + 1);
    return candidate.toISOString().slice(0, 10);
  }

  if (rule.startsWith("weekday:")) {
    const idx = WEEKDAYS.indexOf(rule.slice(8).toLowerCase().slice(0, 3));
    if (idx === -1) return todayStr;
    const candidate = new Date(today);
    let delta = idx - candidate.getDay();
    if (delta < 0) delta += 7;
    candidate.setDate(candidate.getDate() + delta);
    return candidate.toISOString().slice(0, 10);
  }

  return todayStr;
}

export async function spawnDueRecurringTasks(): Promise<{ spawned: number }> {
  const templates = (await listRecurring()).filter((r) => r.active);
  const todayStr = todayPacific();
  const today = new Date(`${todayStr}T00:00:00`);
  let spawned = 0;

  for (const tpl of templates) {
    const dueStr = nextDueForRule(tpl.due_rule, todayStr);
    const due = new Date(`${dueStr}T00:00:00`);
    const spawnFrom = new Date(due);
    spawnFrom.setDate(spawnFrom.getDate() - tpl.lead_time_days);
    if (today < spawnFrom || today > due) continue;

    const { data: existing } = await supabase
      .from("client_hub_tasks")
      .select("id")
      .eq("recurring_template_id", tpl.id)
      .eq("due_date", dueStr)
      .maybeSingle();
    if (existing) continue;

    await createTask({
      client_id: tpl.client_id,
      title: tpl.title,
      details: tpl.details,
      assignee_id: tpl.assignee_id,
      due_date: dueStr,
      source: "recurring",
      recurring_template_id: tpl.id,
      actor: "recurring-engine",
    });
    spawned++;
  }

  return { spawned };
}
