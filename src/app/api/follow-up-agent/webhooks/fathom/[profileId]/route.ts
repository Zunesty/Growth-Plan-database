// Fathom webhook (Autopilot trigger) — public, signature-verified, not
// gated behind any auth. Processing happens before the response (no
// post-response work in serverless); Fathom retries + the dedupe marker
// make this safe.
import type { NextRequest } from "next/server";
import * as autopilot from "@/lib/followup-autopilot";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const rawBody = await req.text();
  let parsedBody: unknown = {};
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    // Leave parsedBody as {} — signature verification below still runs on rawBody.
  }

  const result = await autopilot.handleWebhook({
    profileId,
    rawBody,
    headers: req.headers,
    parsedBody,
  });
  return Response.json(result.body, { status: result.status });
}
