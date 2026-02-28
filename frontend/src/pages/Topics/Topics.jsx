import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Topics.css';
import API_BASE_URL from '../../utils/config.js';

// --- ICONS (Tech Style) ---
const Icons = {
    Terminal: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>,
    Play: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>,
    Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
};

const Topics = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({});

    const categories = [
        "Quantitative Aptitude", "Logical Reasoning",
        "Verbal Ability", "Data Interpretation", "Puzzles", "Technical Aptitude"
    ];

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/topics/stats`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => setStats(data))
            .catch(err => console.error("Failed to load topic stats", err));
    }, []);

    return (
        <div className="topics-container">
            <div className="topics-header">
                <div className="system-status">
                    <div className="status-dot"></div> SYSTEM_MODULES_ONLINE
                </div>
                <h1 className="glitch-title">TRAINING_GROUNDS</h1>
                <p style={{fontFamily:'Michroma', fontSize:'0.8rem', color:'var(--accent-green)'}}>
                    SELECT_MODULE_TO_BEGIN
                </p>
            </div>

            <div className="topics-grid">
                {categories.map((topic, index) => {
                    const topicData = stats[topic] || { total: 0, solved: 0 };
                    const { total, solved } = topicData;
                    const percent = total > 0 ? Math.round((solved / total) * 100) : 0;
                    const isCompleted = percent === 100 && total > 0;
                    const modIndex = String(index + 1).padStart(2, '0');

                    return (
                        <div
                            key={topic}
                            className="console-card"
                            onClick={() => navigate(`/practice/topic?topic=${topic}`)}
                            style={{cursor: 'pointer'}}
                        >
                            <div>
                                <span className="card-label">&gt;&gt; MODULE_{modIndex} [ACTIVE]</span>
                                <h3 className="topic-title">{topic}</h3>
                                <div className="topic-stats">
                                    <div className="progress-info">
                                        <span>PROGRESS_STATUS</span>
                                        <span>{solved}/{total} ({percent}%)</span>
                                    </div>
                                    <div className="progress-track">
                                        <div
                                            className={`progress-fill ${isCompleted ? 'completed' : ''}`}
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <button className={`cmd-btn ${isCompleted ? 'review-mode' : ''}`}>
                                {isCompleted ? <Icons.Check /> : <Icons.Play />}
                                {isCompleted ? 'REVIEW_DATA' : 'INITIALIZE'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Topics;