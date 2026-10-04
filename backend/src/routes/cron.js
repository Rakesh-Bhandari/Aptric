// Scheduled work that has to call out of Postgres. Vercel Cron (vercel.json)
// calls GET /cron/push every hour with "Authorization: Bearer <CRON_SECRET>";
// any other scheduler can do the same.

import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { HttpError, unauthorized } from '../http.js';
import { runDueNotifications } from '../push/jobs.js';
import { pushEnabled } from '../push/sender.js';

/** Whether the Authorization header carries the cron secret (constant-time). */
export function validCronAuth(header, secret) {
  const token = (header ?? '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const router = Router();

router.get('/push', async (req, res) => {
  if (!config.cronSecret) throw new HttpError(503, 'cron_unavailable', 'CRON_SECRET is not set.');
  if (!validCronAuth(req.get('authorization'), config.cronSecret)) throw unauthorized('401', 'Invalid cron secret.');
  if (!pushEnabled()) return res.json({ skipped: 'VAPID keys are not set' });
  res.json(await runDueNotifications());
});

export default router;
