// POST /rpc/:name: the game and admin SQL functions, called as the signed-in
// user. Only the functions below are reachable, only with their declared
// arguments, each cast to its SQL type; the functions themselves still check
// who may call them (grants, private.require_uid(), private.is_admin()).

import { Router } from 'express';
import { asUser } from '../db.js';
import { badRequest, notFound } from '../http.js';
import { requireUser } from '../middleware/auth.js';

// name -> { args: { arg: sql type }, set: returns rows (setof / table), void: returns nothing }
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
  const { rows } = await asUser(req.user.id, (db) => db.query(text, params));
  if (shape === 'rows') return res.json(rows);
  res.json(shape === 'void' ? null : (rows[0]?.result ?? null));
});

export default router;
