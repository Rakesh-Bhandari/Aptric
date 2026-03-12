import React, { useState, useEffect } from 'react';
import './Leaderboard.css';
import API_BASE_URL from '../../utils/config.js';

/* --- SVG MATH HELPERS --- */
const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return { x: centerX + (radius * Math.cos(angleInRadians)), y: centerY + (radius * Math.sin(angleInRadians)) };
};

const describeDonutSegment = (x, y, radius, innerRadius, startAngle, endAngle) => {
    if (endAngle - startAngle >= 360) endAngle = 359.99;
    const startOuter = polarToCartesian(x, y, radius, endAngle);
    const endOuter = polarToCartesian(x, y, radius, startAngle);
    const startInner = polarToCartesian(x, y, innerRadius, endAngle);
    const endInner = polarToCartesian(x, y, innerRadius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return ["M", startOuter.x, startOuter.y, "A", radius, radius, 0, largeArcFlag, 0, endOuter.x, endOuter.y, "L", endInner.x, endInner.y, "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y, "Z"].join(" ");
};

const SkillWheel = ({ topics }) => {
    const allCategories = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation', 'Puzzles', 'Technical Aptitude'];
    const safeTopics = allCategories.map(cat => {
        const existing = (topics || []).find(t => t.name === cat);
        return existing || { name: cat, progress: 0, total: 0, correct: 0 };
    });

    const [activeIndex, setActiveIndex] = useState(() => {
        return safeTopics.reduce((max, curr, idx, arr) =>
            (Number(curr.progress) || 0) > (Number(arr[max]?.progress) || 0) ? idx : max, 0);
    });

    const colors = ['#2ea043', '#3b82f6', '#a855f7', '#d29922', '#f85149', '#06b6d4'];
    const grandTotal = safeTopics.reduce((acc, t) => acc + (t.total || 0), 0);

    let currentAngle = 0;
    const slices = safeTopics.map((topic, i) => {
        const weight = grandTotal > 0 ? (topic.total || 0) / grandTotal : 1 / 6;
        const angleSize = weight * 360;
        const slice = { ...topic, color: colors[i % colors.length], startAngle: currentAngle, endAngle: currentAngle + angleSize, midAngle: currentAngle + (angleSize / 2) };
        currentAngle += angleSize;
        return slice;
    });

    const activeItem = slices[activeIndex];
    const isRightSide = activeItem ? (activeItem.midAngle >= 0 && activeItem.midAngle < 180) : true;

    return (
        <div className="skill-wheel-container">
            <div className="wheel-wrapper">
                <svg viewBox="0 0 200 200" className="skill-svg">
                    <circle cx="100" cy="100" r="90" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="15" />
                    {slices.map((slice, i) => (
                        <path key={i} d={describeDonutSegment(100, 100, activeIndex === i ? 96 : 90, 60, slice.startAngle + 1.5, slice.endAngle - 1.5)}
                            fill={slice.color} onMouseEnter={() => setActiveIndex(i)} className="wheel-segment"
                            style={{ opacity: activeIndex === i ? 1 : 0.6, filter: activeIndex === i ? `drop-shadow(0 0 8px ${slice.color})` : 'none', transition: '0.4s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                    ))}
                </svg>
                <div className="wheel-center">
                    <div className="center-stats">
                        <div style={{ color: activeItem?.color, fontSize: '1.5rem', fontWeight: 'bold' }}>{activeItem?.progress || 0}%</div>
                        <div style={{ fontSize: '0.6rem', color: '#7d8590', textTransform: 'uppercase' }}>Mastery</div>
                    </div>
                </div>
                {activeItem && (
                    <div className={`stat-popup ${isRightSide ? 'popup-right' : 'popup-left'}`}>
                        <div className="popup-header" style={{ color: activeItem.color }}>{activeItem.name}</div>
                        <div className="popup-body">
                            <div className="popup-row"><span>ATTEMPTED</span><span>{activeItem.total || 0}</span></div>
                            <div className="popup-row"><span>CORRECT</span><span style={{ color: '#2ea043' }}>{activeItem.correct || 0}</span></div>
                            <div className="popup-row"><span>ACCURACY</span><span>{activeItem.progress}%</span></div>
                        </div>
                    </div>
                )}
            </div>
            <div className="skill-legend-bottom">
                {slices.map((slice, i) => (
                    <div key={i} className={`mini-legend-item ${activeIndex === i ? 'active' : ''}`}
                        style={{ borderColor: activeIndex === i ? slice.color : 'rgba(255,255,255,0.05)' }}
                        onMouseEnter={() => setActiveIndex(i)}>
                        <span className="dot" style={{ background: slice.color }}></span>
                        {slice.name.split(' ')[0]}
                    </div>
                ))}
            </div>
        </div>
    );
};

const Leaderboard = () => {
    const [leaders, setLeaders] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const lbRes = await fetch(`${API_BASE_URL}/api/leaderboard`);
                const lbData = await lbRes.json();
                setLeaders(Array.isArray(lbData) ? lbData : []);

                const userRes = await fetch(`${API_BASE_URL}/api/user`, { credentials: 'include' });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    setCurrentUser(userData.user);
                }
            } catch (error) { console.error("Leaderboard Fetch Error:", error); }
            finally { setLoading(false); }
        };
        fetchData();
    }, []);

    const handleUserClick = async (userId) => {
        setProfileLoading(true);
        setSelectedProfile(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/${userId}/public`);
            if (res.ok) {
                const data = await res.json();
                setSelectedProfile(data);
            }
        } catch (err) { console.error("Public Profile Fetch Error:", err); }
        finally { setProfileLoading(false); }
    };

    const getAvatarUrl = (path, name) => {
        if (path && path.startsWith('http')) return path;
        if (path) return `${API_BASE_URL}${path}`;
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=2ea043&color=fff&size=128`;
    };

    if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2ea043', fontFamily: 'JetBrains Mono' }}>INITIALIZING_RANKING_DATA...</div>;

    return (
        <div className="leaderboard-container">
            <div className="practice-header">
                <div className="header-main-title">
                    <h1 className="glitch-title">OPERATIVE_RANKS</h1>
                    <p className="subtitle-timer">// GLOBAL_LEADERBOARD_V2.0</p>
                </div>
            </div>

            <div className="bento-leaderboard-grid">
                {leaders.map((player) => {
                    const isMe = currentUser && player.userId === currentUser.id;
                    return (
                        <div key={player.rank} className={`bento-item ${isMe ? 'is-me' : ''}`} onClick={() => handleUserClick(player.userId)}>
                            <div className="bento-rank">#{player.rank}</div>
                            <div className="bento-user-core">
                                <img src={getAvatarUrl(player.profilePic, player.user)} alt="Avatar" className="bento-avatar" />
                                <div>
                                    <span className="bento-name">{player.user} {isMe && <span style={{ color: 'var(--accent-green)', fontSize: '0.6rem' }}>(YOU)</span>}</span>
                                    <span className="bento-clearance">LEVEL_{player.level.toUpperCase()}</span>
                                </div>
                            </div>
                            <div className="bento-stats-row">
                                <div className="mini-stat"><span className="mini-label">SCORE</span><span className="mini-val" style={{ color: 'var(--accent-green)' }}>{player.score.toLocaleString()}</span></div>
                                <div className="mini-stat"><span className="mini-label">ACCURACY</span><span className="mini-val">{player.accuracy}%</span></div>
                            </div>
                            <div style={{ marginTop: '1rem', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${player.accuracy}%`, height: '100%', background: 'var(--accent-green)', boxShadow: '0 0 10px var(--accent-green)' }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {(selectedProfile || profileLoading) && (
                <div className="modal-backdrop" onClick={() => setSelectedProfile(null)}>
                    <div className="lp-modal" onClick={e => e.stopPropagation()}>

                        {profileLoading ? (
                            <div className="lp-modal-loading">
                                <div className="lp-loading-dots">
                                    <span></span><span></span><span></span>
                                </div>
                                <span>SYNCHRONIZING_DATA...</span>
                            </div>
                        ) : selectedProfile && (
                            <>
                                {/* ── BANNER ── */}
                                <div className="lp-banner">
                                    <div className="lp-banner-pattern"></div>
                                    <button className="lp-modal-close" onClick={() => setSelectedProfile(null)}>✕</button>
                                    <div className="lp-banner-label">// USER_PROFILE</div>
                                </div>

                                {/* ── PROFILE HEADER ── */}
                                <div className="lp-profile-header">
                                    <div className="lp-avatar-wrapper">
                                        <img
                                            src={getAvatarUrl(selectedProfile.profilePic, selectedProfile.name)}
                                            className="lp-avatar"
                                            alt="Avatar"
                                        />
                                        <div className="lp-avatar-ring"></div>
                                    </div>
                                    <div className="lp-identity">
                                        <h2 className="lp-name">{selectedProfile.name}</h2>
                                        <div className="lp-meta-row">
                                            <span className="lp-level-chip">
                                                <span className="chip-dot"></span>
                                                {selectedProfile.stats?.level || 'Beginner'}
                                            </span>
                                            {selectedProfile.stats?.joined && (
                                                <span className="lp-joined">
                                                    ⏱ Since {new Date(selectedProfile.stats.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                        {selectedProfile.bio && (
                                            <p className="lp-bio">" {selectedProfile.bio} "</p>
                                        )}
                                    </div>
                                </div>

                                {/* ── STATS GRID ── */}
                                <div className="lp-modal-body">
                                    <div className="lp-section-label">// PERFORMANCE_METRICS</div>
                                    <div className="lp-stats-row">
                                        <div className="lp-stat" style={{ '--sc': '#2ea043' }}>
                                            <span className="lp-stat-icon">◈</span>
                                            <span className="lp-stat-val" style={{ color: '#2ea043' }}>{selectedProfile.stats?.score?.toLocaleString() ?? 0}</span>
                                            <span className="lp-stat-lbl">Score</span>
                                        </div>
                                        <div className="lp-stat" style={{ '--sc': '#a855f7' }}>
                                            <span className="lp-stat-icon">◎</span>
                                            <span className="lp-stat-val" style={{ color: '#a855f7' }}>{selectedProfile.stats?.accuracy ?? 0}%</span>
                                            <span className="lp-stat-lbl">Accuracy</span>
                                        </div>
                                        <div className="lp-stat" style={{ '--sc': '#f59e0b' }}>
                                            <span className="lp-stat-icon">🔥</span>
                                            <span className="lp-stat-val" style={{ color: '#f59e0b' }}>{selectedProfile.stats?.streak ?? 0}</span>
                                            <span className="lp-stat-lbl">Streak</span>
                                        </div>
                                        <div className="lp-stat" style={{ '--sc': '#3b82f6' }}>
                                            <span className="lp-stat-icon">✦</span>
                                            <span className="lp-stat-val" style={{ color: '#3b82f6' }}>{selectedProfile.stats?.questionsAnswered ?? 0}</span>
                                            <span className="lp-stat-lbl">Solved</span>
                                        </div>
                                    </div>

                                    {/* ── SKILL WHEEL ── */}
                                    <div className="lp-section-label" style={{ marginTop: '0.5rem' }}>// SKILL_DISTRIBUTION</div>
                                    <div className="lp-wheel-card">
                                        <SkillWheel topics={selectedProfile.topics} />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Leaderboard;