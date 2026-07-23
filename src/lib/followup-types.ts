// Follow-Up Agent types. Pure type defs only, zero runtime deps — safe to
// import from client components (unlike followup-store.ts and friends, which
// touch crypto/Supabase and must stay server-only).

export const TEMPLATE_IDS = {
  POST_MEETING: "post_meeting",
  URGENCY: "urgency",
  REENGAGEMENT: "reengagement",
} as const;

export type TemplateId = (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS];

export type TemplateMeta = {
  id: TemplateId;
  name: string;
  autopilot: boolean;
  blurb: string;
};

export type ContextLink = { label: string; url: string };

export type ProfileSettings = {
  event_name: string;
  sender_name: string;
  company_name: string;
  context_links: ContextLink[];
  pricing: string;
  booking_link: string;
  templates: Record<TemplateId, string>;
  autopilot: boolean;
  slack_webhook_url: string;
};

export type DraftedMarker = {
  gmailDraftId?: string;
  needsAttention: boolean;
  attendeeName: string;
  attendeeEmail: string;
  meetingTitle: string;
  meetingDate: string;
  source: "manual" | "webhook" | "poller" | "simulate";
  createdAt: string;
};

// Internal, server-side profile shape (decrypted secrets included). Never
// send this to the client directly — use SafeProfile / toSafe().
export type Profile = {
  id: string;
  name: string;
  settings: ProfileSettings;
  drafted: Record<string, DraftedMarker>;
  fathomKey: string;
  gmailRefreshToken: string;
  gmailAccessToken: string;
  gmailAccessExpiry: number;
  gmailEmail: string;
  fathomWebhookId: string;
  fathomWebhookSecret: string;
  createdAt: string;
  updatedAt: string;
};

// Client-safe view: no secrets, keys become booleans.
export type SafeProfile = {
  id: string;
  name: string;
  settings: ProfileSettings;
  hasFathomKey: boolean;
  gmail: { connected: boolean; email: string };
  autopilotWebhookRegistered: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Attendee = { name: string; email: string };

export type Call = {
  recordingId: string;
  title: string;
  createdAt: string;
  url: string;
  recordedBy: { name?: string; email?: string } | null;
  externalAttendees: Attendee[];
  primaryAttendee: Attendee | null;
  transcript: unknown;
};

export type CallWithStatus = Call & {
  status: "none" | "drafted" | "needs_attention";
  draftedAt: string | null;
  gmailDraftId: string | null;
};

export type Draft = {
  to: string;
  subject: string;
  html: string;
  needsAttention: boolean;
};

export type SessionInfo = {
  gmailConfigured: boolean;
  encryptionReady: boolean;
  model: string;
  templateMeta: TemplateMeta[];
};
