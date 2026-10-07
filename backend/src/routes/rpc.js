// POST /rpc/:name: the game and admin SQL functions, called as the signed-in
// user. Only the functions below are reachable, only with their declared
// arguments, each cast to its SQL type. Every one is SECURITY DEFINER and
// checks the caller itself (private.require_uid(), private.is_admin(), bans).

import { Router } from 'express';
import { asUser } from '../db.js';
import { badRequest, HttpError, notFound } from '../http.js';
import { requireAdmin, requireUser } from '../middleware/auth.js';
import { hit } from '../middleware/rateLimit.js';
import { ensurePersonalSet } from '../personalSet.js';
import { getEntitlements, hasFeature } from '../entitlements.js';

// Argument shapes checked before any SQL runs (the functions validate again).
const HANDLE = /^[A-Za-z0-9_]{1,24}$/;
const SEARCH_TERM = /^@?[A-Za-z0-9_]{0,24}$/;
// "<timestamptz>|<uuid or id>" or a handle, as the paging functions return them.
const CURSOR = /^[0-9A-Za-z:+.| _-]{1,80}$/;
// A hot-feed cursor also carries the page's clock and a score (e.g. 1.2345e-05).
const CURSOR_LONG = /^[0-9A-Za-z:+.| _eE-]{1,160}$/;
const WORD = /^[a-z_]{1,24}$/;
const FEED_WORD = /^[a-z_]{1,12}$/;

// name -> { args: { arg: sql type }, set: returns rows (setof / table), void: returns nothing,
//           admin: the route itself refuses non-admins before the call,
//           limit: [bucket, window seconds, max calls] per player, counted before the call (429 when spent),
//           flag: the plan feature that switches it on (plans.features; dark until set),
//           flagArgs: { arg: flag } a truthy argument needs that feature too,
//           check: { arg: RegExp } a string argument must match (400 otherwise),
//           max: { arg: n } a string argument has at most n characters }
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
  get_leaderboard: { args: { board: 'text', page_size: 'integer', page_offset: 'integer', friends_only: 'boolean' } },
  get_player_profile: { args: { target_handle: 'text' } },
  list_contests: { args: {} },
  get_contest: { args: { contest_id: 'uuid' } },
  join_contest: { args: { contest_id: 'uuid' } },
  finish_contest: { args: { contest_id: 'uuid', violation: 'text' } },
  submit_contest_answer: { args: { contest_id: 'uuid', question_id: 'uuid', option_id: 'uuid', time_ms: 'integer' } },
  get_contest_standings: { args: { contest_id: 'uuid', page_size: 'integer', page_offset: 'integer', friends_only: 'boolean' } },
  // Community: follow / friends. Each checks the caller, blocks and its own caps in SQL;
  // the limit here is the outer flood guard.
  follow_user: { limit: ['rpc_follow', 60, 120], check: { target_handle: HANDLE }, args: { target_handle: 'text' } },
  unfollow_user: { limit: ['rpc_follow', 60, 120], check: { target_handle: HANDLE }, args: { target_handle: 'text' } },
  remove_follower: { limit: ['rpc_follow', 60, 120], check: { target_handle: HANDLE }, args: { target_handle: 'text' } },
  respond_follow_request: { limit: ['rpc_follow', 60, 120], args: { request_id: 'uuid', accept: 'boolean' } },
  get_follow_requests: { args: {} },
  block_user: { limit: ['rpc_block', 60, 20], check: { target_handle: HANDLE }, args: { target_handle: 'text' } },
  unblock_user: { limit: ['rpc_block', 60, 20], check: { target_handle: HANDLE }, args: { target_handle: 'text' } },
  get_blocks: { args: {} },
  report_user: {
    limit: ['rpc_report', 3600, 20], check: { target_handle: HANDLE, reason: WORD }, max: { details: 500 },
    args: { target_handle: 'text', reason: 'text', details: 'text' },
  },
  get_followers: { check: { target_handle: HANDLE, cursor: CURSOR }, args: { target_handle: 'text', cursor: 'text' } },
  get_following: { check: { target_handle: HANDLE, cursor: CURSOR }, args: { target_handle: 'text', cursor: 'text' } },
  search_users: { limit: ['rpc_search', 60, 40], check: { q: SEARCH_TERM, cursor: CURSOR }, args: { q: 'text', cursor: 'text' } },
  get_suggested_users: { args: {} },
  get_friend_activity: { check: { cursor: CURSOR }, args: { cursor: 'text' } },
  get_privacy: { args: {} },
  set_privacy: {
    limit: ['rpc_privacy', 3600, 60],
    args: {
      is_private: 'boolean', stats_visibility: 'public.visibility_level', exam_visibility: 'public.visibility_level',
      college_visibility: 'public.visibility_level', name_visibility: 'public.visibility_level',
      share_activity: 'boolean', discoverable: 'boolean',
    },
  },
  // Community: 48-hour posts (flag community_posts). The limits here are the outer flood guard; the
  // per-day post and reply limits come from plans.limits in SQL.
  create_post: {
    limit: ['rpc_post', 60, 10], max: { body: 600 }, check: { kind: WORD, exam_tag: /^[a-z0-9_-]{1,40}$/ },
    args: {
      kind: 'text', body: 'text', question_id: 'uuid', topic_id: 'uuid', exam_tag: 'text',
      contains_spoiler: 'boolean', poll_options: 'text[]',
    },
  },
  delete_post: { limit: ['rpc_post', 60, 10], args: { target_post_id: 'uuid' } },
  create_reply: { limit: ['rpc_reply', 60, 20], max: { body: 400 }, args: { target_post_id: 'uuid', body: 'text' } },
  delete_reply: { limit: ['rpc_reply', 60, 20], args: { target_reply_id: 'uuid' } },
  react_post: { limit: ['rpc_react', 60, 60], check: { reaction: WORD }, args: { target_post_id: 'uuid', reaction: 'text' } },
  vote_poll: { limit: ['rpc_react', 60, 60], args: { target_post_id: 'uuid', option_idx: 'integer' } },
  report_post: {
    limit: ['rpc_report', 3600, 20], check: { reason: WORD }, max: { details: 300 },
    args: { target_post_id: 'uuid', reason: 'text', details: 'text' },
  },
  mute_user: { limit: ['rpc_block', 60, 20], check: { target_handle: HANDLE }, args: { target_handle: 'text' } },
  unmute_user: { limit: ['rpc_block', 60, 20], check: { target_handle: HANDLE }, args: { target_handle: 'text' } },
  get_mutes: { args: {} },
  get_feed: { check: { feed: FEED_WORD, sort: FEED_WORD, cursor: CURSOR_LONG }, args: { feed: 'text', sort: 'text', topic_id: 'uuid', cursor: 'text' } },
  get_post: { args: { target_post_id: 'uuid' } },
  get_replies: { check: { cursor: CURSOR }, args: { target_post_id: 'uuid', cursor: 'text' } },
  // Moderation: the route refuses non-admins, the SQL checks again and audits every action.
  admin_list_post_reports: { admin: true, check: { only_status: WORD }, args: { only_status: 'text', page_size: 'integer', page_offset: 'integer' } },
  admin_moderate_post: { admin: true, check: { action: WORD }, max: { note: 500 }, args: { target_post_id: 'uuid', action: 'text', note: 'text' } },
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

// Community functions stay dark until the player's plan carries the switch (plans.features).
export const COMMUNITY_FLAG = 'community_follow';
for (const name of [
  'follow_user', 'unfollow_user', 'remove_follower', 'respond_follow_request', 'get_follow_requests', 'block_user',
  'unblock_user', 'get_blocks', 'report_user', 'get_followers', 'get_following', 'search_users', 'get_suggested_users',
  'get_friend_activity', 'get_privacy', 'set_privacy',
]) RPCS[name].flag = COMMUNITY_FLAG;
// 48-hour posts are a second switch, so the two halves can open separately.
export const POSTS_FLAG = 'community_posts';
for (const name of [
  'create_post', 'delete_post', 'create_reply', 'delete_reply', 'react_post', 'vote_poll', 'report_post', 'mute_user',
  'unmute_user', 'get_mutes', 'get_feed', 'get_post', 'get_replies',
]) RPCS[name].flag = POSTS_FLAG;
// The Friends filter is the part of two older functions that belongs to the community feature.
RPCS.get_leaderboard.flagArgs = { friends_only: COMMUNITY_FLAG };
RPCS.get_contest_standings.flagArgs = { friends_only: COMMUNITY_FLAG };

/** The plan features a call needs: the function's own flag, plus those of any flagged argument that is set. */
export function requiredFlags(name, body = {}) {
  const spec = Object.hasOwn(RPCS, name) ? RPCS[name] : null;
  if (!spec) return [];
  const flags = new Set(spec.flag ? [spec.flag] : []);
  for (const [arg, flag] of Object.entries(spec.flagArgs ?? {})) if (body?.[arg]) flags.add(flag);
  return [...flags];
}

// Calls that read or score today's daily set. The player's personal set is made
// first (once a day, a cheap read after that), so they all see the same set.
export const DAILY_RPCS = new Set(['get_today_set', 'get_daily_result', 'submit_answer', 'use_hint', 'give_up']);

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
    const pattern = spec.check?.[arg];
    if (pattern && value !== null && !(typeof value === 'string' && pattern.test(value))) throw badRequest(`${arg} is not valid`);
    const max = spec.max?.[arg];
    if (max && value !== null && (typeof value !== 'string' || value.length > max)) throw badRequest(`${arg} must be at most ${max} characters`);
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
  const { admin, limit } = RPCS[req.params.name];
  const flags = requiredFlags(req.params.name, req.body);
  if (flags.length) {
    const ent = await getEntitlements(req.user.id);
    if (!flags.every((f) => hasFeature(ent, f))) {
      throw new HttpError(403, 'feature_disabled', 'This feature is not available to you yet.', { feature: flags[0] });
    }
  }
  if (admin) await requireAdmin(req, res, () => {});
  if (limit) await hit(limit[0], req.user.id, limit[1], limit[2]);
  // A past set (get_daily_result with target_set_id) needs no new set; context 'practice' neither.
  const past = req.params.name === 'get_daily_result' && req.body?.target_set_id;
  if (DAILY_RPCS.has(req.params.name) && !past && req.body?.context !== 'practice') {
    // Never block playing: without a personal set the shared one applies.
    await ensurePersonalSet(req.user.id).catch((err) => console.error('personal daily set:', err));
  }
  const { rows } = await asUser(req.user.id, text, params);
  if (shape === 'rows') return res.json(rows);
  res.json(shape === 'void' ? null : (rows[0]?.result ?? null));
});

export default router;
