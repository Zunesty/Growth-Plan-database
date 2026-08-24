// Client Hub — @mention handling. Creates a task from any message that
// @mentions the bot, confirms via a ✅ reaction, and NEVER posts a new
// message into the client channel (hard guardrail, preserved from source).

import { supabase } from "./supabase";
import { createTask } from "./client-hub-taskops";
import { listClients } from "./client-hub-clients";
import { listTeam } from "./client-hub-team";
import { extractAssignee, extractDue } from "./client-hub-slack-parse";
import { addReaction, getPermalink } from "./client-hub-slack";

// Belt: in-memory dedupe by Slack's event_id. Resets on cold start, which is
// exactly why the DB-level check below (suspenders) matters more here than
// it did in the source app's always-on process.
const seenEventIds = new Set<string>();
const MAX_SEEN_EVENTS = 500;

function alreadySeen(eventId: string | undefined): boolean {
  if (!eventId) return false;
  if (seenEventIds.has(eventId)) return true;
  seenEventIds.add(eventId);
  if (seenEventIds.size > MAX_SEEN_EVENTS) {
    const first = seenEventIds.values().next().value;
    if (first) seenEventIds.delete(first);
  }
  return false;
}

export async function handleAppMention(event: {
  event_id?: string;
  channel: string;
  ts: string;
  text?: string;
  user?: string;
}): Promise<void> {
  if (alreadySeen(event.event_id)) return;

  const stripped = (event.text || "").replace(/<@[A-Z0-9]+>/gi, "").trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);

  const [clients, team] = await Promise.all([listClients(), listTeam()]);
  const assignee = extractAssignee(tokens, team);
  const dueDate = extractDue(tokens);

  let title = tokens.join(" ").trim();
  let details: string | null = null;
  if (title.length > 80) {
    details = title;
    title = title.slice(0, 80);
  }
  if (!title) return;

  const client = clients.find((c) => c.slack_channel_id === event.channel) || null;
  const permalink = await getPermalink(event.channel, event.ts);

  // Suspenders: survives cold starts, unlike the in-memory Set alone.
  if (permalink) {
    const { data } = await supabase.from("client_hub_tasks").select("id").eq("slack_permalink", permalink).maybeSingle();
    if (data) return;
  }

  await createTask({
    client_id: client?.id ?? null,
    title,
    details,
    assignee_id: assignee?.id ?? null,
    due_date: dueDate,
    source: "slack_mention",
    slack_permalink: permalink,
    actor: event.user,
  });

  await addReaction(event.channel, event.ts, "white_check_mark");
}
