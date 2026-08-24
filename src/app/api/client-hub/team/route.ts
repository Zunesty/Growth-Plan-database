import type { NextRequest } from "next/server";
import { createTeamMember } from "@/lib/client-hub-team";
import { apiError, HttpError } from "@/lib/client-hub-http";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.name) throw new HttpError(400, "Missing name.");
    const member = await createTeamMember(body);
    return Response.json({ member });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
