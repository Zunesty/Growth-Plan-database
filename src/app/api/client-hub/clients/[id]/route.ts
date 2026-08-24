import type { NextRequest } from "next/server";
import { updateClient } from "@/lib/client-hub-clients";
import { apiError } from "@/lib/client-hub-http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fields = await req.json();
    const client = await updateClient(Number(id), fields);
    return Response.json({ client });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
