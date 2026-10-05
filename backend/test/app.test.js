import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMisconfiguredApp, originMatcher, securityHeaders } from '../src/app.js';
import { supabaseProblems } from '../src/config.js';

const jwtKey = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;

test('supabaseProblems wants the project URL and a secret key', () => {
  assert.deepEqual(supabaseProblems('https://abcd.supabase.co', 'sb_secret_123'), []);
  assert.deepEqual(supabaseProblems('http://127.0.0.1:54321', jwtKey('service_role')), []);
  assert.deepEqual(supabaseProblems(undefined, undefined), ['SUPABASE_URL is not set', 'SUPABASE_SECRET_KEY is not set']);
  assert.match(supabaseProblems('https://supabase.com', 'sb_secret_1')[0], /project URL/);
  assert.match(supabaseProblems('https://abcd.supabase.co/rest/v1', 'sb_secret_1')[0], /project URL/);
  assert.match(supabaseProblems('postgresql://u:p@h/db', 'sb_secret_1')[0], /project URL/);
  assert.match(supabaseProblems('https://abcd.supabase.co', 'sb_publishable_1')[0], /publishable/);
  assert.match(supabaseProblems('https://abcd.supabase.co', jwtKey('anon'))[0], /secret key/);
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

test('every API response carries the security headers and is never cached', async () => {
  const server = createMisconfiguredApp(['x']).listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/anything`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(res.headers.get('strict-transport-security'), /max-age=\d+/);
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally {
    server.close();
  }
  assert.equal(typeof securityHeaders, 'function');
});
