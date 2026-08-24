// 7:30am PT — the AI sweep. Safe to re-trigger; each run is independent.
import type { NextRequest } from "next/server";
import { runSweep } from "@/lib/client-hub-sweep";
import { apiError } from "@/lib/client-hub-http";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CLIENT_HUB_CRON_SECRET || "";
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const result = await runSweep();
    return Response.json(result);
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
