import type { NextRequest } from "next/server";
import { updateRecurringTemplate } from "@/lib/client-hub-recurring";
import { apiError } from "@/lib/client-hub-http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fields = await req.json();
    const template = await updateRecurringTemplate(Number(id), fields);
    return Response.json({ template });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
