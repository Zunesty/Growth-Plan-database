// Demo/test only: simulate an incoming Fathom webhook to exercise the
// Autopilot path without real Fathom/Gmail keys.
import type { NextRequest } from "next/server";
import * as profiles from "@/lib/followup-store";
import * as autopilot from "@/lib/followup-autopilot";
import * as demo from "@/lib/followup-demo";
import { apiError, HttpError } from "@/lib/followup-http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await profiles.get(id);
    if (!p) throw new HttpError(404, "Profile not found.");

    const body = await req.json().catch(() => ({}));
    const which = body?.which || "match";
    const call = which === "decoy" ? demo.DECOY_CALL : demo.SAMPLE_CALLS[0];
    const result = await autopilot.processCall(p, call, "simulate");
    return Response.json({ which, call: { title: call.title, recordingId: call.recordingId }, result });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
