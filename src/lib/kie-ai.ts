// KIE AI client for Nano Banana (Gemini 2.5 Flash Image).
// Docs: https://docs.kie.ai/market/google/nano-banana
//       https://docs.kie.ai/market/google/nano-banana-edit
//
// Uses the unified job system:
//   POST https://api.kie.ai/api/v1/jobs/createTask    → returns { data: { taskId } }
//   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=... → returns { data: { state, resultJson } }
//
// resultJson is a JSON STRING containing { resultUrls: [url, ...] }.

const KIE_AI_BASE = "https://api.kie.ai/api/v1";

export type KieAiOptions = {
  prompt: string;
  /**
   * Reference images for image-to-image (URLs only — Nano Banana fetches them).
   * If provided, we route to `google/nano-banana-edit` instead of `google/nano-banana`.
   */
  referenceImages?: string[];
  /** Output aspect ratio. Default 9:16 for IG/TikTok. */
  aspectRatio?: "9:16" | "1:1" | "16:9" | "3:4" | "4:3";
  /** Output format. Default png. */
  outputFormat?: "png" | "jpeg";
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

  const isEdit = !!(referenceImages && referenceImages.length > 0);
  const model = isEdit ? "google/nano-banana-edit" : "google/nano-banana";

  const input: Record<string, unknown> = {
    prompt,
    output_format: outputFormat,
    image_size: aspectRatio,
  };
  if (isEdit) {
    input.image_urls = referenceImages;
  }

  const initRes = await fetch(`${KIE_AI_BASE}/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });

  if (!initRes.ok) {
    throw new Error(`KIE AI init error (${initRes.status}): ${await initRes.text()}`);
  }

  const initJson = await initRes.json();
  const taskId: string | undefined = initJson?.data?.taskId;
  if (!taskId) {
    throw new Error(`KIE AI did not return a taskId: ${JSON.stringify(initJson)}`);
  }

  // Poll for completion. Most jobs finish in 5-30s; we cap at ~90s.
  const maxAttempts = 45;
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

  throw new Error("KIE AI generation timed out after 90s");
}
