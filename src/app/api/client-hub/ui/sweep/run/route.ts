import { runSweep } from "@/lib/client-hub-sweep";
import { buildFindings } from "@/lib/client-hub-findings";
import { apiError } from "@/lib/client-hub-http";

export const maxDuration = 120;

export async function POST() {
  try {
    const sweep = await runSweep();
    const findings = await buildFindings();
    return Response.json({ sweep, findings });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
