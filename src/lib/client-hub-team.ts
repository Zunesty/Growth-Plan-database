import { supabase } from "./supabase";
import { HttpError } from "./client-hub-http";
import type { TeamMember } from "./client-hub-types";

const TEAM = "client_hub_team";

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase.from(TEAM).select("*").order("name");
  if (error) {
    console.error("[client-hub] listTeam error:", error.message);
    return [];
  }
  return (data || []) as TeamMember[];
}

export async function createTeamMember(input: {
  name: string;
  slack_user_id?: string | null;
  role?: string | null;
}): Promise<TeamMember> {
  const { data, error } = await supabase
    .from(TEAM)
    .insert({ name: input.name, slack_user_id: input.slack_user_id ?? null, role: input.role ?? null })
    .select()
    .single();
  if (error || !data) throw new HttpError(500, `Failed to create team member: ${error?.message}`);
  return data as TeamMember;
}

export async function updateTeamMember(
  id: number,
  fields: { name?: string; slack_user_id?: string | null; role?: string | null }
): Promise<TeamMember> {
  const patch: Record<string, unknown> = {};
  if ("name" in fields) patch.name = fields.name;
  if ("slack_user_id" in fields) patch.slack_user_id = fields.slack_user_id || null;
  if ("role" in fields) patch.role = fields.role || null;

  const { data, error } = await supabase.from(TEAM).update(patch).eq("id", id).select().maybeSingle();
  if (error) throw new HttpError(500, `Failed to update team member: ${error.message}`);
  if (!data) throw new HttpError(404, "Team member not found.");
  return data as TeamMember;
}

// Tasks/recurring templates assigned to this member fall back to
// unassigned automatically via the `on delete set null` foreign keys — no
// manual null-out step needed here, unlike the source app.
export async function deleteTeamMember(id: number): Promise<void> {
  const { error } = await supabase.from(TEAM).delete().eq("id", id);
  if (error) throw new HttpError(500, `Failed to delete team member: ${error.message}`);
}
