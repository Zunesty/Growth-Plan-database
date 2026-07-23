import type { NextRequest } from "next/server";
import * as profiles from "@/lib/followup-store";
import { toSafe } from "@/lib/followup-store";
import * as autopilot from "@/lib/followup-autopilot";
import { apiError, HttpError } from "@/lib/followup-http";
import type { ProfileSettings } from "@/lib/followup-types";

async function requireProfile(id: string) {
  const p = await profiles.get(id);
  if (!p) throw new HttpError(404, "Profile not found.");
  return p;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await requireProfile(id);
    return Response.json({ profile: toSafe(p) });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const before = await requireProfile(id);
    const { name, settings } = (await req.json()) as { name?: string; settings?: Partial<ProfileSettings> };
    const updated = await profiles.updateSettings(before.id, { name, settings });

    const autopilotChanged =
      settings && typeof settings.autopilot === "boolean" && settings.autopilot !== before.settings.autopilot;
    if (autopilotChanged) await autopilot.syncWebhook(before.id);

    return Response.json({ profile: toSafe(updated) });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await requireProfile(id);
    if (p.fathomWebhookId && p.fathomKey) {
      try {
        const fathom = await import("@/lib/followup-fathom");
        await fathom.deleteWebhook({ apiKey: p.fathomKey, webhookId: p.fathomWebhookId });
      } catch (e) {
        console.error("[follow-up-agent] webhook cleanup on delete failed:", (e as Error).message);
      }
    }
    await profiles.remove(p.id);
    return Response.json({ ok: true });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
