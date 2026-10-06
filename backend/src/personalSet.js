// Personal daily sets. selectQuestions() is the pure part (same inputs, same
// set); ensurePersonalSet() reads the player and the question bank, picks, and
// stores the result as a daily_sets row owned by the player (migration
// 20261008000001), which is what makes refreshes return the same set.
// private.today_set_for() prefers that row and falls back to the shared set.

import { query } from './db.js';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const RANK = { easy: 0, medium: 1, hard: 2 };
const PREFERRED_WEIGHT = 3;
const REUSE_WINDOW_DAYS = 60;
const POOL_TTL_MS = 10 * 60 * 1000;
const BAND_TTL_MS = 10 * 60 * 1000;
const COHORT_TTL_MS = 30 * 60 * 1000;
const COHORT_MAX_ENTRIES = 500;
// A shared (cohort) set is skipped for a player when more than this share of it is
// something they had in the last REUSE_WINDOW_DAYS; they get their own pick instead.
const COHORT_MAX_OVERLAP = 0.3;

// Small TTL cache ---------------------------------------------------------------

/**
 * Caches async results by key for ttlMs. Concurrent callers for the same key share
 * one in-flight call (so a burst at local midnight costs one query, not one per
 * player), and a failed call is not cached. `now` is injectable for tests.
 */
export function ttlCache(ttlMs, { max = Infinity, now = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expires > now()) return hit.value;
      const value = Promise.resolve().then(load);
      entries.set(key, { value, expires: now() + ttlMs });
      value.catch(() => entries.get(key)?.value === value && entries.delete(key));
      if (entries.size > max) {
        for (const [k, e] of entries) if (e.expires <= now() || entries.size > max) entries.delete(k);
      }
      return value;
    },
    clear: () => entries.clear(),
  };
}

const poolCache = ttlCache(POOL_TTL_MS);
const bandCache = ttlCache(BAND_TTL_MS);
const cohortCache = ttlCache(COHORT_TTL_MS, { max: COHORT_MAX_ENTRIES });

/** Test hook: forget everything cached. */
export function resetPersonalSetCaches() {
  poolCache.clear();
  bandCache.clear();
  cohortCache.clear();
}

/** Share of `ids` found in `recent` (0 for an empty set). */
export function overlapShare(ids, recent) {
  if (!ids.length) return 0;
  const seen = new Set(recent);
  return ids.filter((id) => seen.has(id)).length / ids.length;
}

// Seeded randomness -------------------------------------------------------------

/** 32-bit FNV-1a. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator returning floats in [0, 1). */
export function seededRandom(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Difficulty ----------------------------------------------------------------------

/**
 * The level band's mix, made harder by league: a player in the top league gets
 * two questions moved up a notch, one in the middle gets one, and Bronze keeps
 * the band as is. Each step turns an easy into a medium, or (with no easy left)
 * a medium into a hard.
 */
export function difficultyMix(band, tier = 1, tierCount = 1) {
  const mix = { easy: band.easy_count, medium: band.medium_count, hard: band.hard_count };
  const steps = tierCount > 1 ? Math.floor(((Math.max(tier, 1) - 1) * 2) / (tierCount - 1)) : 0;
  for (let i = 0; i < Math.min(steps, 2); i++) {
    if (mix.easy > 0) { mix.easy--; mix.medium++; } else if (mix.medium > 0) { mix.medium--; mix.hard++; }
  }
  return mix;
}

/** Whether score tuple a sorts before b. */
const lexLess = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

// Selection -----------------------------------------------------------------------

/**
 * Picks the questions for one player and day.
 *
 * pool:   [{ id, section_id, topic_id, difficulty }] published, playable questions
 * recent: question ids the player already had lately (avoided while there is enough else)
 * Returns { ids, relaxed }; ids run easy to hard. `relaxed` is true when the
 * exclusions left nothing and were ignored so the set is never empty.
 *
 * Excluded topics are never used unless that would leave no question at all.
 * Preferred topics are three times as likely to be picked. A slot takes the
 * question closest to its difficulty, then from the section used least so far.
 */
export function selectQuestions({ seed, mix, pool, preferred = [], excluded = [], recent = [] }) {
  const slots = DIFFICULTIES.flatMap((d) => Array(Math.max(mix[d] ?? 0, 0)).fill(d));
  const skip = new Set(excluded);
  let candidates = pool.filter((q) => !skip.has(q.topic_id));
  const relaxed = candidates.length === 0 && pool.length > 0 && skip.size > 0;
  if (relaxed) candidates = pool;

  // Avoid recent questions while that still leaves enough to fill the set.
  const seen = new Set(recent);
  const fresh = candidates.filter((q) => !seen.has(q.id));
  if (fresh.length >= slots.length) candidates = fresh;

  // Row order from the database is not stable, so fix one before drawing random numbers.
  candidates = candidates.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const liked = new Set(preferred);
  const random = seededRandom(seed);
  // Efraimidis-Spirakis: the larger u^(1/weight), the earlier the pick.
  const key = new Map(candidates.map((q) => [q.id, random() ** (1 / (liked.has(q.topic_id) ? PREFERRED_WEIGHT : 1))]));

  const left = [...candidates];
  const picked = [];
  const perSection = new Map();
  for (const want of slots) {
    if (!left.length) break;
    let best = null;
    for (const q of left) {
      const score = [Math.abs(RANK[q.difficulty] - RANK[want]), perSection.get(q.section_id) ?? 0, -key.get(q.id)];
      if (!best || lexLess(score, best.score)) best = { q, score };
    }
    picked.push(best.q);
    left.splice(left.indexOf(best.q), 1);
    perSection.set(best.q.section_id, (perSection.get(best.q.section_id) ?? 0) + 1);
  }

  // Easy first; ties keep pick order (Array.sort is stable).
  picked.sort((a, b) => RANK[a.difficulty] - RANK[b.difficulty]);
  return { ids: picked.map((q) => q.id), relaxed };
}

// Storage ---------------------------------------------------------------------------

/** What the picker needs to know about the player, in one row. */
const PLAYER_SQL = `
  select p.id, coalesce(p.track_id, private.default_track_id()) as track_id,
         (now() at time zone p.timezone)::date as today,
         greatest(private.level_for(p.level), coalesce(p.placement_level, 1)) as band_level,
         p.league_tier,
         (select count(*) from public.league_tiers) as tier_count,
         exists (select 1 from public.daily_sets s
                 where s.user_id = p.id and s.set_date = (now() at time zone p.timezone)::date) as has_set
  from public.profiles p
  where p.id = $1 and p.banned_at is null`;

// The band the player plays: their own, else the nearest active one below, else the lowest active.
const BAND_SQL = `
  select level, easy_count, medium_count, hard_count from public.levels
  where is_active
  order by (level <= $1) desc, case when level <= $1 then -level else level end
  limit 1`;

const POOL_SQL = `
  select q.id, sec.id as section_id, top.id as topic_id, q.difficulty
  from public.questions q
  join public.subtopics sub on sub.id = q.subtopic_id and sub.is_active
  join public.topics top    on top.id = sub.topic_id  and top.is_active
  join public.sections sec  on sec.id = top.section_id and sec.is_active
  where q.status = 'published'
    and exists (select 1 from public.question_answers a where a.question_id = q.id)
    and (select count(*) from public.question_options o where o.question_id = q.id) >= 2
    and (
      not exists (select 1 from public.track_sections ts where ts.track_id = $1)
      or exists (select 1 from public.track_sections ts where ts.track_id = $1 and ts.section_id = sec.id)
    )`;

const RECENT_SQL = `
  select distinct i.question_id
  from public.daily_set_items i
  join public.daily_sets s on s.id = i.daily_set_id
  where s.user_id = $1 and s.set_date >= $2::date - ${REUSE_WINDOW_DAYS}`;

const INSERT_SQL = `
  with s as (
    insert into public.daily_sets (track_id, level, set_date, published_at, user_id)
    values ($1, $2, $3, now(), $4)
    on conflict (user_id, set_date) where user_id is not null do nothing
    returning id
  )
  insert into public.daily_set_items (daily_set_id, question_id, position)
  select s.id, x.id, (x.ord - 1)::smallint
  from s, unnest($5::uuid[]) with ordinality as x (id, ord)
  returning daily_set_id`;

/**
 * Makes sure the player has a personal set for their local today and returns its
 * question ids ([] when it was already there, or no set could be made, in which
 * case the shared set applies). Safe to call on every request: it is one cheap
 * read once the set exists, and concurrent first calls end up with the same row.
 *
 * Cost control for the daily burst: only players who actually show up get a set
 * (nothing is generated for inactive ones, and a returning player simply gets
 * today's set on their first call). The question pool and level bands are cached
 * and loaded once per burst, and players with no topic preferences share one
 * picked set per (track, level, league tier, day) instead of each running the
 * picker; a player whose recent questions overlap that set too much gets their
 * own pick. The row stored per player is the same either way.
 */
export async function ensurePersonalSet(userId) {
  const { rows: [me] } = await query(PLAYER_SQL, [userId]);
  if (!me || me.has_set) return [];

  const [band, pool, { rows: prefs }, { rows: recentRows }] = await Promise.all([
    bandCache.get(me.band_level, async () => (await query(BAND_SQL, [me.band_level])).rows[0]),
    poolCache.get(me.track_id, async () => (await query(POOL_SQL, [me.track_id])).rows),
    query('select topic_id, preference from public.user_topic_preferences where user_id = $1', [userId]),
    query(RECENT_SQL, [userId, me.today]),
  ]);
  if (!band || !pool.length) return [];

  const recent = recentRows.map((r) => r.question_id);
  const mix = difficultyMix(band, me.league_tier, me.tier_count);
  const personal = () => selectQuestions({
    seed: `${userId}:${me.today}`,
    mix,
    pool,
    preferred: prefs.filter((p) => p.preference === 'prefer').map((p) => p.topic_id),
    excluded: prefs.filter((p) => p.preference === 'exclude').map((p) => p.topic_id),
    recent,
  }).ids;

  let ids;
  if (prefs.length) {
    ids = personal();
  } else {
    const cohortKey = `${me.track_id}:${band.level}:${me.league_tier}:${me.today}`;
    const shared = await cohortCache.get(cohortKey, () => selectQuestions({ seed: `cohort:${cohortKey}`, mix, pool }).ids);
    ids = overlapShare(shared, recent) <= COHORT_MAX_OVERLAP ? shared : personal();
  }
  if (!ids.length) return [];

  await query(INSERT_SQL, [me.track_id, band.level, me.today, userId, ids]);
  return ids;
}
