// Fathom adapter. Everything Fathom-specific lives here so Fireflies/Otter
// adapters can be added later behind the same interface without touching the
// rest of the app.

import crypto from "crypto";
import { followupConfig } from "./followup-config";
import type { Call } from "./followup-types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FathomApiError = Error & { status?: number };

async function fathomFetch(
  apiKey: string,
  pathOrUrl: string,
  opts: RequestInit = {},
  { retryOn429 = true }: { retryOn429?: boolean } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${followupConfig.FATHOM_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

  if (res.status === 429 && retryOn429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
    await sleep(Math.min(retryAfter, 10) * 1000 || 2000);
    return fathomFetch(apiKey, pathOrUrl, opts, { retryOn429: false });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: FathomApiError = new Error(`Fathom API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Normalization — insulates the rest of the app from Fathom's field names.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeCall(item: any): Call {
  const invitees = Array.isArray(item.calendar_invitees) ? item.calendar_invitees : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const externals = invitees.filter((i: any) => i && i.is_external);
  const recordedByEmail = (item.recorded_by && item.recorded_by.email) || "";
  const primary =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externals.find((e: any) => e.email && e.email !== recordedByEmail) || externals[0] || null;
  return {
    recordingId: String(item.recording_id != null ? item.recording_id : item.id || ""),
    title: item.meeting_title || item.title || "(untitled)",
    createdAt: item.created_at || "",
    url: item.url || "",
    recordedBy: item.recorded_by || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externalAttendees: externals.map((e: any) => ({ name: e.name || "", email: e.email || "" })),
    primaryAttendee: primary ? { name: primary.name || "", email: primary.email || "" } : null,
    transcript: item.transcript || null,
  };
}

export function titleMatches(title: string | null | undefined, eventName: string | null | undefined): boolean {
  if (!eventName) return false;
  return String(title || "")
    .toLowerCase()
    .includes(String(eventName).toLowerCase());
}

// ---------------------------------------------------------------------------
// List sales calls — paginate up to 5 pages, filter by event name, newest first.
// ---------------------------------------------------------------------------
export async function listSalesCalls({
  apiKey,
  eventName,
  sinceIso,
  maxPages = 5,
}: {
  apiKey: string;
  eventName: string;
  sinceIso?: string;
  maxPages?: number;
}): Promise<Call[]> {
  const matched: Call[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams();
    if (sinceIso) params.set("created_after", sinceIso);
    if (cursor) params.set("cursor", cursor);
    const data = await fathomFetch(apiKey, `/meetings?${params.toString()}`);
    const items = (data && data.items) || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of items as any[]) {
      const title = item.meeting_title || item.title;
      if (titleMatches(title, eventName)) matched.push(normalizeCall(item));
    }
    cursor = data && data.next_cursor;
    if (!cursor) break;
  }
  matched.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return matched;
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenTranscript(transcript: any): string {
  if (!Array.isArray(transcript)) return "";
  return transcript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((seg: any) => {
      const name = (seg.speaker && (seg.speaker.display_name || seg.speaker.name)) || seg.speaker_name || "Speaker";
      const text = (seg.text || "").trim();
      return text ? `${name}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function getTranscript({ apiKey, recordingId }: { apiKey: string; recordingId: string }): Promise<string> {
  const data = await fathomFetch(apiKey, `/recordings/${encodeURIComponent(recordingId)}/transcript`);
  return flattenTranscript((data && data.transcript) || []);
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export async function registerWebhook({
  apiKey,
  destinationUrl,
  includeTranscript = true,
}: {
  apiKey: string;
  destinationUrl: string;
  includeTranscript?: boolean;
}): Promise<{ id: string; secret: string }> {
  const data = await fathomFetch(apiKey, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      destination_url: destinationUrl,
      triggered_for: ["my_recordings"],
      include_transcript: includeTranscript,
    }),
  });
  return { id: String(data.id), secret: data.secret || "" };
}

export async function deleteWebhook({ apiKey, webhookId }: { apiKey: string; webhookId?: string }): Promise<void> {
  if (!webhookId) return;
  await fathomFetch(apiKey, `/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Signature verification.
// Fathom signs webhook deliveries with an HMAC-SHA256 of the raw request body,
// keyed by the webhook `secret`, delivered in a signature header. Header naming
// varies, so we check the common candidates and compare in constant time.
// Reject anything we cannot positively verify.
// ---------------------------------------------------------------------------
const SIGNATURE_HEADERS = ["x-fathom-signature", "fathom-signature", "x-webhook-signature", "x-signature", "x-hub-signature-256"];

function extractSignature(headers: Headers): string {
  for (const h of SIGNATURE_HEADERS) {
    const v = headers.get(h);
    if (v) return v;
  }
  return "";
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifySignature({ secret, rawBody, headers }: { secret: string; rawBody: string; headers: Headers }): boolean {
  if (!secret) return false;
  const provided = extractSignature(headers);
  if (!provided) return false;

  const body = Buffer.from(rawBody || "", "utf8");
  const digestHex = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const digestB64 = crypto.createHmac("sha256", secret).update(body).digest("base64");

  const candidates = [digestHex, digestB64, `sha256=${digestHex}`, `sha256=${digestB64}`];
  return candidates.some((c) => safeEqual(c, provided));
}
