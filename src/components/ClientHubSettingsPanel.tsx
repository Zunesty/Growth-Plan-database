"use client";

import { useState } from "react";
import { api } from "@/lib/client-hub-fetch";
import type { Client, RecurringTemplate, TeamMember } from "@/lib/client-hub-types";

export default function ClientHubSettingsPanel({
  clients,
  team,
  recurring,
  onClose,
  onSaved,
  toast,
}: {
  clients: Client[];
  team: TeamMember[];
  recurring: RecurringTemplate[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [section, setSection] = useState<"clients" | "team" | "recurring">("clients");

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-lg bg-zunesty-black border-l border-zunesty-green-dark/40 z-50 overflow-y-auto">
        <div className="sticky top-0 bg-zunesty-black border-b border-zunesty-green-dark/40 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zunesty-light">Settings</h2>
          <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 pt-4 flex gap-2">
          {(["clients", "team", "recurring"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                section === s ? "border-zunesty-green bg-zunesty-green/10 text-zunesty-green" : "border-zunesty-green-dark/30 text-zunesty-light/50"
              }`}
            >
              {s === "clients" ? "Clients" : s === "team" ? "Team" : "Recurring"}
            </button>
          ))}
        </div>

        <div className="px-5 py-5">
          {section === "clients" && <ClientsSection clients={clients} onSaved={onSaved} toast={toast} />}
          {section === "team" && <TeamSection team={team} onSaved={onSaved} toast={toast} />}
          {section === "recurring" && <RecurringSection recurring={recurring} clients={clients} team={team} onSaved={onSaved} toast={toast} />}
        </div>
      </aside>
    </>
  );
}

function ClientsSection({
  clients,
  onSaved,
  toast,
}: {
  clients: Client[];
  onSaved: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [rows, setRows] = useState<Record<number, { name: string; slack_channel_id: string }>>(
    Object.fromEntries(clients.map((c) => [c.id, { name: c.name, slack_channel_id: c.slack_channel_id || "" }]))
  );
  const [newName, setNewName] = useState("");

  const saveRow = async (id: number) => {
    try {
      await api("PATCH", `/api/client-hub/clients/${id}`, rows[id]);
      toast("Client saved");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const addClient = async () => {
    if (!newName.trim()) return;
    try {
      await api("POST", "/api/client-hub/clients", { name: newName.trim() });
      setNewName("");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="space-y-3">
      {clients.map((c) => (
        <div key={c.id} className="rounded-lg border border-zunesty-green-dark/30 p-3 space-y-2">
          <input
            value={rows[c.id]?.name ?? c.name}
            onChange={(e) => setRows((r) => ({ ...r, [c.id]: { ...r[c.id], name: e.target.value } }))}
            className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
          />
          <input
            value={rows[c.id]?.slack_channel_id ?? c.slack_channel_id ?? ""}
            onChange={(e) => setRows((r) => ({ ...r, [c.id]: { ...r[c.id], slack_channel_id: e.target.value } }))}
            placeholder="Slack channel ID (used by the Slack app once connected)"
            className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-xs text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
          />
          <button onClick={() => void saveRow(c.id)} className="text-xs text-zunesty-green hover:underline">
            Save
          </button>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void addClient()}
          placeholder="New client name…"
          className="flex-1 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
        />
        <button onClick={() => void addClient()} className="rounded-lg bg-zunesty-green px-3 py-2 text-xs font-semibold text-zunesty-black hover:bg-zunesty-green/90">
          Add
        </button>
      </div>
    </div>
  );
}

function TeamSection({
  team,
  onSaved,
  toast,
}: {
  team: TeamMember[];
  onSaved: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [rows, setRows] = useState<Record<number, { name: string; slack_user_id: string; role: string }>>(
    Object.fromEntries(team.map((t) => [t.id, { name: t.name, slack_user_id: t.slack_user_id || "", role: t.role || "" }]))
  );
  const [newName, setNewName] = useState("");

  const saveRow = async (id: number) => {
    try {
      await api("PATCH", `/api/client-hub/team/${id}`, rows[id]);
      toast("Team member saved");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const deleteRow = async (id: number) => {
    if (!window.confirm("Delete this team member? Their assigned tasks become unassigned.")) return;
    try {
      await api("DELETE", `/api/client-hub/team/${id}`);
      toast("Team member deleted");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const addMember = async () => {
    if (!newName.trim()) return;
    try {
      await api("POST", "/api/client-hub/team", { name: newName.trim() });
      setNewName("");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="space-y-3">
      {team.map((t) => (
        <div key={t.id} className="rounded-lg border border-zunesty-green-dark/30 p-3 space-y-2">
          <input
            value={rows[t.id]?.name ?? t.name}
            onChange={(e) => setRows((r) => ({ ...r, [t.id]: { ...r[t.id], name: e.target.value } }))}
            className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
          />
          <input
            value={rows[t.id]?.slack_user_id ?? t.slack_user_id ?? ""}
            onChange={(e) => setRows((r) => ({ ...r, [t.id]: { ...r[t.id], slack_user_id: e.target.value } }))}
            placeholder="Slack member ID (used by the Slack app once connected)"
            className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-xs text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button onClick={() => void saveRow(t.id)} className="text-xs text-zunesty-green hover:underline">
              Save
            </button>
            <button onClick={() => void deleteRow(t.id)} className="text-xs text-red-400 hover:underline">
              Delete
            </button>
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void addMember()}
          placeholder="New team member name…"
          className="flex-1 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
        />
        <button onClick={() => void addMember()} className="rounded-lg bg-zunesty-green px-3 py-2 text-xs font-semibold text-zunesty-black hover:bg-zunesty-green/90">
          Add
        </button>
      </div>
    </div>
  );
}

function RecurringSection({
  recurring,
  clients,
  team,
  onSaved,
  toast,
}: {
  recurring: RecurringTemplate[];
  clients: Client[];
  team: TeamMember[];
  onSaved: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newDueRule, setNewDueRule] = useState("day:25");
  const clientName = (id: number | null) => clients.find((c) => c.id === id)?.name || "—";
  const teamName = (id: number | null) => team.find((t) => t.id === id)?.name || "Unassigned";

  const toggleActive = async (r: RecurringTemplate) => {
    try {
      await api("PATCH", `/api/client-hub/recurring/${r.id}`, { active: !r.active });
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const addTemplate = async () => {
    if (!newTitle.trim() || !newClientId) return;
    try {
      await api("POST", "/api/client-hub/recurring", {
        title: newTitle.trim(),
        client_id: Number(newClientId),
        due_rule: newDueRule,
      });
      setNewTitle("");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="space-y-3">
      {recurring.map((r) => (
        <div key={r.id} className="rounded-lg border border-zunesty-green-dark/30 p-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm text-zunesty-light">{r.title}</div>
            <div className="text-[11px] text-zunesty-light/40">
              {clientName(r.client_id)} · {teamName(r.assignee_id)} · {r.due_rule} · lead {r.lead_time_days}d
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-zunesty-light/60 shrink-0">
            <input type="checkbox" checked={r.active} onChange={() => void toggleActive(r)} className="w-4 h-4 accent-zunesty-green" />
            Active
          </label>
        </div>
      ))}
      {!recurring.length && <p className="text-xs text-zunesty-light/30">No recurring templates yet.</p>}

      <div className="rounded-lg border border-zunesty-green-dark/30 p-3 space-y-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Template title"
          className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={newClientId}
            onChange={(e) => setNewClientId(e.target.value)}
            className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-xs text-zunesty-light focus:border-zunesty-green focus:outline-none"
          >
            <option value="">Client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={newDueRule}
            onChange={(e) => setNewDueRule(e.target.value)}
            placeholder="due_rule (day:25 | last_weekday | weekday:mon)"
            className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-2.5 py-1.5 text-xs text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
          />
        </div>
        <button onClick={() => void addTemplate()} className="rounded-lg bg-zunesty-green px-3 py-1.5 text-xs font-semibold text-zunesty-black hover:bg-zunesty-green/90">
          Add template
        </button>
      </div>
      <p className="text-[11px] text-zunesty-light/30">
        Templates spawn tasks automatically once the recurring engine ships (Phase 3) — for now this is just the list.
      </p>
    </div>
  );
}
