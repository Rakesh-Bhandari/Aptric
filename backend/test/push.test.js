import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runDueNotifications, JOBS } from '../src/push/jobs.js';
import { messageFor } from '../src/push/messages.js';
import { allowedEndpoint, send } from '../src/push/sender.js';
import { validCronAuth } from '../src/routes/cron.js';
import { validatePushPreferences, validateSubscription } from '../src/routes/push.js';

const HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com'];
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

test('allowedEndpoint accepts only https URLs on the push services', () => {
  assert.equal(allowedEndpoint(FCM, HOSTS), true);
  assert.equal(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x', HOSTS), true);
  assert.equal(allowedEndpoint('http://fcm.googleapis.com/x', HOSTS), false);
  assert.equal(allowedEndpoint('https://evil.com/fcm.googleapis.com', HOSTS), false);
  assert.equal(allowedEndpoint('https://fcm.googleapis.com.evil.com/x', HOSTS), false);
  assert.equal(allowedEndpoint('https://user:pw@fcm.googleapis.com/x', HOSTS), false);
  assert.equal(allowedEndpoint('https://169.254.169.254/latest', HOSTS), false);
  assert.equal(allowedEndpoint('not a url', HOSTS), false);
});

test('validateSubscription wants an allowed endpoint and both keys', () => {
  const ok = { endpoint: FCM, keys: { p256dh: 'BNc_-abc', auth: 'x-Y_9' } };
  assert.deepEqual(validateSubscription(ok, HOSTS), { endpoint: FCM, p256dh: 'BNc_-abc', auth: 'x-Y_9' });
  assert.throws(() => validateSubscription({ ...ok, endpoint: 'https://evil.com/x' }, HOSTS), /supported/);
  assert.throws(() => validateSubscription({ endpoint: FCM }, HOSTS), /supported/);
  assert.throws(() => validateSubscription({ ...ok, keys: { p256dh: 'a b', auth: 'x' } }, HOSTS), /supported/);
  assert.throws(() => validateSubscription(null, HOSTS), /supported/);
});

test('validatePushPreferences takes known booleans only', () => {
  assert.deepEqual(validatePushPreferences({ daily: false, league: true }), ['daily', 'league']);
  assert.deepEqual(validatePushPreferences({ social: false }), ['social']);
  assert.deepEqual(validatePushPreferences({ post_expiry: true }), ['post_expiry']);
  assert.deepEqual(validatePushPreferences({ challenges: false }), ['challenges']);
  assert.deepEqual(validatePushPreferences({ groups: false }), ['groups']);
  assert.throws(() => validatePushPreferences({}), /Nothing/);
  assert.throws(() => validatePushPreferences({ marketing: true }), /Cannot change marketing/);
  assert.throws(() => validatePushPreferences({ daily: 'no' }), /true or false/);
});

test('validCronAuth compares the bearer token with the secret', () => {
  assert.equal(validCronAuth('Bearer s3cret', 's3cret'), true);
  assert.equal(validCronAuth('Bearer wrong!', 's3cret'), false);
  assert.equal(validCronAuth('Bearer s3cre', 's3cret'), false);
  assert.equal(validCronAuth('s3cret', 's3cret'), false);
  assert.equal(validCronAuth(undefined, 's3cret'), false);
  assert.equal(validCronAuth('Bearer x', undefined), false);
});

test('messageFor words each notification and links into the app', () => {
  assert.equal(messageFor('daily').url, '/');
  assert.equal(messageFor('streak', { streak: 1 }).title, 'Keep your 1-day streak alive');
  assert.equal(messageFor('streak', { streak: 12 }).title, 'Keep your 12-day streak alive');
  assert.equal(messageFor('contest_start', { title: 'Weekly', id: 'c1' }).url, '/compete/contests/c1');
  assert.match(messageFor('contest_end', { title: 'Weekly', id: 'c1', rank: 3 }).body, /#3/);
  assert.equal(messageFor('league', { outcome: 'promoted', tier: 'Gold', final_rank: 2 }).title, 'Promoted to Gold!');
  assert.equal(messageFor('league', { outcome: 'demoted', tier: 'Silver', final_rank: 29 }).title, 'Moved down to Silver');
  assert.equal(messageFor('league', { outcome: null }), null);
  assert.equal(messageFor('follow', { handle: 'asha' }).url, '/u/asha');
  assert.equal(messageFor('follow', { handle: 'asha' }).title, '@asha followed you');
  assert.equal(messageFor('follow_request', { handle: 'asha' }).url, '/friends?tab=requests');
  assert.equal(messageFor('follow_accepted', { handle: 'asha' }).tag, 'follow-accepted-asha');
  assert.equal(messageFor('post_expiry', { id: 'p1' }).tag, 'post-expiry-p1');
  assert.equal(messageFor('challenge_received', { id: 'c1', handle: 'asha', score: 8, total: 10 }).title, '@asha challenged you: beat 8/10');
  assert.equal(messageFor('challenge_received', { id: 'c1', handle: 'asha', score: 8, total: 10 }).url, '/challenges/c1');
  assert.equal(messageFor('challenge_result', { id: 'c1', handle: 'asha', outcome: 'won', mine: 8, theirs: 7, total: 10 }).title, 'You beat @asha!');
  assert.equal(messageFor('challenge_result', { id: 'c1', handle: 'asha', outcome: 'lost', mine: 6, theirs: 7, total: 10 }).body, '6/10 to 7/10. Ask for a rematch.');
  assert.equal(messageFor('challenge_result', { outcome: 'nonsense' }), null);
  assert.equal(messageFor('group_announcement', { id: 'a1', group: 'IIT-X 2026', slug: 'iit-x-2026-ab12c', body: 'Season starts Monday' }).url, '/leagues/iit-x-2026-ab12c');
  assert.equal(messageFor('group_announcement', { id: 'a1', group: 'IIT-X 2026', slug: 's', body: 'Hello' }).title, 'IIT-X 2026: new announcement');
  assert.equal(messageFor('hosted_contest_24h', { title: 'Friday quiz', id: 'c1' }).title, 'Friday quiz starts in 24 hours');
  assert.equal(messageFor('hosted_contest_1h', { title: 'Friday quiz', id: 'c1' }).url, '/compete/contests/c1');
  assert.equal(messageFor('hosted_contest_summary', { title: 'Friday quiz', id: 'c1', players: 12 }).body, '12 players took part. See your summary.');
  assert.equal(messageFor('hosted_contest_summary', { title: 'Friday quiz', id: 'c1', players: 1 }).body, '1 player took part. See your summary.');
  assert.equal(messageFor('hosted_contest_summary', { title: 'Friday quiz', id: 'c1', players: 0 }).url, '/compete/host/c1');
  assert.equal(messageFor('nope'), null);
});

test('every job claims its rows in push_log before returning subscriptions', () => {
  assert.deepEqual(JOBS.map((j) => j.type), [
    'daily', 'streak', 'contest_start', 'hosted_contest_24h', 'hosted_contest_1h', 'hosted_contest_summary', 'contest_end', 'league', 'follow', 'follow_request', 'follow_accepted', 'post_expiry',
    'challenge_received', 'challenge_expiring', 'challenge_result', 'group_announcement',
  ]);
  for (const job of JOBS) {
    assert.match(job.sql, /insert into private\.push_log/);
    assert.match(job.sql, /on conflict do nothing/);
    assert.match(job.sql, /join private\.push_subscriptions/);
  }
});

test('runDueNotifications sends one message per claimed subscription and counts results', async () => {
  const rows = {
    daily: [
      { user_id: 'u1', data: {}, endpoint: 'e1', p256dh: 'k', auth: 'a' },
      { user_id: 'u1', data: {}, endpoint: 'e2', p256dh: 'k', auth: 'a' },
      { user_id: 'u2', data: {}, endpoint: 'e3', p256dh: 'k', auth: 'a' },
    ],
    league: [{ user_id: 'u3', data: { outcome: 'promoted', tier: 'Gold', final_rank: 1 }, endpoint: 'e4', p256dh: 'k', auth: 'a' }],
  };
  const sql = [];
  const run = async (text) => {
    sql.push(text);
    const job = JOBS.find((j) => j.sql === text);
    return { rows: (job && rows[job.type]) || [] };
  };
  const delivered = [];
  const deliver = async (sub, payload) => {
    delivered.push([sub.endpoint, payload.title]);
    return sub.endpoint === 'e2' ? 'gone' : sub.endpoint === 'e3' ? 'failed' : 'sent';
  };
  const summary = await runDueNotifications({ run, deliver });
  assert.deepEqual(summary.daily, { users: 2, sent: 1, gone: 1, failed: 1 });
  assert.deepEqual(summary.league, { users: 1, sent: 1, gone: 0, failed: 0 });
  assert.deepEqual(summary.streak, { users: 0, sent: 0, gone: 0, failed: 0 });
  assert.deepEqual(delivered.find(([e]) => e === 'e4'), ['e4', 'Promoted to Gold!']);
  assert.match(sql.at(-1), /delete from private\.push_log/);
});

test('send reports sent, removes gone subscriptions and keeps others', async () => {
  const sub = { endpoint: FCM, p256dh: 'k', auth: 'a' };
  const removed = [];
  const remove = async (e) => removed.push(e);
  const failWith = (statusCode) => async () => { throw Object.assign(new Error('push failed'), { statusCode }); };
  assert.equal(await send(sub, { title: 't' }, { send: async () => {}, remove }), 'sent');
  assert.equal(await send(sub, { title: 't' }, { send: failWith(410), remove }), 'gone');
  assert.equal(await send(sub, { title: 't' }, { send: failWith(404), remove }), 'gone');
  assert.deepEqual(removed, [FCM, FCM]);
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await send(sub, { title: 't' }, { send: failWith(500), remove }), 'failed');
  } finally {
    console.error = quiet;
  }
  assert.equal(removed.length, 2);
});
