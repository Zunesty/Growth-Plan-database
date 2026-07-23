import type { NextRequest } from "next/server";
import * as gmail from "@/lib/followup-gmail";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return Response.redirect(`${origin}/follow-up-agent?gmail=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return Response.redirect(`${origin}/follow-up-agent?gmail=error&reason=missing_code`);
  }
  try {
    const { profileId } = await gmail.handleCallback({ code, state });
    return Response.redirect(`${origin}/follow-up-agent?gmail=connected&profile=${encodeURIComponent(profileId)}`);
  } catch (e) {
    return Response.redirect(`${origin}/follow-up-agent?gmail=error&reason=${encodeURIComponent((e as Error).message)}`);
  }
}
