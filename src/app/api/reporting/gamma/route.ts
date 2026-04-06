import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const gammaApiKey = process.env.GAMMA_API_KEY;

  if (!gammaApiKey) {
    return Response.json(
      { error: "Gamma API key not configured. Set GAMMA_API_KEY in .env.local" },
      { status: 400 }
    );
  }

  try {
    const { report, clientName, templateId } = await req.json();

    // Gamma API integration
    // Gamma supports creating presentations via their API
    const response = await fetch("https://gamma.app/api/v1/presentations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gammaApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `${clientName} — Client Report`,
        content: report,
        templateId: templateId || undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gamma API error: ${response.status} — ${errorText}`);
    }

    const data = await response.json();

    return Response.json({
      success: true,
      url: data.url || data.presentationUrl || null,
    });
  } catch (error) {
    console.error("Gamma error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to push to Gamma" },
      { status: 500 }
    );
  }
}
