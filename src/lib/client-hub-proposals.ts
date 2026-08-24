// Client Hub — the single choke point from an AI-sweep proposal to an
// actual task mutation. A human approval (dashboard click or Slack button)
// is always required; the sweep itself only ever calls addProposal.

import { supabase } from "./supabase";
import { HttpError } from "./client-hub-http";
import { createTask, moveTask } from "./client-hub-taskops";
import type { Proposal, ProposalKind, TaskStatus } from "./client-hub-types";

const PROPOSALS = "client_hub_proposals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProposalRow(row: any): Proposal {
  const { client_hub_clients, payload_json, ...rest } = row;
  return {
    ...rest,
    payload: payload_json || {},
    client_name: client_hub_clients?.name ?? null,
  };
}

export async function addProposal({
  kind,
  client_id,
  payload,
}: {
  kind: ProposalKind;
  client_id: number | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from(PROPOSALS).insert({ kind, client_id, payload_json: payload, status: "open" });
  if (error) console.error("[client-hub] addProposal failed:", error.message);
}

export async function openProposals(): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from(PROPOSALS)
    .select("*, client_hub_clients(name)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[client-hub] openProposals error:", error.message);
    return [];
  }
  return (data || []).map(mapProposalRow);
}

// Stamps every currently-open proposal with the digest message's ts —
// write-only metadata, matches the source: nothing reads it back later.
export async function stampDigestTs(proposalIds: number[], ts: string): Promise<void> {
  if (!proposalIds.length) return;
  const { error } = await supabase.from(PROPOSALS).update({ slack_message_ts: ts }).in("id", proposalIds);
  if (error) console.error("[client-hub] stampDigestTs failed:", error.message);
}

export async function resolveProposal(
  id: number,
  action: "approve" | "dismiss",
  actor?: string | null
): Promise<{ ok: true; task?: unknown }> {
  const { data: row, error } = await supabase.from(PROPOSALS).select("*").eq("id", id).maybeSingle();
  if (error || !row) throw new HttpError(404, "Proposal not found.");
  if (row.status !== "open") throw new HttpError(400, "Proposal already resolved.");

  if (action === "dismiss") {
    await supabase
      .from(PROPOSALS)
      .update({ status: "dismissed", resolved_by: actor ?? null, resolved_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: true };
  }

  const payload = (row.payload_json || {}) as Record<string, unknown>;
  let task: unknown;

  if (row.kind === "new_task") {
    task = await createTask({
      client_id: row.client_id,
      title: (payload.title as string) || "Untitled task",
      details: (payload.details as string) || null,
      due_date: (payload.due_date as string) || null,
      source: "sweep",
      slack_permalink: (payload.evidence_permalink as string) || null,
      actor,
    });
  } else if (row.kind === "status_change") {
    const result = await moveTask(Number(payload.task_id), payload.to_status as TaskStatus, actor, "approved sweep proposal");
    task = result.task;
  }

  await supabase
    .from(PROPOSALS)
    .update({ status: "approved", resolved_by: actor ?? null, resolved_at: new Date().toISOString() })
    .eq("id", id);

  return { ok: true, task };
}
