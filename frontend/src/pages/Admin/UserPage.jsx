import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage, getUser, listAudit, listUserAttempts, setUserBan, setUserRole } from '../../lib/admin';
import { Badge, Empty, ErrorNote, Pager } from './AdminUi';
import { formatDate, plain } from './adminUtils';
import { AuditEntries } from './AuditLog';

const PAGE_SIZE = 25;

const UserPage = () => {
    const { id } = useParams();
    const toast = useToast();
    const { user: me } = useSession();
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');
    const [attempts, setAttempts] = useState({ rows: [], count: 0 });
    const [attemptPage, setAttemptPage] = useState(0);
    const [attemptsError, setAttemptsError] = useState('');
    const [history, setHistory] = useState([]);
    const [banReason, setBanReason] = useState('');
    const [busy, setBusy] = useState(false);
    const isSelf = me?.id === id;

    const load = useCallback(async () => {
        setError('');
        try {
            const u = await getUser(id);
            if (!u) throw new Error('User not found.');
            setUser(u);
            setHistory((await listAudit({ entityType: 'profiles', entityId: id }, { pageSize: 20 })).rows);
        } catch (err) {
            setError(errorMessage(err));
        }
    }, [id]);
    useEffect(() => { setUser(null); load(); }, [load]);

    useEffect(() => {
        let alive = true;
        setAttemptsError('');
        listUserAttempts(id, { page: attemptPage, pageSize: PAGE_SIZE })
            .then((r) => { if (alive) setAttempts(r); })
            .catch((err) => { if (alive) setAttemptsError(errorMessage(err)); });
        return () => { alive = false; };
    }, [id, attemptPage]);

    const run = async (fn, success) => {
        setBusy(true);
        try {
            await fn();
            toast.success(success);
            await load();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const changeRole = async (role) => {
        const ok = await toast.confirm({
            message: role === 'admin'
                ? `Make @${user.handle ?? 'this user'} an admin? Admins can edit all content, users and reports.`
                : `Remove admin rights from @${user.handle ?? 'this user'}${isSelf ? ' (yourself)' : ''}?`,
            confirmText: role === 'admin' ? 'Make admin' : 'Remove admin', variant: role === 'admin' ? 'info' : 'danger',
        });
        if (ok) run(() => setUserRole(id, role), `Role changed to ${role}.`);
    };

    const ban = async () => {
        const ok = await toast.confirm({
            message: `Ban @${user.handle ?? 'this user'}? They are signed out everywhere and can't sign in, play or file reports until unbanned.`,
            confirmText: 'Ban',
        });
        if (ok) run(() => setUserBan(id, true, banReason), 'User banned.').then(() => setBanReason(''));
    };

    const unban = async () => {
        const ok = await toast.confirm({ message: `Unban @${user.handle ?? 'this user'}?`, confirmText: 'Unban', variant: 'info' });
        if (ok) run(() => setUserBan(id, false), 'User unbanned.');
    };

    if (error) return <div className="adm-page"><ErrorNote error={error} onRetry={load} /></div>;
    if (!user) return <div className="adm-page"><Empty>Loading…</Empty></div>;

    const accuracy = user.attempts ? Math.round((100 * user.correct) / user.attempts) : null;

    return (
        <div className="adm-page">
            <header className="adm-header">
                <Link to="/admin/users" className="adm-back">← Users</Link>
                <h1>
                    {user.handle ? `@${user.handle}` : <em>no handle</em>} <Badge value={user.role} />
                    {user.banned_at && <> <Badge value="banned" /></>}
                </h1>
                <p>{user.display_name}{user.display_name && ' · '}{user.email} · <span className="adm-mono">{user.id}</span></p>
            </header>

            <dl className="adm-meta">
                <div><dt>Level</dt><dd>{user.level}</dd></div>
                <div><dt>XP</dt><dd>{user.xp}</dd></div>
                <div><dt>Streak</dt><dd>{user.current_streak} (best {user.longest_streak})</dd></div>
                <div><dt>Attempts</dt><dd>{user.attempts}{accuracy !== null && ` · ${accuracy}% correct`}</dd></div>
                <div><dt>Timezone</dt><dd>{user.timezone}</dd></div>
                <div><dt>Joined</dt><dd>{formatDate(user.created_at)}</dd></div>
                <div><dt>Last sign-in</dt><dd>{formatDate(user.last_sign_in_at)}</dd></div>
            </dl>

            <div className="adm-grid-2">
                <section className="adm-card">
                    <h2>Role</h2>
                    <p className="adm-sub">Admins manage content, users and reports. The last admin can't be demoted.</p>
                    {user.role === 'admin'
                        ? <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={() => changeRole('user')}>Remove admin</button>
                        : <button type="button" className="adm-btn" disabled={busy || !!user.banned_at} onClick={() => changeRole('admin')}>Make admin</button>}
                </section>

                <section className="adm-card">
                    <h2>Ban</h2>
                    {user.banned_at ? (
                        <>
                            <p>Banned {formatDate(user.banned_at)}{user.banned_reason ? ` — “${user.banned_reason}”` : ''}.</p>
                            <button type="button" className="adm-btn" disabled={busy} onClick={unban}>Unban</button>
                        </>
                    ) : isSelf ? (
                        <p className="adm-sub">You can't ban yourself.</p>
                    ) : user.role === 'admin' ? (
                        <p className="adm-sub">Remove admin rights before banning.</p>
                    ) : (
                        <>
                            <label className="adm-field adm-field-wide">
                                <span>Reason <small>shown in the audit log</small></span>
                                <input type="text" maxLength={500} value={banReason} onChange={(e) => setBanReason(e.target.value)} />
                            </label>
                            <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={ban}>Ban user</button>
                        </>
                    )}
                </section>
            </div>

            <section className="adm-section">
                <h2>Attempts ({attempts.count ?? 0})</h2>
                <ErrorNote error={attemptsError} />
                <div className="adm-table-wrap">
                    <table className="adm-table">
                        <thead>
                            <tr><th>When</th><th>Question</th><th>Context</th><th>Result</th><th>Hint</th><th>Time</th><th>XP</th></tr>
                        </thead>
                        <tbody>
                            {attempts.rows.map((a) => (
                                <tr key={a.id}>
                                    <td>{formatDate(a.created_at)}</td>
                                    <td className="adm-cell-stem">
                                        {a.question ? <Link to={`/admin/questions/${a.question.id}`}>{plain(a.question.stem, 90)}</Link> : '—'}
                                    </td>
                                    <td>{a.context}</td>
                                    <td>{a.is_correct ? <Badge value="correct" /> : <Badge value="wrong" />}</td>
                                    <td>{a.used_hint ? 'yes' : '—'}</td>
                                    <td>{a.time_ms != null ? `${Math.round(a.time_ms / 1000)}s` : '—'}</td>
                                    <td>{a.xp_awarded}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!attempts.rows.length && <Empty>No attempts yet.</Empty>}
                </div>
                <Pager page={attemptPage} pageSize={PAGE_SIZE} count={attempts.count} onPage={setAttemptPage} />
            </section>

            <section className="adm-section">
                <h2>Account history</h2>
                <AuditEntries rows={history} />
                <p><Link to={`/admin/audit?actor=${id}`}>Everything this user did as an actor →</Link></p>
            </section>
        </div>
    );
};

export default UserPage;
