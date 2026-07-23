// The three shipped default templates + the AI drafting contract.
// Templates are complete, realistic example emails written in a sharp founder
// voice, generic for any B2B service business. NO EM DASHES anywhere.

import { TEMPLATE_IDS, type TemplateId, type TemplateMeta } from "./followup-types";

export { TEMPLATE_IDS };

export const TEMPLATE_META: TemplateMeta[] = [
  {
    id: TEMPLATE_IDS.POST_MEETING,
    name: "Post-Meeting Follow-Up",
    autopilot: true,
    blurb: "Sent after every call. This is the one Autopilot drafts automatically.",
  },
  {
    id: TEMPLATE_IDS.URGENCY,
    name: "Urgency / Deadline Reminder",
    autopilot: false,
    blurb: 'Manual. A deadline or scarcity nudge. Needs your context on the "why now".',
  },
  {
    id: TEMPLATE_IDS.REENGAGEMENT,
    name: "Re-Engagement",
    autopilot: false,
    blurb: "Manual. Reopens a conversation that went quiet, with something new.",
  },
];

const DEFAULT_TEMPLATES: Record<TemplateId, string> = {
  [TEMPLATE_IDS.POST_MEETING]: `SUBJECT: {{first_name}}, recap + next steps from our call

Hi {{first_name}},

Really enjoyed the conversation, and it was great to hear how you are thinking about growing the {{their team or business area}} side of things this year.

Quick recap of what we covered:

- The main goal you are focused on and why it matters right now
- The specific challenge you mentioned that is slowing that down
- What we agreed a good first 90 days would look like together

Based on what you described, the option I would point you to is our growth package, which lines up almost exactly with where you want to take this. Happy to walk through the numbers whenever you are ready.

You can see the full breakdown in the prospectus here, it covers scope, timeline, and what is included.

I would suggest we lock in a short kickoff call in the next week or so to map the first steps. Grab whatever time works for you here.

Best,
{{sender_name}}`,

  [TEMPLATE_IDS.URGENCY]: `SUBJECT: {{first_name}}, closing enrollment this Friday on the growth package

Hi {{first_name}},

Following up on our conversation last week about getting your pipeline built out before the busy season.

We are closing this quarter's onboarding on Friday, so this is the last window to start before the next cohort in three months.

Given your goal of hitting the ground running in Q1, starting now is what actually makes that timeline realistic.

If you want to hold your spot, you can confirm here and I will get the paperwork over the same day.

Best,
{{sender_name}}`,

  [TEMPLATE_IDS.REENGAGEMENT]: `SUBJECT: Picking this back up, {{first_name}}

Hi {{first_name}},

Last time we spoke you were weighing whether to build the outbound engine in house or bring in a partner to run it for you.

Since then we shipped a new case study with a company almost exactly your size that went from a standing start to twelve booked calls a month in the first quarter, thought it might be useful context.

Worth a quick 15 minutes to see if the timing makes more sense now? You can grab a slot here.

Best,
{{sender_name}}`,
};

// The system prompt, embedded verbatim per the source app's build brief §4.
export const SYSTEM_PROMPT = `You are the Zunesty Follow-Up Agent. You draft sales follow-up emails from real call transcripts.

The user has provided a TEMPLATE EMAIL: a real email in their own voice. Your job is to reproduce that email's structure, tone, length, formatting, greeting style, and sign-off as closely as possible, replacing its specifics (names, recap points, offers, dates) with the correct specifics from THIS call's transcript and the provided settings. You are mimicking their writing, not composing your own.

HARD RULES:
1. Mirror the template email exactly: same paragraph count and order, same approximate length, same style of subject line. Do not add paragraphs, postscripts, or extra CTAs that the template does not have.
2. Every fact must come from the transcript or the provided settings. NEVER invent names, numbers, dates, results, or pricing. Pricing may only come from the pricing settings.
3. If required information is missing, insert [FILL: what's needed] instead of guessing.
4. All links must be HTML hyperlinks: <a href="URL">natural anchor text</a>. Never paste a bare URL in the visible text. Only the provided context links and booking link may be used as hrefs.
5. Write in the user's voice as shown in the template. If the template breaks a "best practice," follow the template anyway. Avoid em dashes; the user does not write with them, so use commas, periods, or parentheses instead.
6. Address the primary EXTERNAL attendee (not the sender's teammates).
7. Output VALID JSON only, no markdown fences: {"to": "recipient email", "subject": "...", "html": "email body as clean HTML using <p>, <ul>/<li>, <a>, <br> only, no inline styles, no <html>/<body> wrapper"}.`;

export function defaultTemplates(): Record<TemplateId, string> {
  return { ...DEFAULT_TEMPLATES };
}
