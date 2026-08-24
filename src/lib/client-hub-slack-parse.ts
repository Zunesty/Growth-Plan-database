// Shared parsing helpers for Slack slash commands and @mentions — the
// source app duplicated these across commands.js/mentions.js; consolidated
// here instead.

import { todayPacific } from "./client-hub-config";
import type { TeamMember } from "./client-hub-types";

// Loose fuzzy match: normalize (lowercase, strip non-alphanumerics) and
// check substring containment either direction. Good enough for "revx",
// "natural", "geisel" style partial names — same tolerance as the source.
export function fuzzyFindByName<T extends { id: number; name: string }>(query: string, list: T[]): T | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const q = norm(query);
  if (!q) return null;
  const exact = list.find((item) => norm(item.name) === q);
  if (exact) return exact;
  const partial = list.filter((item) => norm(item.name).includes(q) || q.includes(norm(item.name)));
  return partial[0] || null;
}

// Scans tokens right-to-left for `<@U123|name>`, `<@U123>`, or `@name`
// forms, fuzzy-matches against the team roster, and removes the matched
// token from the array in place (mirrors the source's splice-as-side-effect
// approach, used identically for slash commands and @mentions).
export function extractAssignee(tokens: string[], team: TeamMember[]): TeamMember | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    const slackMention = tok.match(/^<@([A-Z0-9]+)(?:\|([^>]+))?>$/i);
    if (slackMention) {
      const [, userId, displayName] = slackMention;
      const bySlackId = team.find((t) => t.slack_user_id === userId);
      const match = bySlackId || (displayName ? fuzzyFindByName(displayName, team) : null);
      if (match) {
        tokens.splice(i, 1);
        return match;
      }
    }
    if (tok.startsWith("@") && tok.length > 1) {
      const match = fuzzyFindByName(tok.slice(1), team);
      if (match) {
        tokens.splice(i, 1);
        return match;
      }
    }
  }
  return null;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Parses `due:<fri|today|8/2|+3d>` style tokens into a "YYYY-MM-DD" string.
export function parseDueToken(raw: string): string | null {
  const value = raw.toLowerCase().trim();
  const today = new Date(`${todayPacific()}T00:00:00`);

  if (value === "today") return todayPacific();

  const relDays = value.match(/^\+(\d+)d$/);
  if (relDays) {
    const d = new Date(today);
    d.setDate(d.getDate() + Number(relDays[1]));
    return d.toISOString().slice(0, 10);
  }

  const weekdayIdx = WEEKDAYS.indexOf(value.slice(0, 3));
  if (weekdayIdx !== -1) {
    const d = new Date(today);
    const todayIdx = d.getDay();
    let delta = weekdayIdx - todayIdx;
    if (delta <= 0) delta += 7; // next occurrence, not today, matching "due:fri" meaning "this coming Friday"
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  const dateMatch = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dateMatch) {
    const [, mStr, dStr, yStr] = dateMatch;
    const month = Number(mStr);
    const day = Number(dStr);
    let year = yStr ? Number(yStr) : today.getFullYear();
    if (yStr && yStr.length === 2) year += 2000;
    let candidate = new Date(year, month - 1, day);
    if (!yStr && candidate < today) candidate = new Date(year + 1, month - 1, day);
    return candidate.toISOString().slice(0, 10);
  }

  return null;
}

// Scans tokens for a `due:...` entry, removes it, and returns the parsed
// date (or null if absent/unparseable).
export function extractDue(tokens: string[]): string | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].toLowerCase().startsWith("due:")) {
      const [, raw] = tokens[i].split(/:(.+)/);
      tokens.splice(i, 1);
      return raw ? parseDueToken(raw) : null;
    }
  }
  return null;
}
