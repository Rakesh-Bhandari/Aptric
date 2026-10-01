import type { Difficulty, PracticeMode } from './types';

/** URL for a practice session. */
export const practiceHref = (p: { subtopics?: string[]; difficulty?: Difficulty | null; mode?: PracticeMode; title?: string }) => {
  const q = new URLSearchParams();
  if (p.subtopics?.length) q.set('subtopics', p.subtopics.join(','));
  if (p.difficulty) q.set('difficulty', p.difficulty);
  if (p.mode === 'weak') q.set('mode', 'weak');
  if (p.title) q.set('title', p.title);
  return `/practice/session?${q}`;
};
