import type { Post, PostKind, Reaction } from './types';

export const KIND_LABEL: Record<PostKind, string> = { question: 'Question', tip: 'Tip', win: 'Win', study_buddy: 'Study buddy', poll: 'Poll' };

// Pure helpers for 48-hour posts: the countdown, the "gone" rule, and the Hot score
// (the same formula the server uses, so a test can pin them together).

export const POST_LIFE_MS = 48 * 3_600_000;
/** Under this much time left a post turns amber. */
export const URGENT_MS = 6 * 3_600_000;

/** The server's clock minus ours when the page loaded, so countdowns agree with the server. */
export const clockSkew = (serverNow: string | undefined, clientNow = Date.now()) => {
  const t = serverNow ? Date.parse(serverNow) : NaN;
  return Number.isFinite(t) ? t - clientNow : 0;
};

/** Milliseconds until `expiresAt`, on the server's clock. Zero or less means the post is gone. */
export const msLeft = (expiresAt: string, now: number, skew = 0) => Date.parse(expiresAt) - (now + skew);

export const isUrgent = (ms: number) => ms > 0 && ms < URGENT_MS;

/** "5h 12m", "42m", "<1m" (and "expired" at zero). Rounds down, so it never promises more time than there is. */
export const formatTimeLeft = (ms: number) => {
  if (ms <= 0) return 'expired';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return '<1m';
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
};

/**
 * Time left rounded down to a whole minute (30 s while under one): the countdown only changes once a
 * minute, so a card only needs to re-render then, not every second.
 */
export const quantizeMs = (ms: number) => (ms <= 0 ? 0 : ms < 60_000 ? 30_000 : Math.floor(ms / 60_000) * 60_000);

/** A screen-reader version: "expires in 5 hours 12 minutes". */
export const speakTimeLeft = (ms: number) => {
  if (ms <= 0) return 'expired';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'expires in less than a minute';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts = [h > 0 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '', h === 0 || m > 0 ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : ''].filter(Boolean);
  return `expires in ${parts.join(' ')}`;
};

/** Posts still alive on the server's clock: a card leaves the list the moment its time is up. */
export const livePosts = <T extends Pick<Post, 'expires_at'>>(posts: T[], now: number, skew = 0) =>
  posts.filter((p) => msLeft(p.expires_at, now, skew) > 0);

/** (likes + 2 * replies) / (age in hours + 2) ^ 1.5, as get_feed computes it. */
export const hotScore = (likes: number, replies: number, ageHours: number) =>
  (likes + 2 * replies) / Math.pow(Math.max(ageHours, 0) + 2, 1.5);

/** Orders posts the way the server does for a sort: New (newest first) or Hot. */
export const sortPosts = <T extends Pick<Post, 'id' | 'created_at' | 'like_count' | 'reply_count'>>(posts: T[], sort: 'new' | 'hot', now: number): T[] => {
  const age = (p: T) => (now - Date.parse(p.created_at)) / 3_600_000;
  const key = (p: T) => (sort === 'hot' ? hotScore(p.like_count, p.reply_count, age(p)) : Date.parse(p.created_at));
  return [...posts].sort((a, b) => key(b) - key(a) || (a.id < b.id ? 1 : -1));
};

/** Does this text look like it gives away an answer? The server decides; this only warns while typing. */
export const mentionsAnswer = (text: string) =>
  /(^|[^a-z0-9])(the\s+)?(correct\s+)?(answer|ans)\s*(is|are|:|=|->|-)/i.test(text)
  || /(^|[^a-z0-9])(option|choice|opt)\s*\(?[a-e]\)?([^a-z0-9]|$)/i.test(text)
  || /(^|\s)\([a-e]\)(\s|$|[.,!])/i.test(text);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Applies `change` to the post `id` wherever a cached query holds it: a page of the feed, pages of an
 * infinite feed, or a single { post }. Returns the same object when the post is not in it.
 */
export const withPostChange = (data: unknown, id: string, change: (p: Post) => Post): unknown => {
  if (!isObj(data)) return data;
  if (Array.isArray(data.pages)) {
    const pages = data.pages.map((p) => withPostChange(p, id, change));
    return pages.every((p, i) => p === (data.pages as unknown[])[i]) ? data : { ...data, pages };
  }
  if (Array.isArray(data.items)) {
    let changed = false;
    const items = (data.items as unknown[]).map((it) => {
      if (!isObj(it) || it.id !== id) return it;
      changed = true;
      return change(it as unknown as Post);
    });
    return changed ? { ...data, items } : data;
  }
  if (isObj(data.post) && data.post.id === id) return { ...data, post: change(data.post as unknown as Post) };
  return data;
};

/** One reaction per player: choosing the same one again takes it back; the count follows. */
export const withReaction = (p: Post, reaction: Reaction | null): Post => {
  const had = p.my_reaction !== null;
  const has = reaction !== null;
  return { ...p, my_reaction: reaction, like_count: Math.max(0, p.like_count + Number(has) - Number(had)) };
};

/** Removes a post from every cached page (after a delete, or when it expires). */
export const withoutPost = (data: unknown, id: string): unknown => {
  if (!isObj(data)) return data;
  if (Array.isArray(data.pages)) {
    const pages = data.pages.map((p) => withoutPost(p, id));
    return pages.every((p, i) => p === (data.pages as unknown[])[i]) ? data : { ...data, pages };
  }
  if (Array.isArray(data.items) && (data.items as { id?: unknown }[]).some((it) => it?.id === id)) {
    return { ...data, items: (data.items as { id?: unknown }[]).filter((it) => it?.id !== id) };
  }
  return data;
};
