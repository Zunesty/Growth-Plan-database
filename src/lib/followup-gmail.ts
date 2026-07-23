// Gmail integration — OAuth 2.0 + DRAFT creation only.
//
// HARD GUARDRAILS:
//   - Scope requested is gmail.compose ONLY.
//   - This module NEVER calls messages.send. There is no send path anywhere.
//
// No googleapis SDK: plain fetch against Google's REST endpoints.

import crypto from "crypto";
import { followupConfig } from "./followup-config";
import * as profiles from "./followup-store";
import type { Profile } from "./followup-types";

const SCOPE = "https://www.googleapis.com/auth/gmail.compose";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRAFTS_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

// CSRF state for the OAuth dance. Self-validating (HMAC-signed, contains the
// profileId + timestamp) rather than server-stored, because on Vercel the
// oauth/start and oauth/callback requests may hit different instances.
const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  return followupConfig.ENCRYPTION_KEY || "dev-state-secret";
}

function signState(payload: string): string {
  return crypto.createHmac("sha256", stateSecret()).update(payload).digest("hex").slice(0, 32);
}

export function isConfigured(): boolean {
  return followupConfig.gmailConfigured;
}

export function buildAuthUrl(profileId: string): string {
  const payload = `${profileId}.${Date.now()}`;
  const state = Buffer.from(`${payload}.${signState(payload)}`).toString("base64url");
  const params = new URLSearchParams({
    client_id: followupConfig.GOOGLE_CLIENT_ID,
    redirect_uri: followupConfig.OAUTH_REDIRECT_URL,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function consumeState(state: string): string | null {
  try {
    const decoded = Buffer.from(String(state), "base64url").toString("utf8");
    const [profileId, ts, sig] = decoded.split(".");
    if (!profileId || !ts || !sig) return null;
    if (signState(`${profileId}.${ts}`) !== sig) return null;
    if (Date.now() - Number(ts) > STATE_TTL_MS) return null;
    return profileId;
  } catch {
    return null;
  }
}

async function exchangeCode(code: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: followupConfig.GOOGLE_CLIENT_ID,
      client_secret: followupConfig.GOOGLE_CLIENT_SECRET,
      redirect_uri: followupConfig.OAUTH_REDIRECT_URL,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
}

async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const data = await res.json().catch(() => ({}));
  return data.email || "";
}

// Complete the OAuth callback: exchange code, persist tokens on the profile.
export async function handleCallback({ code, state }: { code: string; state: string }): Promise<{ profileId: string; email: string }> {
  const profileId = consumeState(state);
  if (!profileId) throw new Error("OAuth state expired or invalid. Please try connecting again.");
  const tokens = await exchangeCode(code);
  const email = await fetchEmail(tokens.access_token);
  const expiry = Date.now() + (tokens.expires_in || 3600) * 1000;
  await profiles.setGmailTokens(profileId, {
    refreshToken: tokens.refresh_token || null, // Google omits it on re-consent sometimes; keep old.
    accessToken: tokens.access_token,
    expiry,
    email,
  });
  return { profileId, email };
}

async function refreshAccessToken(profile: Profile): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: followupConfig.GOOGLE_CLIENT_ID,
      client_secret: followupConfig.GOOGLE_CLIENT_SECRET,
      refresh_token: profile.gmailRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: Error & { status?: number; detail?: string } = new Error(
      `Gmail token refresh failed (${res.status}). The connection may have been revoked, reconnect Gmail in Settings.`
    );
    err.status = res.status;
    err.detail = body.slice(0, 300);
    throw err;
  }
  const data = await res.json();
  const expiry = Date.now() + (data.expires_in || 3600) * 1000;
  await profiles.setGmailTokens(profile.id, {
    accessToken: data.access_token,
    expiry,
  });
  return data.access_token;
}

// Return a valid access token, refreshing if it is missing or within 60s of expiry.
async function getValidAccessToken(profile: Profile): Promise<string> {
  if (!profile.gmailRefreshToken) {
    throw new Error("Gmail is not connected for this profile. Connect Gmail in Settings.");
  }
  const fresh = profile.gmailAccessToken && profile.gmailAccessExpiry - Date.now() > 60 * 1000;
  if (fresh) return profile.gmailAccessToken;
  return refreshAccessToken(profile);
}

// ---------------------------------------------------------------------------
// MIME building. base64url of an RFC 2822 message with an HTML body so links
// render as clean hyperlinked text in Gmail (no raw URLs visible).
// ---------------------------------------------------------------------------
function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildMime({ to, subject, html }: { to: string; subject?: string; html?: string }): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject || "")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html || "", "utf8").toString("base64"),
  ];
  return lines.join("\r\n");
}

function toBase64Url(str: string): string {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Create a Gmail DRAFT. Returns { id, messageId }. Never sends.
export async function createDraft(
  profile: Profile,
  { to, subject, html }: { to: string; subject: string; html: string }
): Promise<{ id: string; messageId?: string }> {
  const accessToken = await getValidAccessToken(profile);
  const raw = toBase64Url(buildMime({ to, subject, html }));
  const res = await fetch(DRAFTS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: Error & { status?: number } = new Error(`Gmail draft creation failed (${res.status}): ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return { id: data.id, messageId: data.message && data.message.id };
}
