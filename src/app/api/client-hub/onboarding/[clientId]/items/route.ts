import type { NextRequest } from "next/server";
import { createOnboardingItem } from "@/lib/client-hub-onboarding";
import { apiError, HttpError } from "@/lib/client-hub-http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await params;
    const { title } = (await req.json()) as { title?: string };
    if (!title) throw new HttpError(400, "Missing title.");
    const item = await createOnboardingItem(Number(clientId), title);
    return Response.json({ item });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
