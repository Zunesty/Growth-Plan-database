import type { NextRequest } from "next/server";
import { moveTask } from "@/lib/client-hub-taskops";
import { apiError, HttpError } from "@/lib/client-hub-http";
import type { TaskStatus } from "@/lib/client-hub-types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { to_status, note } = (await req.json()) as { to_status?: TaskStatus; note?: string };
    if (!to_status) throw new HttpError(400, "Missing to_status.");
    const result = await moveTask(Number(id), to_status, "dashboard", note);
    return Response.json(result);
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
