// Follow-Up Agent profile store. Server-only — profile records hold
// encrypted Fathom keys, Gmail tokens, and webhook secrets that must never
// reach the browser. Import this only from route handlers, never from a
// "use client" component (contrast with ad-generator-store.ts, which is
// client-side because ad batches/creatives hold no secrets).
//
// One row per profile in Supabase, matching the JSONB-per-row pattern used
// everywhere else in this codebase. `data` holds the full record (settings,
// encrypted secrets, encrypted Gmail tokens, encrypted webhook secret, the
// "drafted" dedupe markers) — the same shape the source app kept in one KV
// doc, just with Supabase as the backend instead of Redis/JSON-file.

import crypto from "crypto";
import { supabase } from "./supabase";
import { encrypt, decrypt } from "./followup-crypto";
import { defaultTemplates } from "./followup-templates";
import type {
  Profile,
  SafeProfile,
  ProfileSettings,
  DraftedMarker,
  TemplateId,
} from "./followup-types";

const TABLE = "followup_profiles";

type ProfileRecord = {
  id: string;
  name: string;
  settings: Partial<ProfileSettings>;
  secrets?: { fathomKeyEnc?: string };
  gmail?: { refreshEnc?: string; accessEnc?: string; expiry?: number; email?: string };
  webhook?: { id?: string; secretEnc?: string };
  drafted?: Record<string, DraftedMarker>;
  createdAt: string;
  updatedAt: string;
};

function defaultSettings(): ProfileSettings {
  return {
    event_name: "",
    sender_name: "",
    company_name: "",
    context_links: [],
    pricing: "",
    booking_link: "",
    templates: defaultTemplates(),
    autopilot: true,
    slack_webhook_url: "",
  };
}

const nowIso = () => new Date().toISOString();
const newId = () => "p_" + crypto.randomBytes(8).toString("hex");

async function readRow(id: string): Promise<ProfileRecord | null> {
  const { data, error } = await supabase.from(TABLE).select("data").eq("id", id).maybeSingle();
  if (error) {
    console.error("Supabase followup_profiles read error:", error);
    return null;
  }
  return (data?.data as ProfileRecord) || null;
}

async function readAllRows(): Promise<ProfileRecord[]> {
  const { data, error } = await supabase.from(TABLE).select("data").order("created_at", { ascending: true });
  if (error) {
    console.error("Supabase followup_profiles list error:", error);
    return [];
  }
  return (data || []).map((r) => r.data as ProfileRecord);
}

async function writeRow(rec: ProfileRecord) {
  const { error } = await supabase.from(TABLE).upsert({
    id: rec.id,
    data: rec,
    updated_at: rec.updatedAt,
  });
  if (error) {
    console.error("Supabase followup_profiles write error:", error);
    throw new Error(`Failed to save profile: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Raw record -> app-facing profile (secrets decrypted for INTERNAL use only)
// ---------------------------------------------------------------------------
function toProfile(rec: ProfileRecord | null): Profile | null {
  if (!rec) return null;
  const settings: ProfileSettings = { ...defaultSettings(), ...(rec.settings || {}) };
  settings.templates = { ...defaultTemplates(), ...(settings.templates || {}) } as Record<TemplateId, string>;
  const secrets = rec.secrets || {};
  const gmail = rec.gmail || {};
  const webhook = rec.webhook || {};
  return {
    id: rec.id,
    name: rec.name,
    settings,
    drafted: rec.drafted || {},
    fathomKey: decrypt(secrets.fathomKeyEnc || ""),
    gmailRefreshToken: decrypt(gmail.refreshEnc || ""),
    gmailAccessToken: decrypt(gmail.accessEnc || ""),
    gmailAccessExpiry: gmail.expiry || 0,
    gmailEmail: gmail.email || "",
    fathomWebhookId: webhook.id || "",
    fathomWebhookSecret: decrypt(webhook.secretEnc || ""),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

// Client-safe view: no secrets. Keys become booleans; gmail becomes status.
export function toSafe(p: Profile | null): SafeProfile | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    settings: p.settings,
    hasFathomKey: Boolean(p.fathomKey),
    gmail: { connected: Boolean(p.gmailRefreshToken), email: p.gmailEmail || "" },
    autopilotWebhookRegistered: Boolean(p.fathomWebhookId),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function list(): Promise<Profile[]> {
  const rows = await readAllRows();
  return rows.map(toProfile).filter((p): p is Profile => p != null);
}

export async function get(id: string): Promise<Profile | null> {
  return toProfile(await readRow(id));
}

export async function create(name: string): Promise<Profile> {
  const id = newId();
  const ts = nowIso();
  const rec: ProfileRecord = {
    id,
    name: name || "New profile",
    settings: defaultSettings(),
    secrets: {},
    gmail: {},
    webhook: {},
    drafted: {},
    createdAt: ts,
    updatedAt: ts,
  };
  await writeRow(rec);
  return toProfile(rec) as Profile;
}

// Generic mutate helper: load, apply, save.
async function mutate(id: string, fn: (rec: ProfileRecord) => void): Promise<Profile | null> {
  const rec = await readRow(id);
  if (!rec) return null;
  fn(rec);
  rec.updatedAt = nowIso();
  await writeRow(rec);
  return toProfile(rec);
}

export async function updateSettings(
  id: string,
  { name, settings }: { name?: string; settings?: Partial<ProfileSettings> }
): Promise<Profile | null> {
  return mutate(id, (rec) => {
    if (name != null) rec.name = name;
    if (settings) {
      const merged: ProfileSettings = { ...defaultSettings(), ...(rec.settings || {}), ...settings } as ProfileSettings;
      if (settings.templates) {
        merged.templates = { ...(rec.settings && rec.settings.templates), ...settings.templates } as Record<TemplateId, string>;
      }
      rec.settings = merged;
    }
  });
}

export async function setSecret(id: string, field: "fathomKey", plaintext: string): Promise<Profile | null> {
  const columns: Record<string, string> = { fathomKey: "fathomKeyEnc" };
  const col = columns[field];
  if (!col) throw new Error(`Unknown secret field: ${field}`);
  return mutate(id, (rec) => {
    rec.secrets = rec.secrets || {};
    rec.secrets[col as "fathomKeyEnc"] = encrypt(plaintext || "");
  });
}

export async function setGmailTokens(
  id: string,
  { refreshToken, accessToken, expiry, email }: { refreshToken?: string | null; accessToken?: string; expiry?: number; email?: string }
): Promise<Profile | null> {
  return mutate(id, (rec) => {
    rec.gmail = rec.gmail || {};
    if (refreshToken != null) rec.gmail.refreshEnc = encrypt(refreshToken);
    if (accessToken != null) rec.gmail.accessEnc = encrypt(accessToken);
    if (expiry != null) rec.gmail.expiry = expiry;
    if (email != null) rec.gmail.email = email;
  });
}

export async function disconnectGmail(id: string): Promise<Profile | null> {
  return mutate(id, (rec) => {
    rec.gmail = {};
  });
}

export async function setFathomWebhook(id: string, { webhookId, secret }: { webhookId?: string; secret?: string }): Promise<Profile | null> {
  return mutate(id, (rec) => {
    rec.webhook = { id: webhookId || "", secretEnc: encrypt(secret || "") };
  });
}

export async function clearFathomWebhook(id: string): Promise<Profile | null> {
  return mutate(id, (rec) => {
    rec.webhook = {};
  });
}

// Drafted markers (dedupe + status chips) ------------------------------------
function draftedKey(recordingId: string, templateId: string) {
  return `${recordingId}:${templateId}`;
}

export async function getDrafted(id: string, recordingId: string, templateId: string): Promise<DraftedMarker | null> {
  const p = await get(id);
  if (!p) return null;
  return p.drafted[draftedKey(recordingId, templateId)] || null;
}

export async function setDrafted(
  id: string,
  recordingId: string,
  templateId: string,
  entry: Omit<DraftedMarker, "createdAt">
): Promise<Profile | null> {
  return mutate(id, (rec) => {
    rec.drafted = rec.drafted || {};
    rec.drafted[draftedKey(recordingId, templateId)] = { ...entry, createdAt: nowIso() } as DraftedMarker;
  });
}

export async function remove(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) {
    console.error("Supabase followup_profiles delete error:", error);
    throw new Error(`Failed to delete profile: ${error.message}`);
  }
}

export async function autopilotProfiles(): Promise<Profile[]> {
  return (await list()).filter((p) => p.settings.autopilot && p.fathomKey);
}
