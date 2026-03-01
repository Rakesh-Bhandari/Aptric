import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import './Practice.css';
import API_BASE_URL from '../../utils/config';

const Icons = {
    Target: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>,
    Clock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    Bulb: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2 1.5 3.5.8.8 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>,
    Book: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
    Left: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>,
    Right: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>,
    Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
};

const FormattedText = ({ text }) => {
    if (!text) return null;
    const getHtml = () => {
        try { return { __html: marked.parse(text) }; } catch (e) { return { __html: text }; }
    };
    return <div dangerouslySetInnerHTML={getHtml()} />;
};

const POLL_INTERVAL = 4000;
const MAX_POLLS = 30; // 2 minutes max

const Practice = () => {
    const [userData, setUserData] = useState(null);
    const [userStats, setUserStats] = useState({ rank: 0, accuracy: 0, level: 'Beginner' });
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [genStatus, setGenStatus] = useState('loading'); // 'loading' | 'generating' | 'ready' | 'error'
    const [genMessage, setGenMessage] = useState('');
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);
    const [message, setMessage] = useState(null);
    const [countdownTime, setCountdownTime] = useState('--:--:--');
    const [questionTimer, setQuestionTimer] = useState(0);
    const timerRef = useRef(null);
    const pollCountRef = useRef(0);
    const pollTimerRef = useRef(null);

    const apiFetch = useCallback(async (endpoint, options = {}) => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                ...options,
            });
            // Return full response so caller can check status code
            return res;
        } catch (err) {
            console.error('[apiFetch]', endpoint, err);
            return null;
        }
    }, []);

    const refreshUserData = useCallback(async () => {
        const res = await apiFetch('/api/user/progress');
        if (!res || !res.ok) return;
        const data = await res.json();
        if (data) {
            setUserData(data.profile);
            setUserStats({
                rank: data.rank,
                accuracy: data.stats.accuracy,
                score: data.stats.score,
                streak: data.stats.streak,
                level: data.stats.level
            });
        }
    }, [apiFetch]);

    // ── Poll /api/daily-questions until status === 'ready' ──────
    const fetchDailyQuestions = useCallback(async () => {
        const res = await apiFetch('/api/daily-questions');
        if (!res) {
            setGenStatus('error');
            setGenMessage('NETWORK_ERROR: Could not reach server.');
            setLoading(false);
            return;
        }

        if (res.status === 401) {
            setGenStatus('error');
            setGenMessage('SESSION_EXPIRED: Please log in again.');
            setLoading(false);
            return;
        }

        const data = await res.json();

        // 202 = questions being generated, poll again
        if (res.status === 202 || data.status === 'generating') {
            setGenStatus('generating');
            setGenMessage(data.message || 'AI is compiling your training data...');
            setLoading(false);

            pollCountRef.current += 1;
            if (pollCountRef.current >= MAX_POLLS) {
                setGenStatus('error');
                setGenMessage('TIMEOUT: Generation is taking too long. Please refresh.');
                return;
            }
            // Schedule next poll
            pollTimerRef.current = setTimeout(fetchDailyQuestions, POLL_INTERVAL);
            return;
        }

        // 200 = ready
        if (data.status === 'ready' && data.questions?.length > 0) {
            setQuestions(data.questions);
            const firstUnanswered = data.questions.findIndex(q => !q.status || q.status === 'pending');
            if (firstUnanswered > -1) setCurrentIndex(firstUnanswered);
            setGenStatus('ready');
            setLoading(false);
            return;
        }

        setGenStatus('error');
        setGenMessage(data.error || 'NO_QUESTIONS_FOUND: Please refresh.');
        setLoading(false);
    }, [apiFetch]);

    useEffect(() => {
        const init = async () => {
            await refreshUserData();
            await fetchDailyQuestions();
        };
        init();

        const countdownInterval = setInterval(() => {
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            const diff = midnight.getTime() - now.getTime();
            if (diff <= 0) { setCountdownTime('00:00:00'); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdownTime(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
        }, 1000);

        return () => {
            clearInterval(countdownInterval);
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setQuestionTimer(0);
        setSelectedAnswerIndex(null);
        setMessage(null);
        const currentQ = questions[currentIndex];
        if (!currentQ) return;
        const isAnswered = ['correct', 'wrong', 'gave_up'].includes(currentQ.status);
        if (!isAnswered) {
            timerRef.current = setInterval(() => setQuestionTimer(t => t + 1), 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [currentIndex, questions]);

    const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

    const updateQuestionState = (qid, newData) => {
        setQuestions(prev => prev.map(q => q.qid === qid ? { ...q, ...newData } : q));
        refreshUserData();
    };

    const handleSubmit = async () => {
        const currentQ = questions[currentIndex];
        if (selectedAnswerIndex === null) return;
        const res = await apiFetch('/api/submit-answer', {
            method: 'POST',
            body: JSON.stringify({ questionId: currentQ.questionId, qid: currentQ.qid, selectedAnswerIndex })
        });
        if (res?.ok) {
            const data = await res.json();
            updateQuestionState(currentQ.qid, { ...data, selectedAnswerIndex, correctAnswerIndex: data.correct_answer_index });
        }
    };

    const handleHint = async () => {
        const currentQ = questions[currentIndex];
        const res = await apiFetch('/api/use-hint', {
            method: 'POST',
            body: JSON.stringify({ questionId: currentQ.questionId, qid: currentQ.qid })
        });
        if (res?.ok) {
            const data = await res.json();
            if (data.hint) updateQuestionState(currentQ.qid, { status: 'hint_used', hint: data.hint });
        }
    };

    const handleReveal = async () => {
        if (!window.confirm("CONFIRM: ABORT QUESTION?")) return;
        const currentQ = questions[currentIndex];
        const res = await apiFetch('/api/give-up', {
            method: 'POST',
            body: JSON.stringify({ questionId: currentQ.questionId, qid: currentQ.qid })
        });
        if (res?.ok) {
            const data = await res.json();
            updateQuestionState(currentQ.qid, { ...data, selectedAnswerIndex: null });
        }
    };

    // ── Generating state UI ──────────────────────────────────────
    const GeneratingScreen = () => (
        <div className="terminal-loader-container">
            <div className="status-dot"></div>
            <p className="glitch-text">// AI_GENERATION_PROTOCOL_ACTIVE...</p>
            <p className="helper-text">{genMessage}</p>
            <p style={{ fontFamily: 'JetBrains Mono', fontSize: '0.7rem', color: '#555', marginTop: '0.5rem' }}>
                Auto-refreshing every {POLL_INTERVAL/1000}s &bull; Attempt {pollCountRef.current}/{MAX_POLLS}
            </p>
            <button onClick={() => { pollCountRef.current = 0; setGenStatus('loading'); fetchDailyQuestions(); }} className="cmd-btn" style={{ marginTop: '1rem' }}>
                FORCE_RETRY
            </button>
        </div>
    );

    if (loading) return <div className="loading-spinner"></div>;

    const currentQ = questions[currentIndex];
    const isAnswered = currentQ?.status && ['correct', 'wrong', 'gave_up'].includes(currentQ.status);
    const isHintUsed = currentQ?.status === 'hint_used';
    const attemptedCount = questions.filter(q => ['correct', 'wrong', 'gave_up'].includes(q.status)).length;

    let options = [];
    try { options = typeof currentQ?.options === 'string' ? JSON.parse(currentQ.options) : (currentQ?.options || []); } catch (e) {}

    return (
        <div className="practice-container">
            <div className="practice-header">
                <div className="header-top-bar">
                    <div className="practice-rank-badge">
                        <span className="rank-label">CURRENT CLEARANCE</span>
                        <span className="rank-number">{userStats.level || 'RECRUIT'}</span>
                    </div>
                </div>
                <div className="header-main-title">
                    <h1 className="glitch-title">TRAINING_MODULE</h1>
                    <p className="subtitle-timer">NEXT_CYCLE_IN: {countdownTime}</p>
                </div>
            </div>

            <div className="practice-grid">
                {/* Left Column */}
                <div className="console-card">
                    <span className="card-label">&gt;&gt; SYSTEM_METRICS</span>
                    <div className="stats-wrapper">
                        <div className="stat-tile">
                            <span className="stat-val">{userStats.score?.toLocaleString() || 0}</span>
                            <span className="stat-desc">SCORE</span>
                        </div>
                        <div className="stat-tile">
                            <span className="stat-val" style={{ color: 'var(--gold)' }}>🔥 {userStats.streak || 0}</span>
                            <span className="stat-desc">STREAK</span>
                        </div>
                        <div className="stat-tile">
                            <span className="stat-val" style={{ fontSize: '1.4rem' }}>{userStats.accuracy || 0}%</span>
                            <span className="stat-desc">ACCURACY</span>
                        </div>
                        <div className="stat-tile">
                            <span className="stat-val" style={{ fontSize: '1.4rem' }}>{attemptedCount}/10</span>
                            <span className="stat-desc">PROGRESS</span>
                        </div>
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                        <span className="card-label">&gt;&gt; QUESTION_MATRIX</span>
                        <div className="progress-grid">
                            {questions.map((q, idx) => {
                                const qStatus = q.status || 'pending';
                                let statusClass = 'progress-dot';
                                if (idx === currentIndex) statusClass += ' active';
                                if (['correct', 'wrong', 'gave_up'].includes(qStatus)) statusClass += qStatus === 'correct' ? ' correct' : ' wrong';
                                else if (qStatus === 'hint_used') statusClass += ' hinted';
                                return <div key={idx} className={statusClass} onClick={() => setCurrentIndex(idx)}>{idx + 1}</div>;
                            })}
                        </div>
                    </div>

                    <div className="log-stream">
                        <span className="card-label" style={{ marginBottom: '10px' }}>&gt;&gt; TRANSMISSION_LOGS</span>
                        {questions.filter(q => ['correct', 'wrong', 'gave_up'].includes(q.status)).length === 0 ? (
                            <div style={{ color: '#555', fontStyle: 'italic', fontSize: '0.8rem' }}>NO_DATA_RECORDED</div>
                        ) : (
                            questions.map((q, idx) => {
                                if (!['correct', 'wrong', 'gave_up'].includes(q.status)) return null;
                                return (
                                    <div key={idx} className={`log-item ${q.status}`}>
                                        <span className="log-id">Q-{String(idx + 1).padStart(2, '0')}</span>
                                        <span className="log-result">{q.status.toUpperCase()}</span>
                                        <span className="log-pts">{q.status === 'correct' ? `+${q.pointsEarned}` : '+0'} PTS</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="console-card">
                    {genStatus === 'generating' ? (
                        <GeneratingScreen />
                    ) : genStatus === 'error' ? (
                        <div className="terminal-loader-container">
                            <p className="glitch-text">// ERROR</p>
                            <p className="helper-text">{genMessage}</p>
                            <button onClick={() => window.location.reload()} className="cmd-btn" style={{ marginTop: '1rem' }}>
                                RETRY_SYNC
                            </button>
                        </div>
                    ) : currentQ ? (
                        <>
                            <span className="card-label">&gt;&gt; ACTIVE_CHALLENGE_LOG</span>
                            <div className="terminal-header">
                                <span>[{currentQ.difficulty.toUpperCase()}] :: {currentQ.category.toUpperCase()}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Icons.Clock /> {formatTime(questionTimer)}
                                </span>
                            </div>
                            <div className="question-text"><FormattedText text={currentQ.questionText} /></div>
                            {currentQ.hint && (isHintUsed || isAnswered) && (
                                <div className="terminal-alert alert-hint">[HINT_DECRYPTED]: <FormattedText text={currentQ.hint} /></div>
                            )}
                            {isAnswered && currentQ.explanation && (
                                <div className="terminal-alert alert-info">[ANALYSIS]: <FormattedText text={currentQ.explanation} /></div>
                            )}
                            <div className="option-stack">
                                {options.map((opt, idx) => {
                                    let optClass = 'terminal-option';
                                    if (isAnswered) {
                                        optClass += ' disabled';
                                        if (idx === currentQ.correctAnswerIndex) optClass += ' correct';
                                        if (idx === currentQ.selectedAnswerIndex && idx !== currentQ.correctAnswerIndex) optClass += ' incorrect';
                                    } else {
                                        if (selectedAnswerIndex === idx) optClass += ' selected';
                                    }
                                    return (
                                        <div key={idx} className={optClass} onClick={() => !isAnswered && setSelectedAnswerIndex(idx)}>
                                            <span className="opt-prefix">{String.fromCharCode(65 + idx)} &gt;</span>
                                            <FormattedText text={opt} />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="cmd-bar">
                                <button className="cmd-btn primary" onClick={handleSubmit} disabled={isAnswered}><Icons.Check /> SUBMIT_DATA</button>
                                <button className="cmd-btn" onClick={handleHint} disabled={isAnswered || isHintUsed}><Icons.Bulb /> HINT [-10]</button>
                                <button className="cmd-btn" onClick={handleReveal} disabled={isAnswered}><Icons.Book /> ABORT</button>
                            </div>
                            <div className="nav-row">
                                <button className="cmd-btn" onClick={() => setCurrentIndex(c => c - 1)} disabled={currentIndex === 0}><Icons.Left /> PREV</button>
                                <button className="cmd-btn" onClick={() => setCurrentIndex(c => c + 1)} disabled={currentIndex === questions.length - 1}>NEXT <Icons.Right /></button>
                            </div>
                        </>
                    ) : (
                        <div className="terminal-loader-container">
                            <div className="status-dot"></div>
                            <p className="glitch-text">// INITIALIZING_AI_GENERATION_PROTOCOL...</p>
                            <p className="helper-text">Please stand by while our AI compiles your custom training data packets.</p>
                            <button onClick={() => window.location.reload()} className="cmd-btn">RETRY_SYNC</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Practice;