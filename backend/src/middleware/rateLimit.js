// Fixed-window rate limits stored in Postgres (private.rate_limits through
// public.gen_rate_limit), so every serverless instance shares the counts.

import { query } from '../db.js';
import { HttpError } from '../http.js';

/**
 * Counts one hit for `key` in `bucket`; throws 429 once the window's budget is
 * spent. Keys are hashed into the function's uuid subject.
 */
export async function hit(bucket, key, windowSeconds, max) {
  const { rows } = await query(
    'select allowed, retry_after_seconds from public.gen_rate_limit(md5($1)::uuid, $2, $3, $4)',
    [`${bucket}:${key}`, bucket, windowSeconds, max],
  );
  const { allowed, retry_after_seconds: retry } = rows[0];
  if (!allowed) {
    throw new HttpError(429, 'over_request_rate_limit', 'Too many attempts. Please wait a minute and try again.',
      { retry_after_seconds: retry }, { 'Retry-After': String(retry) });
  }
}

/** Express middleware: limit per client IP. */
export const limitByIp = (bucket, windowSeconds, max) => async (req, res, next) => {
  await hit(bucket, req.ip ?? 'unknown', windowSeconds, max);
  next();
};
