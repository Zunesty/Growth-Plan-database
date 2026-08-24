import type { NextRequest } from "next/server";
import { updateTeamMember, deleteTeamMember } from "@/lib/client-hub-team";
import { apiError } from "@/lib/client-hub-http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fields = await req.json();
    const member = await updateTeamMember(Number(id), fields);
    return Response.json({ member });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteTeamMember(Number(id));
    return Response.json({ ok: true });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
