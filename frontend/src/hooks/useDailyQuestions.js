// src/hooks/useDailyQuestions.js
// Polls /api/daily-questions until questions are ready (status === 'ready').
// Handles the 202 'generating' state so the serverless timeout is never hit.

import { useState, useEffect, useCallback, useRef } from 'react';
import API_BASE_URL from '../utils/config';

export const POLL_INTERVAL_MS = 4000;
export const MAX_POLLS = 30; // ~2 minutes

export function useDailyQuestions() {
    const [questions, setQuestions] = useState([]);
    const [status, setStatus] = useState('loading'); // 'loading' | 'generating' | 'ready' | 'error'
    const [message, setMessage] = useState('');
    const [pollCount, setPollCount] = useState(0);
    const timerRef = useRef(null);
    const pollsRef = useRef(0);
    const activeRef = useRef(true);

    const fetchQuestions = useCallback(async () => {
        clearTimeout(timerRef.current);
        let res, data;
        try {
            res = await fetch(`${API_BASE_URL}/api/daily-questions`, { credentials: 'include' });
            data = await res.json();
        } catch (err) {
            console.error('[useDailyQuestions]', err);
            setStatus('error');
            setMessage('NETWORK_ERROR: Could not reach server.');
            return;
        }

        if (res.status === 401) {
            setStatus('error');
            setMessage('SESSION_EXPIRED: Please log in again.');
            return;
        }

        if (res.status === 202 || data.status === 'generating') {
            pollsRef.current += 1;
            setPollCount(pollsRef.current);
            if (pollsRef.current >= MAX_POLLS) {
                setStatus('error');
                setMessage('TIMEOUT: Generation is taking too long. Please refresh.');
                return;
            }
            setStatus('generating');
            setMessage(data.message || 'AI is compiling your training data...');
            // A request still in flight at unmount must not schedule another poll.
            if (activeRef.current) timerRef.current = setTimeout(fetchQuestions, POLL_INTERVAL_MS);
            return;
        }

        if (data.status === 'ready' && data.questions?.length > 0) {
            setQuestions(data.questions);
            setStatus('ready');
            return;
        }

        setStatus('error');
        setMessage(data.error || 'NO_QUESTIONS_FOUND: Please refresh.');
    }, []);

    const retry = useCallback(() => {
        pollsRef.current = 0;
        setPollCount(0);
        setStatus('loading');
        fetchQuestions();
    }, [fetchQuestions]);

    useEffect(() => {
        activeRef.current = true;
        fetchQuestions();
        return () => {
            activeRef.current = false;
            clearTimeout(timerRef.current);
        };
    }, [fetchQuestions]);

    return { questions, setQuestions, status, message, pollCount, retry };
}
