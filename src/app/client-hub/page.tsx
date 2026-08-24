"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ClientHubOnboardingTab from "@/components/ClientHubOnboardingTab";
import ClientHubProjectManagerTab from "@/components/ClientHubProjectManagerTab";
import ClientHubHealthTab from "@/components/ClientHubHealthTab";
import ClientHubTaskModal from "@/components/ClientHubTaskModal";
import ClientHubClientStageModal from "@/components/ClientHubClientStageModal";
import ClientHubHealthEditModal from "@/components/ClientHubHealthEditModal";
import ClientHubSettingsPanel from "@/components/ClientHubSettingsPanel";
import { api } from "@/lib/client-hub-fetch";
import type { BootstrapPayload, Client, TaskWithNames } from "@/lib/client-hub-types";

type Toast = { id: number; text: string; kind: "ok" | "err" };

type ModalState =
  | { type: "task"; task: TaskWithNames | null }
  | { type: "clientStage"; client: Client }
  | { type: "health"; client: Client }
  | { type: "settings" }
  | null;

const TABS = [
  { id: "onboarding", label: "Client Onboarding" },
  { id: "pm", label: "Project Manager" },
  { id: "health", label: "Client Health" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function ClientHubPage() {
  const [tab, setTab] = useState<TabId>("onboarding");
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [dragging, setDragging] = useState(false);
  const [filterClientId, setFilterClientId] = useState<number | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 6000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const payload = await api<BootstrapPayload>("GET", "/api/client-hub/bootstrap");
      setData(payload);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 5s poll, paused while a modal is open or a drag is in progress or the
  // tab is hidden — matches the source app's pause conditions.
  useEffect(() => {
    const interval = setInterval(() => {
      if (modal || dragging || document.hidden) return;
      void refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [modal, dragging, refresh]);

  if (loadError && !data) {
    return (
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          Couldn&apos;t load Client Hub: {loadError}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        <p className="text-zunesty-light/50 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold text-zunesty-light mb-1">Client Hub</h2>
          <p className="text-zunesty-light/50 text-sm">Onboarding, task pipeline, and client health — one place.</p>
        </div>
        {tab === "pm" && (
          <button
            onClick={() => setModal({ type: "settings" })}
            className="w-9 h-9 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 text-zunesty-light hover:border-zunesty-green/50 transition-colors"
            title="Settings"
          >
            ⚙
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-6 border-b border-zunesty-green-dark/30">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-zunesty-green text-zunesty-light"
                : "border-transparent text-zunesty-light/40 hover:text-zunesty-light/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "onboarding" && (
        <ClientHubOnboardingTab
          clients={data.clients}
          team={data.team}
          onboardingItems={data.onboardingItems}
          onOpenClient={(client) => setModal({ type: "clientStage", client })}
          onRefresh={refresh}
          toast={toast}
        />
      )}

      {tab === "pm" && (
        <ClientHubProjectManagerTab
          tasks={data.tasks}
          clients={data.clients}
          filterClientId={filterClientId}
          onFilterClientId={setFilterClientId}
          onOpenTask={(task) => setModal({ type: "task", task })}
          onDragStateChange={setDragging}
          onRefresh={refresh}
          toast={toast}
        />
      )}

      {tab === "health" && (
        <ClientHubHealthTab clients={data.clients} team={data.team} onOpenClient={(client) => setModal({ type: "health", client })} />
      )}

      {modal?.type === "task" && (
        <ClientHubTaskModal
          task={modal.task}
          clients={data.clients}
          team={data.team}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            setModal(null);
          }}
          toast={toast}
        />
      )}

      {modal?.type === "clientStage" && (
        <ClientHubClientStageModal
          client={modal.client}
          team={data.team}
          items={data.onboardingItems.filter((i) => i.client_id === modal.client.id)}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
          }}
          toast={toast}
        />
      )}

      {modal?.type === "health" && (
        <ClientHubHealthEditModal
          client={modal.client}
          team={data.team}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            setModal(null);
          }}
          toast={toast}
        />
      )}

      {modal?.type === "settings" && (
        <ClientHubSettingsPanel
          clients={data.clients}
          team={data.team}
          recurring={data.recurring}
          onClose={() => setModal(null)}
          onSaved={refresh}
          toast={toast}
        />
      )}

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
