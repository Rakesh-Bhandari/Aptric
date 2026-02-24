import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import './Practice.css';

const API_BASE_URL = 'http://localhost:5000';

// --- ICONS (Tech Style) ---
const Icons = {
    Target: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>,
    Clock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    Bulb: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2 1.5 3.5.8.8 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>,
    Book: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
    Left: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>,
    Right: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>,
    Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
};

// --- HELPER: Formatted Text ---
const FormattedText = ({ text }) => {
    if (!text) return null;
    const getHtml = () => {
        try { return { __html: marked.parse(text) }; } catch (e) { return { __html: text }; }
    };
    return <div dangerouslySetInnerHTML={getHtml()} />;
};

const Practice = () => {
    const [userData, setUserData] = useState(null);
    const [userStats, setUserStats] = useState({ rank: 0, accuracy: 0, level: 'Beginner' });
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);
    const [message, setMessage] = useState(null);

    // Timers
    const [countdownTime, setCountdownTime] = useState('--:--:--');
    const [questionTimer, setQuestionTimer] = useState(0);
    const timerRef = useRef(null);

    const apiFetch = useCallback(async (endpoint, options = {}) => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                ...options,
            });
            if (res.status === 401) return null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(err);
            return null;
        }
    }, []);

    // Refresh User Data (Score, Rank, Accuracy, Level)
    const refreshUserData = async () => {
        const data = await apiFetch('/api/user/progress');
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
    };

    useEffect(() => {
        const init = async () => {
            await refreshUserData();

            try {
                const dailyData = await apiFetch('/api/daily-questions');
                if (dailyData && dailyData.questions && dailyData.questions.length > 0) {
                    setQuestions(dailyData.questions);
                    const firstUnanswered = dailyData.questions.findIndex(q => !q.status || q.status === 'pending');
                    if (firstUnanswered > -1) setCurrentIndex(firstUnanswered);
                } else {
                    setMessage({ type: 'info', text: 'NO_QUESTIONS_GENERATED' });
                }
            } catch (error) {
                setMessage({ type: 'error', text: 'SYSTEM_ERROR: LOAD_FAILED' });
            } finally {
                setLoading(false);
            }
        };
        init();

        const countdownInterval = setInterval(() => {
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            const diff = midnight.getTime() - now.getTime();
            if (diff <= 0) setCountdownTime('00:00:00');
            else {
                const h = Math.floor(diff / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                setCountdownTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            }
        }, 1000);
        return () => clearInterval(countdownInterval);
    }, [apiFetch]);

    // Timer Logic
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setQuestionTimer(0);
        setSelectedAnswerIndex(null);
        setMessage(null);

        const currentQ = questions[currentIndex];
        if (!currentQ) return;
        const isAnswered = currentQ.status && ['correct', 'wrong', 'gave_up'].includes(currentQ.status);

        if (!isAnswered) {
            timerRef.current = setInterval(() => setQuestionTimer(t => t + 1), 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [currentIndex, questions]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const updateQuestionState = (qid, newData) => {
        setQuestions(prev => prev.map(q => q.qid === qid ? { ...q, ...newData } : q));
        refreshUserData(); // Refresh score/rank/level after answer
    };

    const handleSubmit = async () => {
        const currentQ = questions[currentIndex];
        if (selectedAnswerIndex === null) return;

        const data = await apiFetch('/api/submit-answer', {
            method: 'POST',
            body: JSON.stringify({
                questionId: currentQ.questionId,
                qid: currentQ.qid,
                selectedAnswerIndex
            })
        });

        if (data) {
            updateQuestionState(currentQ.qid, {
                ...data,
                selectedAnswerIndex: selectedAnswerIndex,
                correctAnswerIndex: data.correct_answer_index
            });
        }
    };

    const handleHint = async () => {
        const currentQ = questions[currentIndex];
        const data = await apiFetch('/api/use-hint', {
            method: 'POST',
            body: JSON.stringify({ questionId: currentQ.questionId, qid: currentQ.qid })
        });
        if (data) updateQuestionState(currentQ.qid, { status: 'hint_used', hint: data.hint });
    };

    const handleReveal = async () => {
        if (!window.confirm("CONFIRM: ABORT QUESTION?")) return;
        const currentQ = questions[currentIndex];
        const data = await apiFetch('/api/give-up', {
            method: 'POST',
            body: JSON.stringify({ questionId: currentQ.questionId, qid: currentQ.qid })
        });
        if (data) updateQuestionState(currentQ.qid, { ...data, selectedAnswerIndex: null });
    };

    if (loading) return <div className="loading-spinner"></div>;

    const currentQ = questions[currentIndex];
    const isAnswered = currentQ?.status && ['correct', 'wrong', 'gave_up'].includes(currentQ.status);
    const isHintUsed = currentQ?.status === 'hint_used';

    // Calculate Local Session Stats for display
    const attemptedCount = questions.filter(q => ['correct', 'wrong', 'gave_up'].includes(q.status)).length;
    const avgTimeDisplay = attemptedCount > 0 ? "~45s" : "--";

    let options = [];
    try { options = typeof currentQ?.options === 'string' ? JSON.parse(currentQ.options) : (currentQ?.options || []); } catch (e) { }

    return (
        <div className="practice-container" >
            {/* 1. Header (Redesigned with Flexbox) */}
            <div className="practice-header">

                {/* Top Row: Rank (Left) & Status (Right) */}
                <div className="header-top-bar">
                    <div className="practice-rank-badge">
                        <span className="rank-label">CURRENT CLEARANCE</span>
                        <span className="rank-number">{userStats.level || 'RECRUIT'}</span>
                    </div>
                </div>
                {/* Bottom Row: Title (Centered) */}
                <div className="header-main-title">
                    <h1 className="glitch-title">TRAINING_MODULE</h1>
                    <p className="subtitle-timer">
                        NEXT_CYCLE_IN: {countdownTime}
                    </p>
                </div>
            </div>

            {/* 2. Bento Grid */}
            <div className="practice-grid">

                {/* Left Column: Stats & Logs */}
                <div className="console-card">
                    {/* Fixed > with &gt; */}
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
                            <span className="stat-val" style={{ fontSize: '1.4rem' }}>{avgTimeDisplay}</span>
                            <span className="stat-desc">AVG_TIME</span>

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

                                return (
                                    <div key={idx} className={statusClass} onClick={() => setCurrentIndex(idx)}>
                                        {idx + 1}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Answer Logs / Performance History */}
                    <div className="log-stream">
                        <span className="card-label" style={{ marginBottom: '10px' }}>&gt;&gt; TRANSMISSION_LOGS</span>
                        {questions.filter(q => ['correct', 'wrong', 'gave_up'].includes(q.status)).length === 0 ? (
                            <div style={{ color: '#555', fontStyle: 'italic', fontSize: '0.8rem' }}>NO_DATA_RECORDED</div>
                        ) : (
                            questions.map((q, idx) => {
                                if (!['correct', 'wrong', 'gave_up'].includes(q.status)) return null;
                                const isCorrect = q.status === 'correct';
                                return (
                                    <div key={idx} className={`log-item ${q.status}`}>
                                        <span className="log-id">Q-{String(idx + 1).padStart(2, '0')}</span>
                                        <span className="log-result">{q.status.toUpperCase()}</span>
                                        <span className="log-pts">{isCorrect ? `+${q.pointsEarned}` : '+0'} PTS</span>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Right Column: Question Console */}
                <div className="console-card">
                    {currentQ ? (
                        <>
                            <span className="card-label">&gt;&gt; ACTIVE_CHALLENGE_LOG</span>

                            <div className="terminal-header">
                                <span>[{currentQ.difficulty.toUpperCase()}] :: {currentQ.category.toUpperCase()}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Icons.Clock /> {formatTime(questionTimer)}
                                </span>
                            </div>

                            <div className="question-text">
                                <FormattedText text={currentQ.questionText} />
                            </div>

                            {currentQ.hint && (isHintUsed || isAnswered) && (
                                <div className="terminal-alert alert-hint">
                                    [HINT_DECRYPTED]: <FormattedText text={currentQ.hint} />
                                </div>
                            )}

                            {isAnswered && currentQ.explanation && (
                                <div className="terminal-alert alert-info">
                                    [ANALYSIS]: <FormattedText text={currentQ.explanation} />
                                </div>
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
                                <button className="cmd-btn primary" onClick={handleSubmit} disabled={isAnswered}>
                                    <Icons.Check /> SUBMIT_DATA
                                </button>
                                <button className="cmd-btn" onClick={handleHint} disabled={isAnswered || isHintUsed}>
                                    <Icons.Bulb /> HINT [-10]
                                </button>
                                <button className="cmd-btn" onClick={handleReveal} disabled={isAnswered}>
                                    <Icons.Book /> ABORT
                                </button>
                            </div>

                            <div className="nav-row">
                                <button className="cmd-btn" onClick={() => setCurrentIndex(c => c - 1)} disabled={currentIndex === 0}>
                                    <Icons.Left /> PREV
                                </button>
                                <button className="cmd-btn" onClick={() => setCurrentIndex(c => c + 1)} disabled={currentIndex === questions.length - 1}>
                                    NEXT <Icons.Right />
                                </button>
                            </div>
                        </>
                        // Change the "NO_DATA" fallback in Practice.jsx to a loading terminal
                    ) : (
                        <div className="terminal-loader-container">
                            <div className="status-dot"></div>
                            <p className="glitch-text">
        // INITIALIZING_AI_GENERATION_PROTOCOL...
                            </p>
                            <p className="helper-text">
                                Please stand by while our AI compiles your custom training data packets.
                            </p>
                            <button onClick={() => window.location.reload()} className="cmd-btn">
                                RETRY_SYNC
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Practice;