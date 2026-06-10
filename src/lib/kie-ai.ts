// KIE AI client for Nano Banana Pro.
// Docs: https://docs.kie.ai/market/google/pro-image-to-image
//
// We sit in the middle: not the basic Nano Banana Edit (older, weaker at
// text), not Nano Banana 2 (newest but slower and we were timing out on it).
// Pro is the proven sweet spot for our use case:
//   - Strong text-on-product-label rendering (the bug we keep hitting on
//     Edit was "headline landed on a face or bottle")
//   - Faster than Nano Banana 2, especially at 2K resolution
//   - Up to 8 reference images, same request shape as Nano Banana 2
//
// Uses the unified job system:
//   POST https://api.kie.ai/api/v1/jobs/createTask    → returns { data: { taskId } }
//   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=... → returns { data: { state, resultJson } }
//
// resultJson is a JSON STRING containing { resultUrls: [url, ...] }.

const KIE_AI_BASE = "https://api.kie.ai/api/v1";
const MODEL_SLUG = "nano-banana-pro";

export type KieAiOptions = {
  prompt: string;
  /**
   * Reference images for image-to-image (URLs only — KIE AI fetches them).
   * Up to 14 supported. Each must be a publicly reachable URL serving
   * jpeg/png/webp, max 30 MB per image.
   */
  referenceImages?: string[];
  /** Output aspect ratio. Default 9:16 for IG/TikTok. */
  aspectRatio?: "9:16" | "1:1" | "16:9" | "3:4" | "4:3" | "4:5" | "auto";
  /** Output format. Default png. */
  outputFormat?: "png" | "jpg";
  /** Output resolution. Default 2K for higher-quality static ads. */
  resolution?: "1K" | "2K" | "4K";
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
    resolution = "2K",
  } = options;

  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    output_format: outputFormat,
  };
  if (referenceImages && referenceImages.length > 0) {
    input.image_input = referenceImages;
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

  // Poll for completion. Nano Banana Pro at 2K averages 60-120s but can stretch
  // to 180-220s under load. We extend the wait to ~240s before giving up.
  // The job typically keeps running on KIE AI's side past the timeout — we
  // just stop waiting and let the caller fall back.
  const maxAttempts = 120;
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
    `KIE AI generation timed out after 240s (taskId ${taskId} may still be processing on KIE AI's side — check the KIE AI dashboard if you need to recover the result)`
  );
}
