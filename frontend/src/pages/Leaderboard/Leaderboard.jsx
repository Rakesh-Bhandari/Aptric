import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './Leaderboard.css';
import { useSession } from '../../context/SessionContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { getLeaderboard, getMyLeague, getPlayerProfile, subscribeToLeague, gameErrorMessage } from '../../lib/game';

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
    const allCategories = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation', 'Technical Aptitude'];
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

const TABS = [
    { id: 'league', label: 'MY_LEAGUE' },
    { id: 'weekly', label: 'WEEKLY' },
    { id: 'all_time', label: 'ALL_TIME' },
    { id: 'rating', label: 'RATING' },
];

const TIER_COLORS = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#d29922', platinum: '#5fd3c6', diamond: '#79c0ff' };

const avatarFor = (player) =>
    player?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(player?.display_name || player?.handle || 'User')}&background=2ea043&color=fff&size=128`;

const nameOf = (player) => player?.display_name || player?.handle;

const timeAgo = (iso) => {
    if (!iso) return 'never';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return mins < 1 ? 'just now' : `${mins} min ago`;
};

const countdown = (iso) => {
    const ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return '0h';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
};

// Same order as the database: XP, then whoever got there first.
const rankMembers = (members) =>
    [...members]
        .sort((a, b) => b.xp - a.xp || new Date(a.last_xp_at ?? 0) - new Date(b.last_xp_at ?? 0) || a.rank - b.rank)
        .map((m, i) => ({ ...m, rank: i + 1 }));

// ── LEAGUE BOARD (live) ──────────────────────────────────────────────────────
const LeagueBoard = ({ onSelect }) => {
    const [league, setLeague] = useState(null);
    const [error, setError] = useState(null);
    const [live, setLive] = useState(false);
    const [, tick] = useState(0);
    const reloadTimer = useRef(null);

    const load = useCallback(async () => {
        try {
            setLeague(await getMyLeague());
            setError(null);
        } catch (err) {
            setError(gameErrorMessage(err));
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Countdown refresh.
    useEffect(() => {
        const id = setInterval(() => tick(t => t + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const leagueId = league?.league_id;
    useEffect(() => {
        if (!leagueId) return undefined;
        let subscribedOnce = false;
        const onStatus = (subscribed) => {
            setLive(subscribed);
            // Broadcasts sent while disconnected are lost: resync on reconnect.
            if (subscribed && subscribedOnce) load();
            if (subscribed) subscribedOnce = true;
        };
        const unsubscribe = subscribeToLeague(leagueId, (update) => {
            setLeague(prev => {
                if (!prev || prev.league_id !== update.league_id) return prev;
                const known = prev.members.some(m => m.user_id === update.user_id);
                if (!known) {
                    // A new member: refetch for their handle and the new zone sizes.
                    clearTimeout(reloadTimer.current);
                    reloadTimer.current = setTimeout(load, 300);
                    return prev;
                }
                return {
                    ...prev,
                    members: rankMembers(prev.members.map(m => m.user_id === update.user_id
                        ? { ...m, xp: update.xp, last_xp_at: update.last_xp_at }
                        : m)),
                };
            });
        }, onStatus);
        return () => {
            clearTimeout(reloadTimer.current);
            unsubscribe();
        };
    }, [leagueId, load]);

    if (error) return <div className="lb-empty">{error}</div>;
    if (!league) return <div className="lb-empty">LOADING_LEAGUE...</div>;

    const tier = league.tier || {};
    const color = TIER_COLORS[tier.slug] || 'var(--accent-green)';
    const n = league.members.length;
    const last = league.last_result;

    return (
        <div className="lb-panel">
            <div className="lb-league-head" style={{ '--tier': color }}>
                <div>
                    <div className="lb-tier-name">{(tier.name || 'Bronze').toUpperCase()}_LEAGUE</div>
                    <div className="lb-sub">
                        Ends in {countdown(league.week_ends_at)} · top {league.promote_zone} promote · bottom {league.demote_zone} demote
                    </div>
                </div>
                {leagueId && <span className={`lb-live ${live ? 'on' : ''}`}>{live ? 'LIVE' : 'OFFLINE'}</span>}
            </div>

            {last && (
                <div className={`lb-last ${last.outcome}`}>
                    Last week: #{last.final_rank} · {last.outcome === 'promoted' ? 'promoted ▲' : last.outcome === 'demoted' ? 'demoted ▼' : 'stayed'}
                </div>
            )}

            {!leagueId ? (
                <div className="lb-empty">Earn XP this week to join a {tier.name || 'Bronze'} league of up to 30 players.</div>
            ) : (
                <ol className="lb-list">
                    {league.members.map(m => {
                        const zone = m.rank <= league.promote_zone ? 'up'
                            : m.rank > Math.max(league.promote_zone, n - league.demote_zone) ? 'down' : '';
                        return (
                            <li key={m.user_id} className={`lb-row ${zone} ${m.is_me ? 'me' : ''}`} onClick={() => onSelect(m.handle)}>
                                <span className="lb-rank">{m.rank}</span>
                                <img className="lb-avatar" src={avatarFor(m)} alt="" />
                                <span className="lb-name">{nameOf(m)}{m.is_me && <em> (YOU)</em>}</span>
                                <span className="lb-value">{m.xp.toLocaleString()} XP</span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
};

// ── GLOBAL BOARDS (materialized views, refreshed every 5 minutes) ────────────
const PAGE = 50;

const GlobalBoard = ({ board, onSelect }) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);
        getLeaderboard({ board, pageSize: PAGE })
            .then(d => { if (!cancelled) setData(d); })
            .catch(err => { if (!cancelled) setError(gameErrorMessage(err)); });
        return () => { cancelled = true; };
    }, [board]);

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const next = await getLeaderboard({ board, pageSize: PAGE, offset: data.entries.length });
            setData(prev => ({ ...prev, entries: [...prev.entries, ...next.entries] }));
        } catch (err) {
            setError(gameErrorMessage(err));
        } finally {
            setLoadingMore(false);
        }
    };

    const value = (e) => board === 'weekly' ? `${e.weekly_xp.toLocaleString()} XP`
        : board === 'rating' ? `${e.rating}` : `${e.xp.toLocaleString()} XP`;

    if (error) return <div className="lb-empty">{error}</div>;
    if (!data) return <div className="lb-empty">LOADING_RANKS...</div>;

    const meVisible = data.me && data.entries.some(e => e.user_id === data.me.user_id);
    const row = (e, extra = '') => (
        <li key={`${extra}${e.user_id}`} className={`lb-row ${e.is_me || extra ? 'me' : ''}`} onClick={() => onSelect(e.handle)}>
            <span className="lb-rank">{e.rank}</span>
            <img className="lb-avatar" src={avatarFor(e)} alt="" />
            <span className="lb-name">{nameOf(e)}{(e.is_me || extra) && <em> (YOU)</em>}</span>
            <span className="lb-meta">LVL {e.level} · 🔥 {e.current_streak}</span>
            <span className="lb-value">{value(e)}</span>
        </li>
    );

    return (
        <div className="lb-panel">
            <div className="lb-sub lb-board-sub">
                {board === 'weekly' ? `XP earned since Monday (IST)` : board === 'rating' ? 'Daily challenge rating' : 'Total XP'}
                {' · '}{data.total} players · updated {timeAgo(data.refreshed_at)}
            </div>
            {data.entries.length === 0 ? (
                <div className="lb-empty">{board === 'rating' ? 'Finish a daily challenge to get rated.' : 'No one here yet.'}</div>
            ) : (
                <ol className="lb-list">
                    {data.entries.map(e => row(e))}
                    {data.me && !meVisible && (<><li className="lb-gap">⋯</li>{row({ ...data.me, rank: data.me.rank }, 'me-')}</>)}
                </ol>
            )}
            {data.entries.length < data.total && (
                <button type="button" className="lb-more" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'LOADING...' : 'LOAD_MORE'}
                </button>
            )}
        </div>
    );
};

// ── PLAYER MODAL ─────────────────────────────────────────────────────────────
const PlayerModal = ({ handle, onClose }) => {
    const [player, setPlayer] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getPlayerProfile(handle)
            .then(p => { if (!cancelled) setPlayer(p); })
            .catch(err => { if (!cancelled) setError(gameErrorMessage(err)); });
        return () => { cancelled = true; };
    }, [handle]);

    const topics = useMemo(() => (player?.sections || []).map(s => ({
        name: s.name, total: s.attempted, correct: s.correct,
        progress: s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0,
    })), [player]);

    const accuracy = player?.attempts ? Math.round((player.correct / player.attempts) * 100) : 0;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="lp-modal" onClick={e => e.stopPropagation()}>
                {!player ? (
                    <div className="lp-modal-loading">
                        {error ? <span>{error}</span> : (<>
                            <div className="lp-loading-dots"><span></span><span></span><span></span></div>
                            <span>SYNCHRONIZING_DATA...</span>
                        </>)}
                    </div>
                ) : (
                    <>
                        <div className="lp-banner">
                            <div className="lp-banner-pattern"></div>
                            <button className="lp-modal-close" onClick={onClose}>✕</button>
                            <div className="lp-banner-label">// USER_PROFILE</div>
                        </div>

                        <div className="lp-profile-header">
                            <div className="lp-avatar-wrapper">
                                <img src={avatarFor(player)} className="lp-avatar" alt="Avatar" />
                                <div className="lp-avatar-ring"></div>
                            </div>
                            <div className="lp-identity">
                                <h2 className="lp-name">{nameOf(player)}</h2>
                                <div className="lp-meta-row">
                                    <span className="lp-level-chip"><span className="chip-dot"></span>LEVEL {player.level}</span>
                                    {player.league_tier && (
                                        <span className="lp-level-chip" style={{ color: TIER_COLORS[player.league_tier.slug] }}>
                                            {player.league_tier.name}
                                        </span>
                                    )}
                                    <span className="lp-joined">
                                        ⏱ Since {new Date(player.joined_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                    </span>
                                </div>
                                {player.bio && <p className="lp-bio">" {player.bio} "</p>}
                            </div>
                        </div>

                        <div className="lp-modal-body">
                            <div className="lp-section-label">// PERFORMANCE_METRICS</div>
                            <div className="lp-stats-row">
                                <div className="lp-stat" style={{ '--sc': '#2ea043' }}>
                                    <span className="lp-stat-icon">◈</span>
                                    <span className="lp-stat-val" style={{ color: '#2ea043' }}>{player.xp.toLocaleString()}</span>
                                    <span className="lp-stat-lbl">XP</span>
                                </div>
                                <div className="lp-stat" style={{ '--sc': '#a855f7' }}>
                                    <span className="lp-stat-icon">◎</span>
                                    <span className="lp-stat-val" style={{ color: '#a855f7' }}>{player.rated_sets ? player.rating : '—'}</span>
                                    <span className="lp-stat-lbl">Rating</span>
                                </div>
                                <div className="lp-stat" style={{ '--sc': '#f59e0b' }}>
                                    <span className="lp-stat-icon">🔥</span>
                                    <span className="lp-stat-val" style={{ color: '#f59e0b' }}>{player.current_streak}</span>
                                    <span className="lp-stat-lbl">Streak</span>
                                </div>
                                <div className="lp-stat" style={{ '--sc': '#3b82f6' }}>
                                    <span className="lp-stat-icon">✦</span>
                                    <span className="lp-stat-val" style={{ color: '#3b82f6' }}>{player.solved}</span>
                                    <span className="lp-stat-lbl">Solved · {accuracy}%</span>
                                </div>
                            </div>

                            <div className="lp-section-label" style={{ marginTop: '0.5rem' }}>// BADGES</div>
                            {player.badges.length === 0 ? (
                                <div className="lb-sub">No badges yet.</div>
                            ) : (
                                <div className="lb-badges">
                                    {player.badges.map(b => (
                                        <span key={`${b.slug}-${b.topic || ''}`} className="lb-badge" title={b.description}>
                                            <span>{b.icon}</span> {b.name}{b.topic ? ` · ${b.topic}` : ''}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="lp-section-label" style={{ marginTop: '0.5rem' }}>// SKILL_DISTRIBUTION</div>
                            <div className="lp-wheel-card">
                                <SkillWheel topics={topics} />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ── PAGE ─────────────────────────────────────────────────────────────────────
const Leaderboard = () => {
    const { isAuthenticated, status } = useSession();
    const { openAuth } = useAuthModal();
    const [tab, setTab] = useState('league');
    const [selected, setSelected] = useState(null);

    return (
        <div className="leaderboard-container">
            <div className="practice-header">
                <div className="header-main-title">
                    <h1 className="glitch-title">OPERATIVE_RANKS</h1>
                    <p className="subtitle-timer">// LEAGUES_AND_GLOBAL_LEADERBOARDS</p>
                </div>
            </div>

            {status === 'loading' ? (
                <div className="lb-empty">INITIALIZING_RANKING_DATA...</div>
            ) : !isAuthenticated ? (
                <div className="lb-empty">
                    Sign in to see your league and the global rankings.
                    <button type="button" className="lb-more" onClick={() => openAuth()}>SIGN_IN</button>
                </div>
            ) : (
                <>
                    <div className="lb-tabs" role="tablist">
                        {TABS.map(t => (
                            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                                className={`lb-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {tab === 'league'
                        ? <LeagueBoard onSelect={setSelected} />
                        : <GlobalBoard key={tab} board={tab} onSelect={setSelected} />}
                </>
            )}

            {selected && <PlayerModal handle={selected} onClose={() => setSelected(null)} />}
        </div>
    );
};

export default Leaderboard;
