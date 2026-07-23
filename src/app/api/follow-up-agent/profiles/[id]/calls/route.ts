import type { NextRequest } from "next/server";
import * as profiles from "@/lib/followup-store";
import * as service from "@/lib/followup-service";
import { apiError, HttpError } from "@/lib/followup-http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await profiles.get(id);
    if (!p) throw new HttpError(404, "Profile not found.");

    const lookbackDays = parseInt(req.nextUrl.searchParams.get("lookback") || "14", 10);
    const result = await service.listCalls(p, { lookbackDays });
    return Response.json(result);
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
