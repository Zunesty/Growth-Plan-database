"use client";

import { useState } from "react";
import { api } from "@/lib/client-hub-fetch";
import { CLIENT_STAGES, STAGE_LABELS } from "@/lib/client-hub-types";
import type { Client, ClientStage, OnboardingItem, TeamMember } from "@/lib/client-hub-types";

export default function ClientHubClientStageModal({
  client,
  team,
  items,
  onClose,
  onSaved,
  toast,
}: {
  client: Client;
  team: TeamMember[];
  items: OnboardingItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [stage, setStage] = useState<ClientStage>(client.stage);
  const [ownerId, setOwnerId] = useState<string>(client.owner_id ? String(client.owner_id) : "");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (stage !== client.stage) {
        await api("POST", `/api/client-hub/clients/${client.id}/stage`, { stage });
      }
      await api("PATCH", `/api/client-hub/clients/${client.id}`, { owner_id: ownerId ? Number(ownerId) : null });
      toast("Client updated");
      await onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (item: OnboardingItem) => {
    try {
      await api("PATCH", `/api/client-hub/onboarding/items/${item.id}`, { done: !item.done });
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const deleteItem = async (item: OnboardingItem) => {
    try {
      await api("DELETE", `/api/client-hub/onboarding/items/${item.id}`);
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const addItem = async () => {
    if (!newItemTitle.trim()) return;
    try {
      await api("POST", `/api/client-hub/onboarding/${client.id}/items`, { title: newItemTitle.trim() });
      setNewItemTitle("");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-zunesty-green-dark/40 bg-zunesty-black p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zunesty-light">{client.name}</h3>
            <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light">
              ✕
            </button>
          </div>

          <div className="space-y-3 mb-5">
            <label className="block">
              <span className="block text-xs font-medium text-zunesty-light/60 mb-1">Stage</span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as ClientStage)}
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
              >
                {CLIENT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-zunesty-light/60 mb-1">Owner</span>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
              >
                <option value="">Unassigned</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zunesty-light/50">Onboarding checklist</div>
          <div className="space-y-1.5 mb-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 group">
                <input type="checkbox" checked={item.done} onChange={() => void toggleItem(item)} className="w-4 h-4 accent-zunesty-green" />
                <span className={`flex-1 text-sm ${item.done ? "text-zunesty-light/30 line-through" : "text-zunesty-light/80"}`}>{item.title}</span>
                <button onClick={() => void deleteItem(item)} className="text-zunesty-light/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  ✕
                </button>
              </div>
            ))}
            {!items.length && <div className="text-xs text-zunesty-light/30">No checklist items yet.</div>}
          </div>
          <div className="flex gap-2 mb-5">
            <input
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addItem()}
              placeholder="Add checklist item…"
              className="flex-1 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-1.5 text-xs text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
            />
            <button onClick={() => void addItem()} className="rounded-lg border border-zunesty-green-dark/40 px-3 py-1.5 text-xs text-zunesty-light/70 hover:border-zunesty-green/40">
              Add
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
