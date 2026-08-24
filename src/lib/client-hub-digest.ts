// Client Hub — the daily digest: per-client pipeline counts, overdue/due-
// today, stale tasks, and open AI proposals, posted to a Slack channel with
// Approve/Dismiss + Done/Push-to-QC buttons. Also used standalone by the
// dashboard's "Preview digest" action (no posting, just the computed data).

import { listClients } from "./client-hub-clients";
import { listTasks, overdueTasks, dueTodayTasks, staleTasks } from "./client-hub-taskops";
import { openProposals, stampDigestTs } from "./client-hub-proposals";
import { postMessage } from "./client-hub-slack";
import { STATUS_LABELS } from "./client-hub-types";
import type { Proposal, TaskStatus, TaskWithNames } from "./client-hub-types";

export type DigestData = {
  perClient: { clientId: number; clientName: string; counts: Record<string, number>; overdue: number }[];
  overdue: TaskWithNames[];
  dueToday: TaskWithNames[];
  stale: TaskWithNames[];
  proposals: Proposal[];
};

export async function buildDigestData(): Promise<DigestData> {
  const [clients, allTasks, overdue, dueToday, stale, proposals] = await Promise.all([
    listClients(),
    listTasks({ openOnly: true }),
    overdueTasks(),
    dueTodayTasks(),
    staleTasks(),
    openProposals(),
  ]);

  const overdueIds = new Set(overdue.map((t) => t.id));
  const perClient = clients
    .filter((c) => c.active)
    .map((c) => {
      const clientTasks = allTasks.filter((t) => t.client_id === c.id);
      const counts: Record<string, number> = { todo: 0, in_progress: 0, qc: 0 };
      for (const t of clientTasks) counts[t.status] = (counts[t.status] || 0) + 1;
      return {
        clientId: c.id,
        clientName: c.name,
        counts,
        overdue: clientTasks.filter((t) => overdueIds.has(t.id)).length,
      };
    });

  return { perClient, overdue, dueToday, stale, proposals };
}

export function buildDigestText(data: DigestData): string {
  const lines: string[] = ["*Daily Digest*"];
  for (const c of data.perClient) {
    lines.push(
      `• ${c.clientName}: ${c.counts.todo || 0} to do, ${c.counts.in_progress || 0} in progress, ${c.counts.qc || 0} in QC${
        c.overdue ? ` (${c.overdue} overdue)` : ""
      }`
    );
  }
  if (data.overdue.length) lines.push(`🔴 Overdue: ${data.overdue.length}`);
  if (data.dueToday.length) lines.push(`⏰ Due today: ${data.dueToday.length}`);
  if (data.stale.length) lines.push(`⚪ Stale (in progress >5 days): ${data.stale.length}`);
  if (data.proposals.length) lines.push(`🟡 Open proposals: ${data.proposals.length}`);
  return lines.join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDigestBlocks(data: DigestData): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [{ type: "header", text: { type: "plain_text", text: "Daily Digest" } }];

  const summaryLines = data.perClient.map(
    (c) =>
      `*${c.clientName}*: ${c.counts.todo || 0} to do · ${c.counts.in_progress || 0} in progress · ${c.counts.qc || 0} in QC${
        c.overdue ? ` · _${c.overdue} overdue_` : ""
      }`
  );
  if (summaryLines.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: summaryLines.join("\n") } });

  if (data.overdue.length || data.dueToday.length) {
    const bits: string[] = [];
    if (data.overdue.length) bits.push(`🔴 *${data.overdue.length} overdue*`);
    if (data.dueToday.length) bits.push(`⏰ *${data.dueToday.length} due today*`);
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: bits.join("   ") } });
  }

  if (data.stale.length) {
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: "⚪ *Stale tasks (in progress >5 days)*" } });
    for (const t of data.stale.slice(0, 10)) {
      blocks.push(
        { type: "section", text: { type: "mrkdwn", text: `#${t.id} ${t.title}${t.client_name ? ` — ${t.client_name}` : ""}` } },
        {
          type: "actions",
          elements: [
            { type: "button", text: { type: "plain_text", text: "Done" }, action_id: "task_done", value: String(t.id) },
            { type: "button", text: { type: "plain_text", text: "Push to QC" }, action_id: "task_qc", value: String(t.id) },
          ],
        }
      );
    }
  }

  if (data.proposals.length) {
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: "🟡 *Proposals*" } });
    for (const p of data.proposals) {
      const payload = p.payload as Record<string, unknown>;
      const desc =
        p.kind === "new_task"
          ? `New task: *${payload.title}*${p.client_name ? ` — ${p.client_name}` : ""}`
          : `Move #${payload.task_id} → ${STATUS_LABELS[payload.to_status as TaskStatus] || String(payload.to_status)}`;
      const evidence = payload.evidence_permalink ? `\n<${payload.evidence_permalink}|View message>` : "";
      blocks.push(
        { type: "section", text: { type: "mrkdwn", text: `${desc}${evidence}` } },
        {
          type: "actions",
          elements: [
            { type: "button", text: { type: "plain_text", text: "Approve" }, style: "primary", action_id: "approve_proposal", value: String(p.id) },
            { type: "button", text: { type: "plain_text", text: "Dismiss" }, action_id: "dismiss_proposal", value: String(p.id) },
          ],
        }
      );
    }
  }

  return blocks;
}

export async function postDigest(): Promise<{ ok: boolean; demo?: boolean; text: string }> {
  const data = await buildDigestData();
  const text = buildDigestText(data);

  const channelId = process.env.CLIENT_HUB_DIGEST_CHANNEL_ID;
  if (!channelId) return { ok: false, text };

  const blocks = buildDigestBlocks(data);
  const ts = await postMessage(channelId, text, blocks);
  if (ts && data.proposals.length) await stampDigestTs(data.proposals.map((p) => p.id), ts);

  return { ok: true, text };
}
