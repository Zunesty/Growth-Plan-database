import type { NextRequest } from "next/server";
import * as profiles from "@/lib/followup-store";
import * as service from "@/lib/followup-service";
import { apiError, HttpError } from "@/lib/followup-http";
import { TEMPLATE_IDS } from "@/lib/followup-types";
import type { TemplateId } from "@/lib/followup-types";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await profiles.get(id);
    if (!p) throw new HttpError(404, "Profile not found.");

    const { recordingId, templateId, draft, force } = (await req.json()) as {
      recordingId: string;
      templateId?: TemplateId;
      draft?: { to: string; subject: string; html: string };
      force?: boolean;
    };
    const tId = templateId || TEMPLATE_IDS.POST_MEETING;
    if (!draft || typeof draft.html !== "string") throw new HttpError(400, "Missing draft body.");

    const call = await service.getCall(p, recordingId);
    if (!call) throw new HttpError(404, "Call not found.");

    const existing = await service.findLog(p.id, recordingId, tId);
    if (existing && existing.gmailDraftId && !force) {
      return Response.json(
        { error: "A draft already exists for this call.", existing: { at: existing.createdAt } },
        { status: 409 }
      );
    }

    const draftObj = {
      to: draft.to,
      subject: draft.subject,
      html: draft.html,
      needsAttention: /\[FILL:/i.test(draft.html) || /\[FILL:/i.test(draft.subject || ""),
    };
    const out = await service.createDraftAndLog(p, { call, templateId: tId, draft: draftObj, source: "manual" });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
