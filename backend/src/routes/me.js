// The signed-in player's own rows and the small catalogs the app reads.
// Every query runs as the user, so RLS and column grants decide what works.

import { Router } from 'express';
import { asUser } from '../db.js';
import { badRequest, forbidden } from '../http.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser);

const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, bio, role, timezone, exam_goal, daily_target, onboarded_at, placement_level, placed_at';

// Columns a player may change (the profiles column grants allow these).
const EDITABLE = ['handle', 'display_name', 'bio', 'timezone', 'exam_goal', 'daily_target', 'onboarded_at'];

router.get('/me/profile', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query(`select ${PROFILE_COLUMNS} from public.profiles where id = auth.uid()`));
  if (!rows[0]) throw forbidden('No profile for this account.');
  res.json(rows[0]);
});

router.patch('/me/profile', async (req, res) => {
  const patch = req.body ?? {};
  const keys = Object.keys(patch);
  const unknown = keys.filter((k) => !EDITABLE.includes(k));
  if (unknown.length) throw badRequest(`Cannot change ${unknown.join(', ')}`);
  if (!keys.length) throw badRequest('Nothing to change.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const { rows } = await asUser(req.user.id, (db) =>
    db.query(
      `update public.profiles set ${sets.join(', ')} where id = auth.uid() returning ${PROFILE_COLUMNS}`,
      keys.map((k) => patch[k]),
    ));
  // RLS hides the row from banned players.
  if (!rows[0]) throw forbidden('Your profile cannot be changed right now.');
  res.json(rows[0]);
});

router.get('/me/placement', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query(
      `select completed_at, placed_level, correct, score from public.placement_tests
       where user_id = auth.uid() and completed_at is not null
       order by completed_at desc limit 1`,
    ));
  res.json(rows[0] ?? null);
});

router.post('/reports', async (req, res) => {
  const { question_id: questionId, reason, details } = req.body ?? {};
  await asUser(req.user.id, (db) =>
    db.query(
      'insert into public.reports (question_id, reason, details) values ($1, $2, $3)',
      [questionId, reason, typeof details === 'string' && details.trim() ? details : null],
    ));
  res.status(201).json({ ok: true });
});

router.post('/feedback', async (req, res) => {
  const { category, message, page } = req.body ?? {};
  await asUser(req.user.id, (db) =>
    db.query(
      `insert into public.feedback (category, message, page)
       values (coalesce($1::public.feedback_category, 'general'), $2, $3)`,
      [category ?? null, message, page ?? null],
    ));
  res.status(201).json({ ok: true });
});

router.get('/catalog/exam-tags', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query(`select slug, name from public.tags where kind = 'exam' order by sort_order`));
  res.json(rows);
});

router.get('/catalog/levels', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) => db.query('select level, name, slug from public.levels order by level'));
  res.json(rows);
});

/** Subtopic of a question the player can read (published, or one they attempted). */
router.get('/questions/:id/subtopic', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query('select subtopic_id from public.questions where id = $1', [req.params.id]));
  res.json({ subtopic_id: rows[0]?.subtopic_id ?? null });
});

export default router;
