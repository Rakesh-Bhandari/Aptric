import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { CONTEST_STATES, deleteContest, errorMessage, listContests, setContestPublished } from './api';
import { Badge, Empty, ErrorNote } from './AdminUi';
import { formatDate, label } from './adminUtils';
import { canDelete } from './contestUtils';

// All contests, drafts included, with state, window and participant count.
const Contests = () => {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [state, setState] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setRows(await listContests());
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const act = async (contest, run, done) => {
        setBusy(contest.id);
        try {
            await run();
            toast.success(done);
            await load();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(null);
        }
    };

    const togglePublished = async (c) => {
        if (c.is_published) {
            const ok = await toast.confirm({
                title: 'Unpublish contest?',
                message: `“${c.title}” disappears for players${c.participants ? `, including its ${c.participants} participant${c.participants === 1 ? '' : 's'}` : ''}. Entries and answers are kept.`,
                confirmText: 'Unpublish', danger: true,
            });
            if (!ok) return;
        }
        act(c, () => setContestPublished(c.id, !c.is_published), c.is_published ? 'Contest unpublished.' : 'Contest published.');
    };

    const remove = async (c) => {
        const ok = await toast.confirm({
            title: 'Delete contest?',
            message: `“${c.title}” and its question list will be permanently deleted. This cannot be undone.`,
            confirmText: 'Delete', danger: true,
        });
        if (ok) act(c, () => deleteContest(c.id), 'Contest deleted.');
    };

    const shown = state ? rows.filter((r) => r.state === state) : rows;

    return (
        <div className="adm-page">
            <header className="adm-header">
                <h1>Contests</h1>
                <p>Create timed contests from the question bank. Drafts are invisible to players until published.</p>
            </header>

            <div className="adm-filters">
                <label className="adm-field">
                    <span>State</span>
                    <select value={state} onChange={(e) => setState(e.target.value)}>
                        <option value="">All</option>
                        {CONTEST_STATES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                </label>
                <Link to="new" className="adm-btn adm-btn-primary">New contest</Link>
            </div>

            <ErrorNote error={error} onRetry={load} />

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>Contest</th>
                            <th>State</th>
                            <th>Starts</th>
                            <th>Ends</th>
                            <th>Questions</th>
                            <th>Participants</th>
                            <th><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((c) => (
                            <tr key={c.id}>
                                <td className="adm-cell-stem">
                                    <Link to={c.id}>{c.title}</Link>
                                    <span className="adm-sub adm-mono">{c.slug}</span>
                                </td>
                                <td><Badge value={c.state} /></td>
                                <td>{formatDate(c.starts_at)}</td>
                                <td>{formatDate(c.ends_at)}</td>
                                <td>{c.question_count}</td>
                                <td>{c.participants}</td>
                                <td>
                                    <div className="adm-actions">
                                        <Link to={c.id} className="adm-btn adm-btn-small">Edit</Link>
                                        <Link to={`${c.id}/results`} className="adm-btn adm-btn-small">Results</Link>
                                        <button type="button" className="adm-btn adm-btn-small" disabled={busy === c.id} onClick={() => togglePublished(c)}>
                                            {c.is_published ? 'Unpublish' : 'Publish'}
                                        </button>
                                        <button type="button" className="adm-btn adm-btn-small adm-btn-danger" disabled={busy === c.id || !canDelete(c)}
                                            title={canDelete(c) ? undefined : 'Players have joined: unpublish instead.'} onClick={() => remove(c)}>
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!loading && !shown.length && !error && <Empty>{rows.length ? 'No contests in this state.' : 'No contests yet.'}</Empty>}
                {loading && <Empty>Loading…</Empty>}
            </div>
        </div>
    );
};

export default Contests;
