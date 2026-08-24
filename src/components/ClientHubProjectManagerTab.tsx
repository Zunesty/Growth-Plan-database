"use client";

import { useState } from "react";
import { api } from "@/lib/client-hub-fetch";
import { TASK_STATUSES, STATUS_LABELS } from "@/lib/client-hub-types";
import type { Client, TaskStatus, TaskWithNames } from "@/lib/client-hub-types";

export default function ClientHubProjectManagerTab({
  tasks,
  clients,
  filterClientId,
  onFilterClientId,
  onOpenTask,
  onDragStateChange,
  onRefresh,
  toast,
}: {
  tasks: TaskWithNames[];
  clients: Client[];
  filterClientId: number | null;
  onFilterClientId: (id: number | null) => void;
  onOpenTask: (task: TaskWithNames | null) => void;
  onDragStateChange: (dragging: boolean) => void;
  onRefresh: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const visible = filterClientId ? tasks.filter((t) => t.client_id === filterClientId) : tasks;
  const activeClients = clients.filter((c) => c.active);

  const moveTask = async (id: number, to_status: TaskStatus) => {
    try {
      await api("POST", `/api/client-hub/tasks/${id}/status`, { to_status });
      await onRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => onFilterClientId(null)}
          className={`rounded-full px-3 py-1 text-xs border transition-colors ${
            filterClientId === null
              ? "border-zunesty-green bg-zunesty-green/10 text-zunesty-green"
              : "border-zunesty-green-dark/30 text-zunesty-light/50 hover:border-zunesty-green/40"
          }`}
        >
          All clients
        </button>
        {activeClients.map((c) => (
          <button
            key={c.id}
            onClick={() => onFilterClientId(c.id)}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${
              filterClientId === c.id
                ? "border-zunesty-green bg-zunesty-green/10 text-zunesty-green"
                : "border-zunesty-green-dark/30 text-zunesty-light/50 hover:border-zunesty-green/40"
            }`}
          >
            {c.name}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => onOpenTask(null)}
            className="rounded-lg bg-zunesty-green px-3 py-1.5 text-xs font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors"
          >
            + New task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TASK_STATUSES.map((status) => {
          const colTasks = visible.filter((t) => t.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStatus(status);
              }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStatus(null);
                onDragStateChange(false);
                const id = Number(e.dataTransfer.getData("text/plain"));
                if (id) void moveTask(id, status);
              }}
              className={`rounded-lg border p-2.5 min-h-[120px] transition-colors ${
                dragOverStatus === status ? "border-zunesty-green/60 bg-zunesty-green-darkest/30" : "border-zunesty-green-dark/30 bg-zunesty-green-darkest/10"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-zunesty-light/50 mb-2 px-1">
                {STATUS_LABELS[status]} <span className="text-zunesty-light/30">({colTasks.length})</span>
              </div>
              <div className="space-y-2">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(task.id));
                      onDragStateChange(true);
                    }}
                    onDragEnd={() => onDragStateChange(false)}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-menu]")) return;
                      onOpenTask(task);
                    }}
                    className="relative rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/30 p-3 cursor-grab active:cursor-grabbing hover:border-zunesty-green/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-zunesty-light">
                        {task.title}
                        {task.revision_count > 0 && <span className="ml-1.5 text-amber-400 text-xs">↩︎</span>}
                      </span>
                      <div data-menu className="relative shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === task.id ? null : task.id);
                          }}
                          className="text-zunesty-light/30 hover:text-zunesty-light px-1"
                        >
                          ⋯
                        </button>
                        {openMenuId === task.id && (
                          <div className="absolute right-0 top-5 z-10 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-black shadow-lg py-1 w-36">
                            {TASK_STATUSES.filter((s) => s !== status).map((s) => (
                              <button
                                key={s}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  void moveTask(task.id, s);
                                }}
                                className="block w-full text-left px-3 py-1.5 text-xs text-zunesty-light/70 hover:bg-zunesty-green-darkest/60"
                              >
                                Move to {STATUS_LABELS[s]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-zunesty-light/40">
                      {task.client_name || "—"}
                      {task.assignee_name ? ` · ${task.assignee_name}` : ""}
                      {task.due_date ? ` · ${task.due_date}` : ""}
                    </div>
                  </div>
                ))}
                {!colTasks.length && <div className="text-xs text-zunesty-light/25 px-1 py-2">No tasks</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
