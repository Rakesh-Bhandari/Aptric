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

/** Account and preferences page. */
export const SETTINGS_PATH = '/settings';

/** Friends: activity, following, followers and follow requests. */
export const FRIENDS_PATH = '/friends';

/** Someone's followers or the people they follow. */
export const followListHref = (handle: string, list: 'followers' | 'following') => `/u/${handle}/${list}`;

/** 48-hour community posts. */
export const COMMUNITY_PATH = '/community';

/** The post composer, opened on a question you solved (spoiler-safe: the post links to it, never reveals it). */
export const discussHref = (questionId: string) => `${COMMUNITY_PATH}?compose=1&question=${encodeURIComponent(questionId)}`;
