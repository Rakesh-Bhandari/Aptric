import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Practice.css';
import Markdown from '../../components/Markdown/Markdown';
import { supabase } from '../../lib/supabase';
import { submitAnswer, requestHint, giveUp, gameErrorMessage, correctIndex } from '../../lib/game';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';
import { useDailyQuestions } from '../../hooks/useDailyQuestions';
import { msUntilMidnight, DEFAULT_TIME_ZONE } from '../../utils/time';

const Icons = {
    Target: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>,
    Clock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    Bulb: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2 1.5 3.5.8.8 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>,
    Book: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
    Left: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>,
    Right: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>,
    Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
};

const Practice = () => {
    const toast = useToast();
    const { user } = useSession();
    const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
    const [userStats, setUserStats] = useState({ accuracy: 0, level: 'Beginner' });
    const { questions, setQuestions, status: genStatus, message: genMessage, retry } = useDailyQuestions();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);
    const [message, setMessage] = useState(null);
    const [countdownTime, setCountdownTime] = useState('--:--:--');
    const [questionTimer, setQuestionTimer] = useState(0);
    const timerRef = useRef(null);

    const refreshUserData = useCallback(async () => {
        if (!user) return;
        const [{ data: profile }, { count: total }, { count: correct }] = await Promise.all([
            supabase.from('profiles').select('xp, level, current_streak, timezone').eq('id', user.id).single(),
            supabase.from('attempts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
            supabase.from('attempts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_correct', true),
        ]);
        if (!profile) return;
        setTimeZone(profile.timezone || DEFAULT_TIME_ZONE);
        setUserStats({
            accuracy: total ? Math.round((correct / total) * 100) : 0,
            score: profile.xp,
            streak: profile.current_streak,
            level: `LVL ${profile.level}`,
        });
    }, [user]);

    // Once questions arrive, jump to the first unanswered one.
    useEffect(() => {
        if (genStatus !== 'ready') return;
        const firstUnanswered = questions.findIndex(q => !q.status || q.status === 'pending');
        if (firstUnanswered > -1) setCurrentIndex(firstUnanswered);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only on the transition to ready
    }, [genStatus]);

    useEffect(() => {
        refreshUserData();
    }, [refreshUserData]);

    useEffect(() => {
        const countdownInterval = setInterval(() => {
            const diff = msUntilMidnight(timeZone);
            if (diff <= 0) { setCountdownTime('00:00:00'); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdownTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, [timeZone]);

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

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const updateQuestionState = (qid, newData) => {
        setQuestions(prev => prev.map(q => q.qid === qid ? { ...q, ...newData } : q));
        refreshUserData();
    };

    const handleSubmit = async () => {
        const currentQ = questions[currentIndex];
        if (selectedAnswerIndex === null) return;
        try {
            const data = await submitAnswer({
                questionId: currentQ.qid,
                optionId: currentQ.optionIds[selectedAnswerIndex],
                context: 'daily',
                timeMs: questionTimer * 1000,
            });
            updateQuestionState(currentQ.qid, {
                status: data.is_correct ? 'correct' : 'wrong',
                explanation: data.explanation,
                selectedAnswerIndex,
                correctAnswerIndex: correctIndex(currentQ.optionIds, data),
                pointsEarned: data.xp_awarded,
            });
        } catch (err) {
            toast.error(gameErrorMessage(err));
        }
    };

    const handleHint = async () => {
        const currentQ = questions[currentIndex];
        try {
            const data = await requestHint({ questionId: currentQ.qid, context: 'daily' });
            if (data.hint) updateQuestionState(currentQ.qid, { status: 'hint_used', hint: data.hint });
            else toast.info('No hint is available for this question.');
        } catch (err) {
            toast.error(gameErrorMessage(err));
        }
    };

    const handleReveal = async () => {
        if (!(await toast.confirm({ message: 'Abort this question? Your progress on it will be lost.', confirmText: 'Abort', cancelText: 'Cancel', variant: 'warning' }))) return;
        const currentQ = questions[currentIndex];
        try {
            const data = await giveUp({ questionId: currentQ.qid, context: 'daily' });
            updateQuestionState(currentQ.qid, {
                status: 'gave_up',
                explanation: data.explanation,
                selectedAnswerIndex: null,
                correctAnswerIndex: correctIndex(currentQ.optionIds, data),
                pointsEarned: 0,
            });
        } catch (err) {
            toast.error(gameErrorMessage(err));
        }
    };

    if (genStatus === 'loading') return <div className="loading-spinner"></div>;

    const currentQ = questions[currentIndex];
    const isAnswered = currentQ?.status && ['correct', 'wrong', 'gave_up'].includes(currentQ.status);
    const isHintUsed = currentQ?.status === 'hint_used';
    const attemptedCount = questions.filter(q => ['correct', 'wrong', 'gave_up'].includes(q.status)).length;

    let options = [];
    try { options = typeof currentQ?.options === 'string' ? JSON.parse(currentQ.options) : (currentQ?.options || []); } catch (e) { }

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
                            <span className="stat-val" style={{ color: 'var(--gold)' }}>{userStats.streak || 0}</span>
                            <span className="stat-desc">STREAK</span>
                        </div>
                        <div className="stat-tile">
                            <span className="stat-val" style={{ fontSize: '1.4rem' }}>{userStats.accuracy || 0}%</span>
                            <span className="stat-desc">ACCURACY</span>
                        </div>
                        <div className="stat-tile">
                            <span className="stat-val" style={{ fontSize: '1.4rem' }}>{attemptedCount}/{questions.length}</span>
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
                                        <span className="log-pts">{q.pointsEarned > 0 ? `+${q.pointsEarned}` : `${q.pointsEarned}`} PTS</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="console-card">
                    {genStatus === 'error' || genStatus === 'empty' ? (
                        <div className="terminal-loader-container">
                            <p className="glitch-text">{genStatus === 'empty' ? '// STANDBY' : '// ERROR'}</p>
                            <p className="helper-text">{genMessage}</p>
                            <button onClick={retry} className="cmd-btn" style={{ marginTop: '1rem' }}>
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
                            <div className="question-text"><Markdown text={currentQ.questionText} /></div>
                            {currentQ.hint && (isHintUsed || isAnswered) && (
                                <div className="terminal-alert alert-hint">[HINT_DECRYPTED]: <Markdown text={currentQ.hint} /></div>
                            )}
                            {isAnswered && currentQ.explanation && (
                                <div className="terminal-alert alert-info">[ANALYSIS]: <Markdown text={currentQ.explanation} /></div>
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
                                            <Markdown text={opt} />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="cmd-bar">
                                <button className="cmd-btn primary" onClick={handleSubmit} disabled={isAnswered}><Icons.Check /> SUBMIT_DATA</button>
                                <button className="cmd-btn" onClick={handleHint} disabled={isAnswered || isHintUsed}><Icons.Bulb /> HINT</button>
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
                            <p className="glitch-text">// SYNCING...</p>
                            <button onClick={retry} className="cmd-btn">RETRY_SYNC</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Practice;