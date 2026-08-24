// Slash command endpoint (/task ...). Raw body read FIRST, verified, THEN
// parsed — reading req.json()/req.formData() before verification would
// consume the stream and lose the exact bytes the signature is computed
// over. Same pattern as the Fathom webhook route.
import type { NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/client-hub-slack";
import { handleSlashCommand } from "@/lib/client-hub-commands";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const valid = verifySlackSignature({
    rawBody,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
  });
  if (!valid) return Response.json({ error: "invalid signature" }, { status: 401 });

  const params = new URLSearchParams(rawBody);
  const text = params.get("text") || "";
  const channelId = params.get("channel_id") || "";
  const userId = params.get("user_id") || "";

  try {
    const result = await handleSlashCommand({ text, channelId, userId });
    return Response.json(result);
  } catch (e) {
    return Response.json({ response_type: "ephemeral", text: `Error: ${(e as Error).message}` });
  }
}
