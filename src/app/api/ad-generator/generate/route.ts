import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ANGLES,
  BANNED_WORDS,
  type AdAngle,
  type AdBatch,
  type AdCreative,
  type WinningAd,
} from "@/lib/ad-generator-types";
import { pickRandomImage, downloadImage, uploadImage } from "@/lib/google-drive";
import { overlayHeadline } from "@/lib/text-overlay";
import { generateImage as kieGenerateImage } from "@/lib/kie-ai";

const anthropic = new Anthropic();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Drive folder IDs come from env. If not set, we skip the image pipeline
// and the creative is created in "concept only" mode (no image).
const BOTTLES_FOLDER_ID = process.env.DRIVE_BOTTLES_FOLDER_ID;
const OUTPUT_FOLDER_ID = process.env.DRIVE_OUTPUT_FOLDER_ID;

// How many AI-generated UGC ads per batch (vs. pure bottle-shot ads).
// Mix gives variety in each batch.
const UGC_MIX_RATIO = 0.4;

export async function POST(req: NextRequest) {
  try {
    const { batchId, product, count, winners, createdBy } = (await req.json()) as {
      batchId: string;
      product: string;
      count: number;
      winners: WinningAd[];
      createdBy: string;
    };

    // 1. Use Claude to ideate ad concepts grounded in the winners
    const concepts = await ideateConcepts(winners, count);

    // 2. For each concept, generate the image + overlay text + upload to Drive
    const creatives: AdCreative[] = [];
    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i];

      // Compliance check on the headline + hook
      const flags = BANNED_WORDS.filter((w) =>
        `${concept.headline} ${concept.hook}`.toLowerCase().includes(w.toLowerCase())
      );

      const creative: AdCreative = {
        id: `creative-${batchId}-${i}-${Date.now()}`,
        batchId,
        product: "dopamine-brain-food",
        angle: concept.angle,
        filename: `static_${concept.angle}_${i + 1}.png`,
        headline: concept.headline,
        status: flags.length > 0 ? "rejected" : "generating",
        complianceFlags: flags,
        rejectionReason: flags.length > 0 ? `Compliance: contains "${flags[0]}"` : undefined,
        createdAt: new Date().toISOString(),
      };

      // Skip image gen if compliance failed
      if (flags.length === 0) {
        try {
          // Decide image source: bottle-shot vs. AI UGC
          const useUgc = Math.random() < UGC_MIX_RATIO;
          const sourceImage = await getSourceImage(concept.visualPrompt, useUgc);

          if (sourceImage) {
            const finalBuffer = await overlayHeadline(sourceImage, {
              headline: concept.headline,
            });

            // Upload to Drive output folder (if configured)
            if (OUTPUT_FOLDER_ID) {
              const uploaded = await uploadImage(
                OUTPUT_FOLDER_ID,
                creative.filename,
                finalBuffer
              );
              creative.driveFileId = uploaded.id;
              creative.driveUrl = uploaded.webViewLink;
              creative.finalImageUrl = uploaded.webViewLink;
            }
            creative.status = "ready";
          } else {
            // No image source available — leave in "ready" state with concept only
            creative.status = "ready";
          }
        } catch (genErr) {
          console.error(`Image gen failed for creative ${creative.id}:`, genErr);
          creative.status = "failed";
          creative.rejectionReason =
            genErr instanceof Error ? genErr.message : "Image generation failed";
        }
      }

      creatives.push(creative);

      // Persist as we go so the UI can show progress
      await supabase.from("ad_creatives").upsert({
        id: creative.id,
        batch_id: creative.batchId,
        data: creative,
        updated_at: new Date().toISOString(),
      });
    }

    // 3. Update batch status
    const batchUpdate: Partial<AdBatch> = {
      status: "ready-for-review",
      generatedCount: creatives.length,
    };
    const { data: existing } = await supabase
      .from("ad_batches")
      .select("data")
      .eq("id", batchId)
      .single();
    if (existing) {
      const updatedBatch = { ...(existing.data as AdBatch), ...batchUpdate };
      await supabase.from("ad_batches").upsert({
        id: batchId,
        data: updatedBatch,
        updated_at: new Date().toISOString(),
      });
    }

    void product;
    void createdBy;

    return Response.json({
      success: true,
      creativesGenerated: creatives.length,
      readyCount: creatives.filter((c) => c.status === "ready").length,
      failedCount: creatives.filter((c) => c.status === "failed").length,
      rejectedCount: creatives.filter((c) => c.status === "rejected").length,
    });
  } catch (error) {
    console.error("Generate batch error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate batch" },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

async function ideateConcepts(winners: WinningAd[], count: number) {
  const ideationPrompt = `You are a senior performance marketing strategist for Natural Stacks, a premium nootropic brand.

Product: Dopamine Brain Food (650mg L-Tyrosine + B-vitamins for focus & motivation)
Brand voice: Open-source, transparent, biohacker-friendly, science-backed but human

Below are ${winners.length} ads currently winning in the Meta account (CPA ≤ $70). Use them as PATTERNS — same angles, hooks, and visual styles that are working — but generate fresh variations.

WINNING ADS:
${winners
  .map(
    (w, i) => `
Winner ${i + 1}:
- Headline: "${w.headline}"
- Hook: "${w.hook}"
- Visual style: ${w.visualStyle}
- Performance: $${w.cpa} CPA, ${w.sales} sales`
  )
  .join("\n")}

TASK: Generate ${count} new ad concepts. Each must include:
- angle: pick ONE from this list — ${ANGLES.map((a) => a.id).join(", ")}
- headline: short, punchy, max 12 words. Will be overlaid on the image.
- hook: 1-sentence opening line for context
- visualPrompt: detailed description for an image generator. UGC-style, real-looking, NOT stock photo. Include: subject, setting, lighting, composition, mood. The Dopamine Brain Food bottle (white with green label) MUST be visible.

COMPLIANCE — DO NOT use any of these words/phrases (FDA risk):
${BANNED_WORDS.join(", ")}

Avoid disease/treatment claims. Focus on: focus, motivation, mental drive, productivity, energy, transparency.

Output as a JSON array. Example:
[
  {
    "angle": "morning-ritual",
    "headline": "Your 60-second morning unlock",
    "hook": "Stop dragging through your first 3 hours.",
    "visualPrompt": "Realistic UGC selfie of a 30-something woman at her home desk, morning light streaming through window, holding Natural Stacks Dopamine Brain Food bottle next to her coffee mug, slight smile, natural, no makeup look, iPhone-style photo, slight grain"
  }
]

Return ONLY the JSON array, no other text.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: ideationPrompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Claude didn't return a JSON array");

  return JSON.parse(jsonMatch[0]) as Array<{
    angle: AdAngle;
    headline: string;
    hook: string;
    visualPrompt: string;
  }>;
}

/**
 * Get the source image for a creative.
 * - If useUgc and KIE AI is configured → generate via KIE AI
 * - Otherwise, pull a random bottle shot from the Drive folder
 * - Returns null if nothing is available (creative falls back to concept-only)
 */
async function getSourceImage(visualPrompt: string, useUgc: boolean): Promise<Buffer | null> {
  // Try AI-generated UGC first if requested
  if (useUgc && process.env.KIE_AI_API_KEY) {
    try {
      const result = await kieGenerateImage({
        prompt: visualPrompt,
        aspectRatio: "9:16",
      });
      if (result.imageBuffer) return result.imageBuffer;
    } catch (err) {
      console.warn("KIE AI generation failed, falling back to bottle shot:", err);
    }
  }

  // Fall back to (or default to) a random bottle shot from Drive
  if (BOTTLES_FOLDER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const image = await pickRandomImage(BOTTLES_FOLDER_ID);
      if (image) return await downloadImage(image.id);
    } catch (err) {
      console.warn("Drive bottle fetch failed:", err);
    }
  }

  return null;
}
