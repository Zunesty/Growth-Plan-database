// 6:00am PT — spawns tasks from due recurring templates. Idempotent by
// design (see client-hub-recurring-engine.ts), safe to re-trigger.
import type { NextRequest } from "next/server";
import { spawnDueRecurringTasks } from "@/lib/client-hub-recurring-engine";
import { apiError } from "@/lib/client-hub-http";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CLIENT_HUB_CRON_SECRET || "";
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const result = await spawnDueRecurringTasks();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
