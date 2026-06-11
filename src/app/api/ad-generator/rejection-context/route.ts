// Debug endpoint: shows the rejection memory the team is feeding into Claude.
//
// GET /api/ad-generator/rejection-context?product=dopamine-brain-food
//
// Use this to verify the "past rejections" block is working: after rejecting
// a few concepts/creatives, hit this endpoint to see exactly what Claude
// would receive on the next batch.

import type { NextRequest } from "next/server";
import { fetchRecentRejections } from "@/lib/ad-pipeline";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "dopamine-brain-food";

  const rejections = await fetchRecentRejections(product);

  return Response.json({
    product,
    count: rejections.length,
    rejections,
    note:
      rejections.length === 0
        ? "No rejected concepts or creatives found for this product yet. Reject a few with a reason and they'll show up here."
        : "These are the patterns Claude will be told to avoid on the next batch for this product.",
  });
}
