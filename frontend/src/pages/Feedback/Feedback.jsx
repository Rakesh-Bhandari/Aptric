import React, { useState, useEffect } from 'react';
import './Feedback.css';
import API_BASE_URL from '../../utils/config';

// --- ICONS (Tech Style) ---
const Icons = {
    Send: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>,
    Terminal: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>,
    Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2 2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
    Flag: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>,
    More: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>,
    Edit: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
    Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>,
    X: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
};

const Feedback = () => {
    const [feedbackList, setFeedbackList] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);

    // Submission State
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [statusMsg, setStatusMsg] = useState('');

    // Editing State
    const [editingId, setEditingId] = useState(null);
    const [editRating, setEditRating] = useState(0);
    const [editComment, setEditComment] = useState('');

    useEffect(() => {
        fetchUserAndFeedback();
        document.addEventListener('click', () => setActiveMenuId(null));
        return () => document.removeEventListener('click', () => setActiveMenuId(null));
    }, []);

    const fetchUserAndFeedback = async () => {
        try {
            const userRes = await fetch(`${API_BASE_URL}/api/user`, { credentials: 'include' });
            if (userRes.ok) {
                const userData = await userRes.json();
                setCurrentUser(userData.user);
            }
            loadFeedback();
        } catch (err) { console.error("Init Error", err); }
    };

    const loadFeedback = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/feedback`, { credentials: 'include' });
            if (response.ok) setFeedbackList(await response.json());
        } catch (err) { console.error('Feed Error', err); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (rating === 0) {
            setStatusMsg('[ERROR]: RATING_REQUIRED');
            return;
        }
        setStatusMsg('TRANSMITTING...');
        try {
            const response = await fetch(`${API_BASE_URL}/api/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rating, comment })
            });

            const data = await response.json();

            if (response.ok) {
                setStatusMsg('>> UPLOAD SUCCESSFUL');
                setRating(0);
                setHoverRating(0);
                setComment('');
                loadFeedback();
                setTimeout(() => setStatusMsg(''), 3000);
            } else {
                setStatusMsg(`[ERROR]: ${data.error || 'SERVER_REJECT'}`.toUpperCase());
            }
        } catch (err) {
            console.error(err);
            setStatusMsg('[ERROR]: CONNECTION_LOST');
        }
    };

    const startEditing = (item) => {
        setEditingId(item.feedback_id);
        setEditRating(item.rating);
        setEditComment(item.comment);
        setActiveMenuId(null); // Close menu
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditRating(0);
        setEditComment('');
    };

    const saveEdit = async (id) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/feedback/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rating: editRating, comment: editComment })
            });

            if (res.ok) {
                loadFeedback();
                cancelEditing();
            } else {
                alert("Update Failed");
            }
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("CONFIRM DELETION?")) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/feedback/${id}`, { method: 'DELETE', credentials: 'include' });
            if (res.ok) loadFeedback();
        } catch (e) { console.error(e); }
    };

    const handleReport = async (id) => {
        try {
            await fetch(`${API_BASE_URL}/api/feedback/${id}/report`, { method: 'POST', credentials: 'include' });
            alert("Log flagged for audit.");
        } catch (e) { console.error(e); }
    };

    const renderStars = (count) => "★".repeat(count) + "☆".repeat(5 - count);

    return (
        <div className="feedback-container">

            {/* 1. Header */}
            <div className="feedback-header">
                <div className="system-status">
                    <div className="status-dot"></div> COMMS LINK ONLINE
                </div>
                <h1 className="glitch-title">System_Logs</h1>
                <p style={{ fontFamily: 'Michroma', fontSize: '0.8rem', color: 'var(--accent-green)' }}>
                    USER_FEEDBACK_PROTOCOL // V 2.4
                </p>
            </div>

            {/* 2. Bento Grid */}
            <div className="feedback-grid">

                {/* Left: Input Console */}
                <div className="console-card">
                    <span className="card-label">TRANSMIT SIGNAL</span>

                    <form onSubmit={handleSubmit}>
                        <div className="terminal-input-group">
                            <label className="terminal-label">&gt;&gt; SIGNAL_STRENGTH (RATING)</label>
                            <div className="star-rating-terminal" onMouseLeave={() => setHoverRating(0)}>
                                {[1, 2, 3, 4, 5].map((idx) => (
                                    <span
                                        key={idx}
                                        className={`star-btn ${(hoverRating || rating) >= idx ? 'active' : ''}`}
                                        onMouseMove={() => setHoverRating(idx)}
                                        onClick={() => setRating(idx)}
                                    >
                                        ★
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="terminal-input-group">
                            <label className="terminal-label">&gt;&gt; DATA_PACKET (COMMENT)</label>
                            <textarea
                                className="terminal-textarea"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Enter system diagnostics..."
                            />
                        </div>

                        {statusMsg && (
                            <div style={{
                                fontFamily: 'JetBrains Mono',
                                color: statusMsg.includes('ERROR') ? 'var(--danger)' : 'var(--accent-green)',
                                marginBottom: '1rem', fontSize: '0.8rem'
                            }}>
                                {statusMsg}
                            </div>
                        )}

                        <button type="submit" className="submit-btn">
                            <Icons.Send /> UPLOAD
                        </button>
                    </form>
                </div>

                {/* Right: Live Feed */}
                <div className="console-card">
                    <span className="card-label">INCOMING TRANSMISSIONS</span>

                    <div className="feed-stream">
                        {feedbackList.length === 0 ? (
                            <div style={{ fontFamily: 'JetBrains Mono', color: '#555', padding: '2rem', textAlign: 'center' }}>
                        // NO_DATA_FOUND
                            </div>
                        ) : (
                            feedbackList.map((item) => (
                                <div key={item.feedback_id} className={`log-entry ${editingId === item.feedback_id ? 'editing' : ''}`}>

                                    <div className="log-header">
                                        <span>
                                            <Icons.Terminal style={{ width: 12, height: 12, marginRight: 5 }} />
                                            ID: <span className="log-user">{item.user_name}</span>
                                        </span>
                                        <span className="log-time">
                                            {new Date(item.created_at).toISOString().split('T')[0]}
                                        </span>

                                        <button className="cmd-btn_fb" onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuId(activeMenuId === item.feedback_id ? null : item.feedback_id);
                                        }}>
                                            <Icons.More />
                                        </button>

                                        {activeMenuId === item.feedback_id && (
                                            <div className="cmd-menu">
                                                {currentUser && currentUser.id === item.user_id ? (
                                                    <>
                                                        <button onClick={() => startEditing(item)} className="cmd-option">
                                                            <Icons.Edit /> EDIT
                                                        </button>
                                                        <button onClick={() => handleDelete(item.feedback_id)} className="cmd-option danger">
                                                            <Icons.Trash /> DELETE
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => handleReport(item.feedback_id)} className="cmd-option">
                                                        <Icons.Flag /> FLAG
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* --- EDIT MODE vs VIEW MODE --- */}
                                    {editingId === item.feedback_id ? (
                                        <div className="edit-mode-container">
                                            <div className="edit-stars">
                                                {[1, 2, 3, 4, 5].map((idx) => (
                                                    <span
                                                        key={idx}
                                                        className={`star-btn small ${editRating >= idx ? 'active' : ''}`}
                                                        onClick={() => setEditRating(idx)}
                                                    >★</span>
                                                ))}
                                            </div>
                                            <textarea
                                                className="terminal-textarea small"
                                                value={editComment}
                                                onChange={(e) => setEditComment(e.target.value)}
                                            />
                                            <div className="edit-actions">
                                                <button className="edit-btn save" onClick={() => saveEdit(item.feedback_id)}>
                                                    <Icons.Check /> SAVE
                                                </button>
                                                <button className="edit-btn cancel" onClick={cancelEditing}>
                                                    <Icons.X /> CANCEL
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className={`log-content ${!item.comment ? 'placeholder' : ''}`}>
                                                "{item.comment || 'NO_TEXT_DATA'}"
                                            </div>
                                            <div className="log-rating">
                                                {renderStars(item.rating)}
                                            </div>
                                        </>
                                    )}

                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Feedback;