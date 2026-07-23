// Safety-net sweep, hit by Vercel Cron (see vercel.json). Protected by
// CRON_SECRET when set — Vercel sends it as a Bearer token automatically.
import type { NextRequest } from "next/server";
import * as autopilot from "@/lib/followup-autopilot";
import { apiError } from "@/lib/followup-http";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || "";
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const result = await autopilot.runPollOnce();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
