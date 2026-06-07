import { NextRequest } from "next/server";
import { WINNER_CRITERIA, type WinningAd } from "@/lib/ad-generator-types";
import { getWinningAdsFromTripleWhale } from "@/lib/triple-whale";

// Mock winners — used as a deterministic fallback when Triple Whale isn't
// configured, returns no rows, or errors. The Claude ideation prompt treats
// them as patterns to vary, so they should sound like real ads.
const MOCK_WINNERS: WinningAd[] = [
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

export async function POST(req: NextRequest) {
  try {
    const { product } = await req.json();

    const apiKey = process.env.TRIPLE_WHALE_API_KEY;
    const shopId = process.env.TRIPLE_WHALE_SHOP_ID;

    let tripleWhaleError: string | undefined;
    let tripleWhaleZeroRows = false;

    if (apiKey && shopId) {
      try {
        const winners = await getWinningAdsFromTripleWhale(
          { apiKey, shopId },
          WINNER_CRITERIA
        );
        if (winners.length > 0) {
          return Response.json({
            winners,
            criteria: WINNER_CRITERIA,
            product,
            source: "triple-whale",
          });
        }
        tripleWhaleZeroRows = true;
        console.warn(
          "Triple Whale returned 0 winners — falling back to mock seeds."
        );
      } catch (twErr) {
        tripleWhaleError =
          twErr instanceof Error ? twErr.message : String(twErr);
        console.error("Triple Whale fetch failed, falling back to mock:", twErr);
      }
    }

    return Response.json({
      winners: MOCK_WINNERS,
      criteria: WINNER_CRITERIA,
      product,
      source: "mock",
      message: apiKey && shopId
        ? tripleWhaleError
          ? `Triple Whale call failed: ${tripleWhaleError}`
          : tripleWhaleZeroRows
            ? "Triple Whale returned 0 winning ads matching the criteria. Using mock seeds."
            : "Triple Whale fell back unexpectedly. Check server logs."
        : "TRIPLE_WHALE_API_KEY / TRIPLE_WHALE_SHOP_ID not configured. Using mock winners.",
      tripleWhaleError,
      tripleWhaleZeroRows,
      tripleWhaleConfigured: !!(apiKey && shopId),
    });
  } catch (error) {
    console.error("Winners endpoint error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch winners" },
      { status: 500 }
    );
  }
}
