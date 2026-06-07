// Shared Ad Generator pipeline. Used by the legacy /generate route (direct
// mode, no concept review) AND by the new /generate-concepts + /generate-images
// routes that split the work into two reviewable phases.
//
// Two top-level entry points:
//   - generateConceptsForBatch  → Claude only; persists concepts on the batch
//   - generateImagesForBatch    → KIE AI pipeline for approved concepts;
//                                 persists creatives + updates batch status

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ANGLES,
  BANNED_WORDS,
  PRODUCTS,
  type AdAngle,
  type AdBatch,
  type AdConcept,
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

const anthropic = new Anthropic();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BOTTLES_FOLDER_ID = process.env.DRIVE_BOTTLES_FOLDER_ID;
const OUTPUT_FOLDER_ID = process.env.DRIVE_OUTPUT_FOLDER_ID;

const UGC_MIX_RATIO = 1.0;
const KIE_TEXT_RATIO = 1.0;
const KIE_CONCURRENCY = 4;

// ───────────────────────────────────────────────────────────────────────────
// Phase 1: Generate concepts (Claude only)
// ───────────────────────────────────────────────────────────────────────────

export type GenerateConceptsOpts = {
  batchId: string;
  product: string;
  count: number;
  winners: WinningAd[];
};

/**
 * Run Claude ideation and persist the concepts onto the batch with status
 * "pending". Returns the persisted AdConcept[].
 */
export async function generateConceptsForBatch(
  opts: GenerateConceptsOpts
): Promise<AdConcept[]> {
  const { batchId, product, count, winners } = opts;

  const productConfig =
    product === "all" ? null : PRODUCTS.find((p) => p.id === product) || null;

  const rawConcepts = await ideateConcepts(winners, count, productConfig);

  const concepts: AdConcept[] = rawConcepts.map((c, i) => ({
    id: `concept-${batchId}-${i}`,
    angle: c.angle,
    includesPerson: c.includesPerson,
    headline: c.headline,
    hook: c.hook,
    visualPrompt: c.visualPrompt,
    status: "pending",
  }));

  // Persist on the batch record. Wrapped because a Supabase blip here would
  // throw away Claude's work — but if it does, the caller can retry.
  const { data: existing } = await supabase
    .from("ad_batches")
    .select("data")
    .eq("id", batchId)
    .single();
  if (existing) {
    const updatedBatch: AdBatch = {
      ...(existing.data as AdBatch),
      concepts,
      status: "concepts-pending",
    };
    await supabase.from("ad_batches").upsert({
      id: batchId,
      data: updatedBatch,
      updated_at: new Date().toISOString(),
    });
  }

  return concepts;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 2: Generate images (KIE AI pipeline)
// ───────────────────────────────────────────────────────────────────────────

export type GenerateImagesOpts = {
  batchId: string;
  /** The set of concepts to actually generate images for (approved/edited). */
  concepts: AdConcept[];
  /** Product selection from the batch — drives bottle subfolder lookup. */
  product: string;
  /** "text" | "no-text"; defaults to "text". */
  textMode: AdTextMode;
  req: NextRequest;
};

export type GenerateImagesResult = {
  creatives: AdCreative[];
  readyCount: number;
  failedCount: number;
  rejectedCount: number;
};

/**
 * Run the KIE AI pipeline for a batch's approved concepts. Persists each
 * resulting creative, updates the batch's status + counts, returns a summary.
 */
export async function generateImagesForBatch(
  opts: GenerateImagesOpts
): Promise<GenerateImagesResult> {
  const { batchId, concepts, product, textMode, req } = opts;

  const publicOrigin = resolvePublicOrigin(req);
  const bottles = await collectBottles(product);
  if (bottles.length === 0) {
    console.warn(
      `No bottle images found for product=${product}. Pipeline will run without reference images.`
    );
  }

  const productConfig =
    product === "all" ? null : PRODUCTS.find((p) => p.id === product) || null;
  const productLabel = productConfig?.name || "Natural Stacks supplements";

  // Per-batch Drive subfolder so each run is its own bucket
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
  const uploadFolderId = batchOutputFolderId || OUTPUT_FOLDER_ID || null;

  // Mark batch as actively generating so the UI shows the right state.
  await patchBatch(batchId, {
    status: "generating-images",
    ...(batchOutputFolderId ? { outputFolderId: batchOutputFolderId } : {}),
    ...(batchOutputFolderUrl ? { outputFolderUrl: batchOutputFolderUrl } : {}),
  });

  const settled = await mapWithConcurrency(
    concepts,
    KIE_CONCURRENCY,
    (concept, i) =>
      processCreative(
        concept,
        i,
        batchId,
        publicOrigin,
        bottles,
        uploadFolderId,
        textMode
      )
  );

  const creatives: AdCreative[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`Creative ${i} rejected:`, r.reason);
    const concept = concepts[i];
    return {
      id: `creative-${batchId}-${i}-${Date.now()}`,
      batchId,
      product: "dopamine-brain-food",
      angle: concept.angle,
      filename: `static_${concept.angle}_${i + 1}.png`,
      headline: concept.headline,
      status: "failed",
      complianceFlags: [],
      rejectionReason:
        r.reason instanceof Error ? r.reason.message : String(r.reason),
      createdAt: new Date().toISOString(),
    };
  });

  await patchBatch(batchId, {
    status: "ready-for-review",
    generatedCount: creatives.length,
  });

  return {
    creatives,
    readyCount: creatives.filter((c) => c.status === "ready").length,
    failedCount: creatives.filter((c) => c.status === "failed").length,
    rejectedCount: creatives.filter((c) => c.status === "rejected").length,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Lower-level helpers
// ───────────────────────────────────────────────────────────────────────────

async function patchBatch(batchId: string, update: Partial<AdBatch>) {
  const { data: existing } = await supabase
    .from("ad_batches")
    .select("data")
    .eq("id", batchId)
    .single();
  if (!existing) return;
  const updatedBatch = { ...(existing.data as AdBatch), ...update };
  await supabase.from("ad_batches").upsert({
    id: batchId,
    data: updatedBatch,
    updated_at: new Date().toISOString(),
  });
}

async function processCreative(
  concept: AdConcept,
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
      const renderTextInKie =
        wantsHeadline && useUgc && Math.random() < KIE_TEXT_RATIO;

      const {
        buffer: sourceImage,
        mode: generationMode,
        kieError,
      } = await getSourceImage(
        concept.visualPrompt,
        useUgc,
        publicOrigin,
        bottles,
        renderTextInKie ? concept.headline : undefined
      );
      creative.generationMode = generationMode;
      if (kieError) creative.kieAiError = kieError;

      if (sourceImage) {
        const finalBuffer =
          !wantsHeadline || renderTextInKie
            ? await sharp(sourceImage)
                .flatten({ background: { r: 24, g: 24, b: 26 } })
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

type SourceImageResult = {
  buffer: Buffer | null;
  mode: GenerationMode;
  kieError?: string;
};

async function getSourceImage(
  visualPrompt: string,
  useUgc: boolean,
  publicOrigin: string | null,
  bottles: DriveImage[],
  embedHeadline?: string
): Promise<SourceImageResult> {
  const bottle: DriveImage | null =
    bottles.length > 0
      ? bottles[Math.floor(Math.random() * bottles.length)]
      : null;

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

    let lastKieError: string | undefined;
    try {
      const buf = await tryKie();
      if (buf) return { buffer: buf, mode: kieMode };
    } catch (firstErr) {
      lastKieError =
        firstErr instanceof Error ? firstErr.message : String(firstErr);
      console.warn("KIE AI attempt 1 failed, retrying once after 3s:", firstErr);
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const buf = await tryKie();
        if (buf) return { buffer: buf, mode: kieMode };
      } catch (retryErr) {
        lastKieError =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.warn(
          "KIE AI retry also failed, falling back to bottle shot:",
          retryErr
        );
      }
    }

    if (bottle) {
      try {
        const buf = await downloadImage(bottle.id);
        return { buffer: buf, mode: "bottle-only", kieError: lastKieError };
      } catch (err) {
        console.warn("Drive bottle download failed:", err);
      }
    }
    return { buffer: null, mode: "none", kieError: lastKieError };
  }

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
  return [...parts, "Scene:", visualPrompt].join("\n");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i], i);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function formatBatchFolderName(productLabel: string): string {
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16).replace(":", "-");
  return `${date}_${time} ${productLabel}`;
}

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
        const subId = await findSubfolder(
          BOTTLES_FOLDER_ID!,
          p.bottleFolderName
        );
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

export function resolvePublicOrigin(req: NextRequest): string | null {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Claude ideation
// ───────────────────────────────────────────────────────────────────────────

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

TASK: Generate EXACTLY ${count} new ad concepts — no more, no less. The output JSON array MUST contain exactly ${count} elements. Each must include:
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

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    angle: AdAngle;
    includesPerson?: boolean;
    headline: string;
    hook: string;
    visualPrompt: string;
  }>;

  if (parsed.length !== count) {
    console.warn(
      `Claude returned ${parsed.length} concepts but ${count} were requested. Truncating.`
    );
  }
  return parsed.slice(0, count);
}
