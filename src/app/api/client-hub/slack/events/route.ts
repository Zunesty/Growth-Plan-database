// Events endpoint: url_verification handshake + app_mention events.
// Raw-body-first pattern, same as the other 2 Slack routes.
import type { NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/client-hub-slack";
import { handleAppMention } from "@/lib/client-hub-mentions";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const valid = verifySlackSignature({
    rawBody,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
  });
  if (!valid) return new Response("invalid signature", { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("", { status: 200 });
  }

  if (body.type === "url_verification") {
    return Response.json({ challenge: body.challenge });
  }

  if (body.type === "event_callback" && body.event?.type === "app_mention") {
    try {
      await handleAppMention(body.event);
    } catch (e) {
      console.error("[client-hub] app_mention handling failed:", (e as Error).message);
    }
  }

  return new Response("", { status: 200 });
}
