// CRUD only in this phase — evaluating due_rule against the calendar and
// spawning tasks from it is the recurring engine, built later alongside the
// cron jobs.

import { supabase } from "./supabase";
import { HttpError } from "./client-hub-http";
import type { RecurringTemplate } from "./client-hub-types";

const RECURRING = "client_hub_recurring";

export async function listRecurring(): Promise<RecurringTemplate[]> {
  const { data, error } = await supabase.from(RECURRING).select("*").order("title");
  if (error) {
    console.error("[client-hub] listRecurring error:", error.message);
    return [];
  }
  return (data || []) as RecurringTemplate[];
}

export async function createRecurringTemplate(input: {
  client_id?: number | null;
  title: string;
  details?: string | null;
  assignee_id?: number | null;
  due_rule: string;
  lead_time_days?: number;
}): Promise<RecurringTemplate> {
  const { data, error } = await supabase
    .from(RECURRING)
    .insert({
      client_id: input.client_id ?? null,
      title: input.title,
      details: input.details ?? null,
      assignee_id: input.assignee_id ?? null,
      due_rule: input.due_rule,
      lead_time_days: input.lead_time_days ?? 5,
    })
    .select()
    .single();
  if (error || !data) throw new HttpError(500, `Failed to create recurring template: ${error?.message}`);
  return data as RecurringTemplate;
}

const UPDATABLE_FIELDS = ["client_id", "title", "details", "assignee_id", "due_rule", "lead_time_days", "active"] as const;

export async function updateRecurringTemplate(
  id: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: Record<string, any>
): Promise<RecurringTemplate> {
  const patch: Record<string, unknown> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (key in fields) patch[key] = fields[key] === "" ? null : fields[key];
  }
  const { data, error } = await supabase.from(RECURRING).update(patch).eq("id", id).select().maybeSingle();
  if (error) throw new HttpError(500, `Failed to update recurring template: ${error.message}`);
  if (!data) throw new HttpError(404, "Recurring template not found.");
  return data as RecurringTemplate;
}
