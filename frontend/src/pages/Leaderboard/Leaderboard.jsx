import React, { useState, useEffect } from 'react';
import './Leaderboard.css';

const API_BASE_URL = 'http://localhost:5000';

/* --- SVG MATH HELPERS (Keep these for SkillWheel) --- */
const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
};

const describeDonutSegment = (x, y, radius, innerRadius, startAngle, endAngle) => {
    if (endAngle - startAngle >= 360) endAngle = 359.99;
    const startOuter = polarToCartesian(x, y, radius, endAngle);
    const endOuter = polarToCartesian(x, y, radius, startAngle);
    const startInner = polarToCartesian(x, y, innerRadius, endAngle);
    const endInner = polarToCartesian(x, y, innerRadius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
        "M", startOuter.x, startOuter.y,
        "A", radius, radius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
        "L", endInner.x, endInner.y,
        "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
        "Z"
    ].join(" ");
};

/* --- DYNAMIC WEIGHTED SKILL WHEEL --- */
const SkillWheel = ({ topics }) => {
    // Ensure all 6 categories are represented even if data is missing
    const allCategories = [
        'Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 
        'Data Interpretation', 'Puzzles', 'Technical Aptitude'
    ];

    // Map the incoming topic data to the full list of 6
    const safeTopics = allCategories.map(cat => {
        const existing = (topics || []).find(t => t.name === cat);
        return existing || { name: cat, progress: 0, total: 0, correct: 0 };
    });

    const [activeIndex, setActiveIndex] = useState(() => {
        const maxIdx = safeTopics.reduce((max, curr, idx, arr) => 
            (Number(curr.progress) || 0) > (Number(arr[max])?.progress || 0) ? idx : max, 0);
        return maxIdx;
    });
    
    const colors = ['#2ea043', '#3b82f6', '#a855f7', '#d29922', '#f85149', '#06b6d4'];

    // DYNAMIC SIZING: Calculate weights based on total attempts
    const grandTotal = safeTopics.reduce((acc, t) => acc + (t.total || 0), 0);
    
    let currentAngle = 0;
    const slices = safeTopics.map((topic, i) => {
        // If user has 0 total questions, give each slice an equal 1/6th of the wheel
        const weight = grandTotal > 0 ? (topic.total || 0) / grandTotal : 1 / 6;
        const angleSize = weight * 360;
        
        const slice = {
            ...topic,
            color: colors[i % colors.length],
            startAngle: currentAngle,
            endAngle: currentAngle + angleSize,
            midAngle: currentAngle + (angleSize / 2)
        };
        currentAngle += angleSize;
        return slice;
    });

    const activeItem = slices[activeIndex];
    const isRightSide = activeItem ? (activeItem.midAngle >= 0 && activeItem.midAngle < 180) : true;

    return (
        <div className="skill-wheel-container">
            <div className="wheel-wrapper">
                <svg viewBox="0 0 200 200" className="skill-svg">
                    {/* Background track */}
                    <circle cx="100" cy="100" r="90" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="15" />
                    
                    {slices.map((slice, i) => (
                        <path
                            key={i}
                            d={describeDonutSegment(
                                100, 100, 
                                activeIndex === i ? 96 : 90, // Pop out active slice
                                60, 
                                slice.startAngle + 1.5, // 1.5deg gap
                                slice.endAngle - 1.5
                            )}
                            fill={slice.color}
                            onMouseEnter={() => setActiveIndex(i)}
                            className="wheel-segment"
                            style={{ 
                                opacity: activeIndex === i ? 1 : 0.6, 
                                filter: activeIndex === i ? `drop-shadow(0 0 8px ${slice.color})` : 'none',
                                transition: '0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                        />
                    ))}
                </svg>
                
                <div className="wheel-center">
                    <div className="center-stats">
                        <div style={{ color: activeItem?.color, fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {activeItem?.progress || 0}%
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#7d8590', textTransform: 'uppercase' }}>Mastery</div>
                    </div>
                </div>

                {/* BENTO POPUP */}
                {activeItem && (
                    <div className={`stat-popup ${isRightSide ? 'popup-right' : 'popup-left'}`}>
                        <div className="popup-header" style={{ color: activeItem.color }}>{activeItem.name}</div>
                        <div className="popup-body">
                            <div className="popup-row"><span>ATTEMPTED</span><span>{activeItem.total || 0}</span></div>
                            <div className="popup-row"><span>CORRECT</span><span style={{color: '#2ea043'}}>{activeItem.correct || 0}</span></div>
                            <div className="popup-row"><span>ACCURACY</span><span>{activeItem.progress}%</span></div>
                        </div>
                    </div>
                )}
            </div>

            {/* BENTO LEGEND PILLS */}
            <div className="skill-legend-bottom">
                {slices.map((slice, i) => (
                    <div 
                        key={i} 
                        className={`mini-legend-item ${activeIndex === i ? 'active' : ''}`}
                        style={{ borderColor: activeIndex === i ? slice.color : 'rgba(255,255,255,0.05)' }}
                        onMouseEnter={() => setActiveIndex(i)}
                    >
                        <span className="dot" style={{ background: slice.color }}></span>
                        {/* Show short name (first word) */}
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
                setLeaders(lbData);
                const userRes = await fetch(`${API_BASE_URL}/api/user`, { credentials: 'include' });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    setCurrentUser(userData.user);
                }
            } catch (error) { console.error(error); } finally { setLoading(false); }
        };
        fetchData();
    }, []);

    const handleUserClick = async (userId) => {
        setProfileLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/${userId}/public`);
            if (res.ok) setSelectedProfile(await res.json());
        } catch (err) { console.error(err); } finally { setProfileLoading(false); }
    };

    if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2ea043' }}>INITIALIZING_RANKING_DATA...</div>;

    return (
        <div className="leaderboard-container">
            <header className="leaderboard-header-section">
                <div>
                    <h1 className="glitch-title">OPERATIVE_RANKS</h1>
                    <p style={{ color: 'var(--accent-green)', fontFamily: 'JetBrains Mono', fontSize: '0.75rem', margin: '5px 0' }}>// GLOBAL_LEADERBOARD_V2.0</p>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'Michroma', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    ACTIVE_SESSIONS: {leaders.length} <br />
                    SYNC_STATUS: <span style={{ color: 'var(--accent-green)' }}>ENCRYPTED</span>
                </div>
            </header>

            <div className="bento-leaderboard-grid">
                {leaders.map((player) => {
                    const isMe = currentUser && player.user === currentUser.name;
                    const avatarUrl = player.profilePic ? `${API_BASE_URL}${player.profilePic}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(player.user)}&background=2ea043&color=fff&size=128`;

                    return (
                        <div key={player.rank} className={`bento-item ${isMe ? 'is-me' : ''}`} onClick={() => handleUserClick(player.userId)}>
                            <div className="bento-rank">#{player.rank}</div>

                            <div className="bento-user-core">
                                <img src={avatarUrl} alt="Avatar" className="bento-avatar" />
                                <div>
                                    <span className="bento-name">{player.user} {isMe && <span style={{ color: 'var(--accent-green)', fontSize: '0.6rem' }}>(YOU)</span>}</span>
                                    <span className="bento-clearance">LEVEL_{player.level.toUpperCase()}</span>
                                </div>
                            </div>

                            <div className="bento-stats-row">
                                <div className="mini-stat">
                                    <span className="mini-label">SCORE</span>
                                    <span className="mini-val" style={{ color: 'var(--accent-green)' }}>{player.score.toLocaleString()}</span>
                                </div>
                                <div className="mini-stat">
                                    <span className="mini-label">ACCURACY</span>
                                    <span className="mini-val">{player.accuracy}%</span>
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${player.accuracy}%`, height: '100%', background: 'var(--accent-green)', boxShadow: '0 0 10px var(--accent-green)' }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- PREMIER BENTO MODAL 3.0 --- */}
            {(selectedProfile || profileLoading) && (
                <div className="modal-backdrop" onClick={() => setSelectedProfile(null)}>
                    <div className="modal-glass-panel" onClick={e => e.stopPropagation()}>
                        <button className="btn-close-minimal" onClick={() => setSelectedProfile(null)}>✕</button>

                        {profileLoading ? (
                            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono', color: 'var(--accent-green)' }}>
                    // SYNCHRONIZING_DATA...
                            </div>
                        ) : (
                            <div className="bento-modal-wrapper">

                                {/* LEFT: IDENTITY COLUMN */}
                                <div className="bento-column-left">
                                    <div className="card-identity-main">
                                        <img
                                            src={selectedProfile.profilePic ? `${API_BASE_URL}${selectedProfile.profilePic}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedProfile.name)}&background=2ea043&color=fff&size=256`}
                                            className="modal-avatar-premium"
                                            alt="Avatar"
                                        />
                                        <h2 style={{ fontFamily: 'Audiowide', fontSize: '1.5rem', marginBottom: '4px' }}>{selectedProfile.name}</h2>
                                        <div className="premium-label" style={{ color: 'var(--accent-green)' }}>{selectedProfile.stats.level} Operative</div>

                                        <p className="premium-bio">
                                            {selectedProfile.bio || "No tactical biography provided for this operative."}
                                        </p>
                                    </div>

                                    <div className="card-bento-stat" style={{ textAlign: 'center' }}>
                                        <span className="premium-label">Active_Streak</span>
                                        <span className="premium-value" style={{ color: 'var(--gold)' }}>🔥 {selectedProfile.stats.streak} Days</span>
                                    </div>

                                    <div className="card-bento-stat" style={{ gridColumn: 'span 2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="premium-label" style={{ margin: 0 }}>Network_Joined</span>
                                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {new Date(selectedProfile.stats.joined).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                {/* RIGHT: ANALYTICS GRID */}
                                <div className="bento-column-right">
                                    <div className="card-bento-stat">
                                        <span className="premium-label">Global_Score</span>
                                        <span className="premium-value">{selectedProfile.stats.score.toLocaleString()}</span>
                                    </div>
                                    <div className="card-bento-stat">
                                        <span className="premium-label">Avg_Accuracy</span>
                                        <span className="premium-value">{selectedProfile.stats.accuracy}%</span>
                                    </div>

                                    <div className="card-bento-wide">
                                        <span className="premium-label" style={{ alignSelf: 'flex-start', marginBottom: '1.5rem' }}>Skill_Matrix_Analysis</span>
                                        <SkillWheel topics={selectedProfile.topics} />
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Leaderboard;