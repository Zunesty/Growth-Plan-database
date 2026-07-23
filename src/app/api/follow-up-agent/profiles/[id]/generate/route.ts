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

    const { recordingId, templateId, extraContext } = (await req.json()) as {
      recordingId: string;
      templateId?: TemplateId;
      extraContext?: string;
    };
    const call = await service.getCall(p, recordingId);
    if (!call) throw new HttpError(404, "Call not found in the recent list.");

    const tId = templateId || TEMPLATE_IDS.POST_MEETING;
    const draft = await service.generate(p, { templateId: tId, call, extraContext: extraContext || "" });
    const existing = await service.findLog(p.id, recordingId, tId);

    return Response.json({
      draft,
      call,
      templateId: tId,
      existingDraft: existing && existing.gmailDraftId ? { at: existing.createdAt } : null,
    });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
