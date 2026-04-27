"use client";

import { useCallback, useEffect, useState } from "react";
import type { Client, Stage, Task } from "./pipeline-types";
import { STAGES, createEmptyClient, daysInStage } from "./pipeline-types";

const STORAGE_KEY = "zunesty-pipeline-clients";

// Fire-and-forget Slack notification — won't block UI if it fails
async function notifySlack(payload: Record<string, unknown>) {
  try {
    await fetch("/api/pipeline/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Silently fail — Slack isn't critical to the UX
    console.warn("Slack notification failed:", err);
  }
}

function clientUrl(clientId: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/client-pipeline/${clientId}`;
}

function readClients(): Client[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Client[];
  } catch {
    return [];
  }
}

function writeClients(clients: Client[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

export function usePipeline() {
  const [clients, setClients] = useState<Client[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setClients(readClients());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Client[]) => {
    setClients(next);
    writeClients(next);
  }, []);

  const addClient = useCallback(
    (name: string): Client => {
      const client = createEmptyClient(name);
      persist([...readClients(), client]);
      notifySlack({
        eventType: "client-added",
        clientName: client.name,
        clientUrl: clientUrl(client.id),
      });
      return client;
    },
    [persist]
  );

  const deleteClient = useCallback(
    (id: string) => {
      persist(readClients().filter((c) => c.id !== id));
    },
    [persist]
  );

  const updateClient = useCallback(
    (id: string, updater: (c: Client) => Client) => {
      persist(readClients().map((c) => (c.id === id ? updater(c) : c)));
    },
    [persist]
  );

  const moveStage = useCallback(
    (id: string, newStage: Stage) => {
      const before = readClients().find((c) => c.id === id);
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
    [updateClient]
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
      const before = readClients().find((c) => c.id === clientId);
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

      // Only notify when ADDING a blocker, not removing one
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
    [updateClient]
  );

  const addTask = useCallback(
    (clientId: string, stage: Stage, task: Omit<Task, "id">) => {
      updateClient(clientId, (c) => ({
        ...c,
        tasks: {
          ...c.tasks,
          [stage]: [...c.tasks[stage], { ...task, id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }],
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

export function getClient(id: string): Client | undefined {
  return readClients().find((c) => c.id === id);
}
