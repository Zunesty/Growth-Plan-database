// Ad Generator types — V1 focuses on Natural Stacks Dopamine Brain Food
// Workflow: Triple Whale winners → image gen → text overlay → compliance → Drive

export type AdProduct = "dopamine-brain-food" | "neurofuel" | "magtech";

/**
 * What the user picked in the new-batch modal. "all" means: pull bottle
 * references from every active product's subfolder mixed together.
 */
export type AdProductSelection = AdProduct | "all";

export const PRODUCTS: {
  id: AdProduct;
  name: string;
  /**
   * Exact Drive subfolder name inside DRIVE_BOTTLES_FOLDER_ID where this
   * product's reference images live. Must match the folder name in Drive
   * exactly (case-sensitive).
   */
  bottleFolderName: string;
  active: boolean;
}[] = [
  {
    id: "dopamine-brain-food",
    name: "Dopamine Brain Food",
    bottleFolderName: "DopamineBrainFood",
    active: true,
  },
  {
    id: "neurofuel",
    name: "NeuroFuel",
    bottleFolderName: "NeuroFuel",
    active: false,
  },
  {
    id: "magtech",
    name: "MagTech",
    bottleFolderName: "MagTech",
    active: false,
  },
];

// "Winner" criteria — when does an ad in the account count as a winning seed?
export const WINNER_CRITERIA = {
  maxCPA: 70, // dollars
  minSales: 5,
  lookbackDays: 30,
};

// Forbidden claims — hard block before output hits Drive
// Compliance team: add to this list as needed
export const BANNED_WORDS = [
  "brain fog",
  "cure",
  "treat",
  "diagnose",
  "prevent disease",
  "ADHD",
  "Adderall",
  "depression",
  "anxiety disorder",
  "FDA approved",
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
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  complianceFlags: string[]; // banned-word matches found
  sourceWinnerId?: string; // which winning ad seeded this
  createdAt: string;
};

export type BatchStatus = "queued" | "running" | "ready-for-review" | "approved" | "rejected";

export type AdBatch = {
  id: string;
  product: AdProductSelection;
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
