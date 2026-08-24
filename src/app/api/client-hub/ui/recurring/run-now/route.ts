import { spawnDueRecurringTasks } from "@/lib/client-hub-recurring-engine";
import { apiError } from "@/lib/client-hub-http";

export async function POST() {
  try {
    const result = await spawnDueRecurringTasks();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
