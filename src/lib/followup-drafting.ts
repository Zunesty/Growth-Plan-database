// The AI drafting engine. Builds the per-generation user message, calls
// Claude, and defensively parses the JSON response. Uses the app's shared
// ANTHROPIC_API_KEY (same key Growth Plan / Ad Generator / Client Reporting
// use) rather than a per-profile key.

import Anthropic from "@anthropic-ai/sdk";
import { followupConfig } from "./followup-config";
import { SYSTEM_PROMPT, defaultTemplates } from "./followup-templates";
import type { Call, Draft, Profile, TemplateId } from "./followup-types";

const anthropic = new Anthropic();
const TRANSCRIPT_CAP = 60000;

// ---------------------------------------------------------------------------
// Build the per-generation user message.
// ---------------------------------------------------------------------------
function buildUserMessage({
  profile,
  templateId,
  call,
  transcript,
  extraContext,
}: {
  profile: Profile;
  templateId: TemplateId;
  call: Call;
  transcript: string;
  extraContext?: string;
}): string {
  const s = profile.settings;
  const templateText = (s.templates && s.templates[templateId]) || defaultTemplates()[templateId] || "";

  const contextLinks =
    (s.context_links || [])
      .filter((l) => l && l.url)
      .map((l) => `- ${l.label || "Link"}: ${l.url}`)
      .join("\n") || "(none provided)";

  const attendees =
    (call.externalAttendees || []).map((a) => `${a.name || "(no name)"} <${a.email || "no email"}>`).join(", ") || "(none detected)";

  const primary = call.primaryAttendee
    ? `${call.primaryAttendee.name || "(no name)"} <${call.primaryAttendee.email || "no email"}>`
    : "(unknown)";

  let cappedTranscript = transcript || "";
  let truncatedNote = "";
  if (cappedTranscript.length > TRANSCRIPT_CAP) {
    cappedTranscript = cappedTranscript.slice(0, TRANSCRIPT_CAP);
    truncatedNote = "\n[transcript truncated to fit length limit]";
  }

  return `TEMPLATE EMAIL (reproduce its structure, tone, length, greeting, and sign-off exactly; swap in this call's specifics):
"""
${templateText}
"""

SENDER SETTINGS:
- Sender name (for sign-off): ${s.sender_name || "[FILL: sender name]"}
- Company / client name: ${s.company_name || "(not set)"}
- Context links (the ONLY URLs you may hyperlink):
${contextLinks}
- Booking link: ${s.booking_link || "(none)"}
- Pricing (the ONLY source you may quote prices from):
"""
${s.pricing || "(no pricing provided — do not state any price)"}
"""

THIS CALL:
- Meeting title: ${call.title || "(untitled)"}
- Date: ${call.createdAt || "(unknown)"}
- External attendees: ${attendees}
- Primary external attendee to address: ${primary}

EXTRA CONTEXT from the user (urgency reason / what's new; may be empty):
"""
${extraContext || "(none)"}
"""

FULL TRANSCRIPT (Name: text, one line per turn):
"""
${cappedTranscript || "(no transcript available)"}
"""${truncatedNote}

Produce the follow-up now. Output VALID JSON only: {"to","subject","html"}.`;
}

// ---------------------------------------------------------------------------
// Defensive JSON parse: strip markdown fences, extract the outermost braces.
// ---------------------------------------------------------------------------
function parseModelJson(text: string): Draft {
  if (!text) throw new Error("Empty response from the model.");
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  let obj: { to?: string; subject?: string; html?: string };
  try {
    obj = JSON.parse(t);
  } catch {
    throw new Error("The model did not return valid JSON. Try Re-draft.");
  }
  if (typeof obj.html !== "string") throw new Error('Model response missing an "html" field.');
  return {
    to: obj.to || "",
    subject: obj.subject || "",
    html: obj.html || "",
    needsAttention: false,
  };
}

function hasFillMarkers(html: string | undefined): boolean {
  return /\[FILL:/i.test(html || "");
}

// ---------------------------------------------------------------------------
// Orchestrator: profile + call + transcript -> parsed draft.
// ---------------------------------------------------------------------------
export async function generateDraft({
  profile,
  templateId,
  call,
  transcript,
  extraContext,
}: {
  profile: Profile;
  templateId: TemplateId;
  call: Call;
  transcript: string;
  extraContext?: string;
}): Promise<Draft> {
  const userMessage = buildUserMessage({ profile, templateId, call, transcript, extraContext });

  let text: string;
  try {
    const response = await anthropic.messages.create({
      model: followupConfig.ANTHROPIC_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (e) {
    const err = e as Error & { status?: number };
    let hint = "";
    if (err.status === 401) hint = " Check ANTHROPIC_API_KEY.";
    else if (err.status === 429) hint = " Anthropic rate limit hit, wait a moment and retry.";
    throw new Error(`Anthropic API error.${hint} (${err.message})`);
  }

  const draft = parseModelJson(text);
  if (!draft.to && call.primaryAttendee && call.primaryAttendee.email) {
    draft.to = call.primaryAttendee.email;
  }
  draft.needsAttention = hasFillMarkers(draft.html) || hasFillMarkers(draft.subject);
  return draft;
}
