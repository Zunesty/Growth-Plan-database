// Follow-Up Agent — env config. Fathom keys, Gmail tokens, and webhook
// secrets are profile-scoped and DB-stored (encrypted), never env vars.

const PUBLIC_BASE_URL = (process.env.FOLLOWUP_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const followupConfig = {
  PUBLIC_BASE_URL,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "",

  GOOGLE_CLIENT_ID: process.env.FOLLOWUP_GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.FOLLOWUP_GOOGLE_CLIENT_SECRET || "",
  OAUTH_REDIRECT_URL: `${PUBLIC_BASE_URL}/api/follow-up-agent/oauth/callback`,

  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",

  FATHOM_BASE: "https://api.fathom.ai/external/v1",

  get gmailConfigured() {
    return Boolean(this.GOOGLE_CLIENT_ID && this.GOOGLE_CLIENT_SECRET);
  },

  webhookUrl(profileId: string) {
    return `${PUBLIC_BASE_URL}/api/follow-up-agent/webhooks/fathom/${profileId}`;
  },
};
