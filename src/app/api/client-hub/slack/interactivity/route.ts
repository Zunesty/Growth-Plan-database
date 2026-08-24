// Interactivity endpoint: message shortcuts, modal submissions, button
// clicks. Slack sends this as application/x-www-form-urlencoded with a
// single `payload` field holding a JSON string. Raw body read first,
// verified, then parsed — same reasoning as the commands route.
//
// Everything here is awaited before responding rather than fired-and-
// forgotten after the response: unlike a long-lived Express process,
// Vercel functions aren't guaranteed to keep running once a response has
// been sent, so background work would risk never completing.
import type { NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/client-hub-slack";
import { handleShortcut, handleViewSubmission, handleBlockAction } from "@/lib/client-hub-interactivity";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const valid = verifySlackSignature({
    rawBody,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
  });
  if (!valid) return new Response("invalid signature", { status: 401 });

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return new Response("", { status: 200 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return new Response("", { status: 200 });
  }

  try {
    if (payload.type === "message_action" && payload.callback_id === "add_as_task") {
      await handleShortcut(payload);
      return new Response("", { status: 200 });
    }

    if (payload.type === "view_submission" && payload.view?.callback_id === "client_hub_add_task") {
      const result = await handleViewSubmission(payload);
      return Response.json(result);
    }

    if (payload.type === "block_actions") {
      await handleBlockAction(payload);
      return new Response("", { status: 200 });
    }
  } catch (e) {
    console.error("[client-hub] interactivity handling failed:", (e as Error).message);
  }

  return new Response("", { status: 200 });
}
