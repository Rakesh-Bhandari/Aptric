import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCall, COMMUNITY_FLAG, requiredFlags, RPCS } from '../src/routes/rpc.js';

test('named arguments, each cast to its SQL type', () => {
  const call = buildCall('submit_answer', { question_id: 'q', option_id: 'o', context: 'daily', time_ms: 1200 });
  assert.equal(call.text,
    'select public.submit_answer(question_id => $1::uuid, option_id => $2::uuid, context => $3::public.attempt_context, time_ms => $4::integer) as result');
  assert.deepEqual(call.params, ['q', 'o', 'daily', 1200]);
  assert.equal(call.shape, 'value');
});

test('omitted and undefined arguments fall back to the SQL defaults', () => {
  assert.equal(buildCall('get_today_set').text, 'select public.get_today_set() as result');
  assert.equal(buildCall('get_leaderboard', { board: 'weekly', page_size: undefined }).text,
    'select public.get_leaderboard(board => $1::text) as result');
});

test('jsonb is serialised; arrays must be arrays', () => {
  const call = buildCall('finish_placement', { test_id: 't', answers: [{ question_id: 'q', option_id: null }] });
  assert.deepEqual(call.params, ['t', '[{"question_id":"q","option_id":null}]']);
  assert.throws(() => buildCall('get_practice_questions', { subtopic_ids: 'a' }), /must be an array/);
});

test('set-returning and void functions', () => {
  assert.equal(buildCall('admin_list_users', { page_size: 5 }).text,
    'select * from public.admin_list_users(page_size => $1::integer)');
  assert.equal(buildCall('admin_list_users').shape, 'rows');
  assert.equal(buildCall('admin_set_user_role', { target_user_id: 'u', new_role: 'admin' }).shape, 'void');
});

test('only whitelisted functions and arguments', () => {
  assert.throws(() => buildCall('gen_claim_job', {}), (e) => e.status === 404);
  assert.throws(() => buildCall('constructor', {}), (e) => e.status === 404);
  assert.throws(() => buildCall('get_activity', { days: 7, 'days => 1); drop table x; --': 1 }), (e) => e.status === 400);
  assert.throws(() => buildCall('get_activity', [7]), (e) => e.status === 400);
});

test('every whitelisted type is a plain SQL type name', () => {
  for (const [name, spec] of Object.entries(RPCS)) {
    assert.match(name, /^[a-z_]+$/);
    for (const [arg, type] of Object.entries(spec.args)) {
      assert.match(arg, /^[a-z_]+$/);
      assert.match(type, /^(public\.)?[a-z_]+(\[\])?$/);
    }
  }
});

test('every whitelisted function is SECURITY DEFINER (backend_sql does not apply RLS)', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const sql = (await Promise.all(files.map((f) => readFile(new URL(f, dir), 'utf8')))).join('\n');
  for (const name of Object.keys(RPCS)) {
    const defs = [...sql.matchAll(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\bas \\$`, 'g'))];
    assert.ok(defs.length, `${name} is defined`);
    assert.match(defs.at(-1)[0], /security definer/, `${name} is security definer`);
  }
});

test('community functions validate their arguments before any SQL runs', () => {
  assert.equal(buildCall('follow_user', { target_handle: 'asha_k' }).text, 'select public.follow_user(target_handle => $1::text) as result');
  for (const bad of ['', 'a b', 'x'.repeat(25), "a'; drop table x; --", '@asha', 5, {}]) {
    assert.throws(() => buildCall('follow_user', { target_handle: bad }), (e) => e.status === 400, JSON.stringify(bad));
  }
  assert.throws(() => buildCall('get_followers', { target_handle: 'asha', cursor: "x'; --" }), (e) => e.status === 400);
  assert.doesNotThrow(() => buildCall('get_followers', { target_handle: 'asha', cursor: '2026-10-06 19:19:20.058+00|0000-1' }));
  assert.doesNotThrow(() => buildCall('get_followers', { target_handle: 'asha', cursor: null }));
  assert.equal(buildCall('search_users', { q: '@as' }).params[0], '@as');
  assert.throws(() => buildCall('search_users', { q: 'a@b.com' }), (e) => e.status === 400);
  assert.throws(() => buildCall('report_user', { target_handle: 'asha', reason: 'Spam!' }), (e) => e.status === 400);
  assert.throws(() => buildCall('report_user', { target_handle: 'asha', reason: 'spam', details: 'x'.repeat(501) }), (e) => e.status === 400);
  assert.doesNotThrow(() => buildCall('report_user', { target_handle: 'asha', reason: 'spam', details: 'x'.repeat(500) }));
  assert.equal(buildCall('set_privacy', { stats_visibility: 'friends', share_activity: false }).text,
    'select public.set_privacy(stats_visibility => $1::public.visibility_level, share_activity => $2::boolean) as result');
  assert.throws(() => buildCall('follow_user', { target_handle: 'asha', is_admin: true }), (e) => e.status === 400);
});

test('every community write is rate limited at the API too', () => {
  for (const name of ['follow_user', 'unfollow_user', 'remove_follower', 'respond_follow_request', 'block_user', 'unblock_user',
    'report_user', 'search_users', 'set_privacy']) {
    const [bucket, windowSeconds, max] = RPCS[name].limit;
    assert.match(bucket, /^rpc_[a-z]+$/, name);
    assert.ok(windowSeconds >= 1 && max >= 1, name);
  }
});

test('the friends filter is an argument of the leaderboard and contest standings', () => {
  assert.equal(buildCall('get_leaderboard', { board: 'weekly', friends_only: true }).text,
    'select public.get_leaderboard(board => $1::text, friends_only => $2::boolean) as result');
  assert.match(buildCall('get_contest_standings', { contest_id: 'c', friends_only: true }).text, /friends_only => \$2::boolean/);
});

test('community calls need the plan feature; the friends filter needs it only when used', () => {
  assert.deepEqual(requiredFlags('follow_user'), [COMMUNITY_FLAG]);
  assert.deepEqual(requiredFlags('search_users', { q: 'as' }), [COMMUNITY_FLAG]);
  assert.deepEqual(requiredFlags('get_leaderboard', { board: 'weekly' }), []);
  assert.deepEqual(requiredFlags('get_leaderboard', { board: 'weekly', friends_only: false }), []);
  assert.deepEqual(requiredFlags('get_leaderboard', { board: 'weekly', friends_only: true }), [COMMUNITY_FLAG]);
  assert.deepEqual(requiredFlags('get_contest_standings', { contest_id: 'c', friends_only: true }), [COMMUNITY_FLAG]);
  assert.deepEqual(requiredFlags('get_today_set'), []);
  assert.deepEqual(requiredFlags('nope'), []);
});
