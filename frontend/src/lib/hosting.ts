import type { ContestSummary, ContestVisibility, HostDraft, HostGate, HostQuota, HostReason, HostedStatus, ReviewState } from './types';

// Wording and small checks for hosting a contest. The rules that matter (who may host, the quota, the question
// bank, visibility, XP) are enforced in SQL; these only tell the person early and kindly.

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 30;
export const MIN_LEAD_MS = 60 * 60 * 1000;
export const MIN_DURATION_MS = 10 * 60 * 1000;
export const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const VISIBILITY_LABEL: Record<ContestVisibility, string> = {
  unlisted: 'Unlisted: only people with the link',
  group: 'League: members of one of your leagues',
  public: 'Public: listed for everyone after review',
};

export const VISIBILITY_SHORT: Record<ContestVisibility, string> = { unlisted: 'Unlisted', group: 'League', public: 'Public' };

export const VISIBILITY_HELP: Record<ContestVisibility, string> = {
  unlisted: 'Starts as soon as it is scheduled. Share the link; add an access code if you like.',
  group: 'Starts as soon as it is scheduled. Only members of the league can see it or enter. Earns XP when 5 or more players finish.',
  public: 'A moderator checks it before it appears in the contest list. Earns XP when 5 or more players finish.',
};

/** What is still missing, one plain sentence each. */
export const hostBlockers = (gate: HostGate): string[] =>
  gate.reasons.map((r: HostReason) => {
    switch (r) {
      case 'level': return `Reach level ${gate.min_level} (you are level ${gate.level}).`;
      case 'email': return 'Verify your email address.';
      case 'age': return `Your account must be ${gate.min_age_days} days old (it is ${gate.age_days}).`;
      case 'strikes': return 'No removed posts in the last 30 days.';
      case 'suspended': return 'Hosting is paused for 30 days after two strikes.';
      case 'banned': return 'This account cannot host.';
    }
  });

export const quotaText = (q: HostQuota) => `${q.used} of ${q.limit} contests used this month`;
export const quotaLeft = (q: HostQuota) => Math.max(q.limit - q.used, 0);

/** The label on a contest in the host's own list. */
export const hostedLabel = (c: Pick<ContestSummary, 'state'> & { status: HostedStatus; review_state: ReviewState; hidden: boolean }) => {
  if (c.status === 'draft') return 'Draft';
  if (c.status === 'cancelled') return 'Cancelled';
  if (c.hidden) return 'Hidden for review';
  if (c.review_state === 'pending') return 'Waiting for approval';
  if (c.review_state === 'rejected') return 'Not approved';
  if (c.state === 'live') return 'Live';
  if (c.state === 'ended') return 'Ended';
  return 'Scheduled';
};

/** <input type="datetime-local"> wants local time without a zone. */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (local: string) => {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

/** A new contest starts at the next quarter hour that is at least 2 hours away and lasts an hour. */
export const defaultWindow = (nowMs: number) => {
  const quarter = 15 * 60 * 1000;
  const start = Math.ceil((nowMs + 2 * 60 * 60 * 1000) / quarter) * quarter;
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(start + 60 * 60 * 1000).toISOString() };
};

export type DraftErrors = Partial<Record<'title' | 'description' | 'when' | 'questions' | 'group' | 'code' | 'players' | 'late', string>>;

/**
 * What would stop this draft being saved (and, with `publishing`, scheduled). The server checks again.
 * `maxPlayers` comes from the plan.
 */
export const validateDraft = (d: HostDraft, nowMs: number, maxPlayers: number, publishing = false): DraftErrors => {
  const e: DraftErrors = {};
  if (d.title.trim().length < 1 || d.title.trim().length > 120) e.title = 'Give it a title of up to 120 characters.';
  if (d.description.length > 1000) e.description = 'The description is at most 1000 characters.';
  const start = Date.parse(d.starts_at);
  const end = Date.parse(d.ends_at);
  if (Number.isNaN(start) || Number.isNaN(end)) e.when = 'Choose when it starts and ends.';
  else if (start < nowMs + MIN_LEAD_MS) e.when = 'Start at least an hour from now, so there is time to review it and remind players.';
  else if (end - start < MIN_DURATION_MS) e.when = 'A contest runs for at least 10 minutes.';
  else if (end - start > MAX_DURATION_MS) e.when = 'A contest runs for at most 7 days.';
  if (d.question_ids.length > MAX_QUESTIONS) e.questions = `A contest holds at most ${MAX_QUESTIONS} questions.`;
  else if (publishing && d.question_ids.length < MIN_QUESTIONS) e.questions = `Add at least ${MIN_QUESTIONS} questions.`;
  if (d.visibility === 'group' && !d.group_id) e.group = 'Choose the league this contest is for.';
  if (d.access_code && !/^[A-Za-z0-9]{4,24}$/.test(d.access_code)) e.code = 'An access code is 4 to 24 letters or digits.';
  if (d.max_participants !== null && (d.max_participants < 2 || d.max_participants > maxPlayers)) e.players = `Between 2 and ${maxPlayers} players on your plan.`;
  const minutes = Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.floor((end - start) / 60000);
  if (d.late_join_minutes < 0 || d.late_join_minutes > Math.min(1440, minutes)) e.late = 'Late entry is 0 minutes up to a day, and no longer than the contest.';
  return e;
};

/** "uses 2 questions you have seen before": only the host is ever told. */
export const seenWarning = (seen: number) =>
  seen > 0 ? `${seen === 1 ? '1 question is one' : `${seen} questions are ones`} you have answered before. You may know the answer${seen === 1 ? '' : 's'}.` : null;

/** The reason a contest earns no XP, or null when it does. */
export const noXpReason = (c: Pick<ContestSummary, 'visibility' | 'hosted'>) =>
  c.hosted && c.visibility === 'unlisted' ? 'Unlisted contests do not earn XP.' : null;

export const REPORT_LABEL = { spam: 'Spam', offensive: 'Offensive', cheating: 'Cheating or leaked questions', wrong_info: 'Misleading details', other: 'Something else' } as const;
