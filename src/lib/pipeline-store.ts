"use client";

import { useCallback, useEffect, useState } from "react";
import type { Client, Stage, Task } from "./pipeline-types";
import { createEmptyClient } from "./pipeline-types";

const STORAGE_KEY = "zunesty-pipeline-clients";

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
      updateClient(id, (c) => ({
        ...c,
        currentStage: newStage,
        stageStartedAt: new Date().toISOString(),
      }));
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
