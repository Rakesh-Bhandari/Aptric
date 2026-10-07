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

/** 1v1 challenges: the lists, one challenge, and the share link. */
export const CHALLENGES_PATH = '/challenges';
export const challengeHref = (id: string) => `/challenges/${id}`;

/** Private leagues: the hub, one league, and the invite link (/leagues/join?code=...). */
export const LEAGUES_PATH = '/leagues';
export const leagueHref = (slug: string) => `/leagues/${slug}`;
export const inviteHref = (code: string, origin = window.location.origin) => `${origin}/leagues/join?code=${code}`;

/** Hosting a contest: the hub, a new contest, one contest of yours. Playing one is the ordinary contest page. */
export const HOST_PATH = '/compete/host';
export const hostContestHref = (id: string) => `${HOST_PATH}/${id}`;
export const contestHref = (id: string) => `/compete/contests/${id}`;
/** The link a host shares: unlisted contests are reachable by it. */
export const contestShareHref = (id: string, origin = window.location.origin) => `${origin}${contestHref(id)}`;
