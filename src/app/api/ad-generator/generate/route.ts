import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ANGLES,
  BANNED_WORDS,
  PRODUCTS,
  type AdAngle,
  type AdBatch,
  type AdCreative,
  type AdTextMode,
  type GenerationMode,
  type ProductConfig,
  type WinningAd,
} from "@/lib/ad-generator-types";
import {
  downloadImage,
  uploadImage,
  findSubfolder,
  listImagesInFolder,
  createFolder,
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
    const {
      batchId,
      product,
      count,
      winners,
      createdBy,
      textMode = "text",
    } = (await req.json()) as {
      batchId: string;
      product: string;
      count: number;
      winners: WinningAd[];
      createdBy: string;
      textMode?: AdTextMode;
    };

    // Public origin for the bottle proxy URL — KIE AI fetches the
    // reference image from here, so it must be reachable from the internet.
    const publicOrigin = resolvePublicOrigin(req);

    // Resolve the bottle reference pool once for the whole batch. With
    // product="all", flatten images from every active product's subfolder
    // into one pool so creatives sample across products. With a specific
    // product, list only that product's subfolder.
    const bottles = await collectBottles(product);
    if (bottles.length === 0) {
      console.warn(
        `No bottle images found for product=${product}. Pipeline will run without reference images.`
      );
    }

    // Resolve product context. For "all" we pass null and the prompt uses a
    // generic Natural Stacks framing instead of one product's specifics.
    const productConfig =
      product === "all" ? null : PRODUCTS.find((p) => p.id === product) || null;
    const productLabel = productConfig?.name || "Natural Stacks supplements";

    // Create a per-batch Drive subfolder inside DRIVE_OUTPUT_FOLDER_ID, named
    // with the date/time + product (e.g. "2026-05-28_14-30 NeuroFuel"). All
    // creatives in this batch upload into this folder so each run is its own
    // bucket in Drive instead of one ever-growing pile.
    let batchOutputFolderId: string | null = null;
    let batchOutputFolderUrl: string | null = null;
    if (OUTPUT_FOLDER_ID && process.env.GOOGLE_REFRESH_TOKEN) {
      try {
        const folderName = formatBatchFolderName(productLabel);
        const folder = await createFolder(OUTPUT_FOLDER_ID, folderName);
        batchOutputFolderId = folder.id;
        batchOutputFolderUrl = folder.webViewLink;
      } catch (err) {
        console.warn(
          "Failed to create batch output subfolder, falling back to root:",
          err
        );
      }
    }

    // 1. Use Claude to ideate ad concepts grounded in the winners
    const concepts = await ideateConcepts(winners, count, productConfig);

    // 2. Process all concepts in parallel. Each KIE AI call is ~30s; running
    //    them sequentially blows past Vercel's function timeout for any batch
    //    of more than 1-2. Promise.allSettled isolates per-creative failures.
    const uploadFolderId = batchOutputFolderId || OUTPUT_FOLDER_ID || null;
    const settled = await Promise.allSettled(
      concepts.map((concept, i) =>
        processCreative(
          concept,
          i,
          batchId,
          publicOrigin,
          bottles,
          uploadFolderId,
          textMode
        )
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

    // 3. Update batch status (and persist the per-batch Drive folder so the
    // UI / approve flow can find it later)
    const batchUpdate: Partial<AdBatch> = {
      status: "ready-for-review",
      generatedCount: creatives.length,
      ...(batchOutputFolderId ? { outputFolderId: batchOutputFolderId } : {}),
      ...(batchOutputFolderUrl ? { outputFolderUrl: batchOutputFolderUrl } : {}),
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
  publicOrigin: string | null,
  bottles: DriveImage[],
  uploadFolderId: string | null,
  textMode: AdTextMode
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
      const wantsHeadline = textMode === "text";
      // Only ask KIE AI to draw the headline when we're going through KIE AI
      // anyway AND the user wants text — the bottle-only fallback uses sharp,
      // and "no-text" mode skips text rendering entirely on both branches.
      const renderTextInKie =
        wantsHeadline && useUgc && Math.random() < KIE_TEXT_RATIO;

      const { buffer: sourceImage, mode: generationMode } = await getSourceImage(
        concept.visualPrompt,
        useUgc,
        publicOrigin,
        bottles,
        renderTextInKie ? concept.headline : undefined
      );
      creative.generationMode = generationMode;

      if (sourceImage) {
        // Three branches:
        // 1. "no-text" mode → just resize, no overlay
        // 2. KIE AI already baked text into the image → resize only
        // 3. Default → sharp overlay on top
        const finalBuffer =
          !wantsHeadline || renderTextInKie
            ? await sharp(sourceImage)
                .resize(1080, 1920, { fit: "cover", position: "center" })
                .png()
                .toBuffer()
            : await overlayHeadline(sourceImage, {
                headline: concept.headline,
              });

        if (uploadFolderId) {
          const uploaded = await uploadImage(
            uploadFolderId,
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

async function ideateConcepts(
  winners: WinningAd[],
  count: number,
  productConfig: ProductConfig | null
) {
  const productBlock = productConfig
    ? `Product: ${productConfig.name}
Tagline: ${productConfig.tagline}
Active ingredients (for your context, NEVER claim in copy): ${productConfig.activeIngredients}

Allowed benefit language (lean on these — they're FDA structure-function safe):
${productConfig.benefitClaims.map((b) => `- ${b}`).join("\n")}

Themes that fit this product:
${productConfig.themes.map((t) => `- ${t}`).join("\n")}`
    : `Product: Natural Stacks supplements (mixed batch — concepts can lean toward any of: Dopamine Brain Food for motivation/mood, NeuroFuel for focus/memory, MagTech for sleep/relaxation). Pick the slant that fits each concept.`;

  const ideationPrompt = `You are a senior performance marketing strategist for Natural Stacks, a premium nootropic brand.

${productBlock}

Brand voice: Open-source, transparent, biohacker-friendly, science-backed but human.

PLACEMENT: These ads will run on INSTAGRAM (Story / Reels / Feed). They must look like native Instagram content — iPhone photos, real environments, no stock-photo polish. Think: a post a real Natural Stacks customer would share.

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
- headline: ONE punchy sentence, 5-9 words, max 50 characters. NOT a fragment, NOT a tagline pair. It will be rendered in very large white text on top of the image, so it must read as a single beat. The headline must connect to this product specifically — use the allowed benefit language, not generic claims that fit another product.
- hook: 1-sentence opening line for context (internal — not overlaid)
- visualPrompt: detailed description of the SCENE that will surround the product bottle. UGC-style, real-looking, iPhone photo aesthetic, NOT stock photo and NOT studio. Include subject, setting, lighting, composition, props. The scene should fit one of the product's themes above. DO NOT describe the bottle itself — a real bottle photo gets composited in. Just describe the scene around it.

PERSON SPLIT — IMPORTANT:
Of the ${count} concepts, exactly ${Math.ceil(count / 2)} MUST set includesPerson=true and feature a real person fitting the product's themes (e.g. focused at desk for NeuroFuel, winding down in bed for MagTech, getting after their morning for Dopamine Brain Food). The remaining ${Math.floor(count / 2)} should set includesPerson=false and focus on natural environments WITHOUT a person — bottle on a desk, kitchen counter, bedside table, gym bag, etc, again fitting the product's themes.

SCENE COMPOSITION FOR INSTAGRAM — IMPORTANT:
- This is a 9:16 vertical image (Instagram Story / Reels). Compose for vertical viewing.
- Leave the TOP THIRD of the frame as relatively empty / clean background space. The headline text will be overlaid there, and it must NOT cross any person's face, hands, OR the product bottle. The bottle MUST be positioned in the lower half of the frame, not the upper half — there should be clear empty space above the bottle where text can sit without ever touching it.
- Keep the very top ~15% and very bottom ~20% of the frame as clean margin where Instagram's UI overlays (username, swipe-up, send button) sit.

PREFERRED ENVIRONMENTS (pick what fits the product):
- Home desk, coffee shop, sunlit window seat (focus / motivation products)
- Bedside table, soft evening light, cozy bedroom, post-shower wind-down (sleep / relaxation products)
- Morning kitchen with coffee, brushing teeth, getting ready (morning products)
- Going for a walk, hiking trail rock, gym bag in a car (active products)
- Wooden tables, ceramic mugs, real books, AirPods, notebooks as props
Avoid: studio lighting, plain backdrops, hands-only awkward shots, anything that screams "stock photo".

COMPLIANCE — FDA structure-function rules (21 CFR 101.93):
- These are dietary supplements. We CANNOT claim to diagnose, treat, cure, mitigate, or prevent any disease.
- Use "supports", "helps maintain", "promotes" — never "treats", "cures", "fixes", "reverses".
- Do NOT mention any specific disease, drug name, or drug category.
- Do NOT claim FDA approval, guaranteed results, miracle effects, or "no side effects".
- BANNED words/phrases (immediate reject — do NOT use any of these):
${BANNED_WORDS.join(", ")}

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
type SourceImageResult = {
  buffer: Buffer | null;
  mode: GenerationMode;
};

async function getSourceImage(
  visualPrompt: string,
  useUgc: boolean,
  publicOrigin: string | null,
  bottles: DriveImage[],
  embedHeadline?: string
): Promise<SourceImageResult> {
  // Pick a random bottle from the pre-resolved pool (in-memory, no extra
  // Drive API call per creative).
  const bottle: DriveImage | null =
    bottles.length > 0
      ? bottles[Math.floor(Math.random() * bottles.length)]
      : null;

  // UGC branch — image-to-image with the real bottle as reference. We retry
  // once on transient failures (rate limits, brief network blips) so a
  // single hiccup doesn't drop the creative all the way to the bottle-only
  // fallback — which gives the "raw bottle with text" look Santiago noticed.
  if (useUgc && process.env.KIE_AI_API_KEY && bottle && publicOrigin) {
    const bottleUrl = `${publicOrigin}/api/ad-generator/bottle-proxy/${bottle.id}`;
    const kieRequest = {
      prompt: buildEditPrompt(visualPrompt, embedHeadline),
      referenceImages: [bottleUrl],
      aspectRatio: "9:16" as const,
    };

    const tryKie = async () => {
      const result = await kieGenerateImage(kieRequest);
      return result.imageBuffer ?? null;
    };
    const kieMode: GenerationMode = embedHeadline ? "kie-ai-text" : "kie-ai-scene";

    try {
      const buf = await tryKie();
      if (buf) return { buffer: buf, mode: kieMode };
    } catch (firstErr) {
      console.warn("KIE AI attempt 1 failed, retrying once after 3s:", firstErr);
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const buf = await tryKie();
        if (buf) return { buffer: buf, mode: kieMode };
      } catch (retryErr) {
        console.warn(
          "KIE AI retry also failed, falling back to bottle shot:",
          retryErr
        );
      }
    }
  }

  // Bottle-shot branch (or any UGC fallback)
  if (bottle) {
    try {
      const buf = await downloadImage(bottle.id);
      return { buffer: buf, mode: "bottle-only" };
    } catch (err) {
      console.warn("Drive bottle download failed:", err);
    }
  }

  return { buffer: null, mode: "none" };
}

/**
 * Wraps Claude's scene description with explicit image-to-image instructions
 * so Nano Banana places the *reference bottle* into the new scene rather than
 * inventing a generic bottle. If `headline` is provided, also instructs KIE
 * AI to render that headline as large bold white text in the image.
 */
function buildEditPrompt(visualPrompt: string, headline?: string): string {
  const parts = [
    "Take the supplement bottle shown in the reference image and place it naturally into the scene described below.",
    "Keep the bottle's exact label, color, shape, and branding identical to the reference — do not redesign or rename it.",
    "Match the scene's lighting and perspective so the bottle looks like it belongs there.",
  ];

  if (headline) {
    parts.push(
      "",
      `Render this exact headline as large bold white text in the UPPER portion of the image: "${headline}".`,
      "Use one or two lines, sans-serif, high contrast against the background. No other text anywhere in the image.",
      "Spell the headline EXACTLY as written — do not paraphrase or change any words.",
      "CRITICAL placement rules — these are non-negotiable:",
      "- Position the text in EMPTY background space. NEVER place text overlapping any person's face, hands, or the product bottle. The bottle must remain fully visible and unobscured by text at all times.",
      "- Place the text in the top portion of the image, ABOVE any person, subject, or bottle. If the person or bottle is positioned high in the frame, move the text further up into empty sky / wall / ceiling area, or do NOT render text on this image.",
      "- This image is for Instagram (Story / Reels). Keep the text within the central 70% vertical band: avoid the very top ~15% and very bottom ~20% of the frame where Instagram overlays the username and action buttons."
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
 * Build a date-stamped folder name for a batch's output subfolder.
 * Format: "YYYY-MM-DD_HH-MM <productLabel>" — sortable and human-readable
 * when scanning the Output folder in Drive.
 */
function formatBatchFolderName(productLabel: string): string {
  const iso = new Date().toISOString(); // 2026-05-28T14:30:12.345Z
  const date = iso.slice(0, 10); // 2026-05-28
  const time = iso.slice(11, 16).replace(":", "-"); // 14-30
  return `${date}_${time} ${productLabel}`;
}

/**
 * Resolve the bottle reference pool for a batch.
 * - product === "all" → flatten images from every active product's subfolder
 *   inside DRIVE_BOTTLES_FOLDER_ID
 * - specific product → list only that product's subfolder
 * Listing happens once per batch and is shared across all creatives.
 */
async function collectBottles(product: string): Promise<DriveImage[]> {
  if (!BOTTLES_FOLDER_ID || !process.env.GOOGLE_REFRESH_TOKEN) return [];

  const targets =
    product === "all"
      ? PRODUCTS.filter((p) => p.active)
      : PRODUCTS.filter((p) => p.id === product);
  if (targets.length === 0) return [];

  const pools = await Promise.all(
    targets.map(async (p) => {
      try {
        const subId = await findSubfolder(BOTTLES_FOLDER_ID!, p.bottleFolderName);
        if (!subId) {
          console.warn(
            `No "${p.bottleFolderName}" subfolder under bottles folder for product ${p.id}`
          );
          return [];
        }
        return await listImagesInFolder(subId);
      } catch (err) {
        console.warn(`collectBottles failed for ${p.id}:`, err);
        return [];
      }
    })
  );
  return pools.flat();
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
