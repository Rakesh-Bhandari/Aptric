import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { errorMessage, listHostedContests, reviewHostedContest } from './api';
import { Badge, Empty, ErrorNote, Pager } from './AdminUi';
import { formatDate, label } from './adminUtils';

const PAGE_SIZE = 10;
const FILTERS = [['pending', 'Waiting for approval'], ['reported', 'Reported'], ['upcoming', 'Upcoming and live'], ['all', 'All hosted']];

const ContestCard = ({ contest: c, onChanged }) => {
    const toast = useToast();
    const [note, setNote] = useState('');
    const [strike, setStrike] = useState(false);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    // Audited in Postgres (audit_log: the contest row change with the note, plus the action).
    const act = async (action) => {
        setBusy(true);
        try {
            await reviewHostedContest(c.id, action, note, strike);
            toast.success('Done.');
            setNote('');
            setStrike(false);
            onChanged();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };
    const needsNote = (a) => ['reject', 'cancel', 'hide'].includes(a) && !note.trim();
    const live = c.status === 'scheduled' && c.state !== 'ended';

    return (
        <article className="adm-card adm-report">
            <header className="adm-report-head">
                <Badge value={c.status === 'cancelled' ? 'cancelled' : c.review_state === 'pending' ? 'pending' : c.state} />
                <strong>{c.title}</strong>
                <span className="adm-sub">
                    {label(c.visibility)} · by <Link to={`/admin/users/${c.host.id}`}>@{c.host.handle}</Link> (level {c.host.level}
                    {c.host.host_strikes > 0 && <>, <strong>{c.host.host_strikes} hosting strike{c.host.host_strikes === 1 ? '' : 's'}</strong></>}
                    {c.host.post_strikes > 0 && <>, {c.host.post_strikes} removed post{c.host.post_strikes === 1 ? '' : 's'}</>})
                    {' · '}{formatDate(c.starts_at)} to {formatDate(c.ends_at)} · {c.participants} entered
                </span>
            </header>
            {c.description && <blockquote className="adm-quote" style={{ whiteSpace: 'pre-wrap' }}>{c.description}</blockquote>}
            {c.hidden && <p className="adm-sub"><strong>Hidden</strong> {c.status_note ? `: ${c.status_note}` : ''}</p>}
            {c.reports.length > 0 && <p className="adm-sub">Open reports: {c.reports.map((r) => `${label(r.reason)} × ${r.count}`).join(', ')}</p>}
            <button type="button" className="adm-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the {c.questions.length} questions</button>
            {open && (
                <ol className="adm-sub" style={{ paddingLeft: '1.25rem' }}>
                    {c.questions.map((q) => <li key={q.position}>[{q.difficulty}] {q.stem}</li>)}
                </ol>
            )}
            <div className="adm-report-actions">
                <input type="text" aria-label="Note for the host and the audit log" placeholder="Note (required to reject, cancel or hide)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                <label className="adm-sub"><input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} /> Add a hosting strike</label>
                {c.review_state === 'pending' && <button type="button" className="adm-btn adm-btn-primary" disabled={busy} onClick={() => act('approve')}>Approve</button>}
                {c.review_state === 'pending' && <button type="button" className="adm-btn" disabled={busy || needsNote('reject')} onClick={() => act('reject')}>Reject</button>}
                {live && !c.hidden && <button type="button" className="adm-btn" disabled={busy || needsNote('hide')} onClick={() => act('hide')}>Hide</button>}
                {c.hidden && <button type="button" className="adm-btn" disabled={busy} onClick={() => act('unhide')}>Unhide and dismiss reports</button>}
                {live && <button type="button" className="adm-btn" disabled={busy || needsNote('cancel')} onClick={() => act('cancel')}>Cancel contest</button>}
                {c.reports.length > 0 && !c.hidden && <button type="button" className="adm-btn" disabled={busy} onClick={() => act('dismiss_reports')}>Dismiss reports</button>}
            </div>
        </article>
    );
};

// Contests players host: public ones wait here for approval; reported ones can be hidden or cancelled. Official contests
// are edited on the Contests page.
const HostedContests = () => {
    const { refreshCounts } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const filter = FILTERS.some(([v]) => v === params.get('filter')) ? params.get('filter') : 'pending';
    const page = Number(params.get('page') ?? 0) || 0;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            setData(await listHostedContests({ filter, page, pageSize: PAGE_SIZE }));
        } catch (err) {
            setError(errorMessage(err));
        }
    }, [filter, page]);

    useEffect(() => { load(); }, [load]);
    const changed = () => { load(); refreshCounts?.(); };

    return (
        <div className="adm-page">
            <h1>Hosted contests</h1>
            <p className="adm-sub">Hosts pick from verified Aptric questions; nobody writes their own. Check the title and description, then approve, or reject with a note the host will read. Three reports hide a contest automatically until you look.</p>
            <div className="adm-filters">
                <select aria-label="Show" value={filter} onChange={(e) => setParams({ filter: e.target.value })}>
                    {FILTERS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                </select>
            </div>
            <ErrorNote error={error} onRetry={load} />
            {!data && !error && <p role="status">Loading…</p>}
            {data && data.items.length === 0 && <Empty>Nothing to review.</Empty>}
            {data?.items.map((c) => <ContestCard key={c.id} contest={c} onChanged={changed} />)}
            {data && data.total > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} count={data.total} onPage={(n) => setParams({ filter, page: String(n) })} />}
        </div>
    );
};

export default HostedContests;
