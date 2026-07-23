"use client";

import { useState } from "react";
import type { ContextLink, SafeProfile, TemplateId, TemplateMeta } from "@/lib/followup-types";

type FormState = {
  event_name: string;
  sender_name: string;
  company_name: string;
  pricing: string;
  booking_link: string;
  autopilot: boolean;
  slack_webhook_url: string;
};

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) throw new Error((data.error as string) || `Request failed (${res.status})`);
  return data as T;
}

export default function FollowUpSettings({
  profile,
  gmailConfigured,
  templateMeta,
  onClose,
  onSaved,
  onDeleted,
  canDelete,
  toast,
}: {
  profile: SafeProfile;
  gmailConfigured: boolean;
  templateMeta: TemplateMeta[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  canDelete: boolean;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const s = profile.settings;
  const [form, setForm] = useState<FormState>({
    event_name: s.event_name || "",
    sender_name: s.sender_name || "",
    company_name: s.company_name || "",
    pricing: s.pricing || "",
    booking_link: s.booking_link || "",
    autopilot: s.autopilot,
    slack_webhook_url: s.slack_webhook_url || "",
  });
  const [links, setLinks] = useState<ContextLink[]>(s.context_links || []);
  const [templates, setTemplates] = useState<Record<TemplateId, string>>(s.templates);
  const [fathomKey, setFathomKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const addLink = () => setLinks((l) => [...l, { label: "", url: "" }]);
  const updateLink = (i: number, patch: Partial<ContextLink>) =>
    setLinks((l) => l.map((link, idx) => (idx === i ? { ...link, ...patch } : link)));
  const removeLink = (i: number) => setLinks((l) => l.filter((_, idx) => idx !== i));

  const restoreTemplate = async (meta: TemplateMeta) => {
    const { template } = await api<{ template: string }>("POST", `/api/follow-up-agent/profiles/${profile.id}/templates/restore`, {
      templateId: meta.id,
    });
    setTemplates((t) => ({ ...t, [meta.id]: template }));
    toast(`Restored default: ${meta.name}`);
  };

  const disconnectGmail = async () => {
    await api("POST", `/api/follow-up-agent/profiles/${profile.id}/gmail/disconnect`);
    toast("Gmail disconnected");
    await onSaved();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = {
        ...form,
        context_links: links.filter((l) => (l.url || "").trim()),
        templates,
      };
      await api("PUT", `/api/follow-up-agent/profiles/${profile.id}`, { settings });

      if (fathomKey.trim()) {
        await api("POST", `/api/follow-up-agent/profiles/${profile.id}/secrets`, { fathomKey: fathomKey.trim() });
        setFathomKey("");
      }

      toast("Settings saved");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) {
      toast("Keep at least one profile.", "err");
      return;
    }
    if (!window.confirm(`Delete profile "${profile.name}"? This removes its settings and webhook.`)) return;
    setDeleting(true);
    try {
      await api("DELETE", `/api/follow-up-agent/profiles/${profile.id}`);
      toast("Profile deleted");
      await onDeleted();
    } catch (e) {
      toast((e as Error).message, "err");
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-zunesty-black border-l border-zunesty-green-dark/40 z-50 overflow-y-auto">
        <div className="sticky top-0 bg-zunesty-black border-b border-zunesty-green-dark/40 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zunesty-light">
            Settings <span className="text-sm font-normal text-zunesty-light/40">· {profile.name}</span>
          </h2>
          <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 py-5 space-y-8">
          {/* Connections */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zunesty-green mb-3">Connections</h3>

            <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-3 mb-4">
              {profile.gmail.connected ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-zunesty-light">
                    <span className="w-2 h-2 rounded-full bg-zunesty-green" />
                    Connected as <b>{profile.gmail.email || "Gmail account"}</b>
                  </div>
                  <button
                    onClick={() => void disconnectGmail()}
                    className="mt-3 rounded-md border border-red-900/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-zunesty-light/70">
                    <span className="w-2 h-2 rounded-full bg-zunesty-light/20" />
                    Gmail not connected
                  </div>
                  {gmailConfigured ? (
                    <a
                      href={`/api/follow-up-agent/oauth/start?profile=${profile.id}`}
                      className="mt-3 inline-block rounded-md bg-zunesty-green px-3 py-1.5 text-xs font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors"
                    >
                      Connect Gmail
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-zunesty-light/40">
                      Gmail OAuth not configured on the server (FOLLOWUP_GOOGLE_CLIENT_ID/SECRET missing).
                    </p>
                  )}
                </>
              )}
              <p className="mt-2 text-xs text-zunesty-light/40">Drafts are created here. Scope: gmail.compose only — the tool can never send.</p>
            </div>

            <label className="block mb-4">
              <span className="flex items-center gap-2 text-sm font-medium text-zunesty-light/80 mb-1.5">
                Fathom API key {profile.hasFathomKey && <span className="text-zunesty-green text-xs">● set</span>}
              </span>
              <input
                type="password"
                value={fathomKey}
                onChange={(e) => setFathomKey(e.target.value)}
                placeholder={profile.hasFathomKey ? "•••••••• (leave blank to keep)" : "Paste key"}
                autoComplete="new-password"
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
              />
              <span className="block mt-1 text-xs text-zunesty-light/40">
                Fathom → Settings → API. Fathom&apos;s external API is key-based only (no OAuth), so a key is the correct integration.
              </span>
            </label>
          </section>

          {/* Sales context */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zunesty-green mb-3">Sales context</h3>

            <TextField
              label="Sales meeting event name"
              value={form.event_name}
              onChange={(v) => update("event_name", v)}
              hint='This is how the tool finds ONLY your sales calls and ignores everything else. e.g. "Sponsorship Sales Call".'
            />
            <TextField label="Sender name (signature)" value={form.sender_name} onChange={(v) => update("sender_name", v)} />
            <TextField label="Company / client name" value={form.company_name} onChange={(v) => update("company_name", v)} />

            <div className="mb-4">
              <span className="block text-sm font-medium text-zunesty-light/80 mb-1.5">Context links</span>
              <span className="block text-xs text-zunesty-light/40 mb-2">
                The ONLY URLs the AI is allowed to hyperlink (Prospectus, Sales deck, Pricing page, Case study…).
              </span>
              <div className="space-y-2">
                {links.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={link.label}
                      onChange={(e) => updateLink(i, { label: e.target.value })}
                      placeholder="Label"
                      className="w-28 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-xs text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
                    />
                    <input
                      value={link.url}
                      onChange={(e) => updateLink(i, { url: e.target.value })}
                      placeholder="https://…"
                      className="flex-1 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-xs text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
                    />
                    <button onClick={() => removeLink(i)} className="text-zunesty-light/40 hover:text-red-400 px-1">
                      ✕
                    </button>
                  </div>
                ))}
                {!links.length && <p className="text-xs text-zunesty-light/40">No links yet. Add your prospectus, deck, or case study.</p>}
              </div>
              <button onClick={addLink} className="mt-2 text-xs text-zunesty-green hover:underline">
                + Add link
              </button>
            </div>

            <TextAreaField
              label="Pricing"
              value={form.pricing}
              onChange={(v) => update("pricing", v)}
              hint="The ONLY source the AI may quote prices from. Free text — list packages and prices."
            />
            <TextField
              label="Booking link"
              value={form.booking_link}
              onChange={(v) => update("booking_link", v)}
              hint="Optional. Hyperlinked as the call-to-action when present."
            />
          </section>

          {/* Templates */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zunesty-green mb-3">Your 3 follow-up templates</h3>
            <p className="text-xs text-zunesty-light/40 mb-3">
              Paste your best real follow-up email into each slot. The AI mirrors its structure, tone, and length exactly, swapping in each
              call&apos;s details. <b className="text-zunesty-light/60">Your voice, not AI voice.</b>
            </p>
            <div className="space-y-4">
              {templateMeta.map((meta) => (
                <div key={meta.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-zunesty-light/80 flex items-center gap-2">
                      {meta.name}
                      {meta.autopilot && (
                        <span className="rounded-full bg-zunesty-green/15 text-zunesty-green text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5">
                          Autopilot
                        </span>
                      )}
                    </span>
                    <button onClick={() => void restoreTemplate(meta)} className="text-xs text-zunesty-light/40 hover:text-zunesty-green">
                      Restore default
                    </button>
                  </div>
                  <textarea
                    value={templates[meta.id] || ""}
                    onChange={(e) => setTemplates((t) => ({ ...t, [meta.id]: e.target.value }))}
                    rows={6}
                    className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-xs font-mono text-zunesty-light focus:border-zunesty-green focus:outline-none resize-y"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Autopilot */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zunesty-green mb-3">Autopilot</h3>
            <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-zunesty-light">Draft after every sales call</div>
                  <div className="text-xs text-zunesty-light/40 mt-0.5">
                    After every sales call, a follow-up draft is created in your Gmail automatically.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.autopilot}
                  onChange={(e) => update("autopilot", e.target.checked)}
                  className="w-5 h-5 accent-zunesty-green shrink-0 ml-3"
                />
              </label>
              <div className="mt-2 text-xs">
                {profile.autopilotWebhookRegistered ? (
                  <span className="text-zunesty-green">● Webhook registered with Fathom</span>
                ) : profile.hasFathomKey ? (
                  <span className="text-amber-300">Webhook registers when you save with Autopilot on.</span>
                ) : (
                  <span className="text-zunesty-light/40">Add a Fathom key to enable Autopilot.</span>
                )}
              </div>
            </div>
            <TextField
              label="Slack notification webhook URL"
              value={form.slack_webhook_url}
              onChange={(v) => update("slack_webhook_url", v)}
              hint='Optional. Posts "✉️ Follow-up drafted for {attendee}" after each auto-draft.'
            />
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 pb-4">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="rounded-lg border border-red-900/50 px-4 py-2 text-sm text-red-300 hover:bg-red-950/30 transition-colors disabled:opacity-50"
            >
              Delete profile
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function TextField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-zunesty-light/80 mb-1.5">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
      />
      {hint && <span className="block mt-1 text-xs text-zunesty-light/40">{hint}</span>}
    </label>
  );
}

function TextAreaField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-zunesty-light/80 mb-1.5">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none resize-y"
      />
      {hint && <span className="block mt-1 text-xs text-zunesty-light/40">{hint}</span>}
    </label>
  );
}
