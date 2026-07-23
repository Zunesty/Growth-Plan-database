import type { NextRequest } from "next/server";
import * as gmail from "@/lib/followup-gmail";
import * as profiles from "@/lib/followup-store";

export async function GET(req: NextRequest) {
  if (!gmail.isConfigured()) {
    return new Response("Gmail OAuth is not configured (FOLLOWUP_GOOGLE_CLIENT_ID/SECRET missing).", { status: 400 });
  }
  const profileId = req.nextUrl.searchParams.get("profile");
  if (!profileId || !(await profiles.get(profileId))) {
    return new Response("Unknown profile.", { status: 400 });
  }
  return Response.redirect(gmail.buildAuthUrl(profileId));
}
