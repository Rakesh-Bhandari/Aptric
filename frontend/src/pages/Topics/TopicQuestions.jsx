import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './Topics.css';
import API_BASE_URL from '../../utils/config.js';
import useAntiCheat from '../../hooks/useAntiCheat';

const Icons = {
    Back: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>,
    Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>,
    Play: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
};

const PAGE_SIZE = 50;

const TopicQuestions = () => {
    const [searchParams] = useSearchParams();
    const category = searchParams.get('topic');
    const navigate = useNavigate();
    useAntiCheat();
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [solvedIds, setSolvedIds] = useState([]);

    const fetchPage = async (offset) => {
        const res = await fetch(`${API_BASE_URL}/api/category?category=${encodeURIComponent(category)}&limit=${PAGE_SIZE}&offset=${offset}`, { credentials: 'include' });
        const data = await res.json();
        return { list: Array.isArray(data?.questions) ? data.questions : [], hasMore: !!data?.hasMore };
    };

    useEffect(() => {
        if (!category) return;

        const fetchData = async () => {
            try {
                const page = await fetchPage(0);

                const uRes = await fetch(`${API_BASE_URL}/api/user`, { credentials: 'include' });
                let solved = [];
                if (uRes.ok) {
                    const uData = await uRes.json();
                    try {
                        solved = typeof uData.user.answered_qids === 'string'
                            ? JSON.parse(uData.user.answered_qids)
                            : (uData.user.answered_qids || []);
                    } catch (e) { solved = []; }
                }

                setSolvedIds(solved);
                setQuestions(page.list.map(q => ({ ...q, isSolved: solved.includes(q.qid) })));
                setHasMore(page.hasMore);
            } catch (err) {
                console.error("Data load error", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [category]);

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const page = await fetchPage(questions.length);
            setQuestions(prev => {
                const seen = new Set(prev.map(q => q.qid));
                return [...prev, ...page.list.filter(q => !seen.has(q.qid)).map(q => ({ ...q, isSolved: solvedIds.includes(q.qid) }))];
            });
            setHasMore(page.hasMore);
        } catch (err) {
            console.error("Load more error", err);
        } finally {
            setLoadingMore(false);
        }
    };

    if (loading) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="status-dot"></div>
        </div>
    );

    return (
        <div className="topics-container">
            <header className="practice-header" style={{ position: 'relative' }}>
                <div className="header-top-bar" style={{ justifyContent: 'center' }}>
                    <button className="back-btn header-back-btn" onClick={() => navigate('/topics')}>
                        <Icons.Back /> RETURN_TO_MODULES
                    </button>
                    <div className="practice-rank-badge">
                        <span className="rank-label">SYSTEM_STATUS</span>
                        <div className="rank-number">
                            <div className="status-dot"></div> ONLINE
                        </div>
                    </div>
                </div>
                <div className="header-main-title">
                    <h1 className="glitch-title">{category ? category.toUpperCase() : 'UNKNOWN_MODULE'}</h1>
                    <div className="subtitle-timer" style={{ color: 'var(--accent-green)' }}>
                        QUESTION_DATABASE
                    </div>
                </div>
            </header>

            <div className="q-grid">
                {questions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#555', fontFamily: 'JetBrains Mono' }}>
                        // NO_DATA_PACKETS_FOUND
                    </div>
                ) : (
                    questions.map((q, index) => {
                        let options = [];
                        try { options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch (e) { }
                        const qIndex = String(index + 1).padStart(2, '0');

                        return (
                            <div key={q.qid} className={`q-card ${q.isSolved ? 'solved' : ''}`}>
                                <div className="q-meta">
                                    <span>ID: {q.qid} // INDEX_{qIndex}</span>
                                    <span className={`status-badge ${q.isSolved ? 'complete' : ''}`}>
                                        {q.isSolved ? 'STATUS: COMPLETED' : 'STATUS: PENDING'}
                                    </span>
                                </div>
                                <h3 className="q-text">{q.question_text}</h3>
                                <div className="opt-preview">
                                    {options.slice(0, 4).map((opt, i) => (
                                        <div key={i} className="opt-pill">
                                            <span style={{ color: 'var(--accent-green)' }}>{String.fromCharCode(65 + i)} &gt;</span> {opt}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    className={`solve-btn ${q.isSolved ? 'replay' : ''}`}
                                    onClick={() => navigate(`/solve/${q.qid}`)}
                                >
                                    {q.isSolved ? <Icons.Check /> : <Icons.Play />}
                                    {q.isSolved ? 'REVIEW_DATA' : 'INITIATE_SEQUENCE'}
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
            {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                    <button className="solve-btn" style={{ width: 'auto', padding: '0.8rem 2rem' }} onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? 'LOADING...' : 'LOAD_MORE'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default TopicQuestions;