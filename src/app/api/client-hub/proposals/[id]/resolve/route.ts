import type { NextRequest } from "next/server";
import { resolveProposal } from "@/lib/client-hub-proposals";
import { apiError, HttpError } from "@/lib/client-hub-http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action } = (await req.json()) as { action?: "approve" | "dismiss" };
    if (action !== "approve" && action !== "dismiss") throw new HttpError(400, "action must be 'approve' or 'dismiss'.");
    const result = await resolveProposal(Number(id), action, "dashboard");
    return Response.json(result);
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
