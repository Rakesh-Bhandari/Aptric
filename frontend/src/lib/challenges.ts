import { formatClock } from './format';
import type { Challenge, ChallengeSide } from './types';

// Wording and rules for 1v1 challenges. The server decides every result; these only describe it.

/** "8/10 in 4:12": what the opponent has to beat. */
export const formatTarget = (score: number, total: number, timeMs: number) => `${score}/${total} in ${formatClock(timeMs)}`;

export type Outcome = 'won' | 'lost' | 'draw';

/** How it ended for the person looking, or null while it is still open (or if they are only a viewer). */
export const outcomeFor = (c: Pick<Challenge, 'result' | 'role'>): Outcome | null => {
  if (!c.result || c.role === 'viewer') return null;
  if (c.result.winner === 'draw') return 'draw';
  return c.result.winner === c.role ? 'won' : 'lost';
};

export const OUTCOME_TITLE: Record<Outcome, string> = { won: 'You won!', lost: 'You lost this one', draw: "It's a draw" };

/** The first thing that separates two results: correct answers, then time, then hints. */
export type Decider = 'score' | 'time' | 'hints' | 'none';

export const decidedBy = (a: ChallengeSide, b: ChallengeSide): Decider => {
  if (a.score !== b.score) return 'score';
  if (a.time_ms !== b.time_ms) return 'time';
  if (a.hints !== b.hints) return 'hints';
  return 'none';
};

export const DECIDER_TEXT: Record<Decider, string> = {
  score: 'More correct answers wins.',
  time: 'Same score, so the faster time wins.',
  hints: 'Same score and time, so fewer hints wins.',
  none: 'Same score, time and hints.',
};

/** One line for a challenge in a list, from your side. */
export const headline = (c: Pick<Challenge, 'role' | 'challenger' | 'opponent' | 'target' | 'status' | 'draft' | 'result'>): string => {
  const them = c.role === 'challenger' ? c.opponent : c.challenger;
  const name = them ? `@${them.handle}` : 'anyone with the link';
  if (c.draft) return 'Play your set first, then it is sent';
  if (c.status === 'completed') {
    const o = outcomeFor(c);
    return o === 'won' ? `You beat ${name}` : o === 'lost' ? `${name} beat you` : `A draw with ${name}`;
  }
  if (c.status === 'declined') return c.role === 'challenger' ? `${name} declined` : `You declined ${name}`;
  if (c.status === 'expired') return `Expired${them ? ` (${name})` : ''}`;
  if (c.status === 'cancelled') return 'Cancelled';
  if (c.role === 'challenger') return c.status === 'accepted' ? `${name} is playing` : `Waiting for ${name}`;
  return c.target ? `${name} challenged you: beat ${c.target.score}/${c.target.total}` : `${name} challenged you`;
};

/** Milliseconds a player has left to act (accept, or finish), on the server's clock; null when nothing is open. */
export const timeToAct = (c: Pick<Challenge, 'status' | 'accept_by' | 'complete_by' | 'my_run'>, now: number, skew = 0): number | null => {
  const at = c.status === 'pending' ? c.accept_by : c.status === 'accepted' && c.my_run && !c.my_run.finished_at ? c.my_run.deadline_at : null;
  return at ? Date.parse(at) - (now + skew) : null;
};

/** Share link for a challenge. */
export const challengeLink = (token: string, origin = window.location.origin) => `${origin}/c/${token}`;

/** "Beat my score: 8/10 in 4:12": the message that goes with the link. */
export const shareMessage = (c: Pick<Challenge, 'target' | 'question_count'>) =>
  c.target ? `Beat my score on Aptric: ${formatTarget(c.target.score, c.target.total, c.target.time_ms)}` : 'Challenge me on Aptric';
