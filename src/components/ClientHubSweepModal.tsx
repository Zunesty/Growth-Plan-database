"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-hub-fetch";
import { STATUS_LABELS } from "@/lib/client-hub-types";
import type { Finding } from "@/lib/client-hub-findings";
import type { TaskStatus } from "@/lib/client-hub-types";

export default function ClientHubSweepModal({
  onClose,
  onRefresh,
  toast,
}: {
  onClose: () => void;
  onRefresh: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const { findings } = await api<{ findings: Finding[] }>("GET", "/api/client-hub/ui/sweep/findings");
      setFindings(findings);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runSweep = async () => {
    setRunning(true);
    setError(null);
    try {
      const { sweep, findings } = await api<{ sweep: { ok: boolean; error?: string; proposals?: number }; findings: Finding[] }>(
        "POST",
        "/api/client-hub/ui/sweep/run"
      );
      setFindings(findings);
      if (!sweep.ok) toast(sweep.error || "Sweep did not run", "err");
      else toast(`Sweep complete — ${sweep.proposals ?? 0} new proposal(s)`);
      await onRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setRunning(false);
    }
  };

  const resolveProposal = async (proposalId: number, action: "approve" | "dismiss") => {
    try {
      await api("POST", `/api/client-hub/proposals/${proposalId}/resolve`, { action });
      toast(action === "approve" ? "Proposal approved" : "Proposal dismissed");
      await load();
      await onRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const moveTask = async (taskId: number, status: TaskStatus) => {
    try {
      await api("POST", `/api/client-hub/tasks/${taskId}/status`, { to_status: status });
      toast(`Task #${taskId} moved to ${STATUS_LABELS[status]}`);
      await load();
      await onRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border border-zunesty-green-dark/40 bg-zunesty-black p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zunesty-light">Sweep</h3>
            <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light">
              ✕
            </button>
          </div>

          <button
            onClick={() => void runSweep()}
            disabled={running}
            className="mb-4 rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
          >
            {running ? "Running sweep…" : "Run sweep now"}
          </button>

          {error && <div className="text-sm text-red-300 mb-3">{error}</div>}

          <div className="space-y-2">
            {(findings || []).map((f, i) => (
              <div key={i} className="rounded-lg border border-zunesty-green-dark/30 p-3">
                {f.type === "proposal" && (
                  <>
                    <div className="text-sm text-zunesty-light mb-2">
                      🟡 {f.kind === "new_task" ? "New task" : "Status change"}
                      {f.clientName ? ` — ${f.clientName}` : ""}
                      <div className="text-xs text-zunesty-light/40 mt-1">{JSON.stringify(f.payload)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void resolveProposal(f.proposalId, "approve")} className="text-xs text-zunesty-green hover:underline">
                        Approve
                      </button>
                      <button onClick={() => void resolveProposal(f.proposalId, "dismiss")} className="text-xs text-zunesty-light/40 hover:underline">
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
                {f.type === "overdue" && (
                  <div className="text-sm text-zunesty-light">
                    🔴 Overdue: #{f.taskId} {f.title}
                    {f.clientName ? ` — ${f.clientName}` : ""} {f.dueDate ? `(due ${f.dueDate})` : ""}
                  </div>
                )}
                {f.type === "stuck_qc" && (
                  <>
                    <div className="text-sm text-zunesty-light mb-2">
                      ⚪ Stuck in QC: #{f.taskId} {f.title}
                      {f.clientName ? ` — ${f.clientName}` : ""}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void moveTask(f.taskId, "completed")} className="text-xs text-zunesty-green hover:underline">
                        Done
                      </button>
                    </div>
                  </>
                )}
                {f.type === "stale" && (
                  <>
                    <div className="text-sm text-zunesty-light mb-2">
                      ⚪ Stale: #{f.taskId} {f.title}
                      {f.clientName ? ` — ${f.clientName}` : ""}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void moveTask(f.taskId, "completed")} className="text-xs text-zunesty-green hover:underline">
                        Done
                      </button>
                      <button onClick={() => void moveTask(f.taskId, "qc")} className="text-xs text-zunesty-light/40 hover:underline">
                        Push to QC
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {findings && !findings.length && <div className="text-xs text-zunesty-light/30">Nothing needs attention right now.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
