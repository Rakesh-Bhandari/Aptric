import type { AttemptContext, Difficulty, MyLeague } from './types';

// Mirrors private.score_points in supabase/migrations/*_gameplay_rpcs.sql so
// the UI can show what a question is worth and what a hint costs. The server
// is still the only thing that awards points.
export const BASE_POINTS: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 30 };
export const HINT_PENALTY = 5;

export const pointsFor = (difficulty: Difficulty, context: AttemptContext, usedHint = false): number => {
  if (context === 'assessment') return 0;
  const raw = Math.max(0, BASE_POINTS[difficulty] - (usedHint ? HINT_PENALTY : 0));
  return context === 'practice' ? Math.floor(raw / 2) : raw;
};

/** XP a hint costs on this question (practice halves points, so it costs less there). */
export const hintCost = (difficulty: Difficulty, context: AttemptContext): number =>
  pointsFor(difficulty, context) - pointsFor(difficulty, context, true);

/** Contest scoring (submit_contest_answer). */
export const contestPoints = (difficulty: Difficulty) => BASE_POINTS[difficulty];

/** Total XP needed to reach a level: 50·L·(L−1) (private.level_xp). */
export const levelXp = (level: number) => 50 * Math.max(level, 1) * (Math.max(level, 1) - 1);

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export const OPTION_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Where a rank sits in this week's league: moving up, safe, or moving down. */
export const leagueZone = (league: MyLeague, rank: number) => {
  const n = league.members.length;
  if (league.promote_zone > 0 && rank <= league.promote_zone) return 'promote' as const;
  if (league.demote_zone > 0 && rank > n - league.demote_zone) return 'demote' as const;
  return 'safe' as const;
};

export const HANDLE_RE = /^[a-z0-9_]{3,24}$/;
export const DAILY_TARGETS = [5, 10, 20, 30];
