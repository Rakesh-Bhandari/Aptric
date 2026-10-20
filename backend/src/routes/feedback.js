import { Router } from 'express';
import { badRequest } from '../http.js';
import { query } from '../db.js';
import { limitByIp } from '../middleware/rateLimit.js';

const router = Router();
const ALLOWED_TYPES = new Set(['typo', 'solution', 'clarity', 'suggestion']);

// Anonymous reports are stored for moderation; they are never published automatically.
router.post('/', limitByIp('public:resource-feedback', 3600, 5), async (req, res) => {
  const body = req.body ?? {};
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const type = typeof body.type === 'string' ? body.type : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!topic || topic.length > 120) throw badRequest('Topic must be between 1 and 120 characters.');
  if (!ALLOWED_TYPES.has(type)) throw badRequest('Choose a valid feedback category.');
  if (message.length < 8 || message.length > 1000) {
    throw badRequest('Feedback must be between 8 and 1,000 characters.');
  }

  await query(
    `insert into public.resource_feedback (topic, feedback_type, message) values ($1, $2, $3)`,
    [topic, type, message],
  );
  res.status(201).json({ received: true, message: 'Your report was received for review.' });
});

export default router;
