import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import './Practice.css';
import API_BASE_URL from '../../utils/config.js';

const Icons = {
    Back: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
    Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>,
    Bulb: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2 1.5 3.5.8.8 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>,
    Book: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
    Left: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>,
    Right: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
};

const FormattedText = ({ text }) => {
    if (!text) return null;
    const getHtml = () => {
        try { return { __html: marked.parse(text) }; } catch (e) { return { __html: text }; }
    };
    return <div dangerouslySetInnerHTML={getHtml()} />;
};

const SolveQuestion = () => {
    const { qid } = useParams();
    const navigate = useNavigate();

    const [q, setQ] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);
    const [categoryQuestions, setCategoryQuestions] = useState([]);

    useEffect(() => {
        setLoading(true);
        fetch(`${API_BASE_URL}/api/single/${qid}`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    setQ(data);
                    if (['correct', 'wrong'].includes(data.status)) {
                        setSelectedAnswerIndex(data.selectedAnswerIndex);
                    } else {
                        setSelectedAnswerIndex(null);
                    }
                    fetchCategoryQuestions(data.category);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [qid]);

    const fetchCategoryQuestions = (category) => {
        if (categoryQuestions.length > 0 && categoryQuestions[0].category === category) return;
        fetch(`${API_BASE_URL}/api/category?category=${encodeURIComponent(category)}`, { credentials: 'include' })
            .then(res => res.json())
            .then(list => { if (Array.isArray(list)) setCategoryQuestions(list); })
            .catch(console.error);
    };

    const currentIndex = categoryQuestions.findIndex(item => item.qid === qid);
    const prevQid = currentIndex > 0 ? categoryQuestions[currentIndex - 1].qid : null;
    const nextQid = currentIndex !== -1 && currentIndex < categoryQuestions.length - 1 ? categoryQuestions[currentIndex + 1].qid : null;

    const handleSubmit = async () => {
        if (selectedAnswerIndex === null) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/submit-answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ questionId: q.questionId, qid: q.qid, selectedAnswerIndex })
            });
            const result = await res.json();
            setQ(prev => ({
                ...prev,
                status: result.status,
                correctAnswerIndex: result.correct_answer_index,
                explanation: result.explanation
            }));
        } catch (err) { console.error(err); }
    };

    const handleHint = async () => {
        const res = await fetch(`${API_BASE_URL}/api/use-hint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ questionId: q.questionId, qid: q.qid })
        });
        const data = await res.json();
        if (data.hint) setQ(prev => ({ ...prev, status: 'hint_used', hint: data.hint }));
    };

    const handleReveal = async () => {
        if (!window.confirm("ABORT QUESTION?")) return;
        const res = await fetch(`${API_BASE_URL}/api/give-up`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ questionId: q.questionId, qid: q.qid })
        });
        const data = await res.json();
        setQ(prev => ({
            ...prev,
            status: 'gave_up',
            correctAnswerIndex: data.correct_answer_index,
            explanation: data.explanation
        }));
    };

    if (loading) return <div className="loading-spinner"></div>;
    if (!q) return <div className="practice-container" style={{color:'white'}}>DATA_CORRUPTED</div>;

    const isAnswered = ['correct', 'wrong', 'gave_up'].includes(q.status);
    const isHintUsed = q.status === 'hint_used';
    let options = [];
    try { options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch(e){}

    return (
        <div className="practice-container" style={{maxWidth: '100%', width: '100%'}}>
            <button className="cmd-btn" style={{width: '100%', maxWidth: '200px', marginBottom:'1rem'}} onClick={() => navigate('/topics')}>
                <Icons.Back /> RETURN_TO_ROOT
            </button>

            <div className="console-card">
                <span className="card-label">&gt;&gt; SINGLE_QUESTION_MODE</span>
                <div className="terminal-header">
                    <span>[{q.difficulty.toUpperCase()}] :: {q.category.toUpperCase()}</span>
                </div>
                <div className="question-text">
                    <FormattedText text={q.questionText} />
                </div>

                {q.hint && (isHintUsed || isAnswered) && (
                    <div className="terminal-alert alert-hint">
                        [HINT_DECRYPTED]: <FormattedText text={q.hint} />
                    </div>
                )}

                {isAnswered && q.explanation && (
                    <div className="terminal-alert alert-info">
                        [ANALYSIS]: <FormattedText text={q.explanation} />
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