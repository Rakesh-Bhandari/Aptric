// POST /rpc/:name: the game and admin SQL functions, called as the signed-in
// user. Only the functions below are reachable, only with their declared
// arguments, each cast to its SQL type. Every one is SECURITY DEFINER and
// checks the caller itself (private.require_uid(), private.is_admin(), bans).

import { Router } from 'express';
import { asUser } from '../db.js';
import { badRequest, DbError, HttpError, notFound } from '../http.js';
import { requireAdmin, requireUser } from '../middleware/auth.js';

// name -> { args: { arg: sql type }, set: returns rows (setof / table), void: returns nothing,
//           admin: the route itself refuses non-admins before the call }
export const RPCS = {
  // Daily challenge and answering
  get_today_set: { args: {} },
  get_daily_result: { args: { target_set_id: 'uuid' } },
  submit_answer: { args: { question_id: 'uuid', option_id: 'uuid', context: 'public.attempt_context', time_ms: 'integer' } },
  use_hint: { args: { question_id: 'uuid', context: 'public.attempt_context' } },
  give_up: { args: { question_id: 'uuid', context: 'public.attempt_context' } },
  // Practice, placement, progress
  get_practice_tree: { args: {} },
  get_practice_questions: {
    args: { subtopic_ids: 'uuid[]', prefer_difficulty: 'public.question_difficulty', mode: 'text', question_limit: 'integer' },
  },
  get_mistakes: { args: { page_size: 'integer', page_offset: 'integer' } },
  get_activity: { args: { days: 'integer' } },
  start_placement: { args: {} },
  finish_placement: { args: { test_id: 'uuid', answers: 'jsonb' } },
  // Standings and contests
  get_my_league: { args: {} },
  get_leaderboard: { args: { board: 'text', page_size: 'integer', page_offset: 'integer' } },
  get_player_profile: { args: { target_handle: 'text' } },
  list_contests: { args: {} },
  get_contest: { args: { contest_id: 'uuid' } },
  join_contest: { args: { contest_id: 'uuid' } },
  submit_contest_answer: { args: { contest_id: 'uuid', question_id: 'uuid', option_id: 'uuid', time_ms: 'integer' } },
  get_contest_standings: { args: { contest_id: 'uuid', page_size: 'integer', page_offset: 'integer' } },
  // Admin (each checks private.is_admin() itself)
  admin_get_question: { args: { target_question_id: 'uuid' } },
  admin_save_question: {
    args: {
      target_question_id: 'uuid', subtopic_id: 'uuid', stem: 'text', difficulty: 'public.question_difficulty',
      est_seconds: 'integer', options: 'text[]', correct_index: 'integer', explanation: 'text', hint: 'text', tags: 'text[]',
    },
  },
  admin_set_question_status: {
    args: { question_ids: 'uuid[]', new_status: 'public.question_status', note: 'text', from_status: 'public.question_status' },
  },
  admin_list_users: {
    set: true,
    args: {
      search: 'text', only_role: 'public.user_role', only_banned: 'boolean', target_user_id: 'uuid',
      page_size: 'integer', page_offset: 'integer',
    },
  },
  admin_set_user_role: { void: true, args: { target_user_id: 'uuid', new_role: 'public.user_role' } },
  admin_set_user_ban: { void: true, args: { target_user_id: 'uuid', banned: 'boolean', reason: 'text' } },
  // Admin contests (audited by the contests / contest_items triggers)
  admin_list_contests: { admin: true, args: {} },
  admin_get_contest: { admin: true, args: { target_contest_id: 'uuid' } },
  admin_save_contest: {
    admin: true,
    args: {
      target_contest_id: 'uuid', title: 'text', description: 'text', starts_at: 'timestamptz', ends_at: 'timestamptz',
      question_ids: 'uuid[]', is_published: 'boolean',
    },
  },
  admin_set_contest_published: { admin: true, void: true, args: { target_contest_id: 'uuid', published: 'boolean' } },
  admin_delete_contest: { admin: true, void: true, args: { target_contest_id: 'uuid' } },
  admin_pick_contest_questions: {
    admin: true,
    args: {
      section_id: 'uuid', topic_id: 'uuid', subtopic_id: 'uuid', difficulty: 'public.question_difficulty',
      question_count: 'integer', exclude_ids: 'uuid[]',
    },
  },
  admin_get_contest_results: { admin: true, args: { target_contest_id: 'uuid', page_size: 'integer', page_offset: 'integer' } },
};

/**
 * SQL and parameters for one call, using named notation so omitted arguments
 * take their SQL defaults (as PostgREST did). Unknown names/arguments throw.
 */
export function buildCall(name, body = {}) {
  const spec = Object.hasOwn(RPCS, name) ? RPCS[name] : null;
  if (!spec) throw notFound(`Unknown function ${name}`);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Arguments must be a JSON object.');

  const params = [];
  const named = [];
  for (const [arg, value] of Object.entries(body)) {
    const type = Object.hasOwn(spec.args, arg) ? spec.args[arg] : null;
    if (!type) throw badRequest(`Unknown argument ${arg} for ${name}`);
    if (value === undefined) continue;
    if (type.endsWith('[]') && value !== null && !Array.isArray(value)) throw badRequest(`${arg} must be an array`);
    params.push(type === 'jsonb' && value !== null ? JSON.stringify(value) : value);
    named.push(`${arg} => $${params.length}::${type}`);
  }
  const call = `public.${name}(${named.join(', ')})`;
  if (spec.set) return { text: `select * from ${call}`, params, shape: 'rows' };
  return { text: `select ${call} as result`, params, shape: spec.void ? 'void' : 'value' };
}

const router = Router();

router.post('/:name', requireUser, async (req, res) => {
  const { text, params, shape } = buildCall(req.params.name, req.body ?? {});
  if (RPCS[req.params.name].admin) await requireAdmin(req, res, () => {});
  const { rows } = await asUser(req.user.id, text, params).catch((err) => {
    // 42883: the function is not in the database yet, i.e. a migration has not been applied.
    if (err instanceof DbError && err.code === '42883') {
      throw new HttpError(503, 'migration_missing', `${req.params.name} is not in the database. Apply the latest supabase/migrations.`);
    }
    throw err;
  });
  if (shape === 'rows') return res.json(rows);
  res.json(shape === 'void' ? null : (rows[0]?.result ?? null));
});

export default router;
