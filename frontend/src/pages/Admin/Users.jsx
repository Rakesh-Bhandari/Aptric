import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage, listUsers } from '../../lib/admin';
import { Badge, Empty, ErrorNote, Pager } from './AdminUi';
import { formatDate, timeAgo, useDebounced } from './adminUtils';

const PAGE_SIZE = 25;

const Users = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const filters = { search: params.get('q') || '', role: params.get('role') || '', banned: params.get('banned') || '' };
    const page = Number(params.get('page')) || 0;
    const [searchText, setSearchText] = useState(filters.search);
    const debouncedSearch = useDebounced(searchText, 350);
    const [result, setResult] = useState({ rows: [], count: 0 });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const set = useCallback((patch) => {
        setParams((prev) => {
            const next = new URLSearchParams(prev);
            Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
            if (!('page' in patch)) next.delete('page');
            return next;
        }, { replace: true });
    }, [setParams]);

    useEffect(() => {
        if (debouncedSearch !== (params.get('q') || '')) set({ q: debouncedSearch });
    }, [debouncedSearch, params, set]);

    const key = params.toString();
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResult(await listUsers(filters, { page, pageSize: PAGE_SIZE }));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
        // key stands in for filters/page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="adm-page">
            <header className="adm-header">
                <h1>Users</h1>
                <p>Search by handle, name, email or id. Open a user to change their role, ban them or see their attempts.</p>
            </header>

            <div className="adm-filters">
                <label className="adm-field adm-field-search">
                    <span>Search</span>
                    <input type="search" placeholder="handle, name, email or id" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
                </label>
                <label className="adm-field">
                    <span>Role</span>
                    <select value={filters.role} onChange={(e) => set({ role: e.target.value })}>
                        <option value="">All</option>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                    </select>
                </label>
                <label className="adm-field">
                    <span>Status</span>
                    <select value={filters.banned} onChange={(e) => set({ banned: e.target.value })}>
                        <option value="">All</option>
                        <option value="false">Active</option>
                        <option value="true">Banned</option>
                    </select>
                </label>
            </div>

            <ErrorNote error={error} onRetry={load} />

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr><th>User</th><th>Email</th><th>Role</th><th>Level / XP</th><th>Attempts</th><th>Joined</th><th>Last sign-in</th></tr>
                    </thead>
                    <tbody>
                        {result.rows.map((u) => (
                            <tr key={u.id} className="adm-row-link" onClick={() => navigate(`/admin/users/${u.id}`)}>
                                <td>
                                    <Link to={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()}>{u.handle ? `@${u.handle}` : <em>no handle</em>}</Link>
                                    {u.display_name && <span className="adm-sub"> {u.display_name}</span>}
                                    {u.banned_at && <> <Badge value="banned" title={u.banned_reason || undefined} /></>}
                                </td>
                                <td>{u.email ?? '—'}</td>
                                <td><Badge value={u.role} /></td>
                                <td>{u.level} / {u.xp}</td>
                                <td>{u.attempts ? `${u.correct}/${u.attempts}` : '—'}</td>
                                <td title={formatDate(u.created_at)}>{timeAgo(u.created_at)}</td>
                                <td title={formatDate(u.last_sign_in_at)}>{timeAgo(u.last_sign_in_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {loading && <Empty>Loading…</Empty>}
                {!loading && !result.rows.length && !error && <Empty>No users match.</Empty>}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={result.count} onPage={(p) => set({ page: p ? String(p) : '' })} />
        </div>
    );
};

export default Users;
