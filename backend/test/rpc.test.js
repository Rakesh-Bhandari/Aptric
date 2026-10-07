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

test('post functions are validated and need the community_posts feature', async () => {
  const { POSTS_FLAG } = await import('../src/routes/rpc.js');
  for (const name of ['create_post', 'create_reply', 'get_feed', 'react_post', 'report_post', 'delete_post']) {
    assert.deepEqual(requiredFlags(name, {}), [POSTS_FLAG], name);
  }
  assert.deepEqual(requiredFlags('admin_moderate_post', {}), [], 'moderation is for admins, whatever the plan');
  assert.equal(RPCS.admin_moderate_post.admin, true);
  assert.equal(RPCS.admin_list_post_reports.admin, true);
  const uuid = '11111111-1111-4111-8111-111111111111';
  assert.match(buildCall('create_post', { kind: 'tip', body: 'hello', contains_spoiler: false }).text, /create_post\(kind => \$1::text, body => \$2::text, contains_spoiler => \$3::boolean\)/);
  assert.match(buildCall('create_post', { kind: 'poll', body: 'b', poll_options: ['a', 'b'] }).text, /poll_options => \$3::text\[\]/);
  assert.throws(() => buildCall('create_post', { kind: 'tip; drop', body: 'x' }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_post', { kind: 'tip', body: 'x'.repeat(601) }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_post', { kind: 'tip', body: 'x', author_id: uuid }), (e) => e.status === 400, 'no mass assignment');
  assert.throws(() => buildCall('create_reply', { target_post_id: uuid, body: 'x'.repeat(401) }), (e) => e.status === 400);
  assert.doesNotThrow(() => buildCall('get_feed', { feed: 'everyone', sort: 'hot', cursor: '2026-10-06 19:19:20.058+00|1.2345e-05|' + uuid }));
  assert.throws(() => buildCall('get_feed', { feed: 'every;one' }), (e) => e.status === 400);
  assert.throws(() => buildCall('get_feed', { cursor: "x'; --" }), (e) => e.status === 400);
  assert.throws(() => buildCall('react_post', { target_post_id: uuid, reaction: 'Fire!' }), (e) => e.status === 400);
  assert.throws(() => buildCall('report_post', { target_post_id: uuid, reason: 'spam', details: 'x'.repeat(301) }), (e) => e.status === 400);
  for (const name of ['create_post', 'create_reply', 'react_post', 'vote_poll', 'report_post', 'delete_post', 'mute_user']) {
    assert.ok(RPCS[name].limit, `${name} is rate limited at the API`);
  }
});

test('challenge functions are validated, rate limited and behind their own switch', async () => {
  const { CHALLENGES_FLAG } = await import('../src/routes/rpc.js');
  const uuid = '11111111-1111-4111-8111-111111111111';
  for (const name of ['create_challenge', 'accept_challenge', 'submit_challenge_answer', 'get_challenge', 'list_challenges', 'request_rematch']) {
    assert.deepEqual(requiredFlags(name, {}), [CHALLENGES_FLAG], name);
  }
  assert.match(buildCall('accept_challenge', { token: 'abcdefghjkmnpqrs' }).text, /accept_challenge\(token => \$1::text\)/);
  assert.throws(() => buildCall('accept_challenge', { token: 'short' }), (e) => e.status === 400);
  assert.throws(() => buildCall('accept_challenge', { token: "abcdefghjkmnpqr'" }), (e) => e.status === 400);
  assert.throws(() => buildCall('get_challenge', { token: '../../etc/passwd' }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_challenge', { set_kind: 'daily; drop' }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_challenge', { set_kind: 'daily', opponent_handle: 'a b' }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_challenge', { set_kind: 'daily', winner_id: uuid }), (e) => e.status === 400, 'no mass assignment');
  assert.throws(() => buildCall('submit_challenge_answer', { target_challenge_id: uuid, question_id: uuid, option_id: uuid, is_correct: true }), (e) => e.status === 400, 'the client cannot say it was right');
  assert.throws(() => buildCall('submit_challenge_answer', { target_challenge_id: uuid, question_id: uuid, option_id: uuid, time_ms: 1 }), (e) => e.status === 400, 'nor how long it took');
  assert.match(buildCall('create_challenge', { set_kind: 'custom_set', question_ids: [uuid, uuid] }).text, /question_ids => \$2::uuid\[\]/);
  assert.throws(() => buildCall('create_challenge', { set_kind: 'custom_set', question_ids: uuid }), (e) => e.status === 400);
  for (const name of ['create_challenge', 'accept_challenge', 'submit_challenge_answer', 'finish_challenge_run', 'request_rematch']) {
    assert.ok(RPCS[name].limit, `${name} is rate limited at the API`);
  }
});

test('league functions are validated, rate limited and behind their own switch', async () => {
  const { GROUPS_FLAG, POSTS_FLAG } = await import('../src/routes/rpc.js');
  const uuid = '11111111-1111-4111-8111-111111111111';
  for (const name of ['create_group', 'join_group', 'get_group_leaderboard', 'update_group', 'rotate_group_code', 'export_group_results', 'archive_group']) {
    assert.deepEqual(requiredFlags(name, {}), [GROUPS_FLAG], name);
  }
  // The college / batch feed needs both the posts switch and the leagues switch; the others only posts.
  assert.deepEqual(requiredFlags('get_feed', { feed: 'group' }).sort(), [GROUPS_FLAG, POSTS_FLAG].sort());
  assert.deepEqual(requiredFlags('get_feed', { feed: 'everyone' }), [POSTS_FLAG]);
  assert.match(buildCall('join_group', { code: 'abcdefghjk' }).text, /join_group\(code => \$1::text\)/);
  for (const bad of ['short', 'abcdefghjkm', "abcdefghj'", 'abcdefgh j', '../../../', 5]) {
    assert.throws(() => buildCall('join_group', { code: bad }), (e) => e.status === 400, String(bad));
  }
  assert.throws(() => buildCall('create_group', { name: 'x'.repeat(81), kind: 'batch' }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_group', { name: 'IIT-X', kind: 'batch; drop' }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_group', { name: 'IIT-X', kind: 'batch', allowed_email_domain: 'not a domain' }), (e) => e.status === 400);
  assert.throws(() => buildCall('create_group', { name: 'IIT-X', kind: 'batch', owner_id: uuid }), (e) => e.status === 400, 'no mass assignment');
  assert.throws(() => buildCall('create_group', { name: 'IIT-X', kind: 'batch', invite_code: 'aaaaaaaaaa' }), (e) => e.status === 400, 'the code is never client-chosen');
  assert.doesNotThrow(() => buildCall('create_group', { name: 'IIT-X', kind: 'college', join_mode: 'email_domain', allowed_email_domain: 'iitx.ac.in', max_members: 300 }));
  assert.throws(() => buildCall('get_group', { target_slug: 'Not A Slug' }), (e) => e.status === 400);
  assert.throws(() => buildCall('get_group_leaderboard', { target_group_id: uuid, win: 'all time' }), (e) => e.status === 400);
  assert.match(buildCall('get_group_leaderboard', { target_group_id: uuid, win: 'custom', from_date: '2026-10-01', to_date: '2026-10-31' }).text, /from_date => \$3::date, to_date => \$4::date/);
  assert.throws(() => buildCall('post_group_announcement', { target_group_id: uuid, body: 'x'.repeat(401) }), (e) => e.status === 400);
  assert.throws(() => buildCall('set_group_member_role', { target_group_id: uuid, target_handle: 'asha', new_role: 'owner!' }), (e) => e.status === 400);
  assert.throws(() => buildCall('update_group', { target_group_id: uuid, is_archived: false }), (e) => e.status === 400, 'archiving is its own call');
  assert.ok(RPCS.join_group.limit[2] <= 20, 'joining by code is rate limited at the API too');
  for (const name of ['create_group', 'join_group', 'update_group', 'rotate_group_code', 'archive_group', 'remove_group_member']) {
    assert.ok(RPCS[name].limit, `${name} is rate limited at the API`);
  }
});
