import type { NextRequest } from "next/server";
import { apiError } from "@/lib/client-hub-http";

export async function GET(req: NextRequest) {
  try {
    const base = req.nextUrl.origin;
    return Response.json({
      mcp_url: `${base}/api/client-hub/mcp`,
      api_url: `${base}/api/client-hub`,
      api_token_configured: Boolean(process.env.CLIENT_HUB_API_TOKEN),
      slack_configured: Boolean(process.env.CLIENT_HUB_SLACK_BOT_TOKEN && process.env.CLIENT_HUB_SLACK_SIGNING_SECRET),
      claude_code_snippet: `claude mcp add --transport http client-hub ${base}/api/client-hub/mcp --header "Authorization: Bearer $CLIENT_HUB_API_TOKEN"`,
    });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
