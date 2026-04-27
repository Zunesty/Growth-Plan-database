"use client";

import { useCallback, useEffect, useState } from "react";
import type { Client, Stage, Task } from "./pipeline-types";
import { STAGES, createEmptyClient, daysInStage } from "./pipeline-types";
import { supabase } from "./supabase";

const TABLE = "pipeline_clients";

// Fire-and-forget Slack notification — won't block UI if it fails
async function notifySlack(payload: Record<string, unknown>) {
  try {
    await fetch("/api/pipeline/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Slack notification failed:", err);
  }
}

function clientUrl(clientId: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/client-pipeline/${clientId}`;
}

async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Supabase fetch error:", error);
    return [];
  }
  return (data || []).map((row) => row.data as Client);
}

async function upsertClient(client: Client): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: client.id, data: client, updated_at: new Date().toISOString() });
  if (error) console.error("Supabase upsert error:", error);
}

async function deleteClientRow(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) console.error("Supabase delete error:", error);
}

export function usePipeline() {
  const [clients, setClients] = useState<Client[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Initial fetch + refetch when user returns to the tab
  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      fetchClients().then((data) => {
        if (!cancelled) {
          setClients(data);
          setHydrated(true);
        }
      });
    };

    refresh();

    // Refetch when the tab regains focus or visibility — keeps data fresh
    // across users without using realtime quota
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Manual refresh — exposed via the hook
  const refresh = useCallback(async () => {
    const data = await fetchClients();
    setClients(data);
  }, []);

  const addClient = useCallback((name: string): Client => {
    const client = createEmptyClient(name);
    setClients((prev) => [...prev, client]); // optimistic
    upsertClient(client);
    notifySlack({
      eventType: "client-added",
      clientName: client.name,
      clientUrl: clientUrl(client.id),
    });
    return client;
  }, []);

  const deleteClient = useCallback((id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    deleteClientRow(id);
  }, []);

  const updateClient = useCallback(
    (id: string, updater: (c: Client) => Client) => {
      setClients((prev) => {
        const next = prev.map((c) => (c.id === id ? updater(c) : c));
        const updated = next.find((c) => c.id === id);
        if (updated) upsertClient(updated);
        return next;
      });
    },
    []
  );

  const moveStage = useCallback(
    (id: string, newStage: Stage) => {
      const before = clients.find((c) => c.id === id);
      if (!before || before.currentStage === newStage) return;

      const days = daysInStage(before);
      const fromLabel = STAGES.find((s) => s.id === before.currentStage)?.label || before.currentStage;
      const toLabel = STAGES.find((s) => s.id === newStage)?.label || newStage;
      const nextOwner = before.tasks[newStage].find((t) => !t.completed)?.owner;

      updateClient(id, (c) => ({
        ...c,
        currentStage: newStage,
        stageStartedAt: new Date().toISOString(),
      }));

      notifySlack({
        eventType: "stage-change",
        clientName: before.name,
        fromStage: fromLabel,
        toStage: toLabel,
        daysInPrevStage: days,
        nextOwner,
        clientUrl: clientUrl(id),
      });
    },
    [clients, updateClient]
  );

  const toggleTask = useCallback(
    (clientId: string, stage: Stage, taskId: string) => {
      updateClient(clientId, (c) => ({
        ...c,
        tasks: {
          ...c.tasks,
          [stage]: c.tasks[stage].map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  completed: !t.completed,
                  completedAt: !t.completed ? new Date().toISOString() : undefined,
                }
              : t
          ),
        },
      }));
    },
    [updateClient]
  );

  const toggleBlocker = useCallback(
    (clientId: string, stage: Stage, taskId: string, reason?: string) => {
      const before = clients.find((c) => c.id === clientId);
      const beforeTask = before?.tasks[stage].find((t) => t.id === taskId);
      const willBeBlocked = beforeTask ? !beforeTask.blocked : false;

      updateClient(clientId, (c) => ({
        ...c,
        tasks: {
          ...c.tasks,
          [stage]: c.tasks[stage].map((t) =>
            t.id === taskId
              ? { ...t, blocked: !t.blocked, blockReason: !t.blocked ? reason : undefined }
              : t
          ),
        },
      }));

      if (willBeBlocked && before && beforeTask) {
        notifySlack({
          eventType: "blocker-added",
          clientName: before.name,
          blockedTaskLabel: beforeTask.label,
          blockReason: reason || "No reason given",
          clientUrl: clientUrl(clientId),
        });
      }
    },
    [clients, updateClient]
  );

  const addTask = useCallback(
    (clientId: string, stage: Stage, task: Omit<Task, "id">) => {
      updateClient(clientId, (c) => ({
        ...c,
        tasks: {
          ...c.tasks,
          [stage]: [
            ...c.tasks[stage],
            { ...task, id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` },
          ],
        },
      }));
    },
    [updateClient]
  );

  const removeTask = useCallback(
    (clientId: string, stage: Stage, taskId: string) => {
      updateClient(clientId, (c) => ({
        ...c,
        tasks: { ...c.tasks, [stage]: c.tasks[stage].filter((t) => t.id !== taskId) },
      }));
    },
    [updateClient]
  );

  return {
    clients,
    hydrated,
    refresh,
    addClient,
    deleteClient,
    updateClient,
    moveStage,
    toggleTask,
    toggleBlocker,
    addTask,
    removeTask,
  };
}
