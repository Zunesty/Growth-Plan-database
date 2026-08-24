// 8:00am PT — posts the daily digest to Slack. Vercel Cron schedules are
// fixed UTC with no timezone parameter, so the schedule in vercel.json
// targets 8am PST and will drift to 9am during PDT (~mid-March to early
// November) until manually adjusted. This route guards against being
// invoked wildly outside its intended window (e.g. a stray manual hit) —
// it does NOT need to guard against double-firing, since the cron itself
// only fires once a day regardless of DST drift.
import type { NextRequest } from "next/server";
import { postDigest } from "@/lib/client-hub-digest";
import { todayPacific } from "@/lib/client-hub-config";
import { apiError } from "@/lib/client-hub-http";

export const maxDuration = 60;

function pacificHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(new Date()));
}

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CLIENT_HUB_CRON_SECRET || "";
    const isCron = secret && req.headers.get("authorization") === `Bearer ${secret}`;
    if (secret && !isCron) return Response.json({ error: "unauthorized" }, { status: 401 });

    // Only the automatic cron trigger is subject to the sanity window — a
    // manual "run now" from the dashboard bypasses it intentionally.
    const hour = pacificHour();
    if (isCron && (hour < 7 || hour > 9)) {
      return Response.json({ ok: false, skipped: "outside expected window", pacificHour: hour, today: todayPacific() });
    }

    const result = await postDigest();
    return Response.json(result);
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
