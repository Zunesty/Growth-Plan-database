"use client";

import { useState } from "react";
import { api } from "@/lib/client-hub-fetch";
import { TASK_STATUSES, STATUS_LABELS } from "@/lib/client-hub-types";
import type { Client, TaskStatus, TaskWithNames, TeamMember } from "@/lib/client-hub-types";

export default function ClientHubTaskModal({
  task,
  clients,
  team,
  onClose,
  onSaved,
  toast,
}: {
  task: TaskWithNames | null;
  clients: Client[];
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [clientId, setClientId] = useState<string>(task?.client_id ? String(task.client_id) : "");
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee_id ? String(task.assignee_id) : "");
  const [dueDate, setDueDate] = useState(task?.due_date || "");
  const [details, setDetails] = useState(task?.details || "");
  const [status, setStatus] = useState<TaskStatus>(task?.status || "todo");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast("Title is required.", "err");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        client_id: clientId ? Number(clientId) : null,
        assignee_id: assigneeId ? Number(assigneeId) : null,
        due_date: dueDate || null,
        details: details || null,
        status,
      };
      if (task) {
        await api("PATCH", `/api/client-hub/tasks/${task.id}`, payload);
      } else {
        await api("POST", "/api/client-hub/tasks", payload);
      }
      toast(task ? "Task updated" : "Task created");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-zunesty-green-dark/40 bg-zunesty-black p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zunesty-light">{task ? "Edit task" : "New task"}</h3>
            <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light">
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
              >
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
              >
                <option value="">Unassigned</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
              />
              {task && (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Details (optional)"
              rows={4}
              className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none resize-y"
            />
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
