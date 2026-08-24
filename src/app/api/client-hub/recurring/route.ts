import type { NextRequest } from "next/server";
import { createRecurringTemplate } from "@/lib/client-hub-recurring";
import { apiError, HttpError } from "@/lib/client-hub-http";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.title || !body?.due_rule) throw new HttpError(400, "Missing title or due_rule.");
    const template = await createRecurringTemplate(body);
    return Response.json({ template });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
