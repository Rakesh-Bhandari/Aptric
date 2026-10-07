import { describe, expect, it } from 'vitest';
import type { Post } from './types';
import { withPostChange, withReaction, withoutPost } from './posts';
import { quantizeMs, clockSkew, formatTimeLeft, hotScore, isUrgent, livePosts, mentionsAnswer, msLeft, POST_LIFE_MS, sortPosts, speakTimeLeft } from './posts';

const H = 3_600_000;
const M = 60_000;

describe('countdown', () => {
  it('formats the time left, rounding down', () => {
    expect(formatTimeLeft(5 * H + 12 * M + 59_000)).toBe('5h 12m');
    expect(formatTimeLeft(47 * H + 59 * M)).toBe('47h 59m');
    expect(formatTimeLeft(2 * H)).toBe('2h 00m');
    expect(formatTimeLeft(42 * M + 1)).toBe('42m');
    expect(formatTimeLeft(59_999)).toBe('<1m');
    expect(formatTimeLeft(0)).toBe('expired');
    expect(formatTimeLeft(-5)).toBe('expired');
  });
  it('speaks it for screen readers', () => {
    expect(speakTimeLeft(5 * H + 12 * M)).toBe('expires in 5 hours 12 minutes');
    expect(speakTimeLeft(H)).toBe('expires in 1 hour');
    expect(speakTimeLeft(M)).toBe('expires in 1 minute');
    expect(speakTimeLeft(10_000)).toBe('expires in less than a minute');
    expect(speakTimeLeft(0)).toBe('expired');
  });
  it('turns amber under six hours, not before and not after expiry', () => {
    expect(isUrgent(6 * H)).toBe(false);
    expect(isUrgent(6 * H - 1)).toBe(true);
    expect(isUrgent(1)).toBe(true);
    expect(isUrgent(0)).toBe(false);
  });
  it('uses the server clock: a fast device does not drop posts early', () => {
    const skew = clockSkew('2026-10-06T12:00:00Z', Date.parse('2026-10-06T12:10:00Z')); // device runs 10 min ahead
    expect(skew).toBe(-10 * M);
    const expires = '2026-10-06T12:30:00Z';
    expect(msLeft(expires, Date.parse('2026-10-06T12:10:00Z'), skew)).toBe(30 * M);
    expect(clockSkew(undefined)).toBe(0);
    expect(clockSkew('nonsense')).toBe(0);
  });
  it('a post lives 48 hours', () => {
    expect(POST_LIFE_MS).toBe(48 * H);
  });
});

describe('quantizeMs', () => {
  it('changes once a minute and keeps the displayed time the same', () => {
    expect(quantizeMs(5 * H + 12 * M + 59_000)).toBe(5 * H + 12 * M);
    expect(formatTimeLeft(quantizeMs(5 * H + 12 * M + 59_000))).toBe(formatTimeLeft(5 * H + 12 * M + 59_000));
    expect(quantizeMs(59_999)).toBe(30_000);
    expect(formatTimeLeft(quantizeMs(59_999))).toBe('<1m');
    expect(quantizeMs(0)).toBe(0);
    expect(quantizeMs(-4)).toBe(0);
    expect(isUrgent(quantizeMs(6 * H - 1))).toBe(true);
  });
});

describe('expiry', () => {
  const posts = [{ expires_at: '2026-10-06T12:00:00Z', id: 'a' }, { expires_at: '2026-10-06T12:00:01Z', id: 'b' }];
  it('drops a card the moment its time is up', () => {
    const at = Date.parse('2026-10-06T12:00:00Z');
    expect(livePosts(posts, at - 1).map((p) => p.id)).toEqual(['a', 'b']);
    expect(livePosts(posts, at).map((p) => p.id)).toEqual(['b']);
    expect(livePosts(posts, at + 1000)).toEqual([]);
  });
});

describe('feed sorting', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');
  const post = (id: string, minsAgo: number, likes: number, replies: number) =>
    ({ id, created_at: new Date(now - minsAgo * M).toISOString(), like_count: likes, reply_count: replies });
  it('matches the server formula', () => {
    expect(hotScore(3, 0, 1)).toBeCloseTo(3 / Math.pow(3, 1.5), 10);
    expect(hotScore(1, 2, 0)).toBeCloseTo(5 / Math.pow(2, 1.5), 10);
    expect(hotScore(0, 0, 5)).toBe(0);
    expect(hotScore(1, 0, -3)).toBeCloseTo(1 / Math.pow(2, 1.5), 10); // never a negative age
  });
  it('New is newest first, ties by id', () => {
    const out = sortPosts([post('a', 60, 9, 9), post('b', 10, 0, 0), post('c', 10, 0, 0)], 'new', now);
    expect(out.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
  it('Hot lets activity beat age, and age decay beat old activity', () => {
    const loved = post('loved', 60, 3, 0);
    const fresh = post('fresh', 10, 0, 0);
    expect(sortPosts([fresh, loved], 'hot', now).map((p) => p.id)).toEqual(['loved', 'fresh']);
    const stale = post('stale', 40 * 60, 3, 0);
    expect(sortPosts([stale, post('newer', 30, 1, 0)], 'hot', now).map((p) => p.id)).toEqual(['newer', 'stale']);
  });
  it('replies count double', () => {
    expect(sortPosts([post('likes', 30, 2, 0), post('replies', 30, 0, 2)], 'hot', now).map((p) => p.id)).toEqual(['replies', 'likes']);
  });
});

describe('answer warning', () => {
  it('flags the cues the server flags', () => {
    expect(mentionsAnswer('the answer is 42')).toBe(true);
    expect(mentionsAnswer('Ans: B')).toBe(true);
    expect(mentionsAnswer('I picked option c')).toBe(true);
    expect(mentionsAnswer('so (b) it is.')).toBe(true);
    expect(mentionsAnswer('Stuck on the units, any hint?')).toBe(false);
    expect(mentionsAnswer('an answerable question')).toBe(false);
  });
});

describe('optimistic updates', () => {
  const post = (id: string, over: Partial<Post> = {}) => ({ id, like_count: 2, my_reaction: null, ...over }) as unknown as Post;
  it('reacting adds one like, changing it adds none, taking it back removes one', () => {
    expect(withReaction(post('a'), 'up')).toMatchObject({ my_reaction: 'up', like_count: 3 });
    expect(withReaction(post('a', { my_reaction: 'up', like_count: 3 }), 'fire')).toMatchObject({ my_reaction: 'fire', like_count: 3 });
    expect(withReaction(post('a', { my_reaction: 'up', like_count: 3 }), null)).toMatchObject({ my_reaction: null, like_count: 2 });
    expect(withReaction(post('a', { like_count: 0, my_reaction: 'up' }), null).like_count).toBe(0);
  });
  it('patches one post in a page, in infinite pages, and in a single { post }', () => {
    const page = { items: [post('a'), post('b')], next_cursor: null };
    const out = withPostChange(page, 'a', (p) => withReaction(p, 'idea')) as typeof page;
    expect(out.items[0].my_reaction).toBe('idea');
    expect(out.items[1]).toBe(page.items[1]);
    const infinite = { pages: [page, { items: [post('c')], next_cursor: null }], pageParams: [] };
    const next = withPostChange(infinite, 'c', (p) => withReaction(p, 'up')) as typeof infinite;
    expect(next.pages[1].items[0].like_count).toBe(3);
    expect(next.pages[0]).toBe(page);
    const single = { post: post('a'), server_now: 'x' };
    expect((withPostChange(single, 'a', (p) => withReaction(p, 'up')) as typeof single).post.like_count).toBe(3);
    expect(withPostChange(page, 'zzz', (p) => p)).toBe(page);
  });
  it('removes a post from every page', () => {
    const infinite = { pages: [{ items: [post('a'), post('b')] }, { items: [post('c')] }], pageParams: [] };
    const out = withoutPost(infinite, 'b') as typeof infinite;
    expect(out.pages[0].items.map((p) => p.id)).toEqual(['a']);
    expect(out.pages[1]).toBe(infinite.pages[1]);
    expect(withoutPost(infinite, 'zzz')).toBe(infinite);
  });
});
