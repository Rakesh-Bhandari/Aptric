import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';

// A fake Supabase Data API: answers backend_sql so the real db.js, auth
// middleware and /rpc router run end to end without a database.
const ADMIN = '00000000-0000-0000-0000-0000000000a1';
const PLAYER = '00000000-0000-0000-0000-0000000000b1';
const BANNED_ADMIN = '00000000-0000-0000-0000-0000000000c1';
const CONTEST = '70000000-0000-0000-0000-000000000001';
const calls = [];

const fake = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const { statements, as_user: asUser } = JSON.parse(body);
    calls.push({ asUser, sql: statements.map((s) => s.sql) });
    const out = statements.map(({ sql }) => {
      if (sql.includes('public.profiles')) {
        if (sql.includes(ADMIN)) return [{ role: 'admin', banned_at: null }];
        if (sql.includes(BANNED_ADMIN)) return [{ role: 'admin', banned_at: '2026-10-01T00:00:00Z' }];
        return [{ role: 'user', banned_at: null }];
      }
      return [{ result: { ok: true } }];
    });
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
  process.env.JWT_SECRET ??= 'admin-contests-test-secret-0123456789-0123456789';
  const express = (await import('express')).default;
  const { errorHandler } = await import('../src/http.js');
  ({ signAccessToken } = await import('../src/auth/tokens.js'));
  const { default: rpc } = await import('../src/routes/rpc.js');
  const app = express();
  app.use(express.json());
  app.use('/rpc', rpc);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fake.close(); });

const post = (name, body, userId) => fetch(`${base}/rpc/${name}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(userId ? { authorization: `Bearer ${signAccessToken({ userId, email: 'x@example.com', sessionId: 's' })}` } : {}),
  },
  body: JSON.stringify(body),
});

const CONTEST_RPCS = [
  ['admin_list_contests', {}],
  ['admin_get_contest', { target_contest_id: CONTEST }],
  ['admin_save_contest', { target_contest_id: null, title: 'Weekly', description: null, starts_at: '2026-10-10T10:00:00Z', ends_at: '2026-10-10T11:00:00Z', question_ids: [], is_published: false }],
  ['admin_set_contest_published', { target_contest_id: CONTEST, published: true }],
  ['admin_delete_contest', { target_contest_id: CONTEST }],
  ['admin_pick_contest_questions', { question_count: 5 }],
  ['admin_get_contest_results', { target_contest_id: CONTEST }],
];

test('contest admin endpoints refuse anonymous callers', async () => {
  for (const [name, body] of CONTEST_RPCS) {
    assert.equal((await post(name, body)).status, 401, name);
  }
});

test('contest admin endpoints refuse players and banned admins before any contest SQL runs', async () => {
  for (const userId of [PLAYER, BANNED_ADMIN]) {
    for (const [name, body] of CONTEST_RPCS) {
      calls.length = 0;
      const res = await post(name, body, userId);
      assert.equal(res.status, 403, `${name} as ${userId}`);
      assert.equal((await res.json()).error.code, '42501');
      assert.ok(!calls.some((c) => c.sql.some((s) => s.includes(name))), `${name} was not called`);
    }
  }
});

test('admins reach the SQL functions, which run as the admin so triggers audit them', async () => {
  for (const [name, body] of CONTEST_RPCS) {
    calls.length = 0;
    const res = await post(name, body, ADMIN);
    assert.equal(res.status, 200, name);
    const call = calls.find((c) => c.sql.some((s) => s.includes(`public.${name}(`)));
    assert.ok(call, `${name} ran`);
    assert.equal(call.asUser, ADMIN);
  }
});

test('contest arguments are whitelisted and cast to their SQL types', async () => {
  calls.length = 0;
  const bad = await post('admin_save_contest', { title: 'x', is_admin: true }, ADMIN);
  assert.equal(bad.status, 400);
  const res = await post('admin_save_contest', CONTEST_RPCS[2][1], ADMIN);
  assert.equal(res.status, 200);
  const sql = calls.flatMap((c) => c.sql).find((s) => s.includes('admin_save_contest'));
  assert.match(sql, /starts_at => '2026-10-10T10:00:00Z'::timestamptz/);
  assert.match(sql, /question_ids => '\{\}'::uuid\[\]/);
  assert.equal((await post('admin_save_contest', { question_ids: 'abc' }, ADMIN)).status, 400);
});
