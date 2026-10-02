import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMisconfiguredApp, originMatcher } from '../src/app.js';
import { connectionString } from '../src/db.js';

test('connectionString drops sslmode so DATABASE_SSL decides', () => {
  assert.equal(
    connectionString('postgresql://u:p%40ss@host.pooler.supabase.com:6543/postgres?sslmode=require'),
    'postgresql://u:p%40ss@host.pooler.supabase.com:6543/postgres',
  );
  assert.equal(connectionString('postgresql://u:p@localhost:5432/db'), 'postgresql://u:p@localhost:5432/db');
});

test('originMatcher allows listed origins and wildcards only', () => {
  const allowed = originMatcher(['https://aptric.app', 'https://aptric-*.vercel.app']);
  assert.equal(allowed('https://aptric.app'), true);
  assert.equal(allowed('https://aptric-git-main-team.vercel.app'), true);
  assert.equal(allowed(undefined), true);
  assert.equal(allowed('https://evil.com'), false);
  assert.equal(allowed('https://aptric-x.vercel.app.evil.com'), false);
  assert.equal(allowed('https://aptric.app.evil.com'), false);
});

test('misconfigured app answers JSON 503 with CORS instead of crashing', async () => {
  const server = createMisconfiguredApp(['JWT_SECRET is not set']).listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:6969', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:6969');
    const body = await res.json();
    assert.equal(body.error.code, 'server_misconfigured');
    assert.deepEqual(body.error.problems, ['JWT_SECRET is not set']);
  } finally {
    server.close();
  }
});
