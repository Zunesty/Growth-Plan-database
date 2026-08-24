// Client Hub — `/task` slash command dispatch. Fully async against Supabase
// (the source app was synchronous against better-sqlite3, comfortably
// inside Slack's 3s window; a few sequential Supabase calls here should
// still land well under it, but this is the spot to watch if that ever
// changes — see the plan doc's note on response_url-deferred replies as the
// standard escape hatch).

import { createTask, listTasks, moveTask } from "./client-hub-taskops";
import { listClients } from "./client-hub-clients";
import { listTeam } from "./client-hub-team";
import { extractAssignee, extractDue, fuzzyFindByName } from "./client-hub-slack-parse";
import { STATUS_LABELS, TASK_STATUSES } from "./client-hub-types";
import type { TaskStatus, TaskWithNames } from "./client-hub-types";

type SlashResponse = { response_type: "ephemeral"; text: string };

const HELP_TEXT = [
  "*Client Hub — /task commands*",
  "`/task add <client> <title> [@who] [due:<fri|today|8/2|+3d>]` — create a task (client optional inside a mapped client channel)",
  "`/task start|qc|done|back <id>` — move a task's status",
  "`/task list [client|@person|mine]` — list open tasks",
  "`/task help` — this message",
].join("\n");

function formatTaskLine(t: TaskWithNames): string {
  const bits = [`#${t.id} ${t.title}`];
  if (t.client_name) bits.push(`(${t.client_name})`);
  if (t.assignee_name) bits.push(`@${t.assignee_name}`);
  if (t.due_date) bits.push(`due ${t.due_date}`);
  return bits.join(" ");
}

export async function handleSlashCommand({
  text,
  channelId,
  userId,
}: {
  text: string;
  channelId: string;
  userId: string;
}): Promise<SlashResponse> {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const sub = (tokens.shift() || "").toLowerCase();

  const [clients, team] = await Promise.all([listClients(), listTeam()]);

  if (sub === "add") {
    let client = tokens.length ? fuzzyFindByName(tokens[0], clients) : null;
    if (client) tokens.shift();
    if (!client) client = clients.find((c) => c.slack_channel_id === channelId) || null;

    const assignee = extractAssignee(tokens, team);
    const dueDate = extractDue(tokens);
    const title = tokens.join(" ").trim();

    if (!title) return { response_type: "ephemeral", text: "Usage: `/task add <client> <title> [@who] [due:...]`" };

    const task = await createTask({
      client_id: client?.id ?? null,
      title,
      assignee_id: assignee?.id ?? null,
      due_date: dueDate,
      source: "slack_command",
      actor: userId,
    });
    return {
      response_type: "ephemeral",
      text: `✅ Created #${task.id}: ${task.title}${client ? ` — ${client.name}` : ""}${assignee ? ` — @${assignee.name}` : ""}`,
    };
  }

  if (sub === "start" || sub === "qc" || sub === "done" || sub === "back") {
    const id = Number(tokens[0]);
    if (!id) return { response_type: "ephemeral", text: "Usage: `/task start|qc|done|back <id>`" };
    const toStatus: TaskStatus = sub === "start" || sub === "back" ? "in_progress" : sub === "qc" ? "qc" : "completed";
    const note = sub === "back" ? "sent back via /task back" : undefined;
    try {
      const result = await moveTask(id, toStatus, userId, note);
      return {
        response_type: "ephemeral",
        text: `Task #${id} → ${STATUS_LABELS[toStatus]}${result.bumped ? " (revision recorded)" : ""}`,
      };
    } catch (e) {
      return { response_type: "ephemeral", text: `Couldn't move task #${id}: ${(e as Error).message}` };
    }
  }

  if (sub === "list") {
    const arg = tokens.join(" ").trim();
    let tasks: TaskWithNames[];
    if (!arg) {
      tasks = await listTasks({ openOnly: true });
    } else if (arg === "mine") {
      const me = team.find((t) => t.slack_user_id === userId);
      tasks = me ? await listTasks({ openOnly: true, assignee_id: me.id }) : [];
    } else if (arg.startsWith("@") || arg.startsWith("<@")) {
      const person = fuzzyFindByName(arg.replace(/^[<@]+|>$/g, ""), team);
      tasks = person ? await listTasks({ openOnly: true, assignee_id: person.id }) : [];
    } else {
      const client = fuzzyFindByName(arg, clients);
      tasks = client ? await listTasks({ openOnly: true, client_id: client.id }) : [];
    }

    if (!tasks.length) return { response_type: "ephemeral", text: "No open tasks." };

    const lines: string[] = [];
    for (const status of TASK_STATUSES) {
      const group = tasks.filter((t) => t.status === status);
      if (!group.length) continue;
      lines.push(`*${STATUS_LABELS[status]}*`);
      lines.push(...group.map(formatTaskLine));
    }
    return { response_type: "ephemeral", text: lines.join("\n") };
  }

  return { response_type: "ephemeral", text: HELP_TEXT };
}
