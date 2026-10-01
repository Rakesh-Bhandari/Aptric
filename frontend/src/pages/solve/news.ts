import type { SolveQuestion } from '@/components/solve/SolveScreen';
import type { AnswerResult, Badge, QuestionCard } from '@/lib/types';

export const fromCard = (q: QuestionCard): SolveQuestion & { subtopicId: string } => ({
  id: q.id,
  stem: q.stem,
  difficulty: q.difficulty,
  est_seconds: q.est_seconds,
  section: q.section.name,
  topic: q.topic.name,
  subtopic: q.subtopic.name,
  subtopicId: q.subtopic.id,
  has_hint: q.has_hint,
  options: q.options,
});

/** Accumulates the `progress` news from each answer over a session. */
export interface SessionNews {
  leveledUpTo: number | null;
  newBadges: Badge[];
  ratingChange: { before: number; after: number; delta: number } | null;
  streak: number | null;
  bonusXp: number;
}

export const emptyNews = (): SessionNews => ({ leveledUpTo: null, newBadges: [], ratingChange: null, streak: null, bonusXp: 0 });

export const addNews = (news: SessionNews, r: AnswerResult): SessionNews => ({
  leveledUpTo: r.progress?.leveled_up ? r.progress.level : news.leveledUpTo,
  newBadges: [...news.newBadges, ...(r.progress?.new_badges ?? [])],
  ratingChange: r.progress?.rating_change ?? news.ratingChange,
  streak: r.current_streak ?? news.streak,
  bonusXp: news.bonusXp + (r.progress?.bonus_xp ?? 0),
});

