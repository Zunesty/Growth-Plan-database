import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
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
import {
  pickRandomImage,
  downloadImage,
  uploadImage,
  type DriveImage,
} from "@/lib/google-drive";
import { overlayHeadline } from "@/lib/text-overlay";
import { generateImage as kieGenerateImage } from "@/lib/kie-ai";

// Allow the function to run long enough to finish a batch of ~20 KIE AI calls.
// Pro plan w/ fluid compute caps at 300s. Hobby caps at 60s — adjust if needed.
export const maxDuration = 300;

const anthropic = new Anthropic();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Drive folder IDs come from env. If not set, we skip the image pipeline
// and the creative is created in "concept only" mode (no image).
const BOTTLES_FOLDER_ID = process.env.DRIVE_BOTTLES_FOLDER_ID;
const OUTPUT_FOLDER_ID = process.env.DRIVE_OUTPUT_FOLDER_ID;

// Share of creatives that should attempt KIE AI image-to-image (which produces
// a real scene around the bottle). The rest fall back to a plain bottle shot
// resized to the canvas. Austin prefers the AI scenes, so we route everything
// through KIE AI by default — bottle-only is now just the failure fallback.
const UGC_MIX_RATIO = 1.0;

// Of the KIE AI creatives, share that should have the headline RENDERED by
// KIE AI inside the image (text baked into the scene) vs. our sharp overlay
// (guaranteed perfect text). 50/50 gives variety + a typography safety net
// since Nano Banana can misspell longer headlines.
const KIE_TEXT_RATIO = 0.5;

export async function POST(req: NextRequest) {
  try {
    const { batchId, product, count, winners, createdBy } = (await req.json()) as {
      batchId: string;
      product: string;
      count: number;
      winners: WinningAd[];
      createdBy: string;
    };

    // Public origin for the bottle proxy URL — KIE AI fetches the
    // reference image from here, so it must be reachable from the internet.
    const publicOrigin = resolvePublicOrigin(req);

    // 1. Use Claude to ideate ad concepts grounded in the winners
    const concepts = await ideateConcepts(winners, count);

    // 2. Process all concepts in parallel. Each KIE AI call is ~30s; running
    //    them sequentially blows past Vercel's function timeout for any batch
    //    of more than 1-2. Promise.allSettled isolates per-creative failures.
    const settled = await Promise.allSettled(
      concepts.map((concept, i) =>
        processCreative(concept, i, batchId, publicOrigin)
      )
    );

    const creatives: AdCreative[] = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      // Hard failure (not caught by the per-creative try). Mint a minimal
      // failed-creative record so the count still reflects the attempt.
      console.error(`Creative ${i} rejected:`, r.reason);
      return {
        id: `creative-${batchId}-${i}-${Date.now()}`,
        batchId,
        product: "dopamine-brain-food",
        angle: concepts[i].angle,
        filename: `static_${concepts[i].angle}_${i + 1}.png`,
        headline: concepts[i].headline,
        status: "failed",
        complianceFlags: [],
        rejectionReason:
          r.reason instanceof Error ? r.reason.message : String(r.reason),
        createdAt: new Date().toISOString(),
      };
    });

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

type Concept = {
  angle: AdAngle;
  includesPerson?: boolean;
  headline: string;
  hook: string;
  visualPrompt: string;
};

/**
 * Generate one creative end-to-end: compliance check → KIE AI image-to-image
 * (or bottle-shot fallback) → headline overlay → Drive upload → Supabase
 * upsert. Returns the resulting AdCreative regardless of outcome (failed
 * creatives carry a rejectionReason).
 */
async function processCreative(
  concept: Concept,
  index: number,
  batchId: string,
  publicOrigin: string | null
): Promise<AdCreative> {
  const flags = BANNED_WORDS.filter((w) =>
    `${concept.headline} ${concept.hook}`.toLowerCase().includes(w.toLowerCase())
  );

  const creative: AdCreative = {
    id: `creative-${batchId}-${index}-${Date.now()}`,
    batchId,
    product: "dopamine-brain-food",
    angle: concept.angle,
    filename: `static_${concept.angle}_${index + 1}.png`,
    headline: concept.headline,
    status: flags.length > 0 ? "rejected" : "generating",
    complianceFlags: flags,
    rejectionReason:
      flags.length > 0 ? `Compliance: contains "${flags[0]}"` : undefined,
    createdAt: new Date().toISOString(),
  };

  if (flags.length === 0) {
    try {
      const useUgc = Math.random() < UGC_MIX_RATIO;
      // Only ask KIE AI to draw the headline when we're going through KIE AI
      // anyway — the bottle-only fallback always uses sharp's overlay.
      const renderTextInKie = useUgc && Math.random() < KIE_TEXT_RATIO;

      const sourceImage = await getSourceImage(
        concept.visualPrompt,
        useUgc,
        publicOrigin,
        renderTextInKie ? concept.headline : undefined
      );

      if (sourceImage) {
        // If KIE AI baked the headline into the image, just normalize to the
        // 9:16 canvas. Otherwise composite our sharp overlay on top.
        const finalBuffer = renderTextInKie
          ? await sharp(sourceImage)
              .resize(1080, 1920, { fit: "cover", position: "center" })
              .png()
              .toBuffer()
          : await overlayHeadline(sourceImage, {
              headline: concept.headline,
            });

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
      }
      creative.status = "ready";
    } catch (genErr) {
      console.error(`Image gen failed for creative ${creative.id}:`, genErr);
      creative.status = "failed";
      creative.rejectionReason =
        genErr instanceof Error ? genErr.message : "Image generation failed";
    }
  }

  // Persist the result. Wrap so a Supabase glitch on one creative doesn't kill
  // the whole batch — the in-memory creative is still returned.
  try {
    await supabase.from("ad_creatives").upsert({
      id: creative.id,
      batch_id: creative.batchId,
      data: creative,
      updated_at: new Date().toISOString(),
    });
  } catch (dbErr) {
    console.error(`Supabase upsert failed for creative ${creative.id}:`, dbErr);
  }

  return creative;
}

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
- includesPerson: true or false (see split rule below)
- headline: ONE punchy sentence, 5-9 words, max 50 characters. NOT a fragment, NOT a tagline pair. It will be rendered in very large white text on top of the image, so it must read as a single beat.
- hook: 1-sentence opening line for context (internal — not overlaid)
- visualPrompt: detailed description of the SCENE that will surround the product bottle. UGC-style, real-looking, iPhone photo aesthetic, NOT stock photo and NOT studio. Include subject, setting, lighting, composition, props. DO NOT describe the bottle itself — a real bottle photo gets composited in. Just describe the scene around it.

PERSON SPLIT — IMPORTANT:
Of the ${count} concepts, exactly ${Math.ceil(count / 2)} MUST set includesPerson=true and feature a real person interacting with the product in the scene (in their hands, next to them at a desk, on a kitchen counter while they make coffee, etc). The remaining ${Math.floor(count / 2)} should set includesPerson=false and focus on natural environments WITHOUT a person — bottle on a wooden desk next to a laptop, sitting on a bedside table with morning light, on a kitchen counter, on a hiking trail rock, etc.

NATURAL ENVIRONMENTS — preferred scenes:
- Working at a home desk or coffee shop
- Studying with books / laptop
- Morning routine: getting ready, brushing teeth, coffee
- Going for a walk or hike, outdoors
- On a wooden table, bedside, kitchen counter, gym bag
- Soft window light, golden hour, natural daylight
Avoid: studio lighting, plain backdrops, hands-only awkward shots, anything that screams "stock photo".

COMPLIANCE — DO NOT use any of these words/phrases (FDA risk):
${BANNED_WORDS.join(", ")}
Avoid disease/treatment claims. Focus on: focus, motivation, mental drive, productivity, energy, transparency.

Output as a JSON array. Examples:
[
  {
    "angle": "morning-ritual",
    "includesPerson": true,
    "headline": "Stop dragging through your mornings.",
    "hook": "The first 3 hours are everything.",
    "visualPrompt": "Realistic iPhone photo of a 30-something woman at her home desk, soft morning light through window, mug of coffee in hand, the bottle sitting on the desk next to her laptop, no-makeup natural look, slight grain, candid moment"
  },
  {
    "angle": "study-session",
    "includesPerson": false,
    "headline": "Built for the deep-work hours.",
    "hook": "When the work demands more than caffeine can give.",
    "visualPrompt": "Cozy iPhone photo of a wooden desk in a sun-lit home office, open notebook with pen, laptop closed, ceramic mug of coffee steaming, bottle sitting beside the notebook, late-afternoon golden light, slight depth-of-field"
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
    includesPerson?: boolean;
    headline: string;
    hook: string;
    visualPrompt: string;
  }>;
}

/**
 * Get the source image for a creative.
 * - useUgc + KIE AI configured + bottle available → image-to-image via KIE AI
 *   (Claude's prompt drops into a scene; the real bottle is composited in).
 *   If `embedHeadline` is provided, KIE AI is also asked to render that
 *   headline as text inside the image — our sharp overlay is then skipped.
 * - Otherwise → return the raw bottle shot for the simple text-overlay branch.
 * - Returns null if nothing usable is available.
 */
async function getSourceImage(
  visualPrompt: string,
  useUgc: boolean,
  publicOrigin: string | null,
  embedHeadline?: string
): Promise<Buffer | null> {
  let bottle: DriveImage | null = null;

  if (BOTTLES_FOLDER_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    try {
      bottle = await pickRandomImage(BOTTLES_FOLDER_ID);
    } catch (err) {
      console.warn("Drive bottle fetch failed:", err);
    }
  }

  // UGC branch — image-to-image with the real bottle as reference
  if (useUgc && process.env.KIE_AI_API_KEY && bottle && publicOrigin) {
    try {
      const bottleUrl = `${publicOrigin}/api/ad-generator/bottle-proxy/${bottle.id}`;
      const result = await kieGenerateImage({
        prompt: buildEditPrompt(visualPrompt, embedHeadline),
        referenceImages: [bottleUrl],
        aspectRatio: "9:16",
      });
      if (result.imageBuffer) return result.imageBuffer;
    } catch (err) {
      console.warn("KIE AI image-to-image failed, falling back to bottle shot:", err);
    }
  }

  // Bottle-shot branch (or any UGC fallback)
  if (bottle) {
    try {
      return await downloadImage(bottle.id);
    } catch (err) {
      console.warn("Drive bottle download failed:", err);
    }
  }

  return null;
}

/**
 * Wraps Claude's scene description with explicit image-to-image instructions
 * so Nano Banana places the *reference bottle* into the new scene rather than
 * inventing a generic bottle. If `headline` is provided, also instructs KIE
 * AI to render that headline as large bold white text in the image.
 */
function buildEditPrompt(visualPrompt: string, headline?: string): string {
  const parts = [
    "Take the Natural Stacks Dopamine Brain Food bottle in the reference image and place it naturally into the scene described below.",
    "Keep the bottle's exact label, color, shape, and branding identical to the reference — do not redesign it.",
    "Match the scene's lighting and perspective so the bottle looks like it belongs there.",
  ];

  if (headline) {
    parts.push(
      "",
      `Render this exact headline as large bold white text near the top of the image: "${headline}".`,
      "Use one or two lines, sans-serif, high contrast against the background. No other text anywhere in the image.",
      "Spell the headline EXACTLY as written — do not paraphrase or change any words."
    );
  }

  parts.push("");
  return [
    ...parts,
    "Scene:",
    visualPrompt,
  ].join("\n");
}

/**
 * Resolve the public origin (scheme + host) of the deployed app so that
 * external services like KIE AI can fetch our bottle-proxy URL.
 * Prefers the incoming request headers; falls back to VERCEL_URL.
 */
function resolvePublicOrigin(req: NextRequest): string | null {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}
