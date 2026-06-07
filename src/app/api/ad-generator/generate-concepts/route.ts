import type { NextRequest } from "next/server";
import { generateConceptsForBatch } from "@/lib/ad-pipeline";
import type { WinningAd } from "@/lib/ad-generator-types";

// Phase 1: Claude writes the ad concepts (headlines + visual prompts) and
// persists them on the batch with status "concepts-pending". The user then
// reviews each concept and approves / rejects / edits before Phase 2
// (generate-images) runs the KIE AI pipeline.
//
// Claude usually returns within ~30s, so we keep the function ceiling low.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { batchId, product, count, winners } = (await req.json()) as {
      batchId: string;
      product: string;
      count: number;
      winners: WinningAd[];
    };

    if (!batchId || !product || !count || !winners) {
      return Response.json(
        { error: "Missing required fields: batchId, product, count, winners" },
        { status: 400 }
      );
    }

    const concepts = await generateConceptsForBatch({
      batchId,
      product,
      count,
      winners,
    });

    return Response.json({
      success: true,
      concepts,
      conceptCount: concepts.length,
    });
  } catch (error) {
    console.error("Generate concepts error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate concepts",
      },
      { status: 500 }
    );
  }
}
