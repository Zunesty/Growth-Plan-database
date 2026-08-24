// Client Hub — Slack interactivity: the "Add as task" message shortcut +
// its modal, and block-action button clicks (approve/dismiss proposals,
// done/push-to-qc on stale-task nudges).

import { createTask, moveTask } from "./client-hub-taskops";
import { resolveProposal } from "./client-hub-proposals";
import { listClients } from "./client-hub-clients";
import { listTeam } from "./client-hub-team";
import { getPermalink, openView, postToResponseUrl } from "./client-hub-slack";
import type { Client, TeamMember } from "./client-hub-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackPayload = any;

function buildAddTaskModal({
  initialTitle,
  clients,
  team,
  preselectClientId,
  metadata,
}: {
  initialTitle: string;
  clients: Client[];
  team: TeamMember[];
  preselectClientId: number | null;
  metadata: { channel?: string; message_ts?: string };
}) {
  const clientOption = (c: Client) => ({ text: { type: "plain_text", text: c.name }, value: String(c.id) });
  const preselected = preselectClientId ? clients.find((c) => c.id === preselectClientId) : null;

  return {
    type: "modal",
    callback_id: "client_hub_add_task",
    private_metadata: JSON.stringify(metadata || {}),
    title: { type: "plain_text", text: "Add task" },
    submit: { type: "plain_text", text: "Create" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "title",
        label: { type: "plain_text", text: "Title" },
        element: { type: "plain_text_input", action_id: "value", initial_value: initialTitle.slice(0, 80) },
      },
      {
        type: "input",
        block_id: "client",
        optional: true,
        label: { type: "plain_text", text: "Client" },
        element: {
          type: "static_select",
          action_id: "value",
          options: clients.map(clientOption),
          ...(preselected ? { initial_option: clientOption(preselected) } : {}),
        },
      },
      {
        type: "input",
        block_id: "assignee",
        optional: true,
        label: { type: "plain_text", text: "Assignee" },
        element: {
          type: "static_select",
          action_id: "value",
          options: team.map((t) => ({ text: { type: "plain_text", text: t.name }, value: String(t.id) })),
        },
      },
      {
        type: "input",
        block_id: "due",
        optional: true,
        label: { type: "plain_text", text: "Due" },
        element: { type: "datepicker", action_id: "value" },
      },
    ],
  };
}

export async function handleShortcut(payload: SlackPayload): Promise<void> {
  const [clients, team] = await Promise.all([listClients(), listTeam()]);
  const channelId: string | undefined = payload.channel?.id;
  const messageTs: string | undefined = payload.message?.ts;
  const initialTitle: string = payload.message?.text || "";
  const preselected = clients.find((c) => c.slack_channel_id === channelId) || null;

  const view = buildAddTaskModal({
    initialTitle,
    clients,
    team,
    preselectClientId: preselected?.id ?? null,
    metadata: { channel: channelId, message_ts: messageTs },
  });
  await openView(payload.trigger_id, view);
}

export async function handleViewSubmission(payload: SlackPayload): Promise<{ response_action: "clear" }> {
  const values = payload.view.state.values;
  const title: string = values.title?.value?.value || "Untitled task";
  const clientId = values.client?.value?.selected_option?.value;
  const assigneeId = values.assignee?.value?.selected_option?.value;
  const dueDate = values.due?.value?.selected_date || null;

  let metadata: { channel?: string; message_ts?: string } = {};
  try {
    metadata = payload.view.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    metadata = {};
  }

  let permalink: string | null = null;
  if (metadata.channel && metadata.message_ts) {
    permalink = await getPermalink(metadata.channel, metadata.message_ts);
  }

  await createTask({
    client_id: clientId ? Number(clientId) : null,
    title,
    assignee_id: assigneeId ? Number(assigneeId) : null,
    due_date: dueDate,
    source: "slack_shortcut",
    slack_permalink: permalink,
    actor: payload.user?.id,
  });

  return { response_action: "clear" };
}

export async function handleBlockAction(payload: SlackPayload): Promise<void> {
  const action = payload.actions?.[0];
  const actionId: string | undefined = action?.action_id;
  const responseUrl: string | undefined = payload.response_url;
  const actor: string | undefined = payload.user?.id;
  let text = "";

  try {
    if (actionId === "approve_proposal" || actionId === "dismiss_proposal") {
      const proposalId = Number(action.value);
      await resolveProposal(proposalId, actionId === "approve_proposal" ? "approve" : "dismiss", actor);
      text = actionId === "approve_proposal" ? "✅ Proposal approved." : "Dismissed.";
    } else if (actionId === "task_done" || actionId === "task_qc") {
      const taskId = Number(action.value);
      await moveTask(taskId, actionId === "task_done" ? "completed" : "qc", actor);
      text = `Task #${taskId} moved to ${actionId === "task_done" ? "Completed" : "Quality Control"}.`;
    }
  } catch (e) {
    text = `Couldn't apply that: ${(e as Error).message}`;
  }

  if (responseUrl && text) {
    await postToResponseUrl(responseUrl, { response_type: "ephemeral", replace_original: false, text });
  }
}
