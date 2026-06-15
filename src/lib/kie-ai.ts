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

  // createTask is fast (200-500ms) and occasionally returns a 5xx or a 2xx
  // with no taskId (e.g. {"code":500,"msg":"image_urls file type not supported"}
  // even when the same URL succeeds on parallel sibling requests). Treat
  // these as transient and retry with a short backoff — different from the
  // polling step, which is slow and shouldn't be re-fired on timeout.
  const taskId = await createTaskWithRetry(apiKey, input);

  // Poll for completion. Real data from Santiago's batches: Edit at 1K still
  // has a slow tail — durations observed were 24, 90, 100, 160, and 258s in
  // a single 5-ad run. 300s ceiling catches the slow ones while still keeping
  // the function under maxDuration for typical 5-10 ad batches.
  const maxAttempts = 150;
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
    `KIE AI generation timed out after 300s (taskId ${taskId} may still be processing on KIE AI's side — check the KIE AI dashboard if you need to recover the result)`
  );
}

/**
 * POST to /jobs/createTask, retrying on transient errors. Three attempts
 * with 1s / 3s backoff — total worst-case 4s extra on top of the original
 * createTask round trip. Retries on:
 *   - HTTP 5xx
 *   - HTTP 2xx body with no taskId (e.g. {"code":500, "msg":"..."} — KIE AI
 *     returns these as 200s on the HTTP envelope, with the real error in the
 *     body. That's what bit Santiago.)
 *   - Network errors
 *
 * Does NOT retry on 4xx (bad request, bad auth, bad model — fix the input
 * instead).
 */
async function createTaskWithRetry(
  apiKey: string,
  input: Record<string, unknown>
): Promise<string> {
  const body = JSON.stringify({ model: MODEL_SLUG, input });
  const backoffsMs = [1000, 3000];
  let lastErr: string | undefined;

  for (let attempt = 0; attempt < backoffsMs.length + 1; attempt++) {
    try {
      const initRes = await fetch(`${KIE_AI_BASE}/jobs/createTask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (initRes.status >= 400 && initRes.status < 500) {
        // Don't retry client errors — those are real bugs.
        throw new Error(
          `KIE AI init error ${initRes.status}: ${(await initRes.text()).slice(0, 500)}`
        );
      }

      if (!initRes.ok) {
        // 5xx
        lastErr = `KIE AI init HTTP ${initRes.status}: ${(await initRes.text()).slice(0, 200)}`;
      } else {
        const initJson = await initRes.json();
        const taskId: string | undefined = initJson?.data?.taskId;
        if (taskId) return taskId;
        // 2xx but no taskId — KIE AI returns its actual error in the body.
        lastErr = `KIE AI returned no taskId: ${JSON.stringify(initJson).slice(0, 500)}`;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("KIE AI init error 4")) {
        throw err; // client-error rethrow
      }
      lastErr = err instanceof Error ? err.message : String(err);
    }

    const delay = backoffsMs[attempt];
    if (delay) {
      console.warn(
        `KIE AI createTask attempt ${attempt + 1} failed (${lastErr}), retrying after ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(`KIE AI createTask failed after retries: ${lastErr}`);
}
