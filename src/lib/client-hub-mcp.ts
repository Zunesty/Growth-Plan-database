// Client Hub — MCP server. Hand-rolled JSON-RPC 2.0 (no SDK dependency),
// matching the source app's approach — simpler to fit into a single Next.js
// route handler than wiring up a full SDK transport, and the source's
// implementation (protocol negotiation, tools/list, tools/call) was already
// solid.

import { listTasks, createTask, updateTask } from "./client-hub-taskops";
import { listClients } from "./client-hub-clients";
import { listTeam } from "./client-hub-team";
import { buildDigestData, buildDigestText } from "./client-hub-digest";
import { runSweep } from "./client-hub-sweep";
import { fuzzyFindByName } from "./client-hub-slack-parse";
import type { TaskStatus } from "./client-hub-types";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  {
    name: "list_tasks",
    description:
      "List Zunesty Client Hub tasks. Filter by client name (fuzzy, e.g. 'revx'), status (todo|in_progress|qc|completed), or assignee name. Returns id, title, client, assignee, status, due_date, revision_count.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client name or id (optional)" },
        status: { type: "string", enum: ["todo", "in_progress", "qc", "completed"], description: "Pipeline stage (optional)" },
        assignee: { type: "string", description: "Team member name or id (optional)" },
      },
    },
  },
  {
    name: "create_task",
    description: "Create a task in the Client Hub pipeline (defaults to To Do).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        client: { type: "string", description: "Client name (fuzzy) or id" },
        assignee: { type: "string", description: "Team member name or id (optional)" },
        due_date: { type: "string", description: "YYYY-MM-DD (optional)" },
        details: { type: "string", description: "Free-text project details (optional)" },
        status: { type: "string", enum: ["todo", "in_progress", "qc", "completed"] },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Update a task: move it between stages (todo|in_progress|qc|completed), reassign, change due date, title, or details. Moving qc/completed -> in_progress records a revision bump.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Task id" },
        status: { type: "string", enum: ["todo", "in_progress", "qc", "completed"] },
        assignee: { type: "string", description: "Team member name or id, empty string to unassign" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        title: { type: "string" },
        details: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_digest_preview",
    description: "Run the deterministic daily-digest queries on demand: per-client pipeline counts, overdue/due-today, stale tasks, open AI proposals.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "run_sweep",
    description: "Trigger the AI sweep now (reads mapped client channels, writes proposals — never changes tasks directly).",
    inputSchema: { type: "object", properties: {} },
  },
];

async function resolveClientId(query?: string): Promise<number | null> {
  if (!query) return null;
  if (/^\d+$/.test(query)) return Number(query);
  const match = fuzzyFindByName(query, await listClients());
  return match?.id ?? null;
}

// undefined = "field not supplied", null = "explicitly unassign".
async function resolveAssigneeId(query?: string): Promise<number | null | undefined> {
  if (query === undefined) return undefined;
  if (query === "") return null;
  if (/^\d+$/.test(query)) return Number(query);
  const match = fuzzyFindByName(query, await listTeam());
  return match?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTool(name: string, args: any): Promise<unknown> {
  if (name === "list_tasks") {
    const clientId = args.client ? await resolveClientId(args.client) : undefined;
    const assigneeId = args.assignee ? await resolveAssigneeId(args.assignee) : undefined;
    const tasks = await listTasks({
      client_id: clientId ?? undefined,
      status: args.status as TaskStatus | undefined,
      assignee_id: assigneeId ?? undefined,
    });
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      client: t.client_name,
      assignee: t.assignee_name,
      status: t.status,
      due_date: t.due_date,
      revision_count: t.revision_count,
    }));
  }

  if (name === "create_task") {
    if (!args.title) throw new Error("title is required");
    const clientId = await resolveClientId(args.client);
    const assigneeId = await resolveAssigneeId(args.assignee);
    return createTask({
      title: args.title,
      client_id: clientId,
      assignee_id: assigneeId ?? null,
      due_date: args.due_date ?? null,
      details: args.details ?? null,
      status: args.status as TaskStatus | undefined,
      source: "api",
      actor: "mcp",
    });
  }

  if (name === "update_task") {
    if (args.id == null) throw new Error("id is required");
    const fields: Record<string, unknown> = {};
    if (args.status !== undefined) fields.status = args.status;
    if (args.due_date !== undefined) fields.due_date = args.due_date;
    if (args.title !== undefined) fields.title = args.title;
    if (args.details !== undefined) fields.details = args.details;
    if (args.assignee !== undefined) fields.assignee_id = await resolveAssigneeId(args.assignee);
    return updateTask(Number(args.id), fields, "mcp");
  }

  if (name === "get_digest_preview") {
    const data = await buildDigestData();
    return { text: buildDigestText(data), data };
  }

  if (name === "run_sweep") return runSweep();

  throw new Error(`Unknown tool: ${name}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleMcpRequest(msg: any): Promise<any | null> {
  if (!msg || msg.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }

  // Notifications (no id) get no response at all.
  if (msg.id === undefined) return null;

  if (msg.method === "initialize") {
    const requested = msg.params?.protocolVersion;
    const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "zunesty-client-hub", version: "1.0.0" },
        instructions:
          "Zunesty Client Hub: the internal client task pipeline (To Do → In Progress → Quality Control → Completed). Use list_tasks/create_task/update_task to read and write it, get_digest_preview for the daily status math, run_sweep to trigger the AI channel sweep (proposals only).",
      },
    };
  }

  if (msg.method === "ping") return { jsonrpc: "2.0", id: msg.id, result: {} };

  if (msg.method === "tools/list") return { jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } };

  if (msg.method === "tools/call") {
    const { name, arguments: args } = msg.params || {};
    try {
      const result = await callTool(name, args || {});
      return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true },
      };
    }
  }

  return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
}
