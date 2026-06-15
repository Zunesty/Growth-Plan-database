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
  type CreativityLevel,
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
  /** Free-text user notes from the new-batch modal. Passed through to Claude
   * as high-priority instructions Claude must respect ahead of the general
   * brand/strategy guidance. */
  notes?: string;
  /** How closely Claude should follow the winning ad patterns vs. push for
   * novel angles. Default "moderate". */
  creativityLevel?: CreativityLevel;
};

/**
 * Run Claude ideation and persist the concepts onto the batch with status
 * "pending". Returns the persisted AdConcept[].
 */
export async function generateConceptsForBatch(
  opts: GenerateConceptsOpts
): Promise<AdConcept[]> {
  const {
    batchId,
    product,
    count,
    winners,
    notes,
    creativityLevel = "moderate",
  } = opts;

  const productConfig =
    product === "all" ? null : PRODUCTS.find((p) => p.id === product) || null;

  // Pull what the team has killed in recent batches for this product so
  // Claude can avoid those patterns. Empty array if nothing rejected yet
  // or query fails — never blocks generation.
  const pastRejections = await fetchRecentRejections(product);

  const rawConcepts = await ideateConcepts(
    winners,
    count,
    productConfig,
    notes,
    creativityLevel,
    pastRejections
  );

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

    const kieMode: GenerationMode = embedHeadline ? "kie-ai-text" : "kie-ai-scene";

    // Single attempt with 240s polling — the retry path was wasting KIE AI
    // credits without much gain. When the first attempt times out, the job
    // usually keeps running on KIE AI's side. A retry just fires a fresh
    // task that competes for the same queue. Better to give the first
    // attempt the full window and fall back cleanly if it doesn't return.
    let lastKieError: string | undefined;
    try {
      const result = await kieGenerateImage(kieRequest);
      if (result.imageBuffer) return { buffer: result.imageBuffer, mode: kieMode };
    } catch (err) {
      lastKieError = err instanceof Error ? err.message : String(err);
      console.warn("KIE AI attempt failed, falling back to bottle shot:", err);
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
  // Austin's June 2026 Prompt 2 rewrite. Two paths:
  //   - With headline → render text in the image (KIE-text branch).
  //   - No headline   → omit the HEADLINE + TEXT PLACEMENT blocks entirely
  //                     (no-text batch OR our sharp overlay handles text).
  const blocks: string[] = [
    `You are compositing a single advertising image for the supplement "Dopamine Brain Food."

THE PRODUCT — ZERO-TOLERANCE BOTTLE PRESERVATION:
- Treat the reference image as a FIXED PHOTOGRAPH that gets pasted into the scene, like a sticker. You are NOT generating a new bottle. You are PLACING the reference bottle into a different environment.
- PIXEL-LEVEL FIDELITY to the reference bottle. The label, every letter and number on it, the colors, the cap, the proportions, the shape, the texture — ALL identical to the reference. If the reference shows a deep blue glass bottle with a white twist cap and a label that reads "DOPAMINE BRAIN FOOD," the output must show the EXACT SAME bottle, byte-for-byte.
- DO NOT redesign the bottle. DO NOT recolor it. DO NOT restyle the label. DO NOT "improve" the typography. DO NOT autocomplete or correct any text on the label. DO NOT change the font, kerning, or layout. DO NOT add gloss, shine, or "premium" effects that aren't already on the reference.
- DO NOT invent your own bottle, even if it would look similar. If the output bottle differs from the reference in ANY visible way — different text on the label, different shade of blue, different cap style, different proportions, different shape — the image is a FAILURE and unusable.
- The ONLY supplement product in this image is the bottle from the reference. No other bottles, no alternative versions, no "stylized" variants.
- Place the bottle naturally into the scene below. Match the scene's lighting direction, color temperature, perspective, and shadows so it sits believably in the environment — but the bottle ITSELF stays unchanged.
- Keep the bottle fully visible and in sharp focus, in the LOWER HALF of the frame, with clear empty space above it. The label must remain crisp and readable, IDENTICAL to the reference.`,

    `NO INVENTED TEXT ANYWHERE:
- The reference bottle's own label is the ONLY product text allowed.
- Do NOT render any other text in the scene — no signage, documents, supplement-facts panels, readable phone or laptop screens, or packaging copy. If a screen, paper, book, or label appears, keep it blank, blurred, turned away, or out of focus.${headline ? " Any image text other than the headline below is a failure." : " Any image text other than the reference bottle's own label is a failure."}`,
  ];

  if (headline) {
    blocks.push(
      `HEADLINE (render into the image):
- Render EXACTLY this headline, spelled verbatim — no paraphrasing, no added or dropped words:
  "${headline}"
- Use a clean, simple, modern sans-serif — like a phone's default system font. Plain and highly legible. NO decorative, script, condensed, distorted, outlined, or novelty fonts. Letters evenly spaced and correctly formed. One or two lines only, large and bold.
- COLOR FOR LEGIBILITY (adaptive): if the area behind the text is light, render the text in near-black (#111111). If the area behind the text is dark, render it in white (#FFFFFF). Choose whichever gives strong contrast. If contrast is borderline, add a subtle soft shadow or a faint darkening/lightening behind the text — never a hard box.`,

      `TEXT PLACEMENT (non-negotiable):
- Place the headline in EMPTY background space in the TOP THIRD of the frame, ABOVE the bottle and any person. Never overlap a face, hands, or the bottle.
- Keep text within the central ~70% vertical band — clear of the top ~15% and bottom ~20% where Instagram UI sits.
- If the only empty space is small or busy, move the text to the cleanest open area available rather than crowding the subject.`
    );
  }

  blocks.push(`SCENE:
${visualPrompt}`);

  return blocks.join("\n\n");
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
// Past rejection memory — fed back to Claude on the next batch so it learns
// which hooks / settings / patterns the team has already killed.
// ───────────────────────────────────────────────────────────────────────────

export type PastRejection = {
  /** "concept" → user rejected during Phase 1 review.
   *  "creative" → user rejected the final image during Phase 2. */
  type: "concept" | "creative";
  /** The headline that got rejected. */
  headline: string;
  /** The free-text reason the rejector gave. */
  reason: string;
  /** Visual prompt or filename for additional context (creative only). */
  context?: string;
};

/**
 * Pull recent rejections (concept + creative) for the given product, sorted
 * by recency. Shared across the team — no per-user filter. Limited so the
 * Claude prompt doesn't bloat.
 *
 * - We look at the last `batchLimit` batches for the same product.
 * - From those: rejected concepts (`status === "rejected"` with a
 *   rejectionReason) + rejected creatives (same shape).
 * - Returns up to `rejectionLimit` entries (most-recent-first).
 */
export async function fetchRecentRejections(
  product: string,
  batchLimit = 10,
  rejectionLimit = 10
): Promise<PastRejection[]> {
  try {
    const { data: batchRows } = await supabase
      .from("ad_batches")
      .select("id, data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(batchLimit * 3); // overfetch since we filter by product in code
    if (!batchRows || batchRows.length === 0) return [];

    const matchingBatches = (batchRows as Array<{ id: string; data: AdBatch }>)
      .map((r) => r.data)
      .filter((b) => b.product === product)
      .slice(0, batchLimit);
    if (matchingBatches.length === 0) return [];

    const conceptRejections: PastRejection[] = matchingBatches.flatMap((b) =>
      (b.concepts || [])
        .filter((c) => c.status === "rejected" && c.rejectionReason)
        .map((c) => ({
          type: "concept" as const,
          headline: c.headline,
          reason: c.rejectionReason!,
        }))
    );

    const batchIds = matchingBatches.map((b) => b.id);
    let creativeRejections: PastRejection[] = [];
    if (batchIds.length > 0) {
      const { data: creativeRows } = await supabase
        .from("ad_creatives")
        .select("data, updated_at")
        .in("batch_id", batchIds)
        .order("updated_at", { ascending: false })
        .limit(50);
      const creatives = ((creativeRows || []) as Array<{ data: AdCreative }>)
        .map((r) => r.data)
        .filter((c) => c.status === "rejected" && c.rejectionReason);
      creativeRejections = creatives.map((c) => ({
        type: "creative" as const,
        headline: c.headline,
        reason: c.rejectionReason!,
        context: c.filename,
      }));
    }

    return [...conceptRejections, ...creativeRejections].slice(0, rejectionLimit);
  } catch (err) {
    console.warn("fetchRecentRejections failed:", err);
    return [];
  }
}

function formatRejectionsBlock(rejections: PastRejection[]): string {
  if (rejections.length === 0) return "";
  const lines = rejections.map((r, i) => {
    const label = r.type === "concept" ? "REJECTED CONCEPT" : "REJECTED CREATIVE";
    return `${i + 1}. ${label}: "${r.headline}"
   Reason: ${r.reason}`;
  });
  return `

────────────────────────────────────────────────────────────────────────
PAST REJECTIONS — recent patterns the team has killed. Treat these as ANTI-PATTERNS: do NOT reproduce these hooks, headlines, framings, or settings. Vary aggressively away from anything that looks like these.

${lines.join("\n\n")}
────────────────────────────────────────────────────────────────────────
`;
}

// ───────────────────────────────────────────────────────────────────────────
// Claude ideation
// ───────────────────────────────────────────────────────────────────────────

async function ideateConcepts(
  winners: WinningAd[],
  count: number,
  productConfig: ProductConfig | null,
  notes?: string,
  creativityLevel: CreativityLevel = "moderate",
  pastRejections: PastRejection[] = []
) {
  // Austin's June 2026 rewrite — locked to Dopamine Brain Food. We retain
  // the productConfig parameter for future-proofing (other products will
  // need their own prompt) but currently always run the DBF prompt.
  // If a non-DBF product is selected, we still inject DBF's language because
  // NeuroFuel + MagTech are inactive.
  void productConfig;

  const personTrue = Math.round(count * 0.4); // Austin: ~4 true / ~6 false at 10
  const personFalse = count - personTrue;

  // Creativity guidance — varies the relationship between the winners and
  // the new concepts. Austin asked for this control directly so the model
  // doesn't always default to safe variations of past winners.
  const creativityBlock: Record<CreativityLevel, string> = {
    strict: `CREATIVITY LEVEL: STRICT.
Stick CLOSE to the winning-ad patterns. Each concept should clearly riff on a specific winner's structure — same hook archetype, same beat count, similar scene. Minimal deviation. This is a "more of what's already working" batch.`,

    moderate: `CREATIVITY LEVEL: MODERATE.
Use the winning ads as PATTERNS — same angles and styles that are working — but generate fresh variations. New hooks, new scenes, new beats, while staying in the proven territory.`,

    creative: `CREATIVITY LEVEL: CREATIVE.
Use the winning ads as ONE data point only — not the ceiling. Push for new angles, unconventional hooks, and scenes that haven't been tried yet. Take real creative risks. Half the batch should explore territory the winners don't cover, while still respecting the brand voice, product themes, and compliance rules.`,
  };

  const rejectionsBlock = formatRejectionsBlock(pastRejections);

  // High-priority user notes block. Austin tested with notes like "create two
  // ads about l-tyrosine improving focus" and found they weren't being
  // respected. Putting them near the top with strong language so Claude
  // weights them above the general guidance.
  const notesBlock = notes && notes.trim()
    ? `

────────────────────────────────────────────────────────────────────────
USER NOTES — TOP PRIORITY. Read this BEFORE the general guidance below. If these notes conflict with any general rule, the notes win (within the compliance rules at the bottom).

${notes.trim()}
────────────────────────────────────────────────────────────────────────
`
    : "";

  const ideationPrompt = `You are a senior performance-marketing strategist for Natural Stacks. You create scroll-stopping Instagram/Facebook ad concepts for ONE product only.

PRODUCT: Dopamine Brain Food
- A premium dopamine-support nootropic. Blue bottle, "Morning Support for Mental Drive," vegan capsules, stimulant- and caffeine-free.
- Tagline: For improved motor function and mood.
- Active ingredients (CONTEXT ONLY — never state in copy): L-Tyrosine + B-vitamins (B6 P5P, Folate, B12).

This system generates ads for Dopamine Brain Food and NOTHING ELSE. Never reference, name, or imply any other product (no NeuroFuel, no MagTech, no other SKU). Never invent a product name.
${notesBlock}${rejectionsBlock}
APPROVED BENEFIT LANGUAGE (lean on these — FDA structure/function safe):
- supports the body's natural dopamine production / promotes dopamine production already within a healthy range
- supports mental drive and motivation
- helps maintain focus on demanding tasks
- promotes a positive mood
- supports motor function
- stimulant-free / caffeine-free / no jitters / no crash

THEMES THAT FIT THIS PRODUCT:
morning ritual · mental drive · motivation · focus · positive mood · starting the day strong · pushing through a stuck or sluggish moment · steady energy without caffeine

BRAND VOICE: transparent, biohacker-friendly, science-backed but human. Confident, plain-spoken, never hypey.

────────────────────────────────────────────────────────────────────────
WINNING-AD PRINCIPLES — distilled from ads currently converting on Meta. Use them as the creative engine. Apply the PRINCIPLE; do not copy the example.

1. LEAD WITH THE ENEMY, THEN THE RELIEF. Top performers contrast against the downsides of caffeine, stimulants, and "pills with side effects" — jitters, crashes, poor sleep, irritability — then present Dopamine Brain Food as the clean way to get drive and focus. Hook on cultural fatigue with being over-caffeinated and over-stimulated.
   COMPLIANCE GUARDRAIL: contrast against "caffeine," "stimulants," "crashes," "jitters," and "side effects" in GENERAL terms only. NEVER name a specific drug, drug category, or condition, and NEVER call the product a "natural alternative to" anything.

2. SHORT, PUNCHY, RHYTHMIC. The best headlines are staccato and parallel — three beats, readable in under a second. Patterns (do not copy): "No Caffeine. No Crash. Just Results." / "Stay Driven. Stay Focused. Stay Awake."

3. NAME A CONCRETE MOMENT. Anchor to a specific, relatable scene or time: the 3 PM slump, the sluggish morning, the to-do list you can't start.

4. BENEFIT-FORWARD, ALWAYS IN APPROVED LANGUAGE. Every concept makes ONE clear benefit promise (drive, motivation, focus, mood, no-crash), in the approved language above.

5. SOCIAL PROOF WHEN IT FITS. Lines like "Join 100,000+ focused achievers" perform — use sparingly, as the hook, never stacked with other claims.

6. LOOK NATIVE, NOT LIKE AN AD. The scene feels like organic phone-shot content a real customer would post — casual, real environments, real hands. Clarity and cultural relevance beat polish.

7. ONE IDEA PER AD. Each concept makes a single point.

VARIETY MANDATE: across the batch, every concept must differ in angle, scene, pain-moment, and copy rhythm. No two may share the same hook or the same setting. Avoid recycling the same openers ("Stop dragging…", "Tired of…") batch after batch — push for fresh, on-trend phrasings.

────────────────────────────────────────────────────────────────────────
${creativityBlock[creativityLevel]}

────────────────────────────────────────────────────────────────────────
INPUT — WINNING ADS FROM THE ACCOUNT (from Triple Whale or mocked).
Treat them as PATTERNS to riff on, not templates to copy.

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

────────────────────────────────────────────────────────────────────────
PLACEMENT & COMPOSITION (every visualPrompt must respect this):
- Vertical 9:16 (Instagram/Facebook Story, Reels, Feed).
- Keep the TOP THIRD of the frame relatively clean/empty — headline text gets overlaid there and must not cross any face, hand, or the bottle.
- The bottle sits in the LOWER HALF of the frame, with clear empty space above it.
- Keep the top ~15% and bottom ~20% as clean margin for Instagram UI.
- The reserved text zone should fall over a SIMPLE, EVEN-TONED area (open wall, sky, blurred background) so overlaid text stays legible — avoid busy backgrounds there.

PREFERRED ENVIRONMENTS (pick what fits — all read morning / drive / focus):
home desk · sunlit kitchen counter · coffee shop · window seat · getting ready in the morning · gym bag or car console before a workout · walking trail.
Props: ceramic mug, real books, notebook, AirPods, laptop (closed or screen NOT showing readable text), plant, water bottle.
AVOID: studio lighting, plain seamless backdrops, stock-photo polish, sleep/bedtime/wind-down settings (wrong product), and any prop with readable text on it (screens, documents, packaging) — image models garble small text.

────────────────────────────────────────────────────────────────────────
TASK: Generate EXACTLY ${count} ad concepts as a JSON array (exactly ${count} elements). Each object:

- "angle": ONE of — ${ANGLES.map((a) => a.id).join(", ")}. Spread angles across the batch.
- "includesPerson": boolean. Aim for ~${personTrue} true / ~${personFalse} false across the batch. When true, prefer HANDS / POV / partial presence (a hand holding the bottle or a capsule, over-the-shoulder at a desk) over fully posed lifestyle models, which read as stock.
- "headline": the line rendered large on the image. Short and punchy — ideally ≤ 7 words and ≤ 45 characters, max two lines. Must use approved benefit language and connect specifically to Dopamine Brain Food (drive / motivation / focus / mood / no-crash). Use the winning rhythms. NOT a fragment-pair tagline, NOT a long testimonial sentence.
- "hook": one internal context line (NOT overlaid) — the insight behind the concept.
- "visualPrompt": detailed SCENE description that will surround the bottle. Native, real-looking, phone-photo aesthetic — subject, setting, lighting, composition, props — fitting a theme above. DO NOT describe the bottle (a real bottle photo is composited in). Describe only the scene around it, and keep the text-zone clean per the rules.

COMPLIANCE — FDA structure/function (21 CFR 101.93). Dietary supplement; cannot diagnose, treat, cure, mitigate, or prevent disease.
- Use "supports," "helps maintain," "promotes" — never "treats," "cures," "fixes," "reverses."
- No specific disease, drug name, or drug category. No claim of FDA approval, guaranteed results, miracle effects, or "no side effects."
- BANNED (immediate reject): ${BANNED_WORDS.join(", ")}

Return ONLY the JSON array, no other text.

EXAMPLES (Dopamine Brain Food only):
[
  {
    "angle": "no-crash",
    "includesPerson": false,
    "headline": "No caffeine. No crash. Just drive.",
    "hook": "The whole win is steady drive without the stimulant rollercoaster.",
    "visualPrompt": "Realistic iPhone photo of a sunlit kitchen counter in the morning, ceramic mug of coffee, a small potted plant, soft natural light from a window on the right, clean light wall filling the upper-left of the frame, slight grain, candid and uncluttered, bottle in the lower portion of the frame."
  },
  {
    "angle": "morning-momentum",
    "includesPerson": true,
    "headline": "Build your morning momentum.",
    "hook": "Drive you can feel from the first hour of the day.",
    "visualPrompt": "Realistic iPhone photo, first-person POV of a hand reaching toward the bottle on a wooden home desk, closed laptop, open notebook, mug of coffee steaming, soft morning light from a window, plain wall in the upper third for text space, natural candid feel, slight depth of field."
  }
]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
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
