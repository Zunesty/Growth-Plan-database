import { buildFindings } from "@/lib/client-hub-findings";
import { apiError } from "@/lib/client-hub-http";

export async function GET() {
  try {
    const findings = await buildFindings();
    return Response.json({ findings });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
