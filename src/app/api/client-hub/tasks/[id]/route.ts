import type { NextRequest } from "next/server";
import { updateTask } from "@/lib/client-hub-taskops";
import { apiError } from "@/lib/client-hub-http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fields = await req.json();
    const task = await updateTask(Number(id), fields, "dashboard");
    return Response.json({ task });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
