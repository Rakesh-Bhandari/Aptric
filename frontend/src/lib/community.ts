import type { ActivityItem, FollowStatus, Relationship, UserCard } from './types';

// Pure helpers for the follow / friends screens: wording, and how a follow result
// changes the data already on screen (the optimistic update and its settled state).

/** The relationship after a follow, unfollow or request result. */
export const relationshipAfter = (rel: Relationship, status: FollowStatus): Relationship => {
  switch (status) {
    case 'following': return { ...rel, following: true, requested: false, friend: rel.followed_by };
    case 'requested': return { ...rel, following: false, requested: true, friend: false };
    default: return { ...rel, following: false, requested: false, friend: false };
  }
};

/** What pressing the button does to someone you relate to this way (a private account asks first). */
export const predictFollow = (rel: Relationship, isPrivate: boolean): FollowStatus => {
  if (rel.following || rel.requested) return 'none';
  return isPrivate ? 'requested' : 'following';
};

export type FollowLabel = 'Follow' | 'Follow back' | 'Following' | 'Requested' | 'Friends';

export const followLabel = (rel: Relationship): FollowLabel => {
  if (rel.friend) return 'Friends';
  if (rel.following) return 'Following';
  if (rel.requested) return 'Requested';
  return rel.followed_by ? 'Follow back' : 'Follow';
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const sameHandle = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

const patchCard = <T extends { handle: string | null; relationship?: Relationship }>(card: T, handle: string, status: FollowStatus): T =>
  sameHandle(card.handle, handle) && card.relationship ? { ...card, relationship: relationshipAfter(card.relationship, status) } : card;

/**
 * Applies a follow result for `handle` to one cached query result, whatever its shape:
 * a player profile, a page of people (also inside an infinite query), an activity page,
 * or a leaderboard. Returns the same object when nothing in it concerns that handle.
 */
export const withFollowStatus = (data: unknown, handle: string, status: FollowStatus): unknown => {
  if (!isObject(data)) return data;

  if (Array.isArray(data.pages)) {
    const pages = data.pages.map((p) => withFollowStatus(p, handle, status));
    return pages.every((p, i) => p === (data.pages as unknown[])[i]) ? data : { ...data, pages };
  }

  // Player profile
  if (isObject(data.relationship) && 'follower_count' in data && sameHandle(data.handle, handle)) {
    const before = data.relationship as unknown as Relationship;
    const after = relationshipAfter(before, status);
    const delta = Number(after.following) - Number(before.following);
    return { ...data, relationship: after, follower_count: Math.max(0, Number(data.follower_count) + delta) };
  }

  // People pages and the activity feed
  if (Array.isArray(data.items)) {
    let changed = false;
    const items = (data.items as unknown[]).map((item) => {
      if (!isObject(item)) return item;
      let next: unknown = item;
      if (isObject(item.user)) {
        const before = item.user as unknown as UserCard;
        const user = patchCard(before, handle, status);
        if (user !== before) next = { ...item, user };
      } else {
        next = patchCard(item as unknown as UserCard, handle, status);
      }
      if (next !== item) changed = true;
      return next;
    });
    return changed ? { ...data, items } : data;
  }

  // Leaderboards and contest standings
  if (Array.isArray(data.entries)) {
    let changed = false;
    const entries = (data.entries as unknown[]).map((entry) => {
      if (!isObject(entry) || !sameHandle(entry.handle, handle) || !('rank' in entry)) return entry;
      changed = true;
      return { ...entry, following: status === 'following' };
    });
    return changed ? { ...data, entries } : data;
  }
  return data;
};

/** One line for the activity feed: "finished today's set (9/10)". Facts only; never user text. */
export const activityText = (item: Pick<ActivityItem, 'kind' | 'data'>): string => {
  const d = item.data;
  switch (item.kind) {
    case 'daily_set': {
      const total = Number(d.total);
      return total > 0 ? `finished today's set (${Number(d.correct)}/${total})` : "finished today's set";
    }
    case 'league_up': return `reached ${typeof d.name === 'string' ? `${d.name} league` : 'a new league'}`;
    case 'streak': return `reached a ${Number(d.days) || 0}-day streak`;
    case 'challenge_won': return 'won a challenge';
    default: return 'was active';
  }
};

/** A board entry's relationship to you. Boards only say whether you follow them. */
export const entryRelationship = (e: { following?: boolean }): Relationship => ({
  is_me: false, following: e.following === true, followed_by: false, friend: false, requested: false,
});
