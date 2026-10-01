// node --test supabase/scripts/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildReport, buildSql, computeStreak, isBcrypt, localToday, parseNdjson, planImport, uuidV5, v2Handle,
} from './import-v1-users.mjs';

const HASH = '$2b$10$qBjD9a.muaON/PiSJl15c.uw4Q6NkTXsJ7nUiFjN/0iDmqbdpR1k.';

const user = (over) => ({
  t: 'user', user_id: 'u1', email: 'a@example.com', user_name: 'A', handle: 'a-1a2b3c4d',
  password_hash: HASH, google_id: null, is_verified: 1, is_banned: 0, role: 'user', score: 10,
  day_streak: 0, created_at: '2025-01-01T00:00:00Z', ...over,
});

test('uuidV5 is deterministic and well-formed', () => {
  assert.equal(uuidV5('user:u1'), uuidV5('user:u1'));
  assert.notEqual(uuidV5('user:u1'), uuidV5('user:u2'));
  assert.match(uuidV5('user:u1'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // RFC 4122 test vector: DNS namespace, "www.example.com".
  assert.equal(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
});

test('isBcrypt accepts node bcrypt / bcryptjs hashes only', () => {
  assert.ok(isBcrypt(HASH));
  assert.ok(isBcrypt(HASH.replace('$2b$', '$2a$')));
  assert.ok(isBcrypt(HASH.replace('$2b$', '$2y$')));
  assert.ok(!isBcrypt('plaintext'));
  assert.ok(!isBcrypt(HASH.slice(0, -1)));
  assert.ok(!isBcrypt(null));
});

test('computeStreak: live run ending today or yesterday, longest over history', () => {
  const days = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-26', '2026-09-29', '2026-09-30'];
  assert.deepEqual(computeStreak(days, '2026-10-01'), { current: 2, longest: 5, last: '2026-09-30' });
  assert.deepEqual(computeStreak(days, '2026-09-30'), { current: 2, longest: 5, last: '2026-09-30' });
  assert.deepEqual(computeStreak(days, '2026-10-02'), { current: 0, longest: 5, last: '2026-09-30' });
  assert.deepEqual(computeStreak([], '2026-10-01'), { current: 0, longest: 0, last: null });
  // Duplicates and unsorted input; month boundary.
  assert.deepEqual(computeStreak(['2026-10-01', '2026-09-30', '2026-09-30', 'junk'], '2026-10-01'),
    { current: 2, longest: 2, last: '2026-10-01' });
});

test('v2Handle keeps v1 handles that fit and shortens the rest', () => {
  assert.equal(v2Handle('alice-1a2b3c4d'), 'alice_1a2b3c4d');
  assert.equal(v2Handle('bob-with-a-very-long-name-9f8e7d6c'), 'bob_with_a_very_lo_9f8e7');
  assert.equal(v2Handle('user-deadbeef'), 'user_deadbeef');
  assert.equal(v2Handle('a-very-long-slug-with-no-suffix-at-all'), null);
  assert.equal(v2Handle(''), null);
  for (const h of ['a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-0000aaaa', 'ünïcode-name-0000bbbb']) {
    assert.match(v2Handle(h), /^[a-z0-9_]{3,24}$/);
  }
});

test('localToday uses the given timezone', () => {
  const now = new Date('2026-09-30T20:00:00Z'); // 01:30 on Oct 1 in IST
  assert.equal(localToday('Asia/Kolkata', now), '2026-10-01');
  assert.equal(localToday('UTC', now), '2026-09-30');
});

test('parseNdjson rejects bad lines with their line number', () => {
  assert.throws(() => parseNdjson('{"t":"user"}\nnope', 'f'), /f:2: not JSON/);
  assert.throws(() => parseNdjson('{"t":"other"}', 'f'), /unknown record kind/);
});

test('planImport: skips, auth kinds, handle collisions, legacy XP', () => {
  const records = parseNdjson([
    user({ user_id: 'u1', email: 'Alice@Example.com', handle: 'alice-1a2b3c4d', score: 250 }),
    user({ user_id: 'u2', email: 'alice@example.com', created_at: '2025-06-01T00:00:00Z' }),
    user({ user_id: 'u3', email: 'g@example.com', password_hash: null, google_id: '42', is_verified: 0 }),
    user({ user_id: 'u4', email: 'nv@example.com', is_verified: 0 }),
    user({ user_id: 'u5', email: 'bad', handle: 'x-00000000' }),
    user({ user_id: 'u6', email: 'c@example.com', handle: 'alice_1a2b3c4d', password_hash: 'plain', score: 0,
      created_at: '2025-02-01T00:00:00Z' }),
    { t: 'attempts', user_id: 'u6', total: 3, correct: 1, wrong: 2, points: 0 },
    { t: 'streak_day', user_id: 'u1', d: '2026-09-30' },
    { t: 'feedback', feedback_id: 7, user_id: 'u1', rating: '4.5', comment: '' },
    { t: 'feedback', feedback_id: 8, user_id: 'u4', rating: '0.0', comment: 'meh' },
    { t: 'totals', users: 6, user_feedback: 2, score_sum: 290 },
  ].map((r) => JSON.stringify(r)).join('\n'));

  const plan = planImport(records, { today: '2026-10-01' });
  const by = Object.fromEntries(plan.users.map((u) => [u.v1_user_id, u]));

  assert.deepEqual(plan.skipped.map((s) => [s.v1_user_id, s.reason]).sort(),
    [['u2', 'duplicate_email'], ['u4', 'unverified'], ['u5', 'invalid_email']]);
  assert.equal(by.u1.email, 'alice@example.com');
  assert.equal(by.u1.v1_auth, 'password');
  assert.equal(by.u1.current_streak, 1);
  assert.equal(by.u1.new_id, uuidV5('user:u1'));
  assert.equal(by.u3.v1_auth, 'google');
  assert.equal(by.u6.v1_auth, 'none');
  assert.equal(by.u6.password_hash, null);
  assert.equal(by.u6.handle, null); // collides with u1's converted handle
  assert.match(by.u6.notes, /not bcrypt/);
  assert.match(by.u6.notes, /no legacy XP event/);
  assert.deepEqual(plan.feedback.map((f) => [f.rating, f.message]), [[5, '(rating only)'], [null, 'meh']]);
  assert.equal(plan.expected.exported_score_sum, 290);

  const sql = buildSql(plan, { mode: 'dry-run' });
  assert.match(sql, /\nrollback;\n$/);
  assert.doesNotMatch(sql, /\ncommit;/);
  assert.match(buildSql(plan), /\ncommit;\n/);
  const verify = buildSql(plan, { mode: 'verify' });
  assert.doesNotMatch(verify, /insert into auth\.users/);
  assert.match(verify, /\nrollback;\n$/);

  const csv = buildReport(plan).trim().split('\n');
  assert.equal(csv.length, 1 + 6);
});
