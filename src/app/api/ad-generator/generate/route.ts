import type { NextRequest } from "next/server";
import {
  generateConceptsForBatch,
  generateImagesForBatch,
} from "@/lib/ad-pipeline";
import type { AdTextMode, WinningAd } from "@/lib/ad-generator-types";

// Direct-mode batch generation: skip the concept-review step.
// Calls generate-concepts and immediately generate-images, end-to-end.
// Used when the new-batch modal has "Skip concept review" toggled on.
// For the reviewable two-phase flow, see /generate-concepts + /generate-images.

export const maxDuration = 500;

export async function POST(req: NextRequest) {
  try {
    const {
      batchId,
      product,
      count,
      winners,
      textMode = "text",
    } = (await req.json()) as {
      batchId: string;
      product: string;
      count: number;
      winners: WinningAd[];
      createdBy: string;
      textMode?: AdTextMode;
    };

    const concepts = await generateConceptsForBatch({
      batchId,
      product,
      count,
      winners,
    });

    // Skip-review mode: every concept is implicitly approved.
    const approved = concepts.map((c) => ({ ...c, status: "approved" as const }));

    const result = await generateImagesForBatch({
      batchId,
      concepts: approved,
      product,
      textMode,
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
    console.error("Generate batch error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate batch",
      },
      { status: 500 }
    );
  }
}
