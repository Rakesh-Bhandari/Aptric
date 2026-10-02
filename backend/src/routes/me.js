// The signed-in player's own rows and the small catalogs the app reads.
// Queries run with auth.uid() = the player but as the gateway's owner role
// (see supabase/migrations/20261002000002_backend_gateway.sql), so RLS does
// not apply: each query below carries its policy's condition itself, and only
// columns the player was granted are read or written.

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

// The "questions: read published, attempted, or admin" policy, for alias q.
const VISIBLE_QUESTION = `q.status = 'published'
  or private.is_admin()
  or exists (select 1 from public.attempts a where a.question_id = q.id and a.user_id = auth.uid())`;

router.get('/me/profile', async (req, res) => {
  const { rows } = await asUser(req.user.id, `select ${PROFILE_COLUMNS} from public.profiles where id = auth.uid()`);
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
  const { rows } = await asUser(
    req.user.id,
    `update public.profiles set ${sets.join(', ')}
     where id = auth.uid() and banned_at is null
     returning ${PROFILE_COLUMNS}`,
    keys.map((k) => patch[k]),
  );
  // Banned players can't edit (the "banned users cannot edit" policy).
  if (!rows[0]) throw forbidden('Your profile cannot be changed right now.');
  res.json(rows[0]);
});

router.get('/me/placement', async (req, res) => {
  const { rows } = await asUser(
    req.user.id,
    `select completed_at, placed_level, correct, score from public.placement_tests
     where user_id = auth.uid() and completed_at is not null
     order by completed_at desc limit 1`,
  );
  res.json(rows[0] ?? null);
});

router.post('/reports', async (req, res) => {
  const { question_id: questionId, reason, details } = req.body ?? {};
  // reporter_id defaults to auth.uid(). As the "reports: insert own" and
  // "not banned" policies: the question must be visible to the player.
  const { rows } = await asUser(
    req.user.id,
    `insert into public.reports (question_id, reason, details)
     select q.id, $2, $3 from public.questions q
     where q.id = $1::uuid
       and not private.is_banned()
       and (${VISIBLE_QUESTION})
     returning id`,
    [questionId ?? null, reason ?? null, typeof details === 'string' && details.trim() ? details : null],
  );
  if (!rows[0]) throw forbidden('You cannot report this question.');
  res.status(201).json({ ok: true });
});

router.post('/feedback', async (req, res) => {
  const { category, message, page } = req.body ?? {};
  // user_id defaults to auth.uid(); banned players can't send feedback.
  const { rows } = await asUser(
    req.user.id,
    `insert into public.feedback (category, message, page)
     select coalesce($1::public.feedback_category, 'general'), $2, $3
     where not private.is_banned()
     returning id`,
    [category ?? null, message ?? null, page ?? null],
  );
  if (!rows[0]) throw forbidden('You cannot send feedback right now.');
  res.status(201).json({ ok: true });
});

router.get('/catalog/exam-tags', async (req, res) => {
  const { rows } = await asUser(
    req.user.id,
    `select slug, name from public.tags
     where kind = 'exam' and (is_active or private.is_admin())
     order by sort_order`,
  );
  res.json(rows);
});

router.get('/catalog/levels', async (req, res) => {
  const { rows } = await asUser(
    req.user.id,
    'select level, name, slug from public.levels where is_active or private.is_admin() order by level',
  );
  res.json(rows);
});

/** Subtopic of a question the player can read (published, or one they attempted). */
router.get('/questions/:id/subtopic', async (req, res) => {
  const { rows } = await asUser(
    req.user.id,
    `select q.subtopic_id from public.questions q where q.id = $1::uuid and (${VISIBLE_QUESTION})`,
    [req.params.id],
  );
  res.json({ subtopic_id: rows[0]?.subtopic_id ?? null });
});

export default router;
