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

const anthropic = new Anthropic();

// Server-side Supabase client (uses anon key for now — internal tool)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Generates a batch of ad creatives for a product. V1 scaffold:
// - Uses Claude to ideate angles + headlines from winning ads
// - Stubs the actual image generation (will plug in Nano Banana / Flux next)
// - Runs compliance check on every output
// - Persists to Supabase
export async function POST(req: NextRequest) {
  try {
    const { batchId, product, count, winners, createdBy } = (await req.json()) as {
      batchId: string;
      product: string;
      count: number;
      winners: WinningAd[];
      createdBy: string;
    };

    // 1. Use Claude to ideate `count` ad concepts grounded in the winners
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

    const concepts = JSON.parse(jsonMatch[0]) as Array<{
      angle: AdAngle;
      headline: string;
      hook: string;
      visualPrompt: string;
    }>;

    // 2. For each concept, run compliance + create the creative record
    const creatives: AdCreative[] = concepts.map((concept, i) => {
      const flags = BANNED_WORDS.filter((w) =>
        `${concept.headline} ${concept.hook}`.toLowerCase().includes(w.toLowerCase())
      );
      return {
        id: `creative-${batchId}-${i}-${Date.now()}`,
        batchId,
        product: "dopamine-brain-food",
        angle: concept.angle,
        filename: `static_${concept.angle}_${i + 1}.png`,
        headline: concept.headline,
        // imageUrl: TODO — call image generation API with concept.visualPrompt
        // finalImageUrl: TODO — overlay headline on image with Node Canvas
        status: flags.length > 0 ? "rejected" : "ready",
        complianceFlags: flags,
        rejectionReason: flags.length > 0 ? `Compliance: contains "${flags[0]}"` : undefined,
        createdAt: new Date().toISOString(),
      };
    });

    // 3. Save creatives to Supabase
    for (const c of creatives) {
      await supabase.from("ad_creatives").upsert({
        id: c.id,
        batch_id: c.batchId,
        data: c,
        updated_at: new Date().toISOString(),
      });
    }

    // 4. Update batch
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

    return Response.json({ success: true, creativesGenerated: creatives.length });
  } catch (error) {
    console.error("Generate batch error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate batch" },
      { status: 500 }
    );
  }
}
