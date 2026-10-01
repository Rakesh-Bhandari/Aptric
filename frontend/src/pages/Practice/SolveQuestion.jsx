import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Practice.css';
import Markdown from '../../components/Markdown/Markdown';
import { supabase } from '../../lib/supabase';
import { submitAnswer, requestHint, giveUp, gameErrorMessage, correctIndex } from '../../lib/game';
import { attemptStatus } from '../../hooks/useDailyQuestions';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';

const Icons = {
    Back: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>,
    Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>,
    Bulb: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2 1.5 3.5.8.8 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>,
    Book: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
    Left: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>,
    Right: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
};

const SolveQuestion = () => {
    const { qid } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useSession();
    const userId = user?.id;
    const [q, setQ] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);
    const [categoryQuestions, setCategoryQuestions] = useState([]);

    // Practice mode: the question, the caller's practice attempt/hint on it,
    // and its published siblings in the same subtopic for prev/next.
    const loadQuestion = useCallback(async (id) => {
        const { data, error } = await supabase
            .from('questions')
            .select('id, stem, difficulty, subtopic_id, subtopics(name, topics(name)), question_options(id, position, body)')
            .eq('id', id)
            .single();
        if (error) throw error;
        const opts = [...data.question_options].sort((x, y) => x.position - y.position);
        const optionIds = opts.map(o => o.id);

        const [{ data: attempt }, { data: hintUse }, { data: siblings }] = await Promise.all([
            supabase.from('attempts').select('selected_option_id, is_correct')
                .eq('user_id', userId).eq('question_id', id).eq('context', 'practice').maybeSingle(),
            supabase.from('hint_uses').select('id')
                .eq('user_id', userId).eq('question_id', id).eq('context', 'practice').maybeSingle(),
            supabase.from('questions').select('id')
                .eq('subtopic_id', data.subtopic_id).eq('status', 'published')
                .order('created_at').order('id'),
        ]);

        const selectedIndex = attempt?.selected_option_id ? optionIds.indexOf(attempt.selected_option_id) : null;
        let hint = null;
        // Re-reading a hint already paid for is free; after answering it's not offered.
        if (hintUse && !attempt) hint = (await requestHint({ questionId: id, context: 'practice' })).hint;

        return {
            question: {
                qid: data.id,
                questionText: data.stem,
                difficulty: data.difficulty,
                category: data.subtopics?.topics?.name || data.subtopics?.name || '',
                options: opts.map(o => o.body),
                optionIds,
                hint,
                status: attemptStatus(attempt && { ...attempt, gave_up: !attempt.selected_option_id })
                    || (hintUse ? 'hint_used' : 'pending'),
                selectedAnswerIndex: selectedIndex,
                correctAnswerIndex: attempt?.is_correct ? selectedIndex : null,
            },
            siblings: (siblings || []).map(q => q.id),
        };
    }, [userId]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        setLoading(true);
        loadQuestion(qid)
            .then(({ question, siblings }) => {
                if (cancelled) return;
                setQ(question);
                setSelectedAnswerIndex(question.selectedAnswerIndex);
                setCategoryQuestions(siblings);
            })
            .catch((err) => { console.error(err); if (!cancelled) setQ(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [qid, loadQuestion]);

    const currentIndex = categoryQuestions.indexOf(qid);
    const prevQid = currentIndex > 0 ? categoryQuestions[currentIndex - 1] : null;
    const nextQid = currentIndex !== -1 && currentIndex < categoryQuestions.length - 1 ? categoryQuestions[currentIndex + 1] : null;

    const handleSubmit = async () => {
        if (selectedAnswerIndex === null) return;
        try {
            const result = await submitAnswer({
                questionId: q.qid,
                optionId: q.optionIds[selectedAnswerIndex],
                context: 'practice',
            });
            setQ(prev => ({
                ...prev,
                status: result.is_correct ? 'correct' : 'wrong',
                correctAnswerIndex: correctIndex(prev.optionIds, result),
                explanation: result.explanation
            }));
        } catch (err) {
            toast.error(gameErrorMessage(err));
        }
    };

    const handleHint = async () => {
        try {
            const data = await requestHint({ questionId: q.qid, context: 'practice' });
            if (data.hint) setQ(prev => ({ ...prev, status: 'hint_used', hint: data.hint }));
            else toast.info('No hint is available for this question.');
        } catch (err) {
            toast.error(gameErrorMessage(err));
        }
    };

    const handleReveal = async () => {
        if (!(await toast.confirm({ message: 'Abort this question? Your progress on it will be lost.', confirmText: 'Abort', cancelText: 'Cancel', variant: 'warning' }))) return;
        try {
            const data = await giveUp({ questionId: q.qid, context: 'practice' });
            setQ(prev => ({
                ...prev,
                status: 'gave_up',
                correctAnswerIndex: correctIndex(prev.optionIds, data),
                explanation: data.explanation
            }));
        } catch (err) {
            toast.error(gameErrorMessage(err));
        }
    };

    if (loading) return <div className="loading-spinner"></div>;
    if (!q) return <div className="practice-container" style={{ color: 'white' }}>DATA_CORRUPTED</div>;

    const isAnswered = ['correct', 'wrong', 'gave_up'].includes(q.status);
    const isHintUsed = q.status === 'hint_used';
    let options = [];
    try { options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch (e) { }

    return (
        <div className="practice-container" style={{ maxWidth: '100%', width: '100%' }}>
            <button className="cmd-btn" style={{ width: '100%', maxWidth: '200px', marginBottom: '1rem' }} onClick={() => navigate('/topics')}>
                <Icons.Back /> RETURN_TO_ROOT
            </button>

            <div className="console-card">
                <span className="card-label">&gt;&gt; SINGLE_QUESTION_MODE</span>
                <div className="terminal-header">
                    <span>[{q.difficulty.toUpperCase()}] :: {q.category.toUpperCase()}</span>
                </div>
                <div className="question-text">
                    <Markdown text={q.questionText} />
                </div>

                {q.hint && (isHintUsed || isAnswered) && (
                    <div className="terminal-alert alert-hint">
                        [HINT_DECRYPTED]: <Markdown text={q.hint} />
                    </div>
                )}

                {isAnswered && q.explanation && (
                    <div className="terminal-alert alert-info">
                        [ANALYSIS]: <Markdown text={q.explanation} />
                    </div>
                )}

                <div className="option-stack">
                    {options.map((opt, idx) => {
                        let optClass = 'terminal-option';
                        if (isAnswered) {
                            optClass += ' disabled';
                            if (idx === q.correctAnswerIndex) optClass += ' correct';
                            else if (idx === selectedAnswerIndex && idx !== q.correctAnswerIndex) optClass += ' incorrect';
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
                    <button className="cmd-btn primary" onClick={handleSubmit} disabled={isAnswered}>
                        <Icons.Check /> SUBMIT_DATA
                    </button>
                    <button className="cmd-btn" onClick={handleHint} disabled={isAnswered || isHintUsed}>
                        <Icons.Bulb /> HINT
                    </button>
                    <button className="cmd-btn" onClick={handleReveal} disabled={isAnswered}>
                        <Icons.Book /> ABORT
                    </button>
                </div>

                <div className="nav-row">
                    <button className="cmd-btn" onClick={() => prevQid && navigate(`/solve/${prevQid}`)} disabled={!prevQid}>
                        <Icons.Left /> PREV
                    </button>
                    <button className="cmd-btn" onClick={() => nextQid && navigate(`/solve/${nextQid}`)} disabled={!nextQid}>
                        NEXT <Icons.Right />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SolveQuestion;