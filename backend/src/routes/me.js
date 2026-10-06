// The signed-in player's own rows and the small catalogs the app reads.
// Queries run with auth.uid() = the player but as the gateway's owner role
// (see supabase/migrations/20261002000002_backend_gateway.sql), so RLS does
// not apply: each query below carries its policy's condition itself, and only
// columns the player was granted are read or written.

import { Router } from 'express';
import { asUser, asUserBatch } from '../db.js';
import { badRequest, forbidden } from '../http.js';
import { requireUser } from '../middleware/auth.js';
import { getEntitlements, publicEntitlements } from '../entitlements.js';

const router = Router();
router.use(requireUser);

const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, bio, role, timezone, exam_goal, daily_target, onboarded_at, placement_level, placed_at, detect_tab_switches_practice';

// Columns a player may change (the profiles column grants allow these).
// detect_tab_switches_practice only affects Practice: Daily and contests always detect tab switches,
// and there is no column (so no way to PATCH one) that could turn that off.
const EDITABLE = [
  'handle', 'display_name', 'bio', 'timezone', 'exam_goal', 'daily_target', 'onboarded_at', 'detect_tab_switches_practice',
];

/** The columns of a PATCH /me/profile body, or 400. */
export function validateProfilePatch(patch) {
  const keys = Object.keys(patch);
  const unknown = keys.filter((k) => !EDITABLE.includes(k));
  if (unknown.length) throw badRequest(`Cannot change ${unknown.join(', ')}`);
  if (!keys.length) throw badRequest('Nothing to change.');
  if ('detect_tab_switches_practice' in patch && typeof patch.detect_tab_switches_practice !== 'boolean') {
    throw badRequest('detect_tab_switches_practice must be true or false.');
  }
  return keys;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOPICS = 200;

/** The topic ids of a PATCH /me/preferences body ({ preferred_topic_ids, excluded_topic_ids }), or 400. */
export function validatePreferences(body) {
  const lists = {};
  for (const field of ['preferred_topic_ids', 'excluded_topic_ids']) {
    const ids = body?.[field] ?? [];
    if (!Array.isArray(ids) || ids.length > MAX_TOPICS || !ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      throw badRequest(`${field} must be a list of topic ids.`);
    }
    lists[field] = [...new Set(ids.map((id) => id.toLowerCase()))];
  }
  if (lists.preferred_topic_ids.some((id) => lists.excluded_topic_ids.includes(id))) {
    throw badRequest('A topic cannot be both preferred and excluded.');
  }
  return lists;
}

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
  const keys = validateProfilePatch(patch);

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

const PREFERENCES_SQL = `
  select coalesce(array_agg(topic_id) filter (where preference = 'prefer'), '{}') as preferred_topic_ids,
         coalesce(array_agg(topic_id) filter (where preference = 'exclude'), '{}') as excluded_topic_ids
  from public.user_topic_preferences
  where user_id = auth.uid()`;

router.get('/me/preferences', async (req, res) => {
  const { rows } = await asUser(req.user.id, PREFERENCES_SQL);
  res.json(rows[0]);
});

// Replaces the whole list. Unknown or retired topics are dropped. A set the player has not
// started yet is rebuilt from the new topics; one in progress stays until tomorrow.
router.patch('/me/preferences', async (req, res) => {
  const { preferred_topic_ids: preferred, excluded_topic_ids: excluded } = validatePreferences(req.body);
  const [, , , { rows }] = await asUserBatch(req.user.id, [
    ['delete from public.user_topic_preferences where user_id = auth.uid()'],
    [`insert into public.user_topic_preferences (user_id, topic_id, preference)
      select auth.uid(), t.id, x.preference
      from (select unnest($1::uuid[]) as id, 'prefer' as preference
            union all select unnest($2::uuid[]), 'exclude') x
      join public.topics t on t.id = x.id and t.is_active
      where not private.is_banned()`, [preferred, excluded]],
    [`delete from public.daily_sets s
      where s.user_id = auth.uid()
        and not exists (select 1 from public.attempts a where a.daily_set_id = s.id)
        and not exists (select 1 from public.hint_uses h where h.daily_set_id = s.id)`],
    [PREFERENCES_SQL],
  ]);
  res.json(rows[0]);
});

// The player's plan: feature switches, limits and whether ads are shown.
router.get('/me/entitlements', async (req, res) => {
  res.json(publicEntitlements(await getEntitlements(req.user.id)));
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

// Active topics by section, for the daily-set preferences. Only topics with a published question.
router.get('/catalog/topics', async (req, res) => {
  const { rows } = await asUser(
    req.user.id,
    `select sec.id as section_id, sec.name as section, t.id, t.name,
            (select count(*) from public.questions q join public.subtopics st on st.id = q.subtopic_id
             where st.topic_id = t.id and q.status = 'published') as questions
     from public.topics t
     join public.sections sec on sec.id = t.section_id and sec.is_active
     where t.is_active
     order by sec.sort_order, sec.name, t.sort_order, t.name`,
  );
  res.json(rows.filter((r) => r.questions > 0));
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
