#!/usr/bin/env node
// One-time helper to mint a Google OAuth refresh token for the Drive API.
//
// Usage:
//   GOOGLE_CLIENT_ID=...apps.googleusercontent.com \
//   GOOGLE_CLIENT_SECRET=... \
//   node scripts/get-google-refresh-token.mjs
//
// Pre-reqs in Google Cloud Console:
//   1. Enable the Google Drive API on your project
//   2. Configure OAuth consent screen (Internal if Zunesty Workspace)
//   3. Create OAuth 2.0 Client ID:
//      - Application type: Web application
//      - Authorized redirect URI: http://localhost:4567/oauth-callback
//   4. Copy the Client ID and Client Secret into the env vars above
//
// What this script does:
//   - Opens your browser to Google's consent screen
//   - Spins up a local server on :4567 to receive the auth code
//   - Exchanges the code for tokens and prints the refresh token
//
// Paste the refresh token into Vercel + .env.local as GOOGLE_REFRESH_TOKEN.

import { OAuth2Client } from "google-auth-library";
import http from "node:http";
import { exec } from "node:child_process";

const PORT = 4567;
const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;
const SCOPES = ["https://www.googleapis.com/auth/drive"];

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\n❌ Missing env vars.\n");
  console.error("Run with:");
  console.error(
    "  GOOGLE_CLIENT_ID=...apps.googleusercontent.com \\"
  );
  console.error("  GOOGLE_CLIENT_SECRET=... \\");
  console.error("  node scripts/get-google-refresh-token.mjs\n");
  process.exit(1);
}

const oauth = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (u.pathname !== "/oauth-callback") {
    res.writeHead(404).end();
    return;
  }

  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  if (err) {
    res.writeHead(400, { "Content-Type": "text/html" }).end(
      `<h1>OAuth error</h1><pre>${err}</pre>`
    );
    console.error("\n❌ OAuth error:", err);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400).end("No code in callback");
    return;
  }

  try {
    const { tokens } = await oauth.getToken(code);
    res
      .writeHead(200, { "Content-Type": "text/html" })
      .end(
        "<h1>Done.</h1><p>You can close this tab. Check your terminal for the refresh token.</p>"
      );

    if (!tokens.refresh_token) {
      console.error(
        "\n⚠️  No refresh_token returned. This usually means you've already granted consent before."
      );
      console.error(
        "Go to https://myaccount.google.com/permissions, remove this app, then re-run."
      );
      server.close();
      process.exit(1);
    }

    console.log("\n✅ Success! Paste these into your env vars:\n");
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end("Token exchange failed: " + e.message);
    console.error("\n❌ Token exchange failed:", e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nListening on ${REDIRECT_URI} ...`);
  console.log("\nOpening browser. If it doesn't open, paste this URL manually:\n");
  console.log(authUrl + "\n");
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start ''"
        : "xdg-open";
  exec(`${opener} "${authUrl}"`);
});
