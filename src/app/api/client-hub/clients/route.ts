import type { NextRequest } from "next/server";
import { createClient } from "@/lib/client-hub-clients";
import { apiError, HttpError } from "@/lib/client-hub-http";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.name) throw new HttpError(400, "Missing name.");
    const client = await createClient(body);
    return Response.json({ client });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
