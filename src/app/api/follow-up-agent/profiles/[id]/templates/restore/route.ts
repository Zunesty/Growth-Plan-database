import type { NextRequest } from "next/server";
import * as profiles from "@/lib/followup-store";
import { toSafe } from "@/lib/followup-store";
import { apiError, HttpError } from "@/lib/followup-http";
import { defaultTemplates } from "@/lib/followup-templates";
import { TEMPLATE_IDS } from "@/lib/followup-types";
import type { TemplateId } from "@/lib/followup-types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await profiles.get(id);
    if (!p) throw new HttpError(404, "Profile not found.");

    const { templateId } = (await req.json()) as { templateId?: TemplateId };
    if (!templateId || !Object.values(TEMPLATE_IDS).includes(templateId)) {
      throw new HttpError(400, "Unknown template id.");
    }

    const templates = { ...p.settings.templates, [templateId]: defaultTemplates()[templateId] };
    const updated = await profiles.updateSettings(p.id, { settings: { templates } });
    return Response.json({ profile: toSafe(updated), template: defaultTemplates()[templateId] });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
