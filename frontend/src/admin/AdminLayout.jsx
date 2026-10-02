import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Flag, ListChecks, ListTodo, ScrollText, Sparkles, Users } from 'lucide-react';
import { AptricMark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { useSession } from '@/context/SessionContext';
import { countActiveJobs, countByStatus, countOpenReports } from './api';
import './Admin.css';

const NAV = [
    { to: 'review', label: 'Review queue', icon: ListChecks, count: 'review' },
    { to: 'questions', label: 'Questions', icon: ListTodo },
    { to: 'reports', label: 'Reports', icon: Flag, count: 'reports' },
    { to: 'users', label: 'Users', icon: Users },
    { to: 'jobs', label: 'Generation jobs', icon: Sparkles, count: 'jobs' },
    { to: 'audit', label: 'Audit log', icon: ScrollText },
];

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
            <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
                <h1 className="text-2xl font-bold">Admins only</h1>
                <p className="text-muted-foreground">Your account doesn't have access to the admin area.</p>
                <Button asChild><Link to="/">Home</Link></Button>
            </div>
        );
    }

    return (
        <div className="adm">
            <nav className="adm-nav" aria-label="Admin">
                <div className="adm-nav-title">
                    <AptricMark variant="onDark" className="adm-nav-mark" />
                    <span>Admin</span>
                </div>
                {NAV.map(({ to, label, icon: Icon, count }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}>
                        <Icon className="adm-nav-icon" aria-hidden />
                        <span className="adm-nav-label">{label}</span>
                        {count && counts[count] > 0 && (
                            <span className="adm-nav-count" aria-label={`${counts[count]} pending`}>{counts[count]}</span>
                        )}
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
