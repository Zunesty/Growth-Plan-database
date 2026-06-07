import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateImagesForBatch } from "@/lib/ad-pipeline";
import type {
  AdBatch,
  AdConcept,
  AdTextMode,
} from "@/lib/ad-generator-types";

// Phase 2: KIE AI pipeline for the approved/edited concepts on the batch.
// Reads the batch's concept list, filters to approved + edited, runs the
// same image generation pipeline the legacy /generate route uses, persists
// creatives, updates batch status to ready-for-review.
//
// Nano Banana Pro at 2K averages 60-120s per generation, so we keep the
// full 500s ceiling here.

export const maxDuration = 500;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { batchId } = (await req.json()) as { batchId: string };

    if (!batchId) {
      return Response.json(
        { error: "Missing required field: batchId" },
        { status: 400 }
      );
    }

    const { data: batchRow, error: batchErr } = await supabase
      .from("ad_batches")
      .select("data")
      .eq("id", batchId)
      .single();

    if (batchErr || !batchRow) {
      return Response.json(
        { error: `Batch ${batchId} not found` },
        { status: 404 }
      );
    }

    const batch = batchRow.data as AdBatch;
    const allConcepts: AdConcept[] = batch.concepts || [];
    const approvedConcepts = allConcepts.filter(
      (c) => c.status === "approved" || c.status === "edited"
    );

    if (approvedConcepts.length === 0) {
      return Response.json(
        {
          error:
            "No approved concepts to generate. Approve or edit at least one concept first.",
        },
        { status: 400 }
      );
    }

    const result = await generateImagesForBatch({
      batchId,
      concepts: approvedConcepts,
      product: batch.product,
      textMode: (batch.textMode as AdTextMode) || "text",
      req,
    });

    return Response.json({
      success: true,
      creativesGenerated: result.creatives.length,
      readyCount: result.readyCount,
      failedCount: result.failedCount,
      rejectedCount: result.rejectedCount,
    });
  } catch (error) {
    console.error("Generate images error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate images",
      },
      { status: 500 }
    );
  }
}
