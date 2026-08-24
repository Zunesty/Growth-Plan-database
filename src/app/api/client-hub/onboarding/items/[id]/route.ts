import type { NextRequest } from "next/server";
import { updateOnboardingItem, deleteOnboardingItem } from "@/lib/client-hub-onboarding";
import { apiError } from "@/lib/client-hub-http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fields = await req.json();
    const item = await updateOnboardingItem(Number(id), fields);
    return Response.json({ item });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteOnboardingItem(Number(id));
    return Response.json({ ok: true });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
