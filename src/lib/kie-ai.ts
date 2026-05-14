// KIE AI client for generating UGC-style images.
// KIE AI exposes a unified API for many models — we default to Nano Banana
// (Gemini 2.5 Flash Image) for photorealistic UGC.
//
// Docs: https://docs.kie.ai

const KIE_AI_BASE = "https://api.kie.ai/api/v1";

export type KieAiOptions = {
  prompt: string;
  /** Reference images (e.g. the Dopamine Brain Food product render) */
  referenceImages?: string[]; // URLs or base64
  /** Output aspect ratio. Default 9:16 for IG/TikTok */
  aspectRatio?: "9:16" | "1:1" | "16:9";
  /** Model to use — Nano Banana is best for photoreal UGC */
  model?: "nano-banana" | "flux-pro" | "flux-schnell";
};

export type KieAiResult = {
  imageUrl: string;
  imageBuffer?: Buffer;
};

/**
 * Generate an image with KIE AI. Polls until the job completes.
 * Returns the final image URL (and optionally the buffer if download=true).
 */
export async function generateImage(
  options: KieAiOptions,
  download = true
): Promise<KieAiResult> {
  const apiKey = process.env.KIE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("KIE_AI_API_KEY not set in .env.local");
  }

  const { prompt, referenceImages, aspectRatio = "9:16", model = "nano-banana" } = options;

  // KIE AI uses different endpoints per model — Nano Banana lives under
  // /gemini/generate. Adjust here as we add more models.
  const endpoint = `${KIE_AI_BASE}/gemini/generate`;

  const body = {
    model: model === "nano-banana" ? "gemini-2.5-flash-image" : model,
    prompt,
    aspect_ratio: aspectRatio,
    ...(referenceImages && referenceImages.length > 0
      ? { reference_images: referenceImages }
      : {}),
  };

  const initRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`KIE AI init error (${initRes.status}): ${errText}`);
  }

  const initJson = await initRes.json();
  const taskId = initJson.taskId || initJson.task_id || initJson.id;
  if (!taskId) {
    throw new Error("KIE AI did not return a task ID");
  }

  // Poll for completion (most KIE AI jobs finish in 5-30s)
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(`${KIE_AI_BASE}/common/task/${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!pollRes.ok) continue;

    const pollJson = await pollRes.json();
    const status = pollJson.status || pollJson.state;

    if (status === "succeeded" || status === "completed" || status === "success") {
      const imageUrl =
        pollJson.result?.url ||
        pollJson.result?.image_url ||
        pollJson.images?.[0]?.url ||
        pollJson.output?.[0];
      if (!imageUrl) {
        throw new Error("KIE AI completed but no image URL returned");
      }

      let imageBuffer: Buffer | undefined;
      if (download) {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error(`Failed to download KIE AI image: ${imgRes.status}`);
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      }

      return { imageUrl, imageBuffer };
    }

    if (status === "failed" || status === "error") {
      throw new Error(`KIE AI generation failed: ${pollJson.error || "unknown"}`);
    }
  }

  throw new Error("KIE AI generation timed out after 60s");
}
