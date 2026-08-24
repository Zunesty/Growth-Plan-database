// Client Hub — shared config + Pacific-time helpers. The 3 cron jobs (and
// "stale"/"stalled" badges) are all defined in Pacific time in the source
// app; Vercel functions run in UTC, so every "what is today" comparison
// needs to go through these instead of `new Date()` directly.

export const clientHubConfig = {
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
};

const PACIFIC_TZ = "America/Los_Angeles";

// "YYYY-MM-DD" for the current date in Pacific time.
export function todayPacific(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(new Date());
}

// Whole days between a stored date/timestamp string and "now", both
// evaluated in Pacific time. Positive = in the past.
export function daysAgoPacific(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  const then = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  const todayStr = todayPacific();
  const today = new Date(`${todayStr}T00:00:00`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((today.getTime() - then.getTime()) / msPerDay);
}
