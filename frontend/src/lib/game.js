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
// { is_correct, correct_option_id, explanation, xp_awarded, used_hint, current_streak, ... }
export const submitAnswer = ({ questionId, optionId, context, timeMs = null }) =>
    rpc('submit_answer', { question_id: questionId, option_id: optionId, context, time_ms: timeMs });

// Resolves to { context, hint, charged }. Only the first reveal is charged.
export const requestHint = ({ questionId, context }) =>
    rpc('use_hint', { question_id: questionId, context });

// Spends the attempt for 0 XP; resolves like submitAnswer.
export const giveUp = ({ questionId, context }) =>
    rpc('give_up', { question_id: questionId, context });

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
