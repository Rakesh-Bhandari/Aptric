// Web Push for the signed-in player.
//
//   GET   /push/config        → { enabled, publicKey, preferences }
//   POST  /push/subscribe     { endpoint, keys: { p256dh, auth } }   this browser starts receiving
//   POST  /push/unsubscribe   { endpoint }                           this browser stops
//   PATCH /push/preferences   { daily?, streak?, contests?, league?, social?, post_expiry? } booleans
//   POST  /push/test                                                 sends a test to all their browsers
//
// What is sent, and when, lives in ../push/jobs.js (run by GET /cron/push).

import { Router } from 'express';
import { config } from '../config.js';
import { asUser, query } from '../db.js';
import { badRequest, HttpError } from '../http.js';
import { requireUser } from '../middleware/auth.js';
import { hit } from '../middleware/rateLimit.js';
import { allowedEndpoint, pushEnabled, send } from '../push/sender.js';

export const PREFERENCES = ['daily', 'streak', 'contests', 'league', 'social', 'post_expiry'];
// Everything is on until switched off, except "your post is about to expire", which is opt-in.
const OPT_IN = new Set(['post_expiry']);
const DEFAULTS = Object.fromEntries(PREFERENCES.map((k) => [k, !OPT_IN.has(k)]));

/** The { endpoint, p256dh, auth } of a POST /push/subscribe body, or 400. */
export function validateSubscription(body, hosts) {
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !allowedEndpoint(endpoint, hosts)) {
    throw badRequest('That is not a supported push subscription.');
  }
  for (const key of [p256dh, auth]) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw badRequest('That is not a supported push subscription.');
  }
  return { endpoint, p256dh, auth };
}

/** The boolean columns of a PATCH /push/preferences body, or 400. */
export function validatePushPreferences(body) {
  const keys = Object.keys(body ?? {});
  if (!keys.length) throw badRequest('Nothing to change.');
  const unknown = keys.filter((k) => !PREFERENCES.includes(k));
  if (unknown.length) throw badRequest(`Cannot change ${unknown.join(', ')}`);
  for (const k of keys) if (typeof body[k] !== 'boolean') throw badRequest(`${k} must be true or false.`);
  return keys;
}

const router = Router();
router.use(requireUser);

const readPreferences = async (userId) => {
  const { rows } = await query(
    `select ${PREFERENCES.join(', ')} from private.push_preferences where user_id = $1`,
    [userId],
  );
  return { ...DEFAULTS, ...rows[0] };
};

router.get('/config', async (req, res) => {
  res.json({
    enabled: pushEnabled(),
    publicKey: pushEnabled() ? config.push.publicKey : null,
    preferences: await readPreferences(req.user.id),
  });
});

const requireEnabled = () => {
  if (!pushEnabled()) throw new HttpError(503, 'push_unavailable', 'Notifications are not set up on this server.');
};

router.post('/subscribe', async (req, res) => {
  requireEnabled();
  const { endpoint, p256dh, auth } = validateSubscription(req.body);
  const agent = (req.get('user-agent') ?? '').slice(0, 400) || null;
  // The same browser can sign in as someone else: the endpoint moves to them.
  // A player has at most 10 browsers; the oldest are dropped past that.
  await query(
    `insert into private.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
     select $1, p.id, $3, $4, $5 from public.profiles p where p.id = $2 and p.banned_at is null
     on conflict (endpoint) do update
       set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [endpoint, req.user.id, p256dh, auth, agent],
  );
  await query(
    `delete from private.push_subscriptions where user_id = $1 and endpoint not in (
       select endpoint from private.push_subscriptions where user_id = $1 order by created_at desc limit 10)`,
    [req.user.id],
  );
  res.status(204).end();
});

router.post('/unsubscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) throw badRequest('endpoint is required.');
  await query('delete from private.push_subscriptions where endpoint = $1 and user_id = $2', [endpoint, req.user.id]);
  res.status(204).end();
});

router.patch('/preferences', async (req, res) => {
  const keys = validatePushPreferences(req.body);
  const sets = keys.map((k) => `${k} = excluded.${k}`).join(', ');
  const { rows } = await query(
    `insert into private.push_preferences (user_id, ${keys.join(', ')})
     select p.id, ${keys.map((k, i) => `$${i + 2}::boolean`).join(', ')} from public.profiles p where p.id = $1
     on conflict (user_id) do update set ${sets}, updated_at = now()
     returning ${PREFERENCES.join(', ')}`,
    [req.user.id, ...keys.map((k) => req.body[k])],
  );
  res.json(rows[0]);
});

router.post('/test', async (req, res) => {
  requireEnabled();
  await hit('push-test', req.user.id, 3600, 10);
  const { rows } = await query(
    'select endpoint, p256dh, auth from private.push_subscriptions where user_id = $1',
    [req.user.id],
  );
  if (!rows.length) throw badRequest('Turn on notifications in this browser first.');
  const payload = { title: 'Notifications are on', body: 'You will hear from Aptric about your daily set, streak, contests and league.', url: '/settings', tag: 'test' };
  const results = await Promise.all(rows.map((r) => send(r, payload)));
  res.json({ sent: results.filter((r) => r === 'sent').length });
});

export default router;
