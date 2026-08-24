// Client Hub — dashboard-only "Sweep" review composition: merges open
// proposals with overdue/stuck-QC/stale tasks into one prioritized list.
// Not reused by anything else (unlike taskops/proposals, which are the real
// shared core) — this is purely UI convenience for the review modal.

import { overdueTasks, inactiveTasks, staleTasks } from "./client-hub-taskops";
import { openProposals } from "./client-hub-proposals";

export type Finding =
  | { type: "proposal"; proposalId: number; kind: string; clientName: string | null; payload: Record<string, unknown> }
  | { type: "overdue"; taskId: number; title: string; clientName: string | null; dueDate: string | null }
  | { type: "stuck_qc"; taskId: number; title: string; clientName: string | null }
  | { type: "stale"; taskId: number; title: string; clientName: string | null };

export async function buildFindings(): Promise<Finding[]> {
  const [proposals, overdue, stuckQc, stale] = await Promise.all([
    openProposals(),
    overdueTasks(),
    inactiveTasks("qc", 5),
    staleTasks(5),
  ]);

  const findings: Finding[] = [];
  for (const p of proposals) {
    findings.push({ type: "proposal", proposalId: p.id, kind: p.kind, clientName: p.client_name ?? null, payload: p.payload });
  }
  for (const t of overdue.slice(0, 4)) {
    findings.push({ type: "overdue", taskId: t.id, title: t.title, clientName: t.client_name, dueDate: t.due_date });
  }
  for (const t of stuckQc.slice(0, 3)) {
    findings.push({ type: "stuck_qc", taskId: t.id, title: t.title, clientName: t.client_name });
  }
  for (const t of stale.slice(0, 3)) {
    findings.push({ type: "stale", taskId: t.id, title: t.title, clientName: t.client_name });
  }
  return findings.slice(0, 8);
}
