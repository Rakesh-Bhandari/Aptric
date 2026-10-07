import { describe, expect, it } from 'vitest';
import { activityText, followLabel, predictFollow, relationshipAfter, withFollowStatus } from './community';
import type { Relationship, UserCard } from './types';

const rel = (over: Partial<Relationship> = {}): Relationship => ({
  is_me: false, following: false, followed_by: false, friend: false, requested: false, ...over,
});
const card = (handle: string, over: Partial<Relationship> = {}): UserCard => ({
  handle, display_name: null, avatar_url: null, level: 3, current_streak: 2, is_private: false, league_tier: null, relationship: rel(over),
});

describe('relationship after a follow result', () => {
  it('follows, requests and unfollows', () => {
    expect(relationshipAfter(rel(), 'following')).toMatchObject({ following: true, requested: false, friend: false });
    expect(relationshipAfter(rel({ followed_by: true }), 'following').friend).toBe(true);
    expect(relationshipAfter(rel(), 'requested')).toMatchObject({ following: false, requested: true });
    expect(relationshipAfter(rel({ following: true, friend: true, followed_by: true }), 'none'))
      .toMatchObject({ following: false, friend: false, followed_by: true });
  });
  it('predicts the result of pressing the button', () => {
    expect(predictFollow(rel(), false)).toBe('following');
    expect(predictFollow(rel(), true)).toBe('requested');
    expect(predictFollow(rel({ following: true }), false)).toBe('none');
    expect(predictFollow(rel({ requested: true }), true)).toBe('none');
  });
  it('labels the button', () => {
    expect(followLabel(rel())).toBe('Follow');
    expect(followLabel(rel({ followed_by: true }))).toBe('Follow back');
    expect(followLabel(rel({ following: true }))).toBe('Following');
    expect(followLabel(rel({ requested: true }))).toBe('Requested');
    expect(followLabel(rel({ following: true, followed_by: true, friend: true }))).toBe('Friends');
  });
});

describe('withFollowStatus patches cached data', () => {
  it('a page of people, and infinite pages of them', () => {
    const page = { items: [card('asha'), card('ben')], next_cursor: null };
    const out = withFollowStatus(page, 'Asha', 'following') as typeof page;
    expect(out.items[0].relationship.following).toBe(true);
    expect(out.items[1]).toBe(page.items[1]);
    const infinite = { pages: [page, { items: [card('cat')], next_cursor: null }], pageParams: [null, 'x'] };
    const next = withFollowStatus(infinite, 'cat', 'requested') as typeof infinite;
    expect(next.pages[1].items[0].relationship.requested).toBe(true);
    expect(next.pages[0]).toBe(page);
  });
  it('the activity feed (users nested in items)', () => {
    const feed = { items: [{ id: 1, kind: 'streak', data: {}, created_at: 'x', user: card('asha') }], next_cursor: null };
    const out = withFollowStatus(feed, 'asha', 'following') as typeof feed;
    expect(out.items[0].user.relationship.following).toBe(true);
  });
  it('a profile keeps its follower count in step', () => {
    const profile = { handle: 'asha', follower_count: 4, relationship: rel() };
    const followed = withFollowStatus(profile, 'asha', 'following') as typeof profile;
    expect(followed.follower_count).toBe(5);
    expect((withFollowStatus(followed, 'asha', 'none') as typeof profile).follower_count).toBe(4);
    expect(((withFollowStatus(profile, 'asha', 'requested')) as typeof profile).follower_count).toBe(4);
  });
  it('leaderboard entries', () => {
    const board = { entries: [{ handle: 'asha', rank: 1, following: false }, { handle: 'me', rank: 2, following: false }] };
    const out = withFollowStatus(board, 'asha', 'following') as typeof board;
    expect(out.entries[0].following).toBe(true);
    expect(out.entries[1]).toBe(board.entries[1]);
  });
  it('leaves unrelated data alone (same reference)', () => {
    const page = { items: [card('ben')], next_cursor: null };
    expect(withFollowStatus(page, 'asha', 'following')).toBe(page);
    expect(withFollowStatus(null, 'asha', 'following')).toBe(null);
    const profile = { handle: 'ben', follower_count: 1, relationship: rel() };
    expect(withFollowStatus(profile, 'asha', 'following')).toBe(profile);
  });
});

describe('activity wording', () => {
  it('says what happened, from facts only', () => {
    expect(activityText({ kind: 'daily_set', data: { correct: 9, total: 10 } })).toBe("finished today's set (9/10)");
    expect(activityText({ kind: 'daily_set', data: {} })).toBe("finished today's set");
    expect(activityText({ kind: 'league_up', data: { name: 'Gold' } })).toBe('reached Gold league');
    expect(activityText({ kind: 'streak', data: { days: 7 } })).toBe('reached a 7-day streak');
    expect(activityText({ kind: 'streak', data: { days: 100 } })).toBe('reached a 100-day streak');
    expect(activityText({ kind: 'challenge_won', data: {} })).toBe('won a challenge');
  });
});
