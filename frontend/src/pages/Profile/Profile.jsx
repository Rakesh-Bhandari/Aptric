import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../../context/PreferencesContext';
import { useToast } from '../../context/ToastContext';
import './Profile.css';
import API_BASE_URL from '../../utils/config';


// --- ICONS ---
const Icons = {
    User:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    Activity: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 .33 1.65 1.65 0 0 0 10.51 0H11a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    Edit:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    Shield:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    Target:   () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>,
    Crosshair:() => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>,
    Logout:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    Score:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    Zap:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    Check:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
    Star:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

// --- SVG MATH HELPERS ---
const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    // Subtract 90 to start at 12 o'clock
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

// --- SKILL WHEEL COMPONENT ---
const SkillWheel = ({ topics }) => {
    // Ensure topics exists
    const safeTopics = topics || [];

    // Initialize with the index of the highest progress
    const [activeIndex, setActiveIndex] = useState(() => {
        if (safeTopics.length === 0) return null;
        return safeTopics.reduce((maxIdx, current, idx, arr) =>
            (Number(current.progress) || 0) > (Number(arr[maxIdx].progress) || 0) ? idx : maxIdx, 0
        );
    });

    // Tech Palette
    const colors = ['#2ea043', '#3b82f6', '#a855f7', '#d29922', '#f85149', '#06b6d4', '#eab308', '#ec4899'];

    // 1. Calculate Total Questions
    const grandTotal = safeTopics.reduce((acc, t) => acc + (t.total || 0), 0);

    // 2. Map topics to angles
    let currentAngle = 0;
    const slices = safeTopics.map((topic, i) => {
        const weight = grandTotal > 0 ? (topic.total || 0) / grandTotal : 1 / (safeTopics.length || 1);
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

    const activeItem = activeIndex !== null ? slices[activeIndex] : null;
    const activeColor = activeItem ? activeItem.color : 'var(--text-secondary)';
    const isRightSide = activeItem ? (activeItem.midAngle >= 0 && activeItem.midAngle < 180) : true;

    return (
        <div className="skill-wheel-container">
            <div className="wheel-wrapper">
                <svg viewBox="0 0 200 200" className="skill-svg">
                    {/* Background Ring - Thinner for Bento */}
                    <circle cx="100" cy="100" r="90" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="15" />

                    {slices.map((slice, i) => {
                        const isActive = activeIndex === i;
                        const pathData = describeDonutSegment(
                            100, 100,
                            isActive ? 96 : 90, // Pop out
                            60,
                            slice.startAngle + 1.5, // slightly larger gap for Bento look
                            slice.endAngle - 1.5
                        );

                        return (
                            <g key={i}
                                onClick={() => setActiveIndex(i)}
                                onMouseEnter={() => setActiveIndex(i)}
                                className="wheel-segment"
                                style={{ cursor: 'pointer' }}
                            >
                                <path
                                    d={pathData}
                                    fill={slice.color}
                                    className="segment-fill"
                                    style={{
                                        filter: isActive ? `drop-shadow(0 0 12px ${slice.color})` : 'none',
                                        opacity: isActive ? 1 : 0.65
                                    }}
                                />
                            </g>
                        );
                    })}
                </svg>

                {/* Glassy Center Stats */}
                <div className="wheel-center">
                    {activeItem ? (
                        <div className="center-stats">
                            <span style={{ color: activeColor, fontSize: '1.6rem', fontWeight: '700', fontFamily: 'Inter, sans-serif' }}>{activeItem.progress}%</span>
                            <span style={{ fontSize: '0.65rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '1px' }}>Mastery</span>
                        </div>
                    ) : (
                        <div className="center-icon" style={{ color: 'var(--text-secondary)' }}>
                            <Icons.Target />
                        </div>
                    )}
                </div>

                {/* BENTO POPUP */}
                {activeItem && (
                    <div className={`stat-popup ${isRightSide ? 'popup-right' : 'popup-left'}`} style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                        <div className="popup-header" style={{ color: activeColor }}>
                            {activeItem.name}
                        </div>
                        <div className="popup-body">
                            <div className="popup-row">
                                <span>ATTEMPTED</span>
                                <span>{activeItem.total || 0}</span>
                            </div>
                            <div className="popup-row">
                                <span>CORRECT</span>
                                <span style={{ color: '#2ea043' }}>{activeItem.correct || 0}</span>
                            </div>
                            <div className="popup-row">
                                <span>ACCURACY</span>
                                <span>{activeItem.progress}%</span>
                            </div>
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
                        style={{
                            color: activeIndex === i ? 'white' : '#8b949e',
                            borderColor: activeIndex === i ? slice.color : 'rgba(255,255,255,0.05)'
                        }}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => setActiveIndex(i)}
                    >
                        <span className="dot" style={{ background: slice.color }}></span>
                        {slice.name.split(' ')[0]}
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- STREAK CALENDAR ---
const StreakCalendar = ({ data }) => {
    const safeData = data || {};
    const dataYears = Object.keys(safeData)
        .map(dStr => {
            const dateParts = dStr.split('-');
            return dateParts.length === 3 ? parseInt(dateParts[0], 10) : null;
        })
        .filter(y => y !== null && !isNaN(y));

    const years = Array.from(new Set([new Date().getFullYear(), ...dataYears])).sort((a, b) => b - a);
    const [selectedYear, setSelectedYear] = useState(years[0] || new Date().getFullYear());

    const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const days = isLeapYear(selectedYear) ? 366 : 365;

    const startDate = new Date(selectedYear, 0, 1);
    const startDay = startDate.getDay();

    const grid = [];
    for (let i = 0; i < startDay; i++) grid.push(null);
    for (let i = 0; i < days; i++) {
        const d = new Date(selectedYear, 0, 1 + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dStr = `${yyyy}-${mm}-${dd}`;
        const count = safeData[dStr] || 0;
        grid.push({ date: dStr, count: count, month: d.getMonth() });
    }

    const monthLabels = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let currentMonth = -1;

    const numColumns = Math.ceil(grid.length / 7);
    for (let col = 0; col < numColumns; col++) {
        const cellIndex = col * 7;
        const colCells = grid.slice(cellIndex, cellIndex + 7).filter(c => c !== null);
        if (colCells.length > 0) {
            const monthForCol = colCells[0].month;
            if (monthForCol !== currentMonth) {
                monthLabels.push({ month: months[monthForCol], colIndex: col });
                currentMonth = monthForCol;
            }
        }
    }

    return (
        <div style={{ fontFamily: 'JetBrains Mono', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>{grid.filter(c => c && c.count > 0).length} ACTIVE_DAYS_IN_{selectedYear}</span>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ background: '#0d1117', color: 'white', border: '1px solid #333', padding: '2px 8px', borderRadius: '4px', outline: 'none', cursor: 'pointer' }}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            <div style={{ overflowX: 'auto', paddingBottom: '10px', scrollbarColor: '#333 transparent' }}>
                <div style={{ display: 'flex', gap: '8px', minWidth: 'max-content' }}>
                    <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: '3px', marginTop: '20px', fontSize: '0.65rem', color: 'var(--text-secondary)', paddingRight: '4px' }}>
                        <div style={{ height: '12px', lineHeight: '12px' }}></div>
                        <div style={{ height: '12px', lineHeight: '12px' }}>Mon</div>
                        <div style={{ height: '12px', lineHeight: '12px' }}></div>
                        <div style={{ height: '12px', lineHeight: '12px' }}>Wed</div>
                        <div style={{ height: '12px', lineHeight: '12px' }}></div>
                        <div style={{ height: '12px', lineHeight: '12px' }}>Fri</div>
                        <div style={{ height: '12px', lineHeight: '12px' }}></div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', position: 'relative', height: '16px', marginBottom: '4px', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                            {monthLabels.map((ml, idx) => (
                                <span key={idx} style={{ position: 'absolute', left: `${ml.colIndex * 15}px`, bottom: 0 }}>
                                    {ml.month}
                                </span>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gap: '3px' }}>
                            {grid.map((cell, i) => (
                                <div key={i} style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '2px',
                                    backgroundColor: !cell ? 'transparent' : cell.count === 0 ? 'rgba(255,255,255,0.05)' : cell.count < 3 ? '#0e4429' : cell.count < 5 ? '#26a641' : '#39d353',
                                    visibility: !cell ? 'hidden' : 'visible'
                                }} title={cell ? `${cell.date}: ${cell.count} contributions` : ''}></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '5px', fontSize: '0.65rem', color: 'var(--text-secondary)', gap: '5px' }}>
                <span>Less</span>
                <div style={{ display: 'flex', gap: '3px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(255,255,255,0.05)' }}></div>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#0e4429' }}></div>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#26a641' }}></div>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#39d353' }}></div>
                </div>
                <span>More</span>
            </div>
        </div>
    );
};

// --- MAIN PROFILE COMPONENT ---
const Profile = () => {
    const navigate = useNavigate();
    const toast    = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const { theme, toggleTheme, reduceMotion, toggleMotion } = usePreferences();

    const [formData, setFormData] = useState({ user_name: '', bio: '' });
    const [saveStatus, setSaveStatus] = useState('');
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => { fetchProfileData(); }, []);

    const fetchProfileData = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/progress`, { credentials: 'include' });
            if (res.status === 401) return (window.location.href = '/');
            const json = await res.json();
            setData(json);
            setFormData({ user_name: json.profile.name, bio: json.profile.bio || '' });
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleLogout = async () => {
        const ok = await toast.confirm({ message: 'Disconnect this session?', confirmText: 'Disconnect', cancelText: 'Cancel', variant: 'warning' });
        if (!ok) return;
        try {
            await fetch(`${API_BASE_URL}/auth/logout`, { credentials: 'include' });
            window.location.href = '/';
        } catch (error) { console.error(error); }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setSaveStatus('SAVING...');
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/update`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setSaveStatus('>> UPDATE COMPLETE');
                fetchProfileData();
                setTimeout(() => setSaveStatus(''), 2000);
            } else { setSaveStatus('>> ERROR: UPDATE FAILED'); }
        } catch (err) { setSaveStatus('>> NETWORK ERROR'); }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        setUploading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/avatar`, { method: 'POST', body: formData, credentials: 'include' });
            if (res.ok) {
                const json = await res.json();
                setData(prev => ({ ...prev, profile: { ...prev.profile, profile_pic: json.url } }));
            }
        } catch (err) { alert('Upload failed'); } finally { setUploading(false); }
    };

    if (loading) return <div className="loading-spinner">SHIELD_LINK_ESTABLISHING...</div>;
    if (!data || !data.profile) {
        return (
            <div className="profile-container" style={{ color: 'white', textAlign: 'center', marginTop: '20%' }}>
                DATA_LINK_FAILURE: UNAUTHORIZED_OR_OFFLINE
            </div>
        );
    }
    const { profile, stats, rank, topics, activity } = data;
    const avatarUrl = profile.profile_pic && profile.profile_pic.startsWith('http')
        ? profile.profile_pic
        : (profile.profile_pic ? `${API_BASE_URL}${profile.profile_pic}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=2ea043&color=fff&size=256`);

    return (
        <div className="profile-container">
            {/* 1. IDENTITY HEADER */}
            <div className="profile-header-card">
                <div className="avatar-wrapper" onClick={() => setShowAvatarModal(true)} title="Click to change avatar">
                    <img src={avatarUrl} alt="Profile" className="avatar" />
                    <div className="avatar-overlay-hint"><Icons.Edit /></div>
                </div>

                <div className="header-info">
                    <span className="user-id-tag"><Icons.Shield /> {profile.role ? profile.role.toUpperCase() : 'USER'} &nbsp;·&nbsp; VERIFIED</span>
                    <h1>{profile.name}</h1>
                    <div className="user-email">{profile.email}</div>
                    {profile.bio && <div className="user-bio">{profile.bio}</div>}

                    <div className="profile-badges">
                        <span className="chip level"><Icons.Star /> {stats.level}</span>
                        <span className="chip rank">RANK #{rank}</span>
                        {profile.role === 'admin' && <span className="chip admin">ADMIN</span>}
                    </div>
                </div>

                <div className="header-actions">
                    {profile.role === 'admin' && (
                        <button onClick={() => navigate('/admin')} className="btn-action">
                            <Icons.Shield /> Admin Panel
                        </button>
                    )}
                    <button onClick={handleLogout} className="btn-action logout">
                        <Icons.Logout /> Disconnect
                    </button>
                </div>
            </div>

            {/* 2. NAVIGATION TABS */}
            <div className="profile-tabs">
                <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                    <Icons.User /> Overview
                </button>
                <button className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                    <Icons.Activity /> Logs
                </button>
                <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                    <Icons.Settings /> Config
                </button>
            </div>

            {/* 3. CONTENT AREA */}
            <div className="content-area">

                {/* OVERVIEW TAB */}
                {activeTab === 'overview' && (
                    <div className="bento-grid">
                        <div className="console-card stat-card" style={{ '--card-accent': '#2ea043' }}>
                            <span className="stat-icon" style={{ color: '#2ea043' }}><Icons.Score /></span>
                            <span className="stat-value" style={{ color: '#2ea043' }}>{stats.score.toLocaleString()}</span>
                            <span className="stat-label">TOTAL SCORE</span>
                        </div>
                        <div className="console-card stat-card" style={{ '--card-accent': '#f59e0b' }}>
                            <span className="stat-icon" style={{ color: '#f59e0b' }}><Icons.Zap /></span>
                            <span className="stat-value" style={{ color: '#f59e0b' }}>🔥 {stats.streak}</span>
                            <span className="stat-label">DAY STREAK</span>
                        </div>
                        <div className="console-card stat-card" style={{ '--card-accent': '#a855f7' }}>
                            <span className="stat-icon" style={{ color: '#a855f7' }}><Icons.Check /></span>
                            <span className="stat-value" style={{ color: '#a855f7' }}>{stats.accuracy}%</span>
                            <span className="stat-label">ACCURACY</span>
                        </div>
                        <div className="console-card stat-card" style={{ '--card-accent': '#3b82f6' }}>
                            <span className="stat-icon" style={{ color: '#3b82f6' }}><Icons.Activity /></span>
                            <span className="stat-value" style={{ color: '#3b82f6' }}>{stats.questionsAnswered}</span>
                            <span className="stat-label">SOLVED</span>
                        </div>

                        {/* SKILL DISTRIBUTION - NEW BENTO UI */}
                        <div className="console-card card-wide">
                            <div className="section-label">&gt;&gt; SKILL_DISTRIBUTION_MATRIX</div>
                            <SkillWheel topics={topics} />
                        </div>

                        {/* Calendar - Wide */}
                        <div className="console-card card-wide">
                            <div className="section-label">&gt;&gt; ACTIVITY_HEATMAP</div>
                            <StreakCalendar data={data.calendar || {}} />
                        </div>
                    </div>
                )}

                {/* ACTIVITY TAB */}
                {activeTab === 'activity' && (
                    <div className="console-card card-wide">
                        <div className="section-label">&gt;&gt; RECENT_SYSTEM_LOGS</div>
                        {activity.length > 0 ? (
                            <div className="activity-list">
                                {activity.map((act, idx) => (
                                    <div key={idx} className="activity-item">
                                        <div>
                                            <span className="act-cat">[{act.category.toUpperCase()}]</span>
                                            <span style={{ marginLeft: '10px', color: 'var(--text-secondary)' }}>{act.difficulty}</span>
                                            <div className="act-date">{new Date(act.attempt_date).toLocaleDateString()}</div>
                                        </div>
                                        <span className={`act-status ${act.status === 'correct' ? 'status-correct' : 'status-wrong'}`}>
                                            {act.status.toUpperCase()} {act.status === 'correct' ? `+${act.points_earned}` : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ fontFamily: 'JetBrains Mono', color: '#555', textAlign: 'center' }}>NO_LOGS_FOUND</p>
                        )}
                    </div>
                )}

                {/* SETTINGS TAB */}
                {activeTab === 'settings' && (
                    <div className="bento-grid">
                        <div className="console-card card-half">
                            <div className="section-label">&gt;&gt; SYSTEM_PREFERENCES</div>
                            <div className="preference-item">
                                <div>
                                    <div className="pref-title">VISUAL_THEME</div>
                                    <div className="pref-desc">Toggle Light/Dark Mode</div>
                                </div>
                                <button onClick={toggleTheme} className="toggle-btn">
                                    {theme === 'dark' ? 'DARK_MODE' : 'LIGHT_MODE'}
                                </button>
                            </div>
                            <div className="preference-item">
                                <div>
                                    <div className="pref-title">REDUCE_MOTION</div>
                                    <div className="pref-desc">Disable animations</div>
                                </div>
                                <button onClick={toggleMotion} className="toggle-btn" style={{ color: reduceMotion ? 'var(--accent-green)' : '' }}>
                                    {reduceMotion ? 'ENABLED' : 'DISABLED'}
                                </button>
                            </div>
                        </div>
                        <div className="console-card card-half">
                            <div className="section-label">&gt;&gt; EDIT_PROFILE_DATA</div>
                            <form onSubmit={handleUpdateProfile}>
                                <div className="form-group">
                                    <label>&gt;&gt; DISPLAY_NAME</label>
                                    <input type="text" className="form-input" value={formData.user_name} onChange={(e) => setFormData({ ...formData, user_name: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>&gt;&gt; BIO_DATA</label>
                                    <textarea className="form-textarea" value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>&gt;&gt; EMAIL_ID [LOCKED]</label>
                                    <input type="text" className="form-input" value={profile.email} disabled style={{ opacity: 0.5 }} />
                                </div>
                                <button type="submit" className="btn-save">SAVE_CONFIG</button>
                                {saveStatus && <div style={{ marginTop: '10px', fontFamily: 'JetBrains Mono', color: saveStatus.includes('ERROR') ? 'var(--danger)' : 'var(--accent-green)', fontSize: '0.8rem', textAlign: 'center' }}>{saveStatus}</div>}
                            </form>
                        </div>
                    </div>
                )}
            </div>

            {/* IMAGE MODAL */}
            {showAvatarModal && (
                <div className="modal-backdrop" onClick={() => setShowAvatarModal(false)}>
                    <div className="modal-glass-panel" onClick={e => e.stopPropagation()}>
                        <img src={avatarUrl} alt="Zoomed Profile" className="modal-avatar-img" />
                        <div className="modal-actions">
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} accept="image/*" />
                            <button className="btn-action" onClick={() => fileInputRef.current.click()}>
                                {uploading ? 'UPLOADING...' : 'UPLOAD NEW'}
                            </button>
                            <button className="btn-action logout" onClick={() => setShowAvatarModal(false)}>CLOSE</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profile;