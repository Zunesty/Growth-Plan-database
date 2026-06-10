// KIE AI client for the basic Nano Banana Edit (image-to-image).
// Docs: https://docs.kie.ai/market/google/nano-banana-edit
//
// We were on Nano Banana Pro for a while — strong on text but slow at 2K
// (we were hitting 240s timeouts and burning extra KIE AI credits on the
// retry path). Edit is the original, cheaper, faster image-to-image model:
//   - ~30-60s per generation instead of 60-180s on Pro
//   - 1K output (smaller files, faster Drive uploads)
//   - Same /jobs/createTask + /jobs/recordInfo polling pattern
//
// Field shape differs from Pro/2 — Edit uses image_urls + image_size where
// Pro/2 use image_input + aspect_ratio + resolution.
//
// Uses the unified job system:
//   POST https://api.kie.ai/api/v1/jobs/createTask    → returns { data: { taskId } }
//   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=... → returns { data: { state, resultJson } }
//
// resultJson is a JSON STRING containing { resultUrls: [url, ...] }.

const KIE_AI_BASE = "https://api.kie.ai/api/v1";
const MODEL_SLUG = "google/nano-banana-edit";

export type KieAiOptions = {
  prompt: string;
  /**
   * Reference images for image-to-image (URLs only — KIE AI fetches them).
   * Nano Banana Edit accepts up to 10 reference images. Each must be a
   * publicly reachable URL serving jpeg/png/webp, max 10 MB per image.
   */
  referenceImages?: string[];
  /** Output aspect ratio. Default 9:16 for IG/TikTok. */
  aspectRatio?: "9:16" | "1:1" | "16:9" | "3:4" | "4:3" | "4:5" | "auto";
  /** Output format. Default png. */
  outputFormat?: "png" | "jpg";
};

export type KieAiResult = {
  imageUrl: string;
  imageBuffer?: Buffer;
};

export async function generateImage(
  options: KieAiOptions,
  download = true
): Promise<KieAiResult> {
  const apiKey = process.env.KIE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("KIE_AI_API_KEY not set");
  }

  const {
    prompt,
    referenceImages,
    aspectRatio = "9:16",
    outputFormat = "png",
  } = options;

  // Edit uses image_urls + image_size; Pro/2 use image_input + aspect_ratio.
  // Keep the field names matched to the model slug above.
  const input: Record<string, unknown> = {
    prompt,
    image_size: aspectRatio,
    output_format: outputFormat,
  };
  if (referenceImages && referenceImages.length > 0) {
    input.image_urls = referenceImages;
  }

  const initRes = await fetch(`${KIE_AI_BASE}/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL_SLUG, input }),
  });

  if (!initRes.ok) {
    throw new Error(`KIE AI init error (${initRes.status}): ${await initRes.text()}`);
  }

  const initJson = await initRes.json();
  const taskId: string | undefined = initJson?.data?.taskId;
  if (!taskId) {
    throw new Error(`KIE AI did not return a taskId: ${JSON.stringify(initJson)}`);
  }

  // Poll for completion. Nano Banana Edit averages 30-60s at 1K so a 120s
  // ceiling gives plenty of headroom. (Pro at 2K needed 240s — we don't.)
  // Smaller function-time budget = more ads we can fit in one batch.
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(
      `${KIE_AI_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!pollRes.ok) continue;

    const pollJson = await pollRes.json();
    const state: string | undefined = pollJson?.data?.state;

    if (state === "success") {
      const resultJsonStr: string | undefined = pollJson?.data?.resultJson;
      if (!resultJsonStr) {
        throw new Error("KIE AI succeeded but no resultJson returned");
      }
      const parsed = JSON.parse(resultJsonStr) as { resultUrls?: string[] };
      const imageUrl = parsed.resultUrls?.[0];
      if (!imageUrl) {
        throw new Error("KIE AI resultJson has no resultUrls");
      }

      let imageBuffer: Buffer | undefined;
      if (download) {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
          throw new Error(`Failed to download KIE AI image: ${imgRes.status}`);
        }
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      }

      return { imageUrl, imageBuffer };
    }

    if (state === "fail" || state === "failed" || state === "error") {
      const msg = pollJson?.data?.failMsg || pollJson?.data?.failCode || "unknown";
      throw new Error(`KIE AI generation failed: ${msg}`);
    }
  }

  throw new Error(
    `KIE AI generation timed out after 120s (taskId ${taskId} may still be processing on KIE AI's side — check the KIE AI dashboard if you need to recover the result)`
  );
}
