"use client";

import { use, useState } from "react";
import Link from "next/link";
import DriveFoldersBar from "@/components/DriveFoldersBar";
import { useBatchDetail } from "@/lib/ad-generator-store";
import {
  ANGLES,
  type AdCreative,
  type CreativeStatus,
  type GenerationMode,
  type WinningAd,
} from "@/lib/ad-generator-types";

export default function BatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  const { batch, creatives, hydrated, updateCreativeStatus } = useBatchDetail(batchId);
  const [filter, setFilter] = useState<"all" | CreativeStatus>("all");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showingWinners, setShowingWinners] = useState(false);

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center text-zunesty-light/40 text-sm">
        Loading batch...
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <p className="text-zunesty-light/50 mb-4">Batch not found.</p>
        <Link
          href="/ad-generator"
          className="rounded-lg border border-zunesty-green-dark/40 px-5 py-2.5 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
        >
          ← Back to Ad Generator
        </Link>
      </div>
    );
  }

  const filtered =
    filter === "all" ? creatives : creatives.filter((c) => c.status === filter);

  const counts = {
    all: creatives.length,
    ready: creatives.filter((c) => c.status === "ready").length,
    approved: creatives.filter((c) => c.status === "approved").length,
    rejected: creatives.filter((c) => c.status === "rejected").length,
  };

  const handleApprove = async (id: string) => {
    // Call the approve endpoint — moves the Drive file from Output → Approved
    try {
      const res = await fetch("/api/ad-generator/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId: id, reviewedBy: "Santiago" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Approve failed");
      }
      // Update local state so the UI reflects immediately
      updateCreativeStatus(id, "approved");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approve failed");
    }
  };
  const handleReject = (id: string) => {
    setRejectingId(id);
    setRejectReason("");
  };
  const confirmReject = () => {
    if (rejectingId) {
      updateCreativeStatus(rejectingId, "rejected", rejectReason || "No reason given");
      setRejectingId(null);
    }
  };

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-6">
      <div>
        <Link
          href="/ad-generator"
          className="text-xs text-zunesty-light/40 hover:text-zunesty-light/70 transition-colors"
        >
          ← Back to Ad Generator
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div>
            <h2 className="text-2xl font-semibold text-zunesty-light">
              Batch {batch.id.split("-").slice(-1)[0]}
            </h2>
            <p className="text-sm text-zunesty-light/50">
              {creatives.length} ads generated · {counts.approved} approved · {counts.rejected} rejected
            </p>
            {batch.notes && (
              <p className="text-sm text-zunesty-light/60 mt-2 italic">&quot;{batch.notes}&quot;</p>
            )}
          </div>
          {batch.winners && batch.winners.length > 0 && (
            <button
              onClick={() => setShowingWinners(true)}
              className="rounded-lg border border-zunesty-green/40 bg-zunesty-green/10 px-4 py-2 text-xs font-semibold text-zunesty-green hover:bg-zunesty-green/20 transition-colors"
            >
              🏆 View winning ads ({batch.winners.length})
            </button>
          )}
        </div>
      </div>

      {/* Drive folder shortcuts */}
      <DriveFoldersBar />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "ready", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              filter === f
                ? "bg-zunesty-green text-zunesty-black font-semibold"
                : "bg-zunesty-green-darkest/40 text-zunesty-light/50 hover:bg-zunesty-green-darkest/70"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Creatives grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zunesty-green-dark/40 bg-zunesty-green-darkest/10 p-12 text-center">
          <p className="text-zunesty-light/50">No creatives match this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((creative) => (
            <CreativeCard
              key={creative.id}
              creative={creative}
              onApprove={() => handleApprove(creative.id)}
              onReject={() => handleReject(creative.id)}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <div
          className="fixed inset-0 bg-zunesty-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setRejectingId(null)}
        >
          <div
            className="bg-zunesty-green-darkest border border-red-500/40 rounded-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zunesty-light mb-2">Reject this creative</h3>
            <p className="text-xs text-zunesty-light/50 mb-4">
              Why is this not good to ship? Helps us improve future batches.
            </p>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmReject()}
              placeholder="e.g. Headline too aggressive, image quality too low..."
              autoFocus
              className="w-full rounded-lg border border-red-500/40 bg-zunesty-green-darkest/60 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-red-400 focus:outline-none transition-colors mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRejectingId(null)}
                className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Winners modal — shows the Triple Whale (or mock) ads this batch was
          seeded from. Useful for understanding why Claude wrote what it wrote. */}
      {showingWinners && batch.winners && batch.winners.length > 0 && (
        <div
          className="fixed inset-0 bg-zunesty-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowingWinners(false)}
        >
          <div
            className="bg-zunesty-green-darkest border border-zunesty-green/40 rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-zunesty-light">
                  🏆 Winning ads used as seeds
                </h3>
                <p className="text-xs text-zunesty-light/50 mt-1">
                  Claude wrote new concepts using these as patterns.
                  {batch.winners[0]?.id?.startsWith("tw_mock_")
                    ? " (Source: mock seeds — Triple Whale not connected for this batch)"
                    : " (Source: Triple Whale)"}
                </p>
              </div>
              <button
                onClick={() => setShowingWinners(false)}
                className="text-zunesty-light/40 hover:text-zunesty-light text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {batch.winners.map((w: WinningAd, i: number) => (
                <div
                  key={w.id}
                  className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/40 p-3"
                >
                  <div className="flex items-start gap-3">
                    {w.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={w.imageUrl}
                        alt={w.headline}
                        className="w-16 h-16 rounded object-cover flex-shrink-0 border border-zunesty-green-dark/40"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-zunesty-light/40">
                          #{i + 1}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-zunesty-green/80 font-semibold">
                          ${w.cpa} CPA · {w.sales} sales
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-zunesty-light leading-snug">
                        {w.headline}
                      </p>
                      {w.hook && (
                        <p className="text-xs text-zunesty-light/60 italic mt-1">
                          &ldquo;{w.hook}&rdquo;
                        </p>
                      )}
                      {w.visualStyle && (
                        <p className="text-[11px] text-zunesty-light/40 mt-1">
                          Visual: {w.visualStyle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreativeCard({
  creative,
  onApprove,
  onReject,
}: {
  creative: AdCreative;
  onApprove: () => void;
  onReject: () => void;
}) {
  const angleLabel = ANGLES.find((a) => a.id === creative.angle)?.label || creative.angle;
  const isReady = creative.status === "ready";
  const isApproved = creative.status === "approved";
  const isRejected = creative.status === "rejected";

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isApproved
          ? "border-zunesty-green/40 bg-zunesty-green/5"
          : isRejected
          ? "border-red-500/30 bg-red-500/5 opacity-70"
          : "border-zunesty-green-dark/30 bg-zunesty-green-darkest/20"
      }`}
    >
      {/* Image preview — clicking opens the Drive file in a new tab. Image bytes
          come from our authenticated proxy because Drive's webViewLink is an
          HTML viewer page, not an <img>-friendly URL. */}
      {creative.driveFileId && creative.driveUrl ? (
        <a
          href={creative.driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block aspect-[9/16] rounded-lg bg-zunesty-green-darkest/60 border border-zunesty-green-dark/20 mb-3 overflow-hidden group/img relative"
          title="Open in Google Drive"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/ad-generator/bottle-proxy/${creative.driveFileId}`}
            alt={creative.headline}
            className="w-full h-full object-cover transition-transform group-hover/img:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-zunesty-black/0 group-hover/img:bg-zunesty-black/20 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover/img:opacity-100 transition-opacity text-xs font-semibold bg-zunesty-black/70 text-zunesty-light px-2 py-1 rounded">
              Open in Drive ↗
            </span>
          </div>
        </a>
      ) : (
        <div className="aspect-[9/16] rounded-lg bg-zunesty-green-darkest/60 border border-zunesty-green-dark/20 flex items-center justify-center mb-3 overflow-hidden">
          <div className="text-center px-3">
            <p className="text-zunesty-green text-sm font-bold mb-2 leading-tight">
              &ldquo;{creative.headline}&rdquo;
            </p>
            <p className="text-xs text-zunesty-light/30">Image generation pending</p>
          </div>
        </div>
      )}

      {creative.generationMode && (
        <GenerationModeBadge mode={creative.generationMode} />
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] font-medium text-zunesty-green/80 uppercase tracking-wider">
          {angleLabel}
        </span>
        <StatusPill status={creative.status} />
      </div>

      <p className="text-sm text-zunesty-light leading-snug font-medium mb-1">{creative.headline}</p>
      <p className="text-xs text-zunesty-light/40 font-mono">{creative.filename}</p>

      {creative.driveUrl && (
        <a
          href={creative.driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-zunesty-green/80 hover:text-zunesty-green mt-1.5 transition-colors"
        >
          View in Drive ↗
        </a>
      )}

      {creative.complianceFlags.length > 0 && (
        <div className="mt-2 text-xs text-red-400">
          🚫 Compliance: {creative.complianceFlags.join(", ")}
        </div>
      )}

      {creative.rejectionReason && isRejected && (
        <div className="mt-2 text-xs text-red-400 italic">
          {creative.rejectionReason}
        </div>
      )}

      {isReady && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-zunesty-green-dark/20">
          <button
            onClick={onApprove}
            className="flex-1 rounded-lg bg-zunesty-green px-3 py-2 text-xs font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: CreativeStatus }) {
  const config: Record<CreativeStatus, { label: string; classes: string }> = {
    generating: { label: "Generating", classes: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
    ready: { label: "Ready", classes: "text-zunesty-green bg-zunesty-green/10 border-zunesty-green/30" },
    approved: { label: "Approved", classes: "text-zunesty-green bg-zunesty-green/15 border-zunesty-green/40" },
    rejected: { label: "Rejected", classes: "text-red-400 bg-red-500/10 border-red-500/30" },
    failed: { label: "Failed", classes: "text-red-400 bg-red-500/10 border-red-500/30" },
  };
  const c = config[status];
  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${c.classes}`}>
      {c.label}
    </span>
  );
}

function GenerationModeBadge({ mode }: { mode: GenerationMode }) {
  const config: Record<
    GenerationMode,
    { label: string; classes: string; title: string }
  > = {
    "kie-ai-scene": {
      label: "AI scene",
      classes: "text-zunesty-green/80 bg-zunesty-green/10 border-zunesty-green/30",
      title: "KIE AI generated a scene + sharp added the headline overlay.",
    },
    "kie-ai-text": {
      label: "AI scene + text",
      classes: "text-zunesty-green/80 bg-zunesty-green/10 border-zunesty-green/30",
      title: "KIE AI generated the scene and rendered the headline directly.",
    },
    "bottle-only": {
      label: "Bottle only — KIE fallback",
      classes: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      title:
        "KIE AI failed (or text mode was 'no-text'). Used the raw bottle shot resized to 9:16. Check Vercel logs for the KIE AI error.",
    },
    none: {
      label: "No image",
      classes: "text-red-400 bg-red-500/10 border-red-500/30",
      title: "No image was produced — compliance reject or Drive not configured.",
    },
  };
  const c = config[mode];
  return (
    <div className="mb-1.5">
      <span
        title={c.title}
        className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${c.classes}`}
      >
        {c.label}
      </span>
    </div>
  );
}
