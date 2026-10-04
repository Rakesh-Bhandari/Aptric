import type { MockOptions } from './mockApi';

export interface RouteCase {
  /** File-name-safe label. */
  name: string;
  path: string;
  mock?: MockOptions;
  /** Part of the main set (before/after shots, axe). */
  main?: boolean;
}

/** Every route in src/App.tsx, with the mock state that renders it. */
export const ROUTES: RouteCase[] = [
  { name: 'landing', path: '/', mock: { signedIn: false }, main: true },
  { name: 'terms', path: '/terms', mock: { signedIn: false } },
  { name: 'auth-callback', path: '/auth/callback', mock: { signedIn: false } },
  { name: 'reset-password', path: '/auth/reset-password', mock: { signedIn: false } },
  { name: 'signed-out-gate', path: '/practice', mock: { signedIn: false } },
  { name: 'not-found', path: '/no-such-page' },
  { name: 'today', path: '/', main: true },
  { name: 'today-done', path: '/', mock: { answered: 10 } },
  { name: 'solve', path: '/solve/daily', main: true },
  { name: 'practice-session', path: '/practice/session?subtopics=st000' },
  { name: 'summary', path: '/session/summary?daily=ds-today', main: true },
  { name: 'practice', path: '/practice', main: true },
  { name: 'progress', path: '/progress', main: true },
  { name: 'compete', path: '/compete', main: true },
  { name: 'compete-promote', path: '/compete', mock: { leagueRank: 2 } },
  { name: 'compete-demote', path: '/compete', mock: { leagueRank: 11 } },
  { name: 'compete-leaderboards', path: '/compete?tab=leaderboards' },
  { name: 'compete-contests', path: '/compete?tab=contests' },
  { name: 'contest', path: '/compete/contests/c-live' },
  { name: 'contest-upcoming', path: '/compete/contests/c-up' },
  { name: 'contest-ended', path: '/compete/contests/c-old' },
  { name: 'profile', path: '/profile', main: true },
  { name: 'settings', path: '/settings', main: true },
  { name: 'public-profile', path: '/u/aarav_meht' },
  { name: 'onboarding', path: '/onboarding', mock: { profile: { handle: null, onboarded_at: null } } },
  { name: 'placement', path: '/onboarding/placement' },
  { name: 'admin-review', path: '/admin/review' },
  { name: 'admin-questions', path: '/admin/questions' },
  { name: 'admin-question', path: '/admin/questions/aq0' },
  { name: 'admin-users', path: '/admin/users' },
  { name: 'admin-user', path: '/admin/users/u1' },
  { name: 'admin-reports', path: '/admin/reports' },
  { name: 'admin-jobs', path: '/admin/jobs' },
  { name: 'admin-audit', path: '/admin/audit' },
  { name: 'styleguide', path: '/dev/styleguide' },
  { name: 'error-state', path: '/progress', mock: { failAll: true } },
  { name: 'loading-state', path: '/compete', mock: { hang: true } },
];

export const WIDTHS = [360, 390, 768, 1280] as const;
