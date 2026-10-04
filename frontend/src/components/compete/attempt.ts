import type { ContestViolation } from '@/lib/types';

/** What the player is told, by recorded reason. */
export const VIOLATION_TEXT: Record<ContestViolation, string> = {
  tab_hidden: 'you switched to another tab or minimised the window',
  window_blur: 'you switched to another window or app',
  fullscreen_exit: 'you exited fullscreen',
  page_left: 'the page was closed or reloaded',
};

// A violation is written down here before it is sent. If the page goes away before the server
// hears about it (reload, closed tab), the contest page sends it on the next visit.
const key = (contestId: string) => `aptric:contest-violation:${contestId}`;

export const pendingViolation = (contestId: string): ContestViolation | null => {
  try {
    const v = localStorage.getItem(key(contestId));
    return v && v in VIOLATION_TEXT ? (v as ContestViolation) : null;
  } catch {
    return null;
  }
};

export const setPendingViolation = (contestId: string, reason: ContestViolation) => {
  try {
    localStorage.setItem(key(contestId), reason);
  } catch {
    // Storage blocked: only a violation the server received can end the attempt.
  }
};

export const clearPendingViolation = (contestId: string) => {
  try {
    localStorage.removeItem(key(contestId));
  } catch {
    // nothing stored
  }
};
