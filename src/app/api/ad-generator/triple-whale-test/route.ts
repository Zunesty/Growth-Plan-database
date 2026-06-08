// Triple Whale diagnostic endpoint.
//
// GET /api/ad-generator/triple-whale-test
//
// Calls Triple Whale's SQL endpoint with both auth header formats and
// returns the verbatim response for each — status, headers, body. No
// fallback to mocks. Use it from the browser to see exactly what Triple
// Whale rejects.
//
// Production note: this leaks the shape of the request body, never the
// API key itself. Still, an internal tool — keep behind the Zunesty
// domain.

import { WINNER_CRITERIA } from "@/lib/ad-generator-types";
import { buildWinnersSql } from "@/lib/triple-whale";

const ENDPOINT = "https://api.triplewhale.com/api/v2/orcabase/api/sql";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function tryFetch(headers: Record<string, string>, body: object) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON
    }
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      bodyRaw: text.slice(0, 2000),
      bodyParsed: parsed,
    };
  } catch (err) {
    return {
      ok: false,
      networkError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const apiKey = process.env.TRIPLE_WHALE_API_KEY;
  const shopId = process.env.TRIPLE_WHALE_SHOP_ID;

  if (!apiKey || !shopId) {
    return Response.json({
      ok: false,
      reason: "Missing env vars",
      apiKeyConfigured: !!apiKey,
      shopIdConfigured: !!shopId,
    });
  }

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - WINNER_CRITERIA.lookbackDays);

  const body = {
    shopId,
    query: buildWinnersSql(WINNER_CRITERIA),
    period: {
      startDate: ymd(start),
      endDate: ymd(now),
    },
    currency: "USD",
  };

  // Try both auth header formats — whichever returns 2xx tells us the
  // right one to use in lib/triple-whale.ts.
  const bearerResult = await tryFetch(
    {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body
  );

  const xApiKeyResult = await tryFetch(
    {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body
  );

  return Response.json({
    endpoint: ENDPOINT,
    shopId,
    period: body.period,
    sqlPreview: body.query.split("\n").slice(0, 5).join("\n") + "...",
    attempts: {
      "Authorization: Bearer": bearerResult,
      "x-api-key": xApiKeyResult,
    },
    suggestion:
      bearerResult.ok
        ? "Bearer works — current code is correct."
        : xApiKeyResult.ok
          ? "x-api-key works — swap auth header in lib/triple-whale.ts."
          : "Neither auth format succeeded. Check the response bodies above for the exact error from Triple Whale.",
  });
}
