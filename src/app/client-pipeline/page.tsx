"use client";

import { useState } from "react";
import Link from "next/link";
import { usePipeline } from "@/lib/pipeline-store";
import { STAGES, daysInStage, hasBlockers, stageProgress, type Client, type Stage, type TeamMember } from "@/lib/pipeline-types";

export default function ClientPipelinePage() {
  const { clients, hydrated, refresh, addClient, deleteClient, moveStage } = usePipeline();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");

  const handleAdd = () => {
    if (!newClientName.trim()) return;
    addClient(newClientName.trim());
    setNewClientName("");
    setShowAddModal(false);
  };

  const groupedByStage: Record<Stage, Client[]> = {
    onboarding: [],
    "icp-brief": [],
    "campaign-build": [],
    live: [],
    optimizing: [],
  };
  clients.forEach((c) => groupedByStage[c.currentStage].push(c));

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center text-zunesty-light/40 text-sm">
        Loading pipeline...
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-zunesty-light mb-1">Client Pipeline</h2>
          <p className="text-sm text-zunesty-light/50">
            Track every client through onboarding, build, launch, and optimization.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refresh()}
            className="rounded-lg border border-zunesty-green-dark/40 px-3 py-2.5 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
            title="Refresh from database"
          >
            ↻
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-zunesty-green px-5 py-2.5 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors"
          >
            + Add Client
          </button>
        </div>
      </div>

      {/* Empty state */}
      {clients.length === 0 && (
        <div className="rounded-xl border border-dashed border-zunesty-green-dark/40 bg-zunesty-green-darkest/10 p-12 text-center">
          <p className="text-zunesty-light/50 mb-4">
            No clients in the pipeline yet. Add your first one to get started.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg border border-zunesty-green/40 bg-zunesty-green/10 px-5 py-2 text-sm text-zunesty-green hover:bg-zunesty-green/20 transition-colors"
          >
            Add First Client
          </button>
        </div>
      )}

      {/* Pipeline board */}
      {clients.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {STAGES.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage.id}
              label={stage.label}
              color={stage.color}
              clients={groupedByStage[stage.id]}
              onMove={moveStage}
              onDelete={deleteClient}
            />
          ))}
        </div>
      )}

      {/* Add client modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-zunesty-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-zunesty-green-darkest border border-zunesty-green-dark/40 rounded-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zunesty-light mb-4">Add New Client</h3>
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Client name (e.g. RevX)"
              autoFocus
              className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/60 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newClientName.trim()}
                className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
              >
                Add Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StageColumn({
  stage,
  label,
  color,
  clients,
  onMove,
  onDelete,
}: {
  stage: Stage;
  label: string;
  color: string;
  clients: Client[];
  onMove: (id: string, stage: Stage) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/15 p-3 min-h-[400px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-xs font-semibold text-zunesty-light uppercase tracking-wider">
            {label}
          </h3>
        </div>
        <span className="text-xs text-zunesty-light/40">{clients.length}</span>
      </div>
      <div className="space-y-2">
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            stage={stage}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function ClientCard({
  client,
  stage,
  onMove,
  onDelete,
}: {
  client: Client;
  stage: Stage;
  onMove: (id: string, stage: Stage) => void;
  onDelete: (id: string) => void;
}) {
  const days = daysInStage(client);
  const blocked = hasBlockers(client);
  const progress = stageProgress(client);
  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const nextStage = STAGES[stageIndex + 1];
  const prevStage = STAGES[stageIndex - 1];

  // Identify the owner of the next uncompleted task (who we're waiting on)
  const currentOwner: TeamMember | null =
    client.tasks[client.currentStage].find((t) => !t.completed)?.owner || null;

  const isStalled = days > 7;

  return (
    <Link
      href={`/client-pipeline/${client.id}`}
      className="block rounded-lg bg-zunesty-green-darkest/50 border border-zunesty-green-dark/30 p-3 hover:border-zunesty-green/40 hover:bg-zunesty-green-darkest/70 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-semibold text-zunesty-light group-hover:text-zunesty-green transition-colors truncate">
          {client.name}
        </h4>
        <button
          onClick={(e) => {
            e.preventDefault();
            if (confirm(`Remove ${client.name} from pipeline?`)) onDelete(client.id);
          }}
          className="text-zunesty-light/20 hover:text-red-400 transition-colors text-xs"
          title="Remove"
        >
          ×
        </button>
      </div>

      {/* Flags row */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {blocked && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">
            Blocked
          </span>
        )}
        {isStalled && !blocked && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
            Stalled
          </span>
        )}
        {currentOwner && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zunesty-green/10 text-zunesty-green/90 border border-zunesty-green/20">
            {currentOwner}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-zunesty-light/40">
            {progress.done}/{progress.total} tasks
          </span>
          <span className="text-[10px] text-zunesty-light/40">{progress.pct}%</span>
        </div>
        <div className="h-1 rounded-full bg-zunesty-green-dark/30 overflow-hidden">
          <div
            className="h-full bg-zunesty-green transition-all"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>

      {/* Days in stage */}
      <div className="flex items-center justify-between text-[10px] text-zunesty-light/40">
        <span>{days} {days === 1 ? "day" : "days"} in stage</span>
      </div>

      {/* Stage move buttons */}
      <div className="flex gap-1 mt-2 pt-2 border-t border-zunesty-green-dark/20">
        {prevStage && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onMove(client.id, prevStage.id);
            }}
            className="flex-1 text-[10px] text-zunesty-light/40 hover:text-zunesty-light/80 transition-colors"
            title={`Move back to ${prevStage.label}`}
          >
            ← {prevStage.label}
          </button>
        )}
        {nextStage && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onMove(client.id, nextStage.id);
            }}
            className="flex-1 text-[10px] text-zunesty-green/70 hover:text-zunesty-green transition-colors font-medium"
            title={`Move to ${nextStage.label}`}
          >
            {nextStage.label} →
          </button>
        )}
      </div>
    </Link>
  );
}
