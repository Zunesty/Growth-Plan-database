import type { NextRequest } from "next/server";
import { setClientStage } from "@/lib/client-hub-clients";
import { apiError, HttpError } from "@/lib/client-hub-http";
import type { ClientStage } from "@/lib/client-hub-types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { stage } = (await req.json()) as { stage?: ClientStage };
    if (!stage) throw new HttpError(400, "Missing stage.");
    const client = await setClientStage(Number(id), stage);
    return Response.json({ client });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
