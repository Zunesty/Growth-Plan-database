// Demo mode — lets the entire UI be exercised with ZERO keys configured.
// A profile is treated as "demo" when it has no Fathom API key. In that state:
//   - listCalls returns the fixtures below
//   - getTranscriptFor returns a realistic sample transcript
//   - generate returns a canned, template-shaped draft (no Anthropic call)
//   - createDraftAndLog returns a fake draft id (no Gmail call)
// This makes the flow, hyperlinks, [FILL] markers, dedupe, and the Autopilot
// "simulate incoming call" path all testable instantly.

import { TEMPLATE_IDS } from "./followup-types";
import type { Call, Draft, Profile, TemplateId } from "./followup-types";

export function isDemoProfile(profile: Profile | null | undefined): boolean {
  return !profile || !profile.fathomKey;
}

// Two matching sample sales calls + one decoy (non-matching title) used to prove
// the webhook title filter ignores unrelated meetings.
export const SAMPLE_CALLS: Call[] = [
  {
    recordingId: "demo-rec-1001",
    title: "Sponsorship Sales Call with Meridian Athletics",
    createdAt: "2026-07-21T16:30:00Z",
    url: "https://fathom.video/calls/demo-1001",
    recordedBy: { name: "You", email: "you@yourcompany.com" },
    externalAttendees: [{ name: "Dana Whitfield", email: "dana@meridianathletics.com" }],
    primaryAttendee: { name: "Dana Whitfield", email: "dana@meridianathletics.com" },
    transcript: null,
  },
  {
    recordingId: "demo-rec-1002",
    title: "Sponsorship Sales Call, Northwind Coffee",
    createdAt: "2026-07-19T14:00:00Z",
    url: "https://fathom.video/calls/demo-1002",
    recordedBy: { name: "You", email: "you@yourcompany.com" },
    externalAttendees: [{ name: "Marcus Lee", email: "marcus@northwindcoffee.com" }],
    primaryAttendee: { name: "Marcus Lee", email: "marcus@northwindcoffee.com" },
    transcript: null,
  },
];

// Decoy: does NOT contain the sample event name, must be ignored by Autopilot.
export const DECOY_CALL: Call = {
  recordingId: "demo-rec-9999",
  title: "Weekly Team Standup",
  createdAt: "2026-07-21T09:00:00Z",
  url: "https://fathom.video/calls/demo-9999",
  recordedBy: { name: "You", email: "you@yourcompany.com" },
  externalAttendees: [],
  primaryAttendee: null,
  transcript: null,
};

const SAMPLE_TRANSCRIPTS: Record<string, string> = {
  "demo-rec-1001": [
    "You: Thanks for hopping on Dana. I know you have been trying to lock in sponsors for the fall season.",
    "Dana Whitfield: Yeah, exactly. Our biggest goal this year is filling the four home-game sponsorship slots before September, and honestly the outreach has been slower than we hoped.",
    "You: Got it. So the goal is those four slots by September, and the bottleneck is outbound. What have you tried so far?",
    "Dana Whitfield: Mostly cold email from our side, but we do not really have anyone dedicated to it. That is the piece that keeps stalling.",
    "You: That is exactly what our growth package is built for. We run the outbound engine end to end so your team does not have to.",
    "Dana Whitfield: That sounds like what we need. What does getting started look like?",
    "You: We would kick off with a short onboarding call to map your target sponsors, then we are live within a week. I will send over the prospectus so you can see the full scope.",
    "Dana Whitfield: Perfect, send that over and let us find a time next week.",
  ].join("\n"),
  "demo-rec-1002": [
    "You: Appreciate the time Marcus. You mentioned wanting to grow the wholesale side of Northwind.",
    "Marcus Lee: Right, we want to get our beans into more local cafes, but we have never really done structured outreach.",
    "You: Understood. So the goal is more wholesale accounts, and the gap is a repeatable outreach process.",
    "Marcus Lee: Exactly. I just do not know what a realistic number of new accounts per month even looks like.",
    "You: We can set that target together once we see your list. I would point you to our case study with a roaster your size.",
    "Marcus Lee: That would help. Let me loop in my co-founder and we will circle back.",
  ].join("\n"),
};

export function getSampleTranscript(recordingId: string): string {
  return SAMPLE_TRANSCRIPTS[recordingId] || "(no transcript available for this sample call)";
}

function firstName(attendee: Call["primaryAttendee"]): string {
  if (!attendee || !attendee.name) return "there";
  return attendee.name.split(/\s+/)[0];
}

function finalize(draft: Omit<Draft, "needsAttention">): Draft {
  const needsAttention = /\[FILL:/i.test(draft.html) || /\[FILL:/i.test(draft.subject);
  return { ...draft, needsAttention };
}

// Canned drafts, shaped like each template. demo-rec-1002 intentionally leaves a
// [FILL] marker (no pricing was set) so the amber "needs attention" path is visible.
export function cannedDraft({
  profile,
  templateId,
  call,
  extraContext,
}: {
  profile: Profile | null;
  templateId: TemplateId;
  call: Call;
  extraContext?: string;
}): Draft {
  const s = profile?.settings;
  const sender = s?.sender_name || "[FILL: sender name]";
  const fn = firstName(call.primaryAttendee);
  const to = call.primaryAttendee?.email || "";
  const bookingLink = s?.booking_link || "";
  const firstLink = (s?.context_links || []).find((l) => l && l.url);
  const linkHtml = firstLink
    ? `<a href="${firstLink.url}">${firstLink.label || "the details"}</a>`
    : "[FILL: add a context link in Settings]";
  const bookingHtml = bookingLink ? `<a href="${bookingLink}">grab a time here</a>` : "reply with a couple of times that work";

  if (templateId === TEMPLATE_IDS.URGENCY) {
    const reason = extraContext || "[FILL: urgency reason / deadline]";
    return finalize({
      to,
      subject: `${fn}, last window on the growth package`,
      html:
        `<p>Hi ${fn},</p>` +
        `<p>Following up on our conversation about locking in your sponsorship slots before the fall season.</p>` +
        `<p>${reason}</p>` +
        `<p>Given your goal of filling those slots by September, starting now is what keeps that timeline realistic.</p>` +
        `<p>If you want to hold your spot, ${bookingHtml}.</p>` +
        `<p>Best,<br>${sender}</p>`,
    });
  }

  if (templateId === TEMPLATE_IDS.REENGAGEMENT) {
    const news = extraContext || "[FILL: new proof point or update]";
    return finalize({
      to,
      subject: `Picking this back up, ${fn}`,
      html:
        `<p>Hi ${fn},</p>` +
        `<p>Last time we spoke you were weighing how to build out your outbound sponsorship process.</p>` +
        `<p>${news}</p>` +
        `<p>Worth a quick 15 minutes to see if the timing makes more sense now? You can ${bookingHtml}.</p>` +
        `<p>Best,<br>${sender}</p>`,
    });
  }

  // Post-meeting (default). demo-rec-1002 has no offer discussed -> point to a link.
  const isSecond = call.recordingId === "demo-rec-1002";
  const offerPara = isSecond
    ? `<p>Based on where you want to take the wholesale side, the option I would point you to is ${linkHtml}.</p>`
    : `<p>Based on what you described, the option I would point you to is our growth package, which lines up almost exactly with filling those four slots. Full scope is in ${linkHtml}.</p>`;

  return finalize({
    to,
    subject: `${fn}, recap + next steps from our call`,
    html:
      `<p>Hi ${fn},</p>` +
      `<p>Really enjoyed the conversation, and it was great to hear how you are thinking about growing this year.</p>` +
      `<p>Quick recap of what we covered:</p>` +
      `<ul>` +
      (isSecond
        ? `<li>Growing the wholesale side by getting Northwind beans into more local cafes</li>` +
          `<li>The gap: no repeatable outreach process in place yet</li>` +
          `<li>Setting a realistic monthly new-account target once we see your list</li>`
        : `<li>Filling all four home-game sponsorship slots before September</li>` +
          `<li>The bottleneck: outbound with no one dedicated to it</li>` +
          `<li>A first 90 days where we run the outbound engine end to end</li>`) +
      `</ul>` +
      offerPara +
      `<p>I would suggest a short kickoff call in the next week to map the first steps. You can ${bookingHtml}.</p>` +
      `<p>Best,<br>${sender}</p>`,
  });
}
