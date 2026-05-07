import { NextRequest } from "next/server";
import { WINNER_CRITERIA, type WinningAd } from "@/lib/ad-generator-types";

// Pulls winning ads from Triple Whale based on WINNER_CRITERIA.
// V0: returns mock data. Once we wire up Triple Whale's API
// (or build a Moby custom agent), this will return real data.
export async function POST(req: NextRequest) {
  try {
    const { product } = await req.json();

    const tripleWhaleApiKey = process.env.TRIPLE_WHALE_API_KEY;

    if (!tripleWhaleApiKey) {
      // Mock data so the rest of the pipeline can be built and tested
      const mockWinners: WinningAd[] = [
        {
          id: "tw_mock_1",
          headline: "The 60-second morning ritual that locked me in for 8+ hours",
          hook: "Morning brain fog had me reaching for a 3rd coffee before 10am.",
          visualStyle:
            "UGC selfie at desk with bottle next to coffee mug, natural morning light, slight smile",
          cpa: 50,
          sales: 20,
          spend: 1000,
        },
        {
          id: "tw_mock_2",
          headline: "Why I stopped taking 'focus' supplements with mystery ingredients",
          hook: "Most nootropics hide what's actually inside. We don't.",
          visualStyle:
            "Hands holding bottle next to printed lab report, clean white background, scientific feel",
          cpa: 65,
          sales: 12,
          spend: 780,
        },
        {
          id: "tw_mock_3",
          headline: "Founders, executives, and PhDs are all stacking this one capsule",
          hook: "Built by biohackers, used by people who can't afford to crash.",
          visualStyle:
            "Lifestyle shot of bottle on desk next to laptop and notebook, executive vibe",
          cpa: 58,
          sales: 18,
          spend: 1044,
        },
      ];

      return Response.json({
        winners: mockWinners,
        criteria: WINNER_CRITERIA,
        product,
        source: "mock",
        message:
          "Triple Whale API key not configured. Returning mock winners. Set TRIPLE_WHALE_API_KEY in .env.local once you have it.",
      });
    }

    // TODO: real Triple Whale API call
    // POST https://api.triplewhale.com/api/v2/... (need to check exact endpoint)
    // For now, return a not-implemented response
    return Response.json(
      { error: "Triple Whale integration not yet implemented. Mock mode is active by default." },
      { status: 501 }
    );
  } catch (error) {
    console.error("Winners endpoint error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch winners" },
      { status: 500 }
    );
  }
}
