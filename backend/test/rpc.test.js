import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCall, RPCS } from '../src/routes/rpc.js';

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
