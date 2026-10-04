import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { difficultyMix, seededRandom, selectQuestions } from '../src/personalSet.js';
import { DAILY_RPCS, RPCS } from '../src/routes/rpc.js';
import { validatePreferences } from '../src/routes/me.js';

// 3 sections x 4 topics x 3 difficulties x 2 questions = 72 questions. Section C is "technical".
const SECTIONS = ['A', 'B', 'C'];
const POOL = SECTIONS.flatMap((s) => [1, 2, 3, 4].flatMap((t) => ['easy', 'medium', 'hard'].flatMap((difficulty) =>
  [1, 2].map((n) => ({ id: `${s}${t}-${difficulty}-${n}`, section_id: s, topic_id: `${s}${t}`, difficulty })))));
const byId = new Map(POOL.map((q) => [q.id, q]));
const BEGINNER = { easy_count: 7, medium_count: 3, hard_count: 0 };
const EXPERT = { easy_count: 0, medium_count: 3, hard_count: 7 };
const count = (ids, difficulty) => ids.filter((id) => byId.get(id).difficulty === difficulty).length;
const pick = (over = {}) => selectQuestions({ seed: 'user-1:2026-10-04', mix: difficultyMix(BEGINNER), pool: POOL, ...over });

test('same user and day give the same set, in any pool order', () => {
  const a = pick();
  assert.deepEqual(pick().ids, a.ids);
  assert.deepEqual(pick({ pool: [...POOL].reverse() }).ids, a.ids);
  assert.equal(a.ids.length, 10);
  assert.equal(new Set(a.ids).size, 10);
});

test('another user or another day gets another set', () => {
  const a = pick().ids;
  assert.notDeepEqual(pick({ seed: 'user-2:2026-10-04' }).ids, a);
  assert.notDeepEqual(pick({ seed: 'user-1:2026-10-05' }).ids, a);
});

test('seededRandom is repeatable and in [0, 1)', () => {
  const x = seededRandom('s');
  const y = seededRandom('s');
  for (let i = 0; i < 50; i++) {
    const v = x();
    assert.equal(v, y());
    assert.ok(v >= 0 && v < 1);
  }
});

test('level band sets the difficulty mix', () => {
  const beginner = pick();
  const expert = pick({ mix: difficultyMix(EXPERT) });
  assert.deepEqual([7, 3, 0], ['easy', 'medium', 'hard'].map((d) => count(beginner.ids, d)));
  assert.deepEqual([0, 3, 7], ['easy', 'medium', 'hard'].map((d) => count(expert.ids, d)));
});

test('league makes the band harder, never past two steps, and keeps the size', () => {
  assert.deepEqual(difficultyMix(BEGINNER, 1, 5), { easy: 7, medium: 3, hard: 0 });
  assert.deepEqual(difficultyMix(BEGINNER, 3, 5), { easy: 6, medium: 4, hard: 0 });
  assert.deepEqual(difficultyMix(BEGINNER, 5, 5), { easy: 5, medium: 5, hard: 0 });
  assert.deepEqual(difficultyMix({ easy_count: 0, medium_count: 5, hard_count: 5 }, 5, 5), { easy: 0, medium: 3, hard: 7 });
  assert.deepEqual(difficultyMix(BEGINNER, 9, 1), { easy: 7, medium: 3, hard: 0 }, 'a single tier changes nothing');
  for (let tier = 1; tier <= 5; tier++) {
    const m = difficultyMix(BEGINNER, tier, 5);
    assert.equal(m.easy + m.medium + m.hard, 10);
  }
  const bronze = pick({ mix: difficultyMix(BEGINNER, 1, 5) });
  const diamond = pick({ mix: difficultyMix(BEGINNER, 5, 5) });
  assert.ok(count(diamond.ids, 'easy') < count(bronze.ids, 'easy'));
});

test('excluded topics never appear', () => {
  const excluded = ['C1', 'C2', 'C3', 'C4'];
  for (const seed of ['a', 'b', 'c', 'd', 'e']) {
    const { ids, relaxed } = pick({ seed, excluded });
    assert.equal(ids.length, 10);
    assert.equal(relaxed, false);
    assert.ok(ids.every((id) => byId.get(id).section_id !== 'C'));
  }
});

test('preferred topics are picked more often', () => {
  const share = (preferred) => {
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      hits += pick({ seed: `u${i}`, preferred }).ids.filter((id) => byId.get(id).topic_id === 'B2').length;
    }
    return hits;
  };
  assert.ok(share(['B2']) > share([]) * 1.5);
});

test('a narrow filter gives a shorter set, never an empty one', () => {
  // Only two questions are left after the exclusion: the set is just those.
  const small = POOL.filter((q) => q.topic_id === 'A1' || q.topic_id === 'C1').slice(0, 14);
  const keepOnly = small.filter((q) => q.topic_id === 'A1').slice(0, 2);
  const pool = [...keepOnly, ...small.filter((q) => q.topic_id === 'C1')];
  const { ids, relaxed } = selectQuestions({ seed: 's', mix: difficultyMix(BEGINNER), pool, excluded: ['C1'] });
  assert.equal(ids.length, 2);
  assert.equal(relaxed, false);

  // Everything excluded: the exclusion is ignored rather than returning nothing.
  const all = pick({ excluded: POOL.map((q) => q.topic_id) });
  assert.equal(all.ids.length, 10);
  assert.equal(all.relaxed, true);

  // Nothing in the bank at all.
  assert.deepEqual(pick({ pool: [] }), { ids: [], relaxed: false });
});

test('recent questions are avoided while enough others are left', () => {
  const first = pick().ids;
  const next = pick({ seed: 'user-1:2026-10-05', recent: first }).ids;
  assert.ok(next.every((id) => !first.includes(id)));
  // With too few fresh questions the recent ones are used again.
  const tiny = POOL.slice(0, 12);
  const again = selectQuestions({ seed: 's', mix: difficultyMix(BEGINNER), pool: tiny, recent: tiny.slice(0, 6).map((q) => q.id) });
  assert.equal(again.ids.length, 10);
});

test('a short bank asks for the nearest difficulty', () => {
  const easyOnly = POOL.filter((q) => q.difficulty === 'easy');
  const { ids } = selectQuestions({ seed: 's', mix: difficultyMix(EXPERT), pool: easyOnly });
  assert.equal(ids.length, 10);
});

test('sections are spread out', () => {
  const sections = pick().ids.map((id) => byId.get(id).section_id);
  const per = SECTIONS.map((s) => sections.filter((x) => x === s).length);
  assert.ok(Math.max(...per) - Math.min(...per) <= 1, `uneven: ${per}`);
});

test('validatePreferences', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(validatePreferences({}), { preferred_topic_ids: [], excluded_topic_ids: [] });
  assert.deepEqual(validatePreferences({ preferred_topic_ids: [a, a.toUpperCase()], excluded_topic_ids: [b] }),
    { preferred_topic_ids: [a], excluded_topic_ids: [b] });
  for (const bad of [{ preferred_topic_ids: 'x' }, { excluded_topic_ids: ['nope'] }, { preferred_topic_ids: [a], excluded_topic_ids: [a] }]) {
    assert.throws(() => validatePreferences(bad), (e) => e.status === 400);
  }
  assert.deepEqual(validatePreferences(undefined), { preferred_topic_ids: [], excluded_topic_ids: [] });
});

test('the daily RPCs build the personal set first', () => {
  for (const name of DAILY_RPCS) assert.ok(name in RPCS, `${name} is whitelisted`);
  for (const name of ['get_today_set', 'get_daily_result', 'submit_answer', 'use_hint', 'give_up']) assert.ok(DAILY_RPCS.has(name));
});

test('the SQL scopes personal sets to their player', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20261008000001_personal_daily_sets.sql', import.meta.url), 'utf8');
  assert.match(sql, /s\.user_id = target_user_id/, 'today_set_for serves the player their own set');
  assert.match(sql, /user_id is null or user_id = \(select auth\.uid\(\)\)/, 'players cannot read each other\'s sets');
  assert.match(sql, /s\.user_id is null\s+and s\.set_date >= gen_date/, 'shared reuse window ignores personal sets');
});
