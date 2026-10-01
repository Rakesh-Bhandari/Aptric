import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getPlayerProfile, gameErrorMessage } from '../../lib/game';
import './ProgressPanel.css';

// The signed-in player's level, rating, streak freezes, league and badges
// (earned and still locked), from get_player_profile() and the badges catalog.
const ProgressPanel = () => {
    const [me, setMe] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            getPlayerProfile(),
            supabase.from('badges').select('slug, name, description, icon, per_topic').order('sort_order'),
        ]).then(([profile, { data, error: catalogError }]) => {
            if (cancelled) return;
            if (catalogError) throw catalogError;
            setMe(profile);
            setCatalog(data || []);
        }).catch(err => { if (!cancelled) setError(gameErrorMessage(err)); });
        return () => { cancelled = true; };
    }, []);

    if (error) return <div className="pp-card pp-error">{error}</div>;
    if (!me) return <div className="pp-card pp-loading">LOADING_PROGRESS...</div>;

    const span = me.next_level_xp - me.level_xp;
    const pct = span > 0 ? Math.min(100, Math.round(((me.xp - me.level_xp) / span) * 100)) : 100;
    const earned = (slug) => me.badges.filter(b => b.slug === slug);

    return (
        <div className="pp-card">
            <div className="pp-top">
                <div className="pp-level">
                    <span className="pp-label">LEVEL</span>
                    <span className="pp-big">{me.level}</span>
                </div>
                <div className="pp-xp">
                    <div className="pp-xp-row">
                        <span>{me.xp.toLocaleString()} XP</span>
                        <span>{(me.next_level_xp - me.xp).toLocaleString()} to level {me.level + 1}</span>
                    </div>
                    <div className="pp-bar"><div style={{ width: `${pct}%` }} /></div>
                </div>
            </div>

            <div className="pp-stats">
                <div>
                    <span className="pp-label">RATING</span>
                    <strong>{me.rated_sets ? me.rating : '—'}</strong>
                    <small>{me.rated_sets ? `${me.rated_sets} daily sets rated` : 'Finish a daily challenge'}</small>
                </div>
                <div>
                    <span className="pp-label">STREAK</span>
                    <strong>🔥 {me.current_streak}</strong>
                    <small>best {me.longest_streak}</small>
                </div>
                <div>
                    <span className="pp-label">FREEZES</span>
                    <strong>❄ {me.streak_freezes}/{me.max_streak_freezes}</strong>
                    <small>{me.streak_freezes >= me.max_streak_freezes
                        ? 'Full'
                        : `next at ${me.next_freeze_xp.toLocaleString()} XP`}</small>
                </div>
                <div>
                    <span className="pp-label">LEAGUE</span>
                    <strong>{me.league_tier?.name ?? '—'}</strong>
                    <small>{me.solved} solved</small>
                </div>
            </div>

            <span className="pp-label">BADGES</span>
            <div className="pp-badges">
                {catalog.map(b => {
                    const got = earned(b.slug);
                    return (
                        <div key={b.slug} className={`pp-badge ${got.length ? 'got' : 'locked'}`} title={b.description}>
                            <span className="pp-badge-icon">{b.icon}</span>
                            <span className="pp-badge-name">{b.name}{got.length > 1 ? ` ×${got.length}` : ''}</span>
                            <span className="pp-badge-desc">
                                {got.length
                                    ? (b.per_topic ? got.map(g => g.topic).join(', ') : `Earned ${new Date(got[0].awarded_at).toLocaleDateString()}`)
                                    : b.description}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ProgressPanel;
