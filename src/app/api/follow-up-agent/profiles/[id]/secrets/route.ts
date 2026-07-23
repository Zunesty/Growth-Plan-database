import type { NextRequest } from "next/server";
import * as profiles from "@/lib/followup-store";
import { toSafe } from "@/lib/followup-store";
import * as autopilot from "@/lib/followup-autopilot";
import { apiError, HttpError } from "@/lib/followup-http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await profiles.get(id);
    if (!p) throw new HttpError(404, "Profile not found.");

    const { fathomKey } = (await req.json()) as { fathomKey?: string };
    let fathomChanged = false;
    if (typeof fathomKey === "string") {
      await profiles.setSecret(p.id, "fathomKey", fathomKey.trim());
      fathomChanged = true;
    }
    if (fathomChanged) await autopilot.syncWebhook(p.id);

    return Response.json({ profile: toSafe(await profiles.get(p.id)) });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
