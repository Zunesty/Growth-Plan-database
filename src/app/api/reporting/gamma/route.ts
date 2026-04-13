import { NextRequest } from "next/server";

const GAMMA_API_BASE = "https://public-api.gamma.app/v1.0";

export async function POST(req: NextRequest) {
  const gammaApiKey = process.env.GAMMA_API_KEY;

  if (!gammaApiKey) {
    return Response.json(
      { error: "Gamma API key not configured. Set GAMMA_API_KEY in .env.local" },
      { status: 400 }
    );
  }

  try {
    const { report, clientName, gammaTemplateId } = await req.json();

    // Use from-template endpoint if a template is configured, otherwise fall back to plain generation
    const endpoint = gammaTemplateId
      ? `${GAMMA_API_BASE}/generations/from-template`
      : `${GAMMA_API_BASE}/generations`;

    const body = gammaTemplateId
      ? {
          gammaId: gammaTemplateId,
          prompt: report,
        }
      : {
          inputText: report,
          textMode: "preserve",
          format: "presentation",
          additionalInstructions: `This is a ${clientName} client report. Format as a clean, minimal slide deck.`,
        };

    const initRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": gammaApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!initRes.ok) {
      const errorText = await initRes.text();
      throw new Error(`Gamma API error (${initRes.status}): ${errorText}`);
    }

    const { generationId } = await initRes.json();
    if (!generationId) {
      throw new Error("Gamma did not return a generationId");
    }

    // Poll until complete (Gamma docs recommend polling every 5 seconds, max ~2 min)
    const maxAttempts = 24;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const pollRes = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
        headers: { "X-API-KEY": gammaApiKey },
      });

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();

      if (pollData.status === "completed") {
        return Response.json({
          success: true,
          url: pollData.gammaUrl || null,
          exportUrl: pollData.exportUrl || null,
        });
      }

      if (pollData.status === "failed") {
        throw new Error(`Gamma generation failed: ${pollData.error || "Unknown error"}`);
      }
    }

    // If we time out, return the generation ID so the user can check Gamma manually
    return Response.json({
      success: true,
      pending: true,
      generationId,
      message: "Generation is taking longer than expected. Check your Gamma account in a moment.",
    });
  } catch (error) {
    console.error("Gamma error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to push to Gamma" },
      { status: 500 }
    );
  }
}
