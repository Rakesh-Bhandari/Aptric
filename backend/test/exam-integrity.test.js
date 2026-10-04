import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';

// Same fake Supabase Data API as admin-contests.test.js: the real db.js, auth
// middleware and routers run end to end without a database. The SQL itself
// (idempotent finish_contest, refusing answers after it) is covered by
// supabase/tests/database/exam_integrity.test.sql.
const PLAYER = '00000000-0000-0000-0000-0000000000b1';
const CONTEST = '70000000-0000-0000-0000-000000000001';
const calls = [];

const fake = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const { statements, as_user: asUser } = JSON.parse(body);
    calls.push({ asUser, sql: statements.map((s) => s.sql) });
    const out = statements.map(({ sql }) => (sql.includes('select role') || sql.includes('banned_at from')
      ? [{ role: 'user', banned_at: null }]
      : [{ result: { ok: true }, detect_tab_switches_practice: false }]));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(out));
  });
});

let base;
let server;
let signAccessToken;

before(async () => {
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.JWT_SECRET ??= 'exam-integrity-test-secret-0123456789-0123456789';
  const express = (await import('express')).default;
  const { errorHandler } = await import('../src/http.js');
  ({ signAccessToken } = await import('../src/auth/tokens.js'));
  const { default: rpc } = await import('../src/routes/rpc.js');
  const { default: me } = await import('../src/routes/me.js');
  const app = express();
  app.use(express.json());
  app.use('/rpc', rpc);
  app.use(me);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fake.close(); });

const send = (method, path, body, userId = PLAYER) => fetch(`${base}${path}`, {
  method,
  headers: {
    'content-type': 'application/json',
    ...(userId ? { authorization: `Bearer ${signAccessToken({ userId, email: 'x@example.com', sessionId: 's' })}` } : {}),
  },
  body: JSON.stringify(body),
});

test('finish_contest needs a signed-in player and runs as that player', async () => {
  assert.equal((await send('POST', '/rpc/finish_contest', { contest_id: CONTEST }, null)).status, 401);
  calls.length = 0;
  const res = await send('POST', '/rpc/finish_contest', { contest_id: CONTEST, violation: 'tab_hidden' });
  assert.equal(res.status, 200);
  const call = calls.find((c) => c.sql.some((s) => s.includes('public.finish_contest(')));
  assert.equal(call.asUser, PLAYER);
  assert.match(call.sql[0], /contest_id => '70000000-0000-0000-0000-000000000001'::uuid, violation => 'tab_hidden'::text/);
});

test('finish_contest takes no other arguments (a player cannot pick the user or the time)', async () => {
  for (const extra of [{ user_id: PLAYER }, { finished_at: '2026-10-10T10:00:00Z' }]) {
    assert.equal((await send('POST', '/rpc/finish_contest', { contest_id: CONTEST, ...extra })).status, 400);
  }
});

test('the practice preference is a boolean and is saved with the profile', async () => {
  calls.length = 0;
  const res = await send('PATCH', '/me/profile', { detect_tab_switches_practice: false });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).detect_tab_switches_practice, false);
  const sql = calls.flatMap((c) => c.sql).find((s) => s.includes('update public.profiles'));
  assert.match(sql, /set detect_tab_switches_practice = 'false'/);
  assert.match(sql, /returning .*detect_tab_switches_practice/);

  for (const bad of ['no', 0, null]) {
    const r = await send('PATCH', '/me/profile', { detect_tab_switches_practice: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

test('Daily detection cannot be turned off through the API', async () => {
  for (const key of ['detect_tab_switches_daily', 'detect_tab_switches', 'detect_tab_switches_contest']) {
    calls.length = 0;
    const res = await send('PATCH', '/me/profile', { [key]: false });
    assert.equal(res.status, 400, key);
    assert.ok(!calls.some((c) => c.sql.some((s) => s.includes('update public.profiles'))), `${key} wrote nothing`);
  }
});
