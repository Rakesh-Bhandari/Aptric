import type { Group, GroupJoinMode, GroupKind, GroupRole, GroupWindow } from './types';

// Wording and small rules for private leagues. Every rule that matters (scores, limits, who may join) is in SQL.

export const KIND_LABEL: Record<GroupKind, string> = { college: 'College', batch: 'Batch', friends: 'Friends', coaching: 'Coaching class' };

export const JOIN_LABEL: Record<GroupJoinMode, string> = {
  invite_code: 'Anyone with the invite link',
  approval: 'An admin approves each request',
  email_domain: 'Verified email on one domain',
};

export const WINDOW_LABEL: Record<GroupWindow, string> = {
  weekly: 'This week', monthly: 'This month', season: 'Season', all_time: 'All time', custom: 'Custom',
};

/** The windows to offer: a season only when the league has one. */
export const windowsFor = (g: Pick<Group, 'season_start'>): GroupWindow[] =>
  (['weekly', 'monthly', ...(g.season_start ? ['season' as const] : []), 'all_time', 'custom'] as GroupWindow[]);

/** Owner and admins run a league. */
export const canManage = (role: GroupRole | null | undefined) => role === 'owner' || role === 'admin';

/** "+2" / "−1" / "–" for the change in rank since the window before. */
export const rankDeltaText = (delta: number | null) => {
  if (delta === null) return '';
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '–';
};

/** Spoken: "up 2 places", "down 1 place", "no change". */
export const rankDeltaSpeech = (delta: number | null) => {
  if (delta === null) return 'no earlier result to compare';
  if (delta === 0) return 'no change in rank';
  return `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'place' : 'places'}`;
};

/** Whether a custom range is allowed (up to 93 days, in order). */
export const validRange = (from: string, to: string) => {
  const a = Date.parse(from);
  const b = Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a && (b - a) / 86_400_000 <= 92;
};

/** A league code as typed from a link or by hand: letters and digits, any case, spaces dropped. */
export const cleanCode = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
export const isCode = (raw: string) => /^[a-z0-9]{10}$/.test(cleanCode(raw));

/** The code in a pasted link ("…/leagues/join?code=abc…") or the text itself. */
export const codeFromInput = (raw: string) => {
  try {
    const code = new URL(raw.trim()).searchParams.get('code');
    if (code) return cleanCode(code);
  } catch {
    /* not a URL */
  }
  return cleanCode(raw);
};

/** "42 of 300 members". */
export const memberText = (g: Pick<Group, 'member_count' | 'max_members'>) => `${g.member_count.toLocaleString()} of ${g.max_members.toLocaleString()} members`;

/** The league is not taking new members. */
export const isFull = (g: Pick<Group, 'member_count' | 'max_members' | 'is_archived'>) => g.is_archived || g.member_count >= g.max_members;

/** Saves text as a file in the browser (the CSV export). */
export const downloadText = (filename: string, text: string, type = 'text/csv') => {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
