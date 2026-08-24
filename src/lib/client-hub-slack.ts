// Client Hub — Slack Web API client + request signature verification.
// Bot token auth for slackApi(); response_url posts (button-click follow-ups)
// use plain fetch with no bot token, matching Slack's own auth model there.

import crypto from "crypto";

const SLACK_API_BASE = "https://slack.com/api";

function botToken(): string {
  const token = process.env.CLIENT_HUB_SLACK_BOT_TOKEN;
  if (!token) throw new Error("CLIENT_HUB_SLACK_BOT_TOKEN is not configured.");
  return token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function slackApi(method: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[client-hub] Slack API ${method} failed:`, data.error);
    throw new Error(`Slack API ${method} failed: ${data.error}`);
  }
  return data;
}

export async function getPermalink(channel: string, messageTs: string): Promise<string | null> {
  try {
    const data = await slackApi("chat.getPermalink", { channel, message_ts: messageTs });
    return data.permalink || null;
  } catch {
    return null;
  }
}

export async function postMessage(channel: string, text: string, blocks?: unknown[]): Promise<string | null> {
  const data = await slackApi("chat.postMessage", { channel, text, blocks, unfurl_links: false });
  return data.ts || null;
}

export async function openView(triggerId: string, view: unknown): Promise<void> {
  await slackApi("views.open", { trigger_id: triggerId, view });
}

export async function addReaction(channel: string, timestamp: string, name: string): Promise<void> {
  try {
    await slackApi("reactions.add", { channel, timestamp, name });
  } catch (e) {
    // Best-effort — a missing reaction shouldn't fail the whole flow.
    console.error("[client-hub] reactions.add failed:", (e as Error).message);
  }
}

export async function fetchChannelHistory(
  channel: string,
  oldestUnixSeconds: number,
  limit: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const data = await slackApi("conversations.history", { channel, oldest: String(oldestUnixSeconds), limit });
  return data.messages || [];
}

// Button-click follow-ups post here instead of chat.postMessage — different
// auth (no bot token needed), and this never edits the original message.
export async function postToResponseUrl(responseUrl: string, payload: Record<string, unknown>): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const REPLAY_WINDOW_SECONDS = 300;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Slack's HMAC-SHA256 request signature: v0:{timestamp}:{raw body}, keyed by
// the app's signing secret. Callers MUST pass the exact raw request bytes
// read before any JSON/urlencoded parsing — see the 3 slack/* route
// handlers, modeled on the Fathom webhook's raw-body-first pattern.
export function verifySlackSignature({
  rawBody,
  timestamp,
  signature,
}: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
}): boolean {
  const signingSecret = process.env.CLIENT_HUB_SLACK_SIGNING_SECRET;
  if (!signingSecret || !timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  return safeEqual(expected, signature);
}
