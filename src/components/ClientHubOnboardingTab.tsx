"use client";

import { api } from "@/lib/client-hub-fetch";
import { daysAgoPacific } from "@/lib/client-hub-config";
import { CLIENT_STAGES, STAGE_LABELS } from "@/lib/client-hub-types";
import type { Client, OnboardingItem, TeamMember } from "@/lib/client-hub-types";

export default function ClientHubOnboardingTab({
  clients,
  team,
  onboardingItems,
  onOpenClient,
  onRefresh,
  toast,
}: {
  clients: Client[];
  team: TeamMember[];
  onboardingItems: OnboardingItem[];
  onOpenClient: (client: Client) => void;
  onRefresh: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const teamName = (id: number | null) => team.find((t) => t.id === id)?.name;

  const moveStage = async (client: Client, direction: -1 | 1) => {
    const idx = CLIENT_STAGES.indexOf(client.stage);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= CLIENT_STAGES.length) return;
    try {
      await api("POST", `/api/client-hub/clients/${client.id}/stage`, { stage: CLIENT_STAGES[nextIdx] });
      await onRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {CLIENT_STAGES.map((stage, colIdx) => {
        const stageClients = clients.filter((c) => c.active && c.stage === stage);
        return (
          <div key={stage} className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/10 p-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-zunesty-light/50 mb-2 px-1">
              {STAGE_LABELS[stage]} <span className="text-zunesty-light/30">({stageClients.length})</span>
            </div>
            <div className="space-y-2">
              {stageClients.map((client) => {
                const items = onboardingItems.filter((i) => i.client_id === client.id);
                const done = items.filter((i) => i.done).length;
                const pct = items.length ? Math.round((done / items.length) * 100) : 0;
                const stalled = daysAgoPacific(client.stage_entered_at) > 21 && stage !== "optimizing" && pct < 100;
                return (
                  <div
                    key={client.id}
                    onClick={() => onOpenClient(client)}
                    className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/30 p-3 cursor-pointer hover:border-zunesty-green/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-zunesty-light truncate">{client.name}</span>
                      {stalled && (
                        <span className="shrink-0 rounded-full bg-red-500/15 text-red-300 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5">
                          Stalled
                        </span>
                      )}
                    </div>
                    {client.owner_id != null && (
                      <div className="text-[11px] text-zunesty-light/40 mb-2">Owner: {teamName(client.owner_id) || "—"}</div>
                    )}
                    {items.length > 0 && (
                      <div className="h-1.5 rounded-full bg-zunesty-light/10 mb-2 overflow-hidden">
                        <div className="h-full bg-zunesty-green" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveStage(client, -1);
                        }}
                        disabled={colIdx === 0}
                        className="text-zunesty-light/40 hover:text-zunesty-green disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        ← Prev
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveStage(client, 1);
                        }}
                        disabled={colIdx === CLIENT_STAGES.length - 1}
                        className="text-zunesty-light/40 hover:text-zunesty-green disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                );
              })}
              {!stageClients.length && <div className="text-xs text-zunesty-light/25 px-1 py-2">No clients</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
