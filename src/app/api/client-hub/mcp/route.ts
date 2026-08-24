// MCP server (Streamable HTTP, simple JSON-response mode — no SSE stream).
// Bearer-gated separately from the open dashboard routes, since this is
// reachable by external tools (Claude, ChatGPT), not just the dashboard.
import type { NextRequest } from "next/server";
import { handleMcpRequest } from "@/lib/client-hub-mcp";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.CLIENT_HUB_API_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") || "";
  return header.replace(/^Bearer\s+/i, "") === token;
}

export async function GET() {
  return Response.json({ error: "POST JSON-RPC messages to this endpoint" }, { status: 405 });
}

export async function POST(req: NextRequest) {
  if (!process.env.CLIENT_HUB_API_TOKEN) {
    return Response.json({ error: "Client Hub MCP/API is not configured (CLIENT_HUB_API_TOKEN unset)." }, { status: 503 });
  }
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const msg = await req.json();
  const result = await handleMcpRequest(msg);

  // Notifications (no `id` in the request) get an empty 202, no body.
  if (result === null) return new Response(null, { status: 202 });
  return Response.json(result);
}
