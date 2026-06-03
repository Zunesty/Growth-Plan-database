// Ad Generator types — V1 focuses on Natural Stacks Dopamine Brain Food
// Workflow: Triple Whale winners → image gen → text overlay → compliance → Drive

export type AdProduct = "dopamine-brain-food" | "neurofuel" | "magtech";

/**
 * What the user picked in the new-batch modal. "all" means: pull bottle
 * references from every active product's subfolder mixed together.
 */
export type AdProductSelection = AdProduct | "all";

export type ProductConfig = {
  id: AdProduct;
  name: string;
  /**
   * Exact Drive subfolder name inside DRIVE_BOTTLES_FOLDER_ID where this
   * product's reference images live. Must match the folder name in Drive
   * exactly (case-sensitive).
   */
  bottleFolderName: string;
  /** Short positioning line — Natural Stacks' own tagline for this product. */
  tagline: string;
  /** Active ingredients (used as context for Claude — never claimed in copy). */
  activeIngredients: string;
  /**
   * Structure-function benefit claims permitted on copy. These are pulled
   * directly from Natural Stacks' own marketing language so they're already
   * FDA-defensible. Claude is told to lean on these and not invent new ones.
   */
  benefitClaims: string[];
  /**
   * Lifestyle / scenario themes that fit this product. Used to bias both
   * Claude's copy direction and the visual scene description.
   * Dopamine Brain Food → mornings, motivation. MagTech → wind-down, sleep.
   */
  themes: string[];
  active: boolean;
};

export const PRODUCTS: ProductConfig[] = [
  {
    id: "dopamine-brain-food",
    name: "Dopamine Brain Food",
    bottleFolderName: "DopamineBrainFood",
    tagline: "For improved motor function and mood",
    activeIngredients: "L-Tyrosine + B-vitamins (B6 P5P, Folate, B12)",
    benefitClaims: [
      "supports motor function",
      "promotes a positive mood",
      "supports mental drive and motivation",
      "helps maintain focus on demanding tasks",
      "supports the body's natural dopamine production",
    ],
    themes: [
      "morning ritual",
      "motivation",
      "mental drive",
      "mood support",
      "starting the day strong",
      "pushing through a stuck moment",
    ],
    active: true,
  },
  {
    id: "neurofuel",
    name: "NeuroFuel",
    bottleFolderName: "NeuroFuel",
    // Paused until Dopamine Brain Food is dialed in (Austin, May 2026).
    // Flip back to active once we're happy with DBF output quality.
    tagline: "Build a better brain — focus and memory",
    activeIngredients:
      "Acetyl-L-Carnitine HCL, Artichoke Leaf Extract, Coleus forskohlii, L-Phenylalanine, Vitamin B6 (P5P)",
    benefitClaims: [
      "supports focus and memory",
      "promotes sharp recall",
      "supports learning",
      "helps maintain mental clarity",
      "supports healthy neurotransmitter function",
    ],
    themes: [
      "deep work",
      "study sessions",
      "creative flow",
      "mental sharpness",
      "remembering what matters",
      "long focused sessions at the desk",
    ],
    active: false,
  },
  {
    id: "magtech",
    name: "MagTech",
    bottleFolderName: "MagTech",
    // Paused until Dopamine Brain Food is dialed in (Austin, May 2026).
    tagline: "Better sleep in a bottle",
    activeIngredients:
      "Magnesium Glycinate, Magnesium-L-Threonate (Magtein™), Magnesium Taurate",
    benefitClaims: [
      "supports sleep quality",
      "promotes relaxation",
      "supports healthy brain magnesium levels",
      "supports recovery",
      "supports cognitive function and memory",
    ],
    themes: [
      "winding down",
      "evening routine",
      "better sleep",
      "calmer nights",
      "feeling rested in the morning",
      "post-workout recovery",
    ],
    active: false,
  },
];

// "Winner" criteria — when does an ad in the account count as a winning seed?
export const WINNER_CRITERIA = {
  maxCPA: 70, // dollars
  minSales: 5,
  lookbackDays: 30,
};

// Forbidden claims — hard block before output hits Drive.
// Based on FDA structure-function rules (21 CFR 101.93): supplements cannot
// claim to diagnose, treat, cure, mitigate, or prevent any disease. Cannot
// reference specific diseases or drug categories. Cannot claim FDA approval.
// Compliance: add new entries here when a new red-flag claim shows up.
export const BANNED_WORDS = [
  // Drug-action verbs (disease-claim triggers)
  "cure",
  "cures",
  "cured",
  "treat",
  "treats",
  "treating",
  "treatment for",
  "diagnose",
  "diagnoses",
  "diagnosis",
  "heal",
  "heals",
  "healing",
  "prevent disease",
  "prevents disease",
  "reverses",
  "reverses aging",

  // Disease / condition names
  "ADHD",
  "ADD",
  "depression",
  "depressed",
  "anxiety disorder",
  "panic attacks",
  "bipolar",
  "Alzheimer's",
  "dementia",
  "insomnia",
  "OCD",
  "PTSD",
  "schizophrenia",
  "Parkinson's",
  "autism",
  "epilepsy",
  "obesity",
  "diabetes",
  "hypertension",
  "cardiovascular disease",
  "cancer",

  // Drug comparisons
  "Adderall",
  "Ritalin",
  "Xanax",
  "Prozac",
  "Ambien",
  "natural alternative to",
  "replaces",
  "as effective as",

  // Overstatements
  "FDA approved",
  "FDA endorsed",
  "clinically proven to cure",
  "guaranteed results",
  "guaranteed weight loss",
  "miracle",
  "miraculous",
  "no side effects",
  "side-effect free",
  "100% effective",
  "instant relief",
  "permanently",
  "addiction-free",

  // Common loose language flagged by FDA warning letters
  "brain fog",
  "leaky gut",
  "detoxes the liver",
];

export type WinningAd = {
  id: string;
  // Pulled from Triple Whale Moby
  headline: string;
  hook: string;
  visualStyle: string; // AI-summarized description of the image
  cpa: number;
  sales: number;
  spend: number;
  imageUrl?: string; // reference image from the original ad
};

export type AdAngle =
  | "morning-ritual"
  | "focus-protocol"
  | "biohacker-stack"
  | "transparency"
  | "scientist-formulated"
  | "before-after"
  | "ingredient-spotlight"
  | "user-testimonial"
  | "competitor-comparison"
  | "value-stack";

export const ANGLES: { id: AdAngle; label: string }[] = [
  { id: "morning-ritual", label: "Morning Ritual" },
  { id: "focus-protocol", label: "Focus Protocol" },
  { id: "biohacker-stack", label: "Biohacker Stack" },
  { id: "transparency", label: "Transparency / Open-Source" },
  { id: "scientist-formulated", label: "Scientist-Formulated" },
  { id: "before-after", label: "Before / After" },
  { id: "ingredient-spotlight", label: "Ingredient Spotlight" },
  { id: "user-testimonial", label: "User Testimonial" },
  { id: "competitor-comparison", label: "vs. Competitors" },
  { id: "value-stack", label: "Value Stack" },
];

export type CreativeStatus = "generating" | "ready" | "approved" | "rejected" | "failed";

/**
 * Which branch of the image pipeline produced this creative. Useful for
 * debugging (e.g. spotting when a creative fell through to the raw bottle).
 *   - kie-ai-scene  → KIE AI image-to-image, sharp overlay added the headline
 *   - kie-ai-text   → KIE AI image-to-image AND rendered the headline itself
 *   - bottle-only   → KIE AI failed (or text-mode = no-text); raw bottle resized
 *   - none          → no image produced (compliance reject / no bottle / Drive off)
 */
export type GenerationMode =
  | "kie-ai-scene"
  | "kie-ai-text"
  | "bottle-only"
  | "none";

export type AdCreative = {
  id: string;
  batchId: string;
  product: AdProduct;
  angle: AdAngle;
  filename: string; // static_[angle].png
  imageUrl?: string; // generated image
  finalImageUrl?: string; // image with text overlay
  driveFileId?: string;
  driveUrl?: string;
  headline: string;
  status: CreativeStatus;
  /** Which branch of the image pipeline ran. */
  generationMode?: GenerationMode;
  /**
   * The most recent KIE AI error message for this creative. Set whenever the
   * KIE AI call failed (whether we eventually fell back to bottle-only or the
   * whole creative failed). Lets the UI surface the real failure reason next
   * to the bottle-only badge instead of forcing devs to crack open Vercel logs.
   */
  kieAiError?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  complianceFlags: string[]; // banned-word matches found
  sourceWinnerId?: string; // which winning ad seeded this
  createdAt: string;
};

export type BatchStatus = "queued" | "running" | "ready-for-review" | "approved" | "rejected";

/**
 * Whether the generated creatives should carry an overlaid headline or come
 * out as clean image-only assets. "text" (default) routes through the
 * existing 50/50 KIE-rendered / sharp-overlaid pipeline. "no-text" skips
 * both, returning the bottle-in-scene image as-is at 9:16.
 */
export type AdTextMode = "text" | "no-text";

export type AdBatch = {
  id: string;
  product: AdProductSelection;
  /** Whether this batch's creatives should have a headline overlay. */
  textMode?: AdTextMode;
  /** Drive folder ID for the per-batch output subfolder (e.g. "2026-05-28_14-30 NeuroFuel"). Set when the batch is started, if Drive is configured. */
  outputFolderId?: string;
  /** Drive web view URL for the per-batch output subfolder. */
  outputFolderUrl?: string;
  status: BatchStatus;
  targetCount: number;
  generatedCount: number;
  approvedCount: number;
  rejectedCount: number;
  winners: WinningAd[]; // snapshot of winners at time of generation
  driveFolderId?: string;
  driveFolderUrl?: string;
  createdBy: string;
  createdAt: string;
  notes?: string;
};
