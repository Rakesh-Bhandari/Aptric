// src/hooks/useDailyQuestions.js
// Drop-in hook for the Practice page.
// Polls /api/daily-questions until questions are ready (status === 'ready').
// Handles the 202 'generating' state so Vercel timeout is never hit.

import { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../utils/config';

const POLL_INTERVAL_MS = 3000; // poll every 3 seconds while generating
const MAX_POLLS = 40;           // give up after ~2 minutes

export function useDailyQuestions() {
    const [questions, setQuestions]   = useState([]);
    const [logId, setLogId]           = useState(null);
    const [status, setStatus]         = useState('loading'); // 'loading' | 'generating' | 'ready' | 'error'
    const [message, setMessage]       = useState('');
    const [pollCount, setPollCount]   = useState(0);

    const fetchQuestions = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/daily-questions`, {
                credentials: 'include'
            });

            if (res.status === 401) {
                setStatus('error');
                setMessage('Please log in to continue.');
                return;
            }

            const data = await res.json();

            if (res.status === 202 || data.status === 'generating') {
                // Questions not ready — keep polling
                setStatus('generating');
                setMessage(data.message || 'Preparing your questions...');
                return; // useEffect will retry
            }

            if (data.status === 'ready' && data.questions?.length > 0) {
                setQuestions(data.questions);
                setLogId(data.logId);
                setStatus('ready');
                return;
            }

            setStatus('error');
            setMessage(data.error || 'Something went wrong. Please refresh.');
        } catch (err) {
            console.error('[useDailyQuestions]', err);
            setStatus('error');
            setMessage('Network error. Please check your connection.');
        }
    }, []);

    useEffect(() => {
        if (status === 'ready' || status === 'error') return;
        if (pollCount >= MAX_POLLS) {
            setStatus('error');
            setMessage('Question generation is taking too long. Please refresh.');
            return;
        }

        if (status === 'loading') {
            // First fetch immediately
            fetchQuestions();
            setPollCount(1);
        } else if (status === 'generating') {
            // Subsequent fetches after delay
            const timer = setTimeout(() => {
                fetchQuestions();
                setPollCount(c => c + 1);
            }, POLL_INTERVAL_MS);
            return () => clearTimeout(timer);
        }
    }, [status, pollCount, fetchQuestions]);

    return { questions, setQuestions, logId, status, message };
}