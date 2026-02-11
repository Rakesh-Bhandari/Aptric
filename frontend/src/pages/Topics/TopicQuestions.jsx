import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './Topics.css'; // Reusing the shared tech styles

// --- ICONS ---
const Icons = {
    Back: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
    Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>,
    Code: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>,
    Play: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
};

const TopicQuestions = () => {
    const [searchParams] = useSearchParams();
    const category = searchParams.get('topic');
    const navigate = useNavigate();
    
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!category) return;

        const fetchData = async () => {
            try {
                // 1. Fetch Questions
                const qRes = await fetch(`http://localhost:5000/api/questions/category?category=${encodeURIComponent(category)}`, { credentials: 'include' });
                const qData = await qRes.json();

                // 2. Fetch User Progress (to check which are solved)
                const uRes = await fetch('http://localhost:5000/api/user', { credentials: 'include' });
                let solvedIds = [];
                if (uRes.ok) {
                    const uData = await uRes.json();
                    // Handle solved IDs safely (could be JSON or array)
                    try {
                        solvedIds = typeof uData.user.answered_qids === 'string' 
                            ? JSON.parse(uData.user.answered_qids) 
                            : (uData.user.answered_qids || []);
                    } catch (e) { solvedIds = []; }
                }

                // Merge data
                const merged = qData.map(q => ({
                    ...q,
                    isSolved: solvedIds.includes(q.qid)
                }));
                setQuestions(merged);
            } catch (err) {
                console.error("Data load error", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [category]);

    if (loading) return (
        <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div className="status-dot"></div>
        </div>
    );

    return (
        <div className="topics-container">
            {/* Header */}
            <div className="q-list-header">
                <button className="back-btn" onClick={() => navigate('/topics')}>
                    <Icons.Back /> RETURN_TO_MODULES
                </button>
                <div className="module-title">
                    {category ? category.toUpperCase() : 'UNKNOWN_MODULE'}
                </div>
                <div className="system-status">
                    <div className="status-dot"></div> ONLINE
                </div>
            </div>

            {/* Question Stream */}
            <div className="q-grid">
                {questions.length === 0 ? (
                    <div style={{textAlign:'center', padding:'4rem', color:'#555', fontFamily:'JetBrains Mono'}}>
                        // NO_DATA_PACKETS_FOUND
                    </div>
                ) : (
                    questions.map((q, index) => {
                        let options = [];
                        try { options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch(e){}

                        // Format index like 01, 02...
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
                                            <span style={{color:'var(--accent-green)'}}>{String.fromCharCode(65 + i)} &gt;</span> {opt}
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
        </div>
    );
};

export default TopicQuestions;