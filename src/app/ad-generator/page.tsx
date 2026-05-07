"use client";

import { useState } from "react";
import Link from "next/link";
import { useBatches, createBatch } from "@/lib/ad-generator-store";
import {
  PRODUCTS,
  type AdBatch,
  type WinningAd,
  WINNER_CRITERIA,
} from "@/lib/ad-generator-types";

export default function AdGeneratorPage() {
  const { batches, hydrated, refresh } = useBatches();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [count, setCount] = useState(20);
  const [notes, setNotes] = useState("");

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // 1. Pull winners from Triple Whale (or mock for now)
      const winnersRes = await fetch("/api/ad-generator/winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: "dopamine-brain-food" }),
      });
      const { winners, source } = (await winnersRes.json()) as {
        winners: WinningAd[];
        source: "mock" | "triple-whale";
      };

      // 2. Create batch record
      const batch: AdBatch = {
        id: `batch-${Date.now()}`,
        product: "dopamine-brain-food",
        status: "running",
        targetCount: count,
        generatedCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        winners,
        createdBy: "Santiago",
        createdAt: new Date().toISOString(),
        notes: notes || undefined,
      };
      await createBatch(batch);

      // 3. Trigger the actual generation
      const genRes = await fetch("/api/ad-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.id,
          product: batch.product,
          count,
          winners,
          createdBy: batch.createdBy,
        }),
      });

      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.error || "Generation failed");
      }

      if (source === "mock") {
        alert(
          "Batch created using mock Triple Whale data. Once we wire up the real API, batches will pull live winning ads."
        );
      }

      setShowNewBatch(false);
      setNotes("");
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center text-zunesty-light/40 text-sm">
        Loading batches...
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zunesty-light mb-1">Ad Generator</h2>
          <p className="text-sm text-zunesty-light/50">
            Generate static ad batches for Natural Stacks. Triple Whale → AI → Drive folder for review.
          </p>
        </div>
        <button
          onClick={() => setShowNewBatch(true)}
          className="rounded-lg bg-zunesty-green px-5 py-2.5 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors"
        >
          + Generate New Batch
        </button>
      </div>

      {/* Status info */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Batches" value={batches.length} />
        <Stat
          label="Ready for Review"
          value={batches.filter((b) => b.status === "ready-for-review").length}
        />
        <Stat
          label="Approved"
          value={batches.filter((b) => b.status === "approved").length}
        />
        <Stat
          label="Total Ads Generated"
          value={batches.reduce((s, b) => s + b.generatedCount, 0)}
        />
      </div>

      {/* Empty state */}
      {batches.length === 0 && (
        <div className="rounded-xl border border-dashed border-zunesty-green-dark/40 bg-zunesty-green-darkest/10 p-12 text-center">
          <p className="text-zunesty-light/50 mb-4">
            No batches yet. Generate your first one to get started.
          </p>
          <button
            onClick={() => setShowNewBatch(true)}
            className="rounded-lg border border-zunesty-green/40 bg-zunesty-green/10 px-5 py-2 text-sm text-zunesty-green hover:bg-zunesty-green/20 transition-colors"
          >
            Generate First Batch
          </button>
        </div>
      )}

      {/* Batch list */}
      {batches.length > 0 && (
        <div className="space-y-3">
          {batches.map((batch) => (
            <BatchRow key={batch.id} batch={batch} />
          ))}
        </div>
      )}

      {/* New batch modal */}
      {showNewBatch && (
        <div
          className="fixed inset-0 bg-zunesty-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => !isGenerating && setShowNewBatch(false)}
        >
          <div
            className="bg-zunesty-green-darkest border border-zunesty-green-dark/40 rounded-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zunesty-light mb-1">Generate New Batch</h3>
            <p className="text-xs text-zunesty-light/40 mb-5">
              Pull winners from Triple Whale and generate static ad variations.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zunesty-light/70 mb-1.5">
                  Product
                </label>
                <select
                  defaultValue="dopamine-brain-food"
                  className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/60 px-4 py-3 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none transition-colors"
                >
                  {PRODUCTS.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={!p.active}
                      className="bg-zunesty-black"
                    >
                      {p.name} {!p.active && "(coming soon)"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zunesty-light/70 mb-1.5">
                  How Many Ads?
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 20)}
                  className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/60 px-4 py-3 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none transition-colors"
                />
                <p className="text-xs text-zunesty-light/30 mt-1">
                  Austin&apos;s target: 20 per week
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zunesty-light/70 mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. focus on morning-ritual angles this week..."
                  rows={3}
                  className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/60 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none transition-colors resize-y"
                />
              </div>

              <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/40 p-3 text-xs text-zunesty-light/60">
                <p className="font-medium text-zunesty-green mb-1">Winner criteria</p>
                <p>
                  CPA ≤ ${WINNER_CRITERIA.maxCPA}, min {WINNER_CRITERIA.minSales} sales, last{" "}
                  {WINNER_CRITERIA.lookbackDays} days
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => setShowNewBatch(false)}
                disabled={isGenerating}
                className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || count < 1}
                className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
              >
                {isGenerating ? "Generating..." : "Generate Batch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 px-4 py-3">
      <p className="text-xs text-zunesty-light/40 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-zunesty-light mt-1">{value}</p>
    </div>
  );
}

function BatchRow({ batch }: { batch: AdBatch }) {
  const product = PRODUCTS.find((p) => p.id === batch.product);
  const date = new Date(batch.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/ad-generator/${batch.id}`}
      className="block rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-4 hover:border-zunesty-green/40 hover:bg-zunesty-green-darkest/40 transition-all group"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-zunesty-light group-hover:text-zunesty-green transition-colors truncate">
              {product?.name || batch.product} · Batch {batch.id.split("-").slice(-1)[0]}
            </h4>
            <BatchStatusBadge status={batch.status} />
          </div>
          <p className="text-xs text-zunesty-light/40">
            {date} · by {batch.createdBy}
          </p>
          {batch.notes && (
            <p className="text-xs text-zunesty-light/50 mt-1 italic">{batch.notes}</p>
          )}
        </div>

        <div className="flex gap-4 text-right">
          <Counter label="Generated" value={batch.generatedCount} total={batch.targetCount} />
          <Counter label="Approved" value={batch.approvedCount} positive />
          <Counter label="Rejected" value={batch.rejectedCount} negative />
        </div>
      </div>
    </Link>
  );
}

function Counter({
  label,
  value,
  total,
  positive,
  negative,
}: {
  label: string;
  value: number;
  total?: number;
  positive?: boolean;
  negative?: boolean;
}) {
  const color = positive
    ? "text-zunesty-green"
    : negative
    ? "text-red-400"
    : "text-zunesty-light";
  return (
    <div>
      <p className={`text-sm font-semibold ${color}`}>
        {value}
        {total !== undefined && <span className="text-zunesty-light/30">/{total}</span>}
      </p>
      <p className="text-[10px] text-zunesty-light/40 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function BatchStatusBadge({ status }: { status: AdBatch["status"] }) {
  const config: Record<AdBatch["status"], { label: string; color: string; bg: string; border: string }> = {
    queued: { label: "Queued", color: "text-zunesty-light/60", bg: "bg-zunesty-light/10", border: "border-zunesty-light/20" },
    running: { label: "Generating", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
    "ready-for-review": { label: "Ready for Review", color: "text-zunesty-green", bg: "bg-zunesty-green/15", border: "border-zunesty-green/30" },
    approved: { label: "Approved", color: "text-zunesty-green", bg: "bg-zunesty-green/15", border: "border-zunesty-green/30" },
    rejected: { label: "Rejected", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  };
  const c = config[status];
  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${c.color} ${c.bg} ${c.border}`}>
      {c.label}
    </span>
  );
}
