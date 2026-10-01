import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import StatusPanel from '../../components/StatusPanel/StatusPanel';
import { useSession } from '../../context/SessionContext';
import { countByStatus, countOpenReports } from '../../lib/admin';
import { supabase } from '../../lib/supabase';
import './Admin.css';

const NAV = [
    { to: 'review', label: 'Review queue', count: 'review' },
    { to: 'questions', label: 'Questions' },
    { to: 'reports', label: 'Reports', count: 'reports' },
    { to: 'users', label: 'Users' },
    { to: 'jobs', label: 'Generation jobs', count: 'jobs' },
    { to: 'audit', label: 'Audit log' },
];

const countActiveJobs = async () => {
    const { count, error } = await supabase.from('question_generation_jobs')
        .select('id', { count: 'exact', head: true }).in('status', ['queued', 'running']);
    if (error) throw error;
    return count ?? 0;
};

// /admin/*. Rendered inside <RequireAuth>, so the user is signed in here. The
// role check only decides what to show: RLS and the admin_* functions refuse
// non-admins regardless.
const AdminLayout = () => {
    const { profile, isAdmin } = useSession();
    const { pathname } = useLocation();
    const [counts, setCounts] = useState({});

    const refreshCounts = useCallback(async () => {
        try {
            const [review, reports, jobs] = await Promise.all([countByStatus('in_review'), countOpenReports(), countActiveJobs()]);
            setCounts({ review, reports, jobs });
        } catch { /* counts are decoration */ }
    }, []);

    // Refresh on navigation and every 30 s.
    useEffect(() => {
        if (!isAdmin) return undefined;
        refreshCounts();
        const t = setInterval(refreshCounts, 30_000);
        return () => clearInterval(t);
    }, [isAdmin, pathname, refreshCounts]);

    const outletContext = useMemo(() => ({ refreshCounts }), [refreshCounts]);

    if (!profile) return null;
    if (!isAdmin) {
        return (
            <StatusPanel code="403 // ADMIN_ONLY" title="Admins only" message="Your account doesn't have access to the admin area.">
                <Link to="/" className="status-panel-btn primary">Home</Link>
            </StatusPanel>
        );
    }

    return (
        <div className="adm">
            <nav className="adm-nav" aria-label="Admin">
                <div className="adm-nav-title">Admin</div>
                {NAV.map((item) => (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}>
                        <span>{item.label}</span>
                        {item.count && counts[item.count] > 0 && <span className="adm-nav-count">{counts[item.count]}</span>}
                    </NavLink>
                ))}
            </nav>
            <section className="adm-main">
                <Outlet context={outletContext} />
            </section>
        </div>
    );
};

export default AdminLayout;
