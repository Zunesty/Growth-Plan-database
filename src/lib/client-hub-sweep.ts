// Client Hub — the AI sweep. "Bounded AI with a leash": only mapped client
// channels, only the last 24h, max 200 messages, text-only, ONE Claude call
// PER CLIENT, confidence below 0.6 dropped, writes proposals only — never
// mutates tasks directly (read-only against listTasks for context).

import Anthropic from "@anthropic-ai/sdk";
import { clientHubConfig } from "./client-hub-config";
import { listClients } from "./client-hub-clients";
import { listTasks } from "./client-hub-taskops";
import { addProposal } from "./client-hub-proposals";
import { fetchChannelHistory, getPermalink } from "./client-hub-slack";
import type { Client, ProposalKind } from "./client-hub-types";

const anthropic = new Anthropic();

const SWEEP_MAX_MESSAGES = 200;
const SWEEP_MIN_CONFIDENCE = 0.6;
const MESSAGE_CHAR_CAP = 600;

const SWEEP_SYSTEM = `You are the task-sweep for Zunesty's internal PM system. You read the last 24h of one client's Slack channel plus that client's open tasks, and propose changes. You NEVER act — humans approve.

Output ONLY a JSON array (no prose, no code fences). Each item:
{
  "kind": "new_task" | "status_change",
  "confidence": 0.0-1.0,
  "evidence_ts": "<ts of the Slack message that justifies this, from the input>",
  "payload": { ... }
}

For "new_task", payload = {"title": "<imperative, <=80 chars>", "details": "<1-2 sentence summary of the ask>", "due_date": "YYYY-MM-DD or null"}.
Propose one when a message contains a clear new ask/request that is NOT already covered by an open task.

For "status_change", payload = {"task_id": <id of an existing open task>, "to_status": "in_progress"|"qc"|"completed", "reason": "<short>"}.
Propose "completed" when a message clearly signals the work is done/approved. Propose "in_progress" (send back) when the client requests changes on something in QC or Completed.

Be conservative: no proposal for vague chatter, scheduling, or pleasantries. Confidence below 0.6 will be dropped. If nothing qualifies, output [].`;

type SweepItem = {
  kind: ProposalKind;
  confidence: number;
  evidence_ts?: string;
  payload: Record<string, unknown>;
};

async function sweepClient(client: Client): Promise<number> {
  if (!client.slack_channel_id) return 0;

  const oldestUnix = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  let raw: Array<{ type?: string; subtype?: string; text?: string; ts: string; user?: string }>;
  try {
    raw = await fetchChannelHistory(client.slack_channel_id, oldestUnix, SWEEP_MAX_MESSAGES);
  } catch (e) {
    console.error(`[client-hub sweep] history fetch failed for ${client.name}:`, (e as Error).message);
    return 0;
  }

  const messages = raw
    .filter((m) => m.type === "message" && !m.subtype && (m.text || "").trim())
    .map((m) => ({ ts: m.ts, user: m.user, text: String(m.text).slice(0, MESSAGE_CHAR_CAP) }));
  if (!messages.length) return 0;

  const openTasks = (await listTasks({ client_id: client.id, openOnly: true })).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due_date: t.due_date,
    assignee: t.assignee_name,
  }));

  let text: string;
  try {
    const response = await anthropic.messages.create({
      model: clientHubConfig.ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: SWEEP_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ client: client.name, open_tasks: openTasks, channel_messages_24h: messages }),
        },
      ],
    });
    text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (e) {
    console.error(`[client-hub sweep] Claude call failed for ${client.name}:`, (e as Error).message);
    return 0;
  }

  let items: SweepItem[];
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    items = JSON.parse(cleaned);
  } catch {
    console.error(`[client-hub sweep] ${client.name}: model did not return valid JSON`);
    return 0;
  }

  let count = 0;
  for (const item of items) {
    if (typeof item.confidence !== "number" || item.confidence < SWEEP_MIN_CONFIDENCE) continue;
    const payload: Record<string, unknown> = { ...item.payload, confidence: item.confidence };
    if (item.evidence_ts) {
      payload.evidence_permalink = await getPermalink(client.slack_channel_id, item.evidence_ts);
    }
    await addProposal({ kind: item.kind, client_id: client.id, payload });
    count++;
  }
  return count;
}

export async function runSweep(): Promise<{ ok: boolean; proposals?: number; channels?: number; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY not configured" };

  const clients = (await listClients()).filter((c) => c.active && c.slack_channel_id);
  let total = 0;
  for (const client of clients) {
    try {
      total += await sweepClient(client);
    } catch (e) {
      console.error(`[client-hub sweep] failed for ${client.name}:`, (e as Error).message);
    }
  }
  return { ok: true, proposals: total, channels: clients.length };
}
