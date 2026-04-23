"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { usePipeline } from "@/lib/pipeline-store";
import {
  STAGES,
  TEAM_MEMBERS,
  daysInStage,
  stageProgress,
  type AccessStatus,
  type Client,
  type CopyApprovalStatus,
  type Stage,
  type TeamMember,
} from "@/lib/pipeline-types";

const COPY_STATUSES: { id: CopyApprovalStatus; label: string; color: string }[] = [
  { id: "not-started", label: "Not Started", color: "#666" },
  { id: "drafted", label: "Drafted", color: "#c97a32" },
  { id: "reviewed", label: "Reviewed Internally", color: "#29804b" },
  { id: "sent-to-client", label: "Sent to Client", color: "#7bbd53" },
  { id: "approved", label: "Approved", color: "#7bbd53" },
];

export default function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const { clients, hydrated, updateClient, moveStage, toggleTask, toggleBlocker, addTask, removeTask } =
    usePipeline();
  const client = clients.find((c) => c.id === clientId);

  const [newTaskLabel, setNewTaskLabel] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState<TeamMember>("Silvia");
  const [blockReasonFor, setBlockReasonFor] = useState<string | null>(null);
  const [blockReasonText, setBlockReasonText] = useState("");
  const [briefDraft, setBriefDraft] = useState("");

  useEffect(() => {
    if (client) setBriefDraft(client.strategicBrief || "");
  }, [client]);

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center text-zunesty-light/40 text-sm">
        Loading client...
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <p className="text-zunesty-light/50 mb-4">Client not found.</p>
        <Link
          href="/client-pipeline"
          className="rounded-lg border border-zunesty-green-dark/40 px-5 py-2.5 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
        >
          ← Back to Pipeline
        </Link>
      </div>
    );
  }

  const days = daysInStage(client);
  const progress = stageProgress(client);
  const currentStageInfo = STAGES.find((s) => s.id === client.currentStage)!;
  const currentTasks = client.tasks[client.currentStage];

  const saveBrief = () => {
    updateClient(client.id, (c) => ({ ...c, strategicBrief: briefDraft }));
  };

  const updateCopyStatus = (status: CopyApprovalStatus) => {
    updateClient(client.id, (c) => ({
      ...c,
      copyApprovalStatus: status,
      copyApprovalSentAt: status === "sent-to-client" ? new Date().toISOString() : c.copyApprovalSentAt,
    }));
  };

  const updateAccessStatus = (idx: number, status: AccessStatus) => {
    updateClient(client.id, (c) => ({
      ...c,
      accesses: c.accesses.map((a, i) => (i === idx ? { ...a, status } : a)),
    }));
  };

  const handleAddTask = () => {
    if (!newTaskLabel.trim()) return;
    addTask(client.id, client.currentStage, {
      label: newTaskLabel.trim(),
      owner: newTaskOwner,
      completed: false,
      blocked: false,
    });
    setNewTaskLabel("");
  };

  const handleToggleBlock = (taskId: string, isCurrentlyBlocked: boolean) => {
    if (isCurrentlyBlocked) {
      toggleBlocker(client.id, client.currentStage, taskId);
    } else {
      setBlockReasonFor(taskId);
      setBlockReasonText("");
    }
  };

  const confirmBlock = () => {
    if (blockReasonFor) {
      toggleBlocker(client.id, client.currentStage, blockReasonFor, blockReasonText || "No reason given");
      setBlockReasonFor(null);
      setBlockReasonText("");
    }
  };

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/client-pipeline"
            className="text-xs text-zunesty-light/40 hover:text-zunesty-light/70 transition-colors"
          >
            ← Back to Pipeline
          </Link>
          <h2 className="text-2xl font-semibold text-zunesty-light mt-2">{client.name}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: `${currentStageInfo.color}20`,
                color: currentStageInfo.color,
                borderColor: `${currentStageInfo.color}40`,
                borderWidth: 1,
                borderStyle: "solid",
              }}
            >
              {currentStageInfo.label}
            </span>
            <span className="text-zunesty-light/40">
              {days} {days === 1 ? "day" : "days"} in stage
            </span>
            <span className="text-zunesty-light/40">
              · {progress.done}/{progress.total} tasks ({progress.pct}%)
            </span>
          </div>
        </div>

        {/* Stage switcher */}
        <div className="flex gap-1">
          {STAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => moveStage(client.id, s.id)}
              className={`text-xs px-2.5 py-1.5 rounded transition-colors ${
                s.id === client.currentStage
                  ? "bg-zunesty-green text-zunesty-black font-semibold"
                  : "bg-zunesty-green-darkest/40 text-zunesty-light/50 hover:bg-zunesty-green-darkest/70 hover:text-zunesty-light"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stage tasks */}
      <section className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zunesty-green uppercase tracking-wider">
            {currentStageInfo.label} Tasks
          </h3>
        </div>

        <div className="space-y-2">
          {currentTasks.map((task) => {
            const ownerColor = TEAM_MEMBERS.find((m) => m.id === task.owner)?.color || "#7bbd53";
            return (
              <div
                key={task.id}
                className={`flex items-start gap-3 rounded-lg p-3 border transition-colors ${
                  task.blocked
                    ? "bg-red-500/5 border-red-500/30"
                    : task.completed
                    ? "bg-zunesty-green/5 border-zunesty-green/20"
                    : "bg-zunesty-green-darkest/30 border-zunesty-green-dark/20"
                }`}
              >
                <button
                  onClick={() => toggleTask(client.id, client.currentStage, task.id)}
                  className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    task.completed
                      ? "bg-zunesty-green border-zunesty-green"
                      : "border-zunesty-light/30 hover:border-zunesty-green"
                  }`}
                >
                  {task.completed && (
                    <svg className="w-3 h-3 text-zunesty-black" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${task.completed ? "text-zunesty-light/40 line-through" : "text-zunesty-light"}`}>
                    {task.label}
                  </div>
                  {task.blocked && task.blockReason && (
                    <div className="text-xs text-red-400 mt-1">🚫 {task.blockReason}</div>
                  )}
                </div>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded border flex-shrink-0"
                  style={{
                    color: ownerColor,
                    borderColor: `${ownerColor}40`,
                    backgroundColor: `${ownerColor}10`,
                  }}
                >
                  {task.owner}
                </span>
                <button
                  onClick={() => handleToggleBlock(task.id, task.blocked)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors flex-shrink-0 ${
                    task.blocked
                      ? "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                      : "text-zunesty-light/30 hover:text-red-400 hover:bg-red-500/10"
                  }`}
                  title={task.blocked ? "Unblock" : "Flag as blocked"}
                >
                  {task.blocked ? "Unblock" : "Block"}
                </button>
                <button
                  onClick={() => removeTask(client.id, client.currentStage, task.id)}
                  className="text-xs text-zunesty-light/20 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Delete task"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Add task */}
        <div className="mt-4 flex gap-2 pt-4 border-t border-zunesty-green-dark/20">
          <input
            type="text"
            value={newTaskLabel}
            onChange={(e) => setNewTaskLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
            placeholder="Add a new task..."
            className="flex-1 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors"
          />
          <select
            value={newTaskOwner}
            onChange={(e) => setNewTaskOwner(e.target.value as TeamMember)}
            className="rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none transition-colors"
          >
            {TEAM_MEMBERS.map((m) => (
              <option key={m.id} value={m.id} className="bg-zunesty-black">
                {m.id}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddTask}
            disabled={!newTaskLabel.trim()}
            className="rounded-lg bg-zunesty-green-mid px-4 py-2 text-sm font-medium text-zunesty-light hover:bg-zunesty-green-mid/80 transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      {/* Strategic Brief */}
      <section className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zunesty-green uppercase tracking-wider">
            Strategic Brief (North Star)
          </h3>
          <button
            onClick={saveBrief}
            className="text-xs text-zunesty-green hover:text-zunesty-light transition-colors"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-zunesty-light/40 mb-3">
          The research-backed document that defines the hypothesis for this client. Update as you learn.
        </p>
        <textarea
          value={briefDraft}
          onChange={(e) => setBriefDraft(e.target.value)}
          placeholder={`## ICP\n...\n\n## Core Hypothesis\n...\n\n## Messaging Angle\n...\n\n## Success Metrics\n...`}
          rows={10}
          className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors resize-y font-mono"
        />
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Copy Approval */}
        <section className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6">
          <h3 className="text-sm font-semibold text-zunesty-green uppercase tracking-wider mb-3">
            Copy Approval
          </h3>
          <p className="text-xs text-zunesty-light/40 mb-4">
            Track where the copy approval stands. 48h SLA after sending to client.
          </p>
          <div className="space-y-2">
            {COPY_STATUSES.map((s) => {
              const isActive = s.id === client.copyApprovalStatus;
              return (
                <button
                  key={s.id}
                  onClick={() => updateCopyStatus(s.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                    isActive
                      ? "bg-zunesty-green/15 border border-zunesty-green/40 text-zunesty-light"
                      : "bg-zunesty-green-darkest/30 border border-zunesty-green-dark/20 text-zunesty-light/50 hover:text-zunesty-light/80"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                  {isActive && s.id === "sent-to-client" && client.copyApprovalSentAt && (
                    <span className="text-xs text-zunesty-light/40 ml-auto">
                      {Math.floor(
                        (Date.now() - new Date(client.copyApprovalSentAt).getTime()) / (1000 * 60 * 60)
                      )}h ago
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Access Tracking */}
        <section className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6">
          <h3 className="text-sm font-semibold text-zunesty-green uppercase tracking-wider mb-3">
            Client Access
          </h3>
          <p className="text-xs text-zunesty-light/40 mb-4">
            Tools and accesses we need from the client to launch.
          </p>
          <div className="space-y-2">
            {client.accesses.map((access, idx) => (
              <div
                key={access.name}
                className="flex items-center justify-between rounded-lg bg-zunesty-green-darkest/30 border border-zunesty-green-dark/20 px-3 py-2"
              >
                <span className="text-sm text-zunesty-light">{access.name}</span>
                <select
                  value={access.status}
                  onChange={(e) => updateAccessStatus(idx, e.target.value as AccessStatus)}
                  className={`text-xs rounded px-2 py-1 border bg-transparent transition-colors ${
                    access.status === "received"
                      ? "text-zunesty-green border-zunesty-green/40 bg-zunesty-green/10"
                      : access.status === "requested"
                      ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                      : "text-zunesty-light/50 border-zunesty-green-dark/30"
                  }`}
                >
                  <option value="not-requested" className="bg-zunesty-black">Not requested</option>
                  <option value="requested" className="bg-zunesty-black">Requested</option>
                  <option value="received" className="bg-zunesty-black">Received</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Block reason modal */}
      {blockReasonFor && (
        <div
          className="fixed inset-0 bg-zunesty-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setBlockReasonFor(null)}
        >
          <div
            className="bg-zunesty-green-darkest border border-red-500/40 rounded-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zunesty-light mb-2">Flag as blocked</h3>
            <p className="text-xs text-zunesty-light/50 mb-4">
              What&apos;s blocking this task? (e.g. &quot;Waiting on client HubSpot access&quot;)
            </p>
            <input
              type="text"
              value={blockReasonText}
              onChange={(e) => setBlockReasonText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmBlock()}
              placeholder="Reason for block..."
              autoFocus
              className="w-full rounded-lg border border-red-500/40 bg-zunesty-green-darkest/60 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-500/30 transition-colors mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setBlockReasonFor(null)}
                className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBlock}
                className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              >
                Flag Blocked
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
