import type { NextRequest } from "next/server";
import * as profiles from "@/lib/followup-store";
import { toSafe } from "@/lib/followup-store";
import { apiError } from "@/lib/followup-http";

export async function GET() {
  try {
    const list = await profiles.list();
    return Response.json({ profiles: list.map(toSafe) });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = body?.name || "New profile";
    const p = await profiles.create(name);
    return Response.json({ profile: toSafe(p) });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
