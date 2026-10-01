// src/hooks/useDailyQuestions.js
// Loads today's daily set for the signed-in user's track via the
// get_today_set RPC and shapes it for the Practice page.

import { useState, useEffect, useCallback, useRef } from 'react';
import { getTodaySet, gameErrorMessage } from '../lib/game';

export const attemptStatus = (attempt) => {
    if (!attempt) return null;
    if (attempt.gave_up) return 'gave_up';
    return attempt.is_correct ? 'correct' : 'wrong';
};

const toQuestion = (q) => {
    const optionIds = (q.options || []).map(o => o.id);
    const selected = q.attempt?.selected_option_id;
    const selectedIndex = selected ? optionIds.indexOf(selected) : null;
    return {
        qid: q.id,
        questionText: q.stem,
        difficulty: q.difficulty,
        category: q.topic || q.section || '',
        options: (q.options || []).map(o => o.body),
        optionIds,
        hint: q.hint,
        status: attemptStatus(q.attempt) || (q.hint_used ? 'hint_used' : 'pending'),
        selectedAnswerIndex: selectedIndex,
        // The set never carries answer keys; a correct pick is the only one we know.
        correctAnswerIndex: q.attempt?.is_correct ? selectedIndex : null,
        pointsEarned: q.attempt?.xp_awarded ?? 0,
    };
};

export function useDailyQuestions() {
    const [questions, setQuestions] = useState([]);
    const [dailySet, setDailySet] = useState(null);
    const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'empty' | 'error'
    const [message, setMessage] = useState('');
    const activeRef = useRef(true);

    const fetchQuestions = useCallback(async () => {
        try {
            const data = await getTodaySet();
            if (!activeRef.current) return;
            setDailySet(data);
            const list = (data?.questions || []).map(toQuestion);
            setQuestions(list);
            if (list.length > 0) {
                setStatus('ready');
            } else {
                setStatus('empty');
                setMessage('NO_SET_RELEASED: Today\'s set for your track is not out yet. Check back soon.');
            }
        } catch (err) {
            console.error('[useDailyQuestions]', err);
            if (!activeRef.current) return;
            setStatus('error');
            setMessage(gameErrorMessage(err));
        }
    }, []);

    const retry = useCallback(() => {
        setStatus('loading');
        fetchQuestions();
    }, [fetchQuestions]);

    useEffect(() => {
        activeRef.current = true;
        fetchQuestions();
        return () => { activeRef.current = false; };
    }, [fetchQuestions]);

    return { questions, setQuestions, dailySet, status, message, retry };
}
