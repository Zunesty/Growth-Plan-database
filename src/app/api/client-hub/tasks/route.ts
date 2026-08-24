import type { NextRequest } from "next/server";
import { createTask } from "@/lib/client-hub-taskops";
import { apiError, HttpError } from "@/lib/client-hub-http";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.title) throw new HttpError(400, "Missing title.");
    const task = await createTask({
      client_id: body.client_id ?? null,
      title: body.title,
      details: body.details ?? null,
      assignee_id: body.assignee_id ?? null,
      due_date: body.due_date ?? null,
      status: body.status,
      source: "dashboard",
      actor: "dashboard",
    });
    return Response.json({ task });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
