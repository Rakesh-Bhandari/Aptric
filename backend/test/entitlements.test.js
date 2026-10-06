import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { getEntitlements, hasFeature, invalidateEntitlements, limitFor, publicEntitlements, requireFeature } from '../src/entitlements.js';
import { errorHandler } from '../src/http.js';

const PLUS = { plan: 'plus', name: 'Plus', features: { ads: false, ai_tier: 'standard', advanced_analytics: true }, limits: { tutor_messages_per_day: 600 } };

test('getEntitlements asks the database once per minute per player', async () => {
  let calls = 0;
  let clock = 1_000;
  const run = async () => { calls += 1; return { rows: [{ ent: PLUS }] }; };
  const now = () => clock;
  assert.deepEqual(await getEntitlements('u-cache', { run, now }), PLUS);
  assert.deepEqual(await getEntitlements('u-cache', { run, now }), PLUS);
  assert.equal(calls, 1);
  clock += 61_000;
  await getEntitlements('u-cache', { run, now });
  assert.equal(calls, 2);
  invalidateEntitlements('u-cache');
  await getEntitlements('u-cache', { run, now });
  assert.equal(calls, 3);
});

test('players are free when the plans migration is missing, and other errors still surface', async () => {
  const missing = async () => { throw Object.assign(new Error('no function'), { code: '42883' }); };
  const ent = await getEntitlements('u-missing', { run: missing });
  assert.equal(ent.plan, 'free');
  const broken = async () => { throw Object.assign(new Error('down'), { code: 'PGRST000' }); };
  await assert.rejects(getEntitlements('u-broken', { run: broken }), /down/);
});

test('limitFor uses the plan limit only when it is a positive number', () => {
  assert.equal(limitFor(PLUS, 'tutor_messages_per_day', 200), 600);
  assert.equal(limitFor(PLUS, 'tutor_messages_per_hour', 60), 60);
  assert.equal(limitFor({ limits: { x: 0 } }, 'x', 7), 7);
  assert.equal(limitFor({ limits: { x: '9' } }, 'x', 7), 7);
  assert.equal(limitFor(null, 'x', 7), 7);
});

test('hasFeature and publicEntitlements', () => {
  assert.equal(hasFeature(PLUS, 'advanced_analytics'), true);
  assert.equal(hasFeature(PLUS, 'ads'), false);
  assert.equal(hasFeature(PLUS, 'ai_tier'), true);
  assert.equal(hasFeature(PLUS, 'nope'), false);
  assert.equal(publicEntitlements(PLUS).show_ads, false);
  assert.equal(publicEntitlements({ plan: 'free', name: 'Free', features: { ads: true }, limits: {} }).show_ads, true);
  // Ads are the default: only a plan that says ads: false hides them.
  assert.equal(publicEntitlements({ plan: 'free', name: 'Free', features: {}, limits: {} }).show_ads, true);
});

test('requireFeature answers 402 upgrade_required for a plan without the feature', async (t) => {
  const app = express();
  const user = (id) => (req, res, next) => { req.user = { id }; next(); };
  // Seed the cache so no database is needed.
  await getEntitlements('u-free', { run: async () => ({ rows: [{ ent: { plan: 'free', name: 'Free', features: {}, limits: {} } }] }) });
  await getEntitlements('u-plus', { run: async () => ({ rows: [{ ent: PLUS }] }) });
  app.get('/free', user('u-free'), requireFeature('advanced_analytics'), (req, res) => res.json({ ok: true }));
  app.get('/plus', user('u-plus'), requireFeature('advanced_analytics'), (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const denied = await fetch(`${base}/free`);
  assert.equal(denied.status, 402);
  assert.deepEqual((await denied.json()).error, { code: 'upgrade_required', message: 'This is part of a paid plan.', feature: 'advanced_analytics', plan: 'free' });
  assert.equal((await fetch(`${base}/plus`)).status, 200);
});
