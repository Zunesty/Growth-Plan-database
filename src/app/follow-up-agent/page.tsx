"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FollowUpSettings from "@/components/FollowUpSettings";
import {
  TEMPLATE_IDS,
  type CallWithStatus,
  type Draft,
  type SafeProfile,
  type SessionInfo,
  type TemplateId,
} from "@/lib/followup-types";

const PROFILE_STORAGE_KEY = "zunesty_followup_profile";

type Toast = { id: number; text: string; kind: "ok" | "err" };

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
  if (!res.ok) {
    const err = new Error((data.error as string) || `Request failed (${res.status})`) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

function highlightFill(html: string): string {
  return html.replace(/\[FILL:[^\]]*\]/gi, (m) => `<span class="text-amber-400 font-semibold">${m}</span>`);
}
function unwrapFill(html: string): string {
  return html.replace(/<span class="text-amber-400 font-semibold">([\s\S]*?)<\/span>/g, "$1");
}

export default function FollowUpAgentPage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [profiles, setProfiles] = useState<SafeProfile[]>([]);
  const [profile, setProfile] = useState<SafeProfile | null>(null);
  const [calls, setCalls] = useState<CallWithStatus[]>([]);
  const [demo, setDemo] = useState(false);
  const [lookback, setLookback] = useState(14);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);

  const [view, setView] = useState<"feed" | "detail">("feed");
  const [selectedCall, setSelectedCall] = useState<CallWithStatus | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>(TEMPLATE_IDS.POST_MEETING);
  const [extraContext, setExtraContext] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [existingDraftNote, setExistingDraftNote] = useState<string | null>(null);
  const [createdNote, setCreatedNote] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Imperatively set the editable body's content once per new draft, instead
  // of binding it via dangerouslySetInnerHTML on every render — that would
  // fight the browser for cursor position while the user types.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = draft ? highlightFill(draft.html || "") : "";
  }, [draft]);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 6000 : 3500);
  }, []);

  const loadCalls = useCallback(async (p: SafeProfile, lb: number) => {
    setLoadingCalls(true);
    setCallsError(null);
    try {
      const data = await api<{ demo: boolean; calls: CallWithStatus[] }>("GET", `/api/follow-up-agent/profiles/${p.id}/calls?lookback=${lb}`);
      setCalls(data.calls);
      setDemo(data.demo);
    } catch (e) {
      setCallsError((e as Error).message);
    } finally {
      setLoadingCalls(false);
    }
  }, []);

  const refreshProfile = useCallback(
    async (id: string) => {
      const { profile: p } = await api<{ profile: SafeProfile }>("GET", `/api/follow-up-agent/profiles/${id}`);
      setProfile(p);
      setProfiles((prev) => {
        const i = prev.findIndex((x) => x.id === id);
        if (i === -1) return prev;
        const next = [...prev];
        next[i] = p;
        return next;
      });
      setView("feed");
      await loadCalls(p, lookback);
      return p;
    },
    [loadCalls, lookback]
  );

  // Boot
  useEffect(() => {
    (async () => {
      const s = await api<SessionInfo>("GET", "/api/follow-up-agent/session");
      setSession(s);

      let { profiles: list } = await api<{ profiles: SafeProfile[] }>("GET", "/api/follow-up-agent/profiles");
      if (!list.length) {
        const { profile: created } = await api<{ profile: SafeProfile }>("POST", "/api/follow-up-agent/profiles", { name: "Default" });
        list = [created];
      }
      setProfiles(list);

      const saved = typeof window !== "undefined" ? window.localStorage.getItem(PROFILE_STORAGE_KEY) : null;
      const found = list.find((p) => p.id === saved) || list[0];
      await refreshProfile(found.id);

      // Gmail OAuth return params
      const params = new URLSearchParams(window.location.search);
      if (params.get("gmail") === "connected") {
        const pid = params.get("profile");
        if (pid) window.localStorage.setItem(PROFILE_STORAGE_KEY, pid);
        toast("Gmail connected");
        window.history.replaceState({}, "", window.location.pathname);
      } else if (params.get("gmail") === "error") {
        toast("Gmail connection failed: " + (params.get("reason") || "unknown"), "err");
        window.history.replaceState({}, "", window.location.pathname);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const handleProfileChange = async (id: string) => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, id);
    await refreshProfile(id);
  };

  const handleNewProfile = async () => {
    const name = window.prompt("New profile name (e.g. MarketingOps, RevX):");
    if (!name) return;
    const { profile: created } = await api<{ profile: SafeProfile }>("POST", "/api/follow-up-agent/profiles", { name });
    const { profiles: list } = await api<{ profiles: SafeProfile[] }>("GET", "/api/follow-up-agent/profiles");
    setProfiles(list);
    window.localStorage.setItem(PROFILE_STORAGE_KEY, created.id);
    await refreshProfile(created.id);
    setShowSettings(true);
    toast("Profile created — add your settings");
  };

  const handleLookbackChange = async (lb: number) => {
    setLookback(lb);
    if (profile) await loadCalls(profile, lb);
  };

  const openDetail = (call: CallWithStatus) => {
    setSelectedCall(call);
    setTemplateId(TEMPLATE_IDS.POST_MEETING);
    setExtraContext("");
    setDraft(null);
    setExistingDraftNote(null);
    setCreatedNote(null);
    setGenError(null);
    setView("detail");
    void generatePreview(call, TEMPLATE_IDS.POST_MEETING, "");
  };

  const generatePreview = async (call: CallWithStatus, tId: TemplateId, ctx: string) => {
    if (!profile) return;
    setGenerating(true);
    setGenError(null);
    try {
      const data = await api<{ draft: Draft; existingDraft: { at: string } | null }>(
        "POST",
        `/api/follow-up-agent/profiles/${profile.id}/generate`,
        { recordingId: call.recordingId, templateId: tId, extraContext: ctx }
      );
      setDraft(data.draft);
      setDraftTo(data.draft.to || "");
      setDraftSubject(data.draft.subject || "");
      setDraftHtml(data.draft.html || "");
      setExistingDraftNote(data.existingDraft ? new Date(data.existingDraft.at).toLocaleString() : null);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const selectTemplate = (id: TemplateId) => {
    setTemplateId(id);
    if (selectedCall) void generatePreview(selectedCall, id, extraContext);
  };

  const handleCreateDraft = async (force = false) => {
    if (!profile || !selectedCall) return;
    setCreating(true);
    try {
      const out = await api<{ gmailUrl: string }>("POST", `/api/follow-up-agent/profiles/${profile.id}/create-draft`, {
        recordingId: selectedCall.recordingId,
        templateId,
        force,
        draft: { to: draftTo, subject: draftSubject, html: draftHtml },
      });
      toast("Draft is in your Gmail — review & send");
      setCreatedNote(out.gmailUrl);
      await loadCalls(profile, lookback);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) {
        if (window.confirm("A draft already exists for this call. Replace the existing Gmail draft?")) {
          setCreating(false);
          return handleCreateDraft(true);
        }
      } else {
        toast(err.message, "err");
      }
    } finally {
      setCreating(false);
    }
  };

  const simulate = async (which: "match" | "decoy") => {
    if (!profile) return;
    try {
      const data = await api<{ call: { title: string }; result: { drafted?: boolean; skipped?: string } }>(
        "POST",
        `/api/follow-up-agent/profiles/${profile.id}/simulate-webhook`,
        { which }
      );
      if (data.result.drafted) toast(`Autopilot drafted a follow-up for "${data.call.title}"`);
      else if (data.result.skipped === "title-mismatch") toast(`Ignored "${data.call.title}" — not a sales call (title filter works)`);
      else if (data.result.skipped === "already-drafted") toast(`Already drafted for "${data.call.title}" — dedupe prevented a double draft`);
      await loadCalls(profile, lookback);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const needsFillWarn = /\[FILL:/i.test(draftHtml || "");

  if (!session || !profile) {
    return (
      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        <p className="text-zunesty-light/50 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold text-zunesty-light mb-1">Follow-Up Agent</h2>
          <p className="text-zunesty-light/50 text-sm">Turn sales calls into ready-to-review Gmail drafts</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={profile.id}
            onChange={(e) => void handleProfileChange(e.target.value)}
            className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void handleNewProfile()}
            title="New profile"
            className="w-9 h-9 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 text-zunesty-light hover:border-zunesty-green/50 transition-colors"
          >
            +
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="w-9 h-9 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 text-zunesty-light hover:border-zunesty-green/50 transition-colors"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Demo banner */}
      {demo && (
        <div className="mb-6 rounded-lg border border-zunesty-green/30 bg-zunesty-green-darkest/40 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-zunesty-light/80">
            <b className="text-zunesty-green">Demo mode.</b> No Fathom key configured, so you are seeing sample calls and canned drafts. Add a
            Fathom key in Settings to go live.
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => void simulate("match")}
              className="rounded-md bg-zunesty-green px-3 py-1.5 text-xs font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors"
            >
              ▶ Simulate incoming call
            </button>
            <button
              onClick={() => void simulate("decoy")}
              title="A non-sales meeting — Autopilot should ignore it"
              className="rounded-md border border-zunesty-green-dark/40 px-3 py-1.5 text-xs text-zunesty-light/70 hover:border-zunesty-green/40 transition-colors"
            >
              Simulate decoy
            </button>
          </div>
        </div>
      )}

      {view === "feed" ? (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zunesty-light">Recent sales calls</h3>
              <span className="text-xs text-zunesty-light/40">{calls.length ? `${calls.length} found` : ""}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={lookback}
                onChange={(e) => void handleLookbackChange(Number(e.target.value))}
                className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
              <button
                onClick={() => void loadCalls(profile, lookback)}
                className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors"
              >
                Find my sales calls
              </button>
            </div>
          </div>

          {loadingCalls && <p className="text-sm text-zunesty-light/50">Finding your sales calls…</p>}

          {callsError && (
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
              Couldn&apos;t load calls: {callsError}
            </div>
          )}

          {!loadingCalls && !callsError && !calls.length && (
            <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 px-4 py-6 text-sm text-zunesty-light/50">
              {profile.settings.event_name ? (
                <>No calls in this window match &ldquo;{profile.settings.event_name}&rdquo;. Autopilot will draft new ones automatically as they come in.</>
              ) : (
                <>
                  Set your <b className="text-zunesty-light/80">sales meeting event name</b> in Settings so the tool knows which calls are
                  yours.
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            {calls.map((c) => {
              const who = c.externalAttendees.map((a) => a.name || a.email).join(", ") || "(no external attendee)";
              const email = c.primaryAttendee?.email || "";
              const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
              return (
                <button
                  key={c.recordingId}
                  onClick={() => openDetail(c)}
                  className="w-full text-left rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 px-4 py-3 flex items-center justify-between gap-4 hover:border-zunesty-green/40 hover:bg-zunesty-green-darkest/40 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-zunesty-light">{who}</div>
                    <div className="text-xs text-zunesty-light/40 mt-0.5">
                      {email}
                      {email ? " · " : ""}
                      <span className="text-zunesty-light/60">{c.title}</span> · {date}
                    </div>
                  </div>
                  {c.status === "drafted" && (
                    <span className="shrink-0 rounded-full border border-zunesty-green/30 bg-zunesty-green/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-zunesty-green">
                      ✓ Drafted
                    </span>
                  )}
                  {c.status === "needs_attention" && (
                    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-400">
                      Needs attention
                    </span>
                  )}
                  {c.status === "none" && (
                    <span className="shrink-0 rounded-full border border-zunesty-light/10 bg-zunesty-light/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-zunesty-light/40">
                      No draft
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        selectedCall && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setView("feed")}
                className="rounded-lg border border-zunesty-green-dark/40 px-3 py-1.5 text-sm text-zunesty-light/70 hover:border-zunesty-green/40 transition-colors"
              >
                ← Back
              </button>
              <div>
                <div className="text-sm font-semibold text-zunesty-light">
                  {selectedCall.externalAttendees.map((a) => a.name || a.email).join(", ") || "(no external attendee)"}
                </div>
                <div className="text-xs text-zunesty-light/40">
                  {selectedCall.title} · {selectedCall.createdAt ? new Date(selectedCall.createdAt).toLocaleString() : ""}
                </div>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-zunesty-light mb-3">Draft a play</h3>
            <div className="grid gap-3 sm:grid-cols-3 mb-5">
              {session.templateMeta.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t.id)}
                  className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                    t.id === templateId
                      ? "border-zunesty-green bg-zunesty-green-darkest/50"
                      : "border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 hover:border-zunesty-green/40"
                  }`}
                >
                  <div className="text-sm font-medium text-zunesty-light flex items-center gap-2">
                    {t.name}
                    {t.autopilot && (
                      <span className="rounded-full bg-zunesty-green/15 text-zunesty-green text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5">
                        Autopilot
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zunesty-light/40 mt-1">{t.blurb}</div>
                </button>
              ))}
            </div>

            {templateId !== TEMPLATE_IDS.POST_MEETING && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-zunesty-light/80 mb-1.5">
                  Extra context <span className="text-zunesty-light/40 font-normal">(urgency reason / what&apos;s new)</span>
                </label>
                <textarea
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  onBlur={() => selectedCall && void generatePreview(selectedCall, templateId, extraContext)}
                  placeholder="e.g. Enrollment closes Friday — only 2 spots left."
                  rows={3}
                  className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none resize-y"
                />
              </div>
            )}

            {generating && <p className="text-sm text-zunesty-light/50 mb-4">Drafting in your voice…</p>}
            {genError && (
              <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300 mb-4">
                Couldn&apos;t generate the draft: {genError}
              </div>
            )}

            {!generating && draft && (
              <div>
                <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 overflow-hidden">
                  <div className="border-b border-zunesty-green-dark/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 text-zunesty-light/40">To</span>
                      <input
                        value={draftTo}
                        onChange={(e) => setDraftTo(e.target.value)}
                        className="flex-1 bg-transparent text-zunesty-light focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 text-zunesty-light/40">Subject</span>
                      <input
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        className="flex-1 bg-transparent text-zunesty-light focus:outline-none"
                      />
                    </div>
                  </div>
                  <div
                    ref={bodyRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => setDraftHtml(unwrapFill(e.currentTarget.innerHTML))}
                    className="p-4 text-sm text-zunesty-light/90 leading-relaxed [&_a]:text-zunesty-green [&_a]:underline [&_ul]:pl-5 [&_ul]:list-disc focus:outline-none"
                  />
                </div>

                {needsFillWarn && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
                    ⚠ This draft has <b>[FILL: …]</b> markers. Fill them in before creating the draft.
                  </div>
                )}

                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => void handleCreateDraft(false)}
                    disabled={creating}
                    className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create Gmail draft"}
                  </button>
                  <button
                    onClick={() => selectedCall && void generatePreview(selectedCall, templateId, extraContext)}
                    className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:border-zunesty-green/40 transition-colors"
                  >
                    ↻ Re-draft
                  </button>
                  <a
                    href="https://mail.google.com/mail/#drafts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:border-zunesty-green/40 transition-colors"
                  >
                    Open Gmail drafts ↗
                  </a>
                  {createdNote ? (
                    <a href={createdNote} target="_blank" rel="noopener noreferrer" className="text-xs text-zunesty-green underline">
                      Open it in Gmail ↗
                    </a>
                  ) : existingDraftNote ? (
                    <span className="text-xs text-amber-300">A draft already exists for this call ({existingDraftNote}).</span>
                  ) : demo ? (
                    <span className="text-xs text-zunesty-light/40">Demo mode: draft is simulated, not sent to Gmail.</span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {showSettings && (
        <FollowUpSettings
          profile={profile}
          gmailConfigured={session.gmailConfigured}
          templateMeta={session.templateMeta}
          onClose={() => setShowSettings(false)}
          onSaved={async () => {
            await refreshProfile(profile.id);
          }}
          onDeleted={async () => {
            setShowSettings(false);
            const { profiles: list } = await api<{ profiles: SafeProfile[] }>("GET", "/api/follow-up-agent/profiles");
            setProfiles(list);
            window.localStorage.removeItem(PROFILE_STORAGE_KEY);
            if (list[0]) await refreshProfile(list[0].id);
          }}
          canDelete={profiles.length > 1}
          toast={toast}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg px-4 py-2.5 text-sm shadow-lg flex items-center gap-2 ${
              t.kind === "err" ? "bg-red-950 border border-red-800 text-red-200" : "bg-zunesty-green-darkest border border-zunesty-green/40 text-zunesty-light"
            }`}
          >
            <span>{t.kind === "err" ? "✕" : "✓"}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
