// Service layer: the ONE place that decides demo vs real, fetches calls +
// transcripts, generates drafts, creates Gmail drafts, and records the
// "already drafted" marker. Routes and Autopilot both call through here.

import * as profiles from "./followup-store";
import * as fathom from "./followup-fathom";
import * as gmail from "./followup-gmail";
import * as drafting from "./followup-drafting";
import * as demo from "./followup-demo";
import { TEMPLATE_IDS } from "./followup-types";
import type { Call, CallWithStatus, Draft, DraftedMarker, Profile, TemplateId } from "./followup-types";

export const GMAIL_DRAFTS_URL = "https://mail.google.com/mail/#drafts";

// ---------------------------------------------------------------------------
// Drafted markers (dedupe + status chips)
// ---------------------------------------------------------------------------
export async function findLog(profileId: string, recordingId: string, templateId: string): Promise<DraftedMarker | null> {
  return profiles.getDrafted(profileId, recordingId, templateId);
}

// ---------------------------------------------------------------------------
// Listing + transcripts (demo/real)
// ---------------------------------------------------------------------------
export async function listCalls(
  profile: Profile,
  { lookbackDays = 14 }: { lookbackDays?: number } = {}
): Promise<{ demo: boolean; calls: CallWithStatus[] }> {
  const eventName = profile.settings.event_name || "";
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  let calls: Call[];
  if (demo.isDemoProfile(profile)) {
    calls = demo.SAMPLE_CALLS.filter((c) => (eventName ? fathom.titleMatches(c.title, eventName) : true));
  } else {
    if (!eventName) return { demo: false, calls: [] };
    calls = await fathom.listSalesCalls({ apiKey: profile.fathomKey, eventName, sinceIso });
  }

  const withStatus: CallWithStatus[] = calls.map((c) => {
    const log = profile.drafted[`${c.recordingId}:${TEMPLATE_IDS.POST_MEETING}`] || null;
    let status: CallWithStatus["status"] = "none";
    if (log && log.gmailDraftId) status = log.needsAttention ? "needs_attention" : "drafted";
    else if (log) status = "needs_attention";
    return {
      ...c,
      status,
      draftedAt: log ? log.createdAt : null,
      gmailDraftId: log ? log.gmailDraftId || null : null,
    };
  });

  return { demo: demo.isDemoProfile(profile), calls: withStatus };
}

async function getTranscriptFor(profile: Profile, call: Call): Promise<string> {
  if (demo.isDemoProfile(profile)) return demo.getSampleTranscript(call.recordingId);
  if (call.transcript) return fathom.flattenTranscript(call.transcript);
  return fathom.getTranscript({ apiKey: profile.fathomKey, recordingId: call.recordingId });
}

// Resolve a single call object by id (from the recent list) for detail/redraft.
export async function getCall(profile: Profile, recordingId: string): Promise<CallWithStatus | null> {
  const { calls } = await listCalls(profile, { lookbackDays: 30 });
  return calls.find((c) => c.recordingId === recordingId) || null;
}

// ---------------------------------------------------------------------------
// Draft generation (demo/real)
// ---------------------------------------------------------------------------
export async function generate(
  profile: Profile,
  { templateId, call, extraContext }: { templateId: TemplateId; call: Call; extraContext: string }
): Promise<Draft> {
  if (demo.isDemoProfile(profile)) {
    return demo.cannedDraft({ profile, templateId, call, extraContext });
  }
  const transcript = await getTranscriptFor(profile, call);
  return drafting.generateDraft({ profile, templateId, call, transcript, extraContext });
}

// Create the Gmail draft (or a simulated one in demo) and record the marker.
export async function createDraftAndLog(
  profile: Profile,
  { call, templateId, draft, source = "manual" }: { call: Call; templateId: TemplateId; draft: Draft; source?: DraftedMarker["source"] }
): Promise<{ gmailDraftId: string; gmailUrl: string }> {
  let gmailDraftId: string;
  if (demo.isDemoProfile(profile) || !profile.gmailRefreshToken) {
    gmailDraftId = "demo-draft-" + Math.random().toString(36).slice(2, 10);
  } else {
    const created = await gmail.createDraft(profile, {
      to: draft.to,
      subject: draft.subject,
      html: draft.html,
    });
    gmailDraftId = created.id;
  }

  await profiles.setDrafted(profile.id, call.recordingId, templateId, {
    gmailDraftId,
    needsAttention: Boolean(draft.needsAttention),
    attendeeName: call.primaryAttendee?.name || "",
    attendeeEmail: draft.to || call.primaryAttendee?.email || "",
    meetingTitle: call.title || "",
    meetingDate: call.createdAt || "",
    source,
  });

  return { gmailDraftId, gmailUrl: GMAIL_DRAFTS_URL };
}
