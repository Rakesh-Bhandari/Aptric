import type { Badge, Difficulty, Outcome } from '@/lib/types';

/** One answered question, for the session summary. */
export interface SessionItem {
  questionId: string;
  subtopicId: string | null;
  subtopic: string;
  difficulty: Difficulty;
  outcome: Outcome;
  xp: number;
  timeMs: number | null;
}

export interface SessionSummaryData {
  kind: 'daily' | 'practice' | 'contest';
  title: string;
  items: SessionItem[];
  /** Where "Keep practising" goes (practice sessions). */
  againHref?: string;
  dailySetId?: string | null;
  leveledUpTo?: number | null;
  newBadges?: Badge[];
  ratingChange?: { before: number; after: number; delta: number } | null;
  streak?: number | null;
  bonusXp?: number;
  contestId?: string;
}

const KEY = 'aptric.lastSession';

export const saveSummary = (data: SessionSummaryData) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* summary still arrives via router state */
  }
};

export const loadSummary = (): SessionSummaryData | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionSummaryData) : null;
  } catch {
    return null;
  }
};

export const outcomeOf = (r: { isCorrect: boolean; usedHint: boolean; gaveUp: boolean }): Outcome =>
  r.isCorrect ? (r.usedHint ? 'hinted' : 'correct') : r.gaveUp ? 'gave_up' : 'wrong';
