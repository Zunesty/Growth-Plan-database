import { buildDigestData, buildDigestText } from "@/lib/client-hub-digest";
import { apiError } from "@/lib/client-hub-http";

export async function GET() {
  try {
    const data = await buildDigestData();
    return Response.json({ data, text: buildDigestText(data) });
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
