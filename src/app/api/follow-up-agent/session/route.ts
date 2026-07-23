import * as gmail from "@/lib/followup-gmail";
import { keyAvailable } from "@/lib/followup-crypto";
import { followupConfig } from "@/lib/followup-config";
import { TEMPLATE_META } from "@/lib/followup-templates";
import type { SessionInfo } from "@/lib/followup-types";

export async function GET() {
  const session: SessionInfo = {
    gmailConfigured: gmail.isConfigured(),
    encryptionReady: keyAvailable(),
    model: followupConfig.ANTHROPIC_MODEL,
    templateMeta: TEMPLATE_META,
  };
  return Response.json(session);
}
