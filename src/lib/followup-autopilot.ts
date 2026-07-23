// Autopilot — the zero-click engine.
//   syncWebhook(profileId)   register/delete the Fathom webhook to match the toggle
//   handleWebhook(...)        verify + process an incoming Fathom delivery
//   processCall(...)          the shared draft-from-call pipeline (webhook + cron)
//   runPollOnce()             safety-net sweep, invoked by Vercel Cron via /api/follow-up-agent/poll
//
// No setInterval here: on Vercel there is no long-lived process. The cron
// schedule lives in vercel.json and hits GET /api/follow-up-agent/poll.

import { followupConfig } from "./followup-config";
import * as profiles from "./followup-store";
import * as fathom from "./followup-fathom";
import * as service from "./followup-service";
import * as slack from "./followup-slack";
import * as demo from "./followup-demo";
import { TEMPLATE_IDS } from "./followup-types";
import type { Call, DraftedMarker, Profile } from "./followup-types";

// ---------------------------------------------------------------------------
// Register/delete the webhook so it always matches the Autopilot toggle.
// ---------------------------------------------------------------------------
export async function syncWebhook(profileId: string): Promise<{ ok: boolean; registered?: boolean; already?: boolean; reason?: string }> {
  const profile = await profiles.get(profileId);
  if (!profile) return { ok: false, reason: "no profile" };

  const wantOn = Boolean(profile.settings.autopilot && profile.fathomKey);

  if (!wantOn) {
    if (profile.fathomWebhookId) {
      try {
        await fathom.deleteWebhook({ apiKey: profile.fathomKey, webhookId: profile.fathomWebhookId });
      } catch (e) {
        console.error("[followup-autopilot] webhook delete failed:", (e as Error).message);
      }
      await profiles.clearFathomWebhook(profileId);
    }
    return { ok: true, registered: false };
  }

  if (profile.fathomWebhookId) return { ok: true, registered: true, already: true };
  try {
    const { id, secret } = await fathom.registerWebhook({
      apiKey: profile.fathomKey,
      destinationUrl: followupConfig.webhookUrl(profileId),
    });
    await profiles.setFathomWebhook(profileId, { webhookId: id, secret });
    return { ok: true, registered: true };
  } catch (e) {
    console.error("[followup-autopilot] webhook register failed:", (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// The shared pipeline: one matching call -> one Post-Meeting Gmail draft.
// Idempotent via the drafted marker.
// ---------------------------------------------------------------------------
export async function processCall(
  profile: Profile,
  call: Call,
  source: DraftedMarker["source"]
): Promise<{ skipped?: string; drafted?: boolean; gmailDraftId?: string; needsAttention?: boolean }> {
  const eventName = profile.settings.event_name || (demo.isDemoProfile(profile) ? "Sponsorship Sales Call" : "");

  if (!fathom.titleMatches(call.title, eventName)) {
    return { skipped: "title-mismatch" };
  }

  const existing = await service.findLog(profile.id, call.recordingId, TEMPLATE_IDS.POST_MEETING);
  if (existing && existing.gmailDraftId) {
    return { skipped: "already-drafted" };
  }

  const draft = await service.generate(profile, {
    templateId: TEMPLATE_IDS.POST_MEETING,
    call,
    extraContext: "",
  });

  const { gmailDraftId } = await service.createDraftAndLog(profile, {
    call,
    templateId: TEMPLATE_IDS.POST_MEETING,
    draft,
    source,
  });

  const attendee = call.primaryAttendee?.name || call.title || "a prospect";
  await slack.notify(profile.settings.slack_webhook_url, `✉️ Follow-up drafted for ${attendee} — review in Gmail`);

  return { drafted: true, gmailDraftId, needsAttention: draft.needsAttention };
}

// ---------------------------------------------------------------------------
// Incoming webhook. Verify signature, extract the recording, process.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCallFromPayload(payload: any): Call | null {
  if (!payload || typeof payload !== "object") return null;
  const item = payload.recording || payload.meeting || payload.data || payload.item || payload;
  if (!item || (item.recording_id == null && item.id == null && !item.meeting_title && !item.title)) {
    return null;
  }
  return fathom.normalizeCall(item);
}

export async function handleWebhook({
  profileId,
  rawBody,
  headers,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedBody,
}: {
  profileId: string;
  rawBody: string;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedBody: any;
}): Promise<{ status: number; body: object }> {
  const profile = await profiles.get(profileId);
  if (!profile) return { status: 404, body: { error: "unknown profile" } };

  const valid = fathom.verifySignature({
    secret: profile.fathomWebhookSecret,
    rawBody,
    headers,
  });
  if (!valid) {
    return { status: 401, body: { error: "invalid signature" } };
  }

  const call = extractCallFromPayload(parsedBody);
  if (!call) return { status: 200, body: { ok: true, note: "no recording in payload" } };

  try {
    const result = await processCall(profile, call, "webhook");
    if (result.drafted) console.log(`[followup-autopilot] webhook drafted for ${call.title}`);
    else console.log(`[followup-autopilot] webhook skipped (${result.skipped}) for ${call.title}`);
    return { status: 200, body: { ok: true, result } };
  } catch (e) {
    console.error("[followup-autopilot] webhook processing failed:", (e as Error).message);
    // 500 so Fathom retries; dedupe keeps retries safe.
    return { status: 500, body: { error: "processing failed" } };
  }
}

// ---------------------------------------------------------------------------
// Safety-net sweep (Vercel Cron -> GET /api/follow-up-agent/poll): look back
// 48h for each Autopilot profile and process anything matching that has no
// drafted marker. Catches missed/failed webhooks; dedupe makes overlap safe.
// ---------------------------------------------------------------------------
export async function runPollOnce(): Promise<{ drafted: { profile: string; recording: string }[] }> {
  const list = await profiles.autopilotProfiles();
  const summary: { profile: string; recording: string }[] = [];
  for (const profile of list) {
    if (!profile.fathomKey) continue; // demo profiles have no real calls to poll
    try {
      const { calls } = await service.listCalls(profile, { lookbackDays: 2 });
      for (const call of calls) {
        try {
          const r = await processCall(profile, call, "poller");
          if (r.drafted) summary.push({ profile: profile.id, recording: call.recordingId });
        } catch (e) {
          console.error(`[followup-poller] processCall failed for ${call.recordingId}:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error(`[followup-poller] list failed for profile ${profile.id}:`, (e as Error).message);
    }
  }
  return { drafted: summary };
}
