// What a player's plan allows. The plan comes from Postgres
// (private.entitlements_for: plans + subscriptions); the API enforces it:
//
//   getEntitlements(userId)       -> { plan, name, features, limits }
//   limitFor(ent, key, fallback)  -> a plan limit, or the server default when the plan has none
//   requireFeature(name)          -> middleware: 402 `upgrade_required` unless the plan has the feature
//
// Adding a paid feature = add its key to `plans.features` / `plans.limits` and
// guard the route with requireFeature(...) or limitFor(...). No other code changes.

import { query } from './db.js';
import { HttpError } from './http.js';

// Every plan lookup would otherwise cost a database round trip per request.
// A purchase or cancellation shows up within TTL_MS (or at once, see invalidate).
const TTL_MS = 60_000;
const MAX_ENTRIES = 5000;
const cache = new Map();

const FREE_FALLBACK = { plan: 'free', name: 'Free', features: {}, limits: {} };

/** The player's entitlements. Never throws for a missing plan table: players are 'free' until it exists. */
export async function getEntitlements(userId, { run = query, now = Date.now } = {}) {
  const hit = cache.get(userId);
  if (hit && hit.expires > now()) return hit.value;

  let value;
  try {
    const { rows } = await run('select private.entitlements_for($1::uuid) as ent', [userId]);
    value = rows[0]?.ent ?? FREE_FALLBACK;
  } catch (err) {
    // 42883 undefined function / 42P01 undefined table: the plans migration is not applied yet.
    if (err?.code !== '42883' && err?.code !== '42P01') throw err;
    value = FREE_FALLBACK;
  }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(userId, { value, expires: now() + TTL_MS });
  return value;
}

/** Forget a player's cached plan (call after a webhook changes their subscription). */
export const invalidateEntitlements = (userId) => cache.delete(userId);

/** A numeric plan limit, or `fallback` (the server's configured default) when the plan sets none. */
export function limitFor(entitlements, key, fallback) {
  const value = entitlements?.limits?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export const hasFeature = (entitlements, name) => {
  const value = entitlements?.features?.[name];
  return value === true || (typeof value === 'string' && value !== '');
};

/** Express middleware (after requireUser): 402 unless the plan includes the feature. */
export const requireFeature = (name) => async (req, res, next) => {
  const ent = await getEntitlements(req.user.id);
  if (!hasFeature(ent, name)) {
    throw new HttpError(402, 'upgrade_required', 'This is part of a paid plan.', { feature: name, plan: ent.plan });
  }
  req.entitlements = ent;
  next();
};

/** What the browser needs: switches and numbers only, plus whether to show ads. */
export const publicEntitlements = (ent) => ({
  plan: ent.plan,
  name: ent.name,
  features: ent.features,
  limits: ent.limits,
  show_ads: ent.features?.ads !== false,
});

