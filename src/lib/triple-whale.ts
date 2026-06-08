// Triple Whale client — pulls winning ads via the orcabase SQL endpoint.
//
// Docs:
//   https://triplewhale.readme.io/reference/data-out-execute-custom-sql-query
//   https://triplewhale.readme.io/reference/ads-table
//
// We hit the ads_table with a SQL query that surfaces top performers
// (CPA <= maxCPA, conversions >= minSales) in the lookback window, and
// map each row into our WinningAd shape so the rest of the ad-generator
// pipeline (Claude ideation, KIE AI image-to-image) treats real winners
// identically to the mock seed data.

import type { WinningAd } from "./ad-generator-types";

const ENDPOINT = "https://api.triplewhale.com/api/v2/orcabase/api/sql";

export type WinnerCriteria = {
  maxCPA: number;
  minSales: number;
  lookbackDays: number;
};

export type TripleWhaleConfig = {
  apiKey: string;
  shopId: string;
};

type TripleWhaleAdRow = {
  ad_id?: string;
  ad_name?: string;
  ad_image_url?: string;
  total_spend?: number;
  total_conversions?: number;
  avg_cpa?: number;
};

/**
 * Format a Date as YYYY-MM-DD (the format Triple Whale's @startDate /
 * @endDate placeholders expect).
 */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Build the SQL that finds top-performing ads in the lookback window.
 * Uses Triple Whale's @startDate / @endDate placeholders rather than
 * inlining the dates — those get bound from the `period` field on the
 * request body.
 *
 * Note: `cpa` is documented as a column but is actually a derived metric
 * computed as SUM(spend) / SUM(conversions). Referencing it directly
 * returns "Unknown expression or function identifier `cpa`". We compute
 * it in the SELECT instead and use the same computation in HAVING/ORDER.
 */
function buildWinnersSql(criteria: WinnerCriteria): string {
  const cpaExpr = "SUM(spend) / NULLIF(SUM(conversions), 0)";
  return `
SELECT
  ad_id,
  MAX(ad_name)        AS ad_name,
  MAX(ad_image_url)   AS ad_image_url,
  SUM(spend)          AS total_spend,
  SUM(conversions)    AS total_conversions,
  ${cpaExpr}          AS avg_cpa
FROM ads_table
WHERE event_date BETWEEN @startDate AND @endDate
  AND ad_id != ''
  AND ad_id IS NOT NULL
GROUP BY ad_id
HAVING SUM(conversions) >= ${criteria.minSales}
   AND ${cpaExpr}     <= ${criteria.maxCPA}
ORDER BY ${cpaExpr} ASC
LIMIT 10
`.trim();
}

export async function getWinningAdsFromTripleWhale(
  config: TripleWhaleConfig,
  criteria: WinnerCriteria
): Promise<WinningAd[]> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - criteria.lookbackDays);

  const body = {
    shopId: config.shopId,
    query: buildWinnersSql(criteria),
    period: {
      startDate: ymd(start),
      endDate: ymd(now),
    },
    currency: "USD",
  };

  // Triple Whale auth uses x-api-key, NOT Authorization: Bearer.
  // The Bearer header makes the gateway try to parse the value as a JWT
  // and fail with "Invalid iss". The /triple-whale-test endpoint confirmed
  // x-api-key returns 2xx / valid responses.
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Triple Whale SQL error (${res.status}): ${text.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as unknown;
  const rows = extractRows(json);

  return rows.map((row, i) => mapRowToWinningAd(row, i));
}

/**
 * Triple Whale's response shape isn't fully documented in the public docs,
 * so we accept a few common containers (`data`, `rows`, `results`) and the
 * bare-array case before giving up.
 */
function extractRows(json: unknown): TripleWhaleAdRow[] {
  if (Array.isArray(json)) return json as TripleWhaleAdRow[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of ["data", "rows", "results", "result"]) {
      const val = obj[key];
      if (Array.isArray(val)) return val as TripleWhaleAdRow[];
      if (val && typeof val === "object") {
        const inner = (val as Record<string, unknown>)["rows"];
        if (Array.isArray(inner)) return inner as TripleWhaleAdRow[];
      }
    }
  }
  return [];
}

function mapRowToWinningAd(row: TripleWhaleAdRow, index: number): WinningAd {
  const id = row.ad_id || `winner-${index}`;
  const name = row.ad_name || `Ad ${index + 1}`;
  return {
    id,
    headline: name,
    hook: `Performing winner from Meta — ${name}`,
    visualStyle: row.ad_image_url
      ? `Real winning ad from the Meta account. Reference image: ${row.ad_image_url}`
      : "Real winning ad from the Meta account (no image URL available).",
    cpa: typeof row.avg_cpa === "number" ? Math.round(row.avg_cpa) : 0,
    sales: typeof row.total_conversions === "number" ? row.total_conversions : 0,
    spend: typeof row.total_spend === "number" ? row.total_spend : 0,
    imageUrl: row.ad_image_url,
  };
}
