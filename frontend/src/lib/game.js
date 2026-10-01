import { supabase } from './supabase';

// Thin wrappers over the gameplay RPCs (supabase/migrations/*_gameplay_rpcs.sql).
// Grading, hints, XP and streaks all happen in Postgres; the client never
// receives a correct option or explanation before its one scoring attempt.

const rpc = async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data;
};

// { set_date, track, daily_set_id, title, questions: [{ id, stem, options, attempt, hint, ... }] }
export const getTodaySet = () => rpc('get_today_set');

// context: 'daily' | 'practice'. Resolves to
// { is_correct, correct_option_id, explanation, xp_awarded, used_hint, current_streak, ...,
//   progress: { xp, level, leveled_up, next_level_xp, rating, streak_freezes, freezes_earned,
//               set_complete, bonus_xp, rating_change, new_badges } }
export const submitAnswer = ({ questionId, optionId, context, timeMs = null }) =>
    rpc('submit_answer', { question_id: questionId, option_id: optionId, context, time_ms: timeMs });

// Resolves to { context, hint, charged }. Only the first reveal is charged.
export const requestHint = ({ questionId, context }) =>
    rpc('use_hint', { question_id: questionId, context });

// Spends the attempt for 0 XP; resolves like submitAnswer.
export const giveUp = ({ questionId, context }) =>
    rpc('give_up', { question_id: questionId, context });

// Progression (supabase/migrations/*_progression.sql) ------------------------

// Share-card data for today's daily set (or a past one the caller played):
// { set_date, track, level, total, answered, correct, complete, xp_earned,
//   questions: [{ position, difficulty, outcome }], rating, current_streak, league }
export const getDailyResult = (dailySetId = null) =>
    rpc('get_daily_result', { target_set_id: dailySetId });

// board: 'all_time' | 'weekly' | 'rating'. Refreshed every 5 minutes.
// { board, refreshed_at, total, entries: [{ rank, user_id, handle, ... }], me }
export const getLeaderboard = ({ board = 'all_time', pageSize = 50, offset = 0 } = {}) =>
    rpc('get_leaderboard', { board, page_size: pageSize, page_offset: offset });

// The caller's league this week: { league_id, tier, members, promote_zone, demote_zone, week_ends_at, last_result }
export const getMyLeague = () => rpc('get_my_league');

// Level, rating, streaks, badges and per-section stats. No handle = the caller.
export const getPlayerProfile = (handle = null) =>
    rpc('get_player_profile', { target_handle: handle });

// Live league standings. The database broadcasts every XP change on the
// private channel `league:<id>` (members only); onUpdate receives
// { league_id, user_id, xp, last_xp_at, joined }; onStatus receives true while
// subscribed. Returns an unsubscribe function.
export const subscribeToLeague = (leagueId, onUpdate, onStatus = () => {}) => {
    const channel = supabase
        .channel(`league:${leagueId}`, { config: { private: true } })
        .on('broadcast', { event: 'member_xp' }, ({ payload }) => onUpdate(payload));
    // Private channels authorise with the user's JWT.
    supabase.realtime.setAuth().finally(() => channel.subscribe(status => onStatus(status === 'SUBSCRIBED')));
    return () => {
        onStatus(false);
        supabase.removeChannel(channel);
    };
};

// Human-readable message for an RPC error (codes come from the SQL functions).
export const gameErrorMessage = (error) => {
    switch (error?.code) {
        case '23505': return 'You have already answered this question.';
        case '42501': return 'This question is not available to you right now.';
        case 'P0002': return 'No daily set has been released for your track today.';
        case '22023': return 'That answer could not be submitted.';
        default: return error?.message || 'Something went wrong. Please try again.';
    }
};

// Maps an RPC result's correct_option_id back to an index into optionIds.
export const correctIndex = (optionIds, result) => optionIds.indexOf(result.correct_option_id);
