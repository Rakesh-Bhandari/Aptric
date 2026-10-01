import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import Markdown from '@/components/markdown/Markdown';
import { useToast } from '@/context/ToastContext';
import { errorMessage, listReports, REPORT_REASONS, REPORT_STATUSES, updateReport } from './api';
import { Badge, Empty, ErrorNote, Pager } from './AdminUi';
import { formatDate, label } from './adminUtils';

const PAGE_SIZE = 20;

const ReportCard = ({ report, onChanged }) => {
    const toast = useToast();
    const [note, setNote] = useState(report.resolution_note ?? '');
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const closed = report.status === 'resolved' || report.status === 'dismissed';

    // Audited by the reports_audit trigger; resolved_by/at are stamped in Postgres.
    const move = async (status) => {
        setBusy(true);
        try {
            await updateReport(report.id, status, note);
            toast.success(`Report ${status === 'open' ? 'reopened' : status}.`);
            onChanged();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className="adm-card adm-report">
            <header className="adm-report-head">
                <Badge value={report.status} />
                <strong>{label(report.reason)}</strong>
                <span className="adm-sub">
                    by {report.reporter ? <Link to={`/admin/users/${report.reporter.id}`}>@{report.reporter.handle ?? report.reporter.id.slice(0, 8)}</Link> : 'a deleted user'}
                    {' · '}{formatDate(report.created_at)}
                </span>
            </header>
            {report.details && <blockquote className="adm-quote">{report.details}</blockquote>}

            {report.question ? (
                <div className="adm-report-question">
                    <div className="adm-report-qhead">
                        <Link to={`/admin/questions/${report.question.id}`}>Open question →</Link>
                        <Badge value={report.question.status} />
                        <button type="button" className="adm-link" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Collapse' : 'Show question'}</button>
                    </div>
                    {expanded && <Markdown className="adm-md" text={report.question.stem} />}
                </div>
            ) : <p className="adm-sub">The question was deleted.</p>}

            {closed && (
                <p className="adm-sub">
                    {label(report.status)} {formatDate(report.resolved_at)}{report.resolver ? ` by @${report.resolver.handle}` : ''}
                    {report.resolution_note ? ` — ${report.resolution_note}` : ''}
                </p>
            )}

            <div className="adm-report-actions">
                {!closed && (
                    <input type="text" placeholder="Resolution note (optional)" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                )}
                {report.status === 'open' && <button type="button" className="adm-btn" disabled={busy} onClick={() => move('triaged')}>Triage</button>}
                {!closed && <button type="button" className="adm-btn adm-btn-primary" disabled={busy} onClick={() => move('resolved')}>Resolve</button>}
                {!closed && <button type="button" className="adm-btn" disabled={busy} onClick={() => move('dismissed')}>Dismiss</button>}
                {closed && <button type="button" className="adm-btn" disabled={busy} onClick={() => move('open')}>Reopen</button>}
            </div>
        </article>
    );
};

// Open and triaged reports first (oldest first), closed ones newest first.
const Reports = () => {
    const { refreshCounts } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const status = params.has('status') ? params.get('status') : 'open';
    const reason = params.get('reason') || '';
    const questionId = params.get('question') || '';
    const page = Number(params.get('page')) || 0;
    const [result, setResult] = useState({ rows: [], count: 0 });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const set = (patch) => {
        const next = new URLSearchParams(params);
        Object.entries(patch).forEach(([k, v]) => {
            if (k === 'status') next.set(k, v); // '' = all, kept explicitly
            else if (v) next.set(k, v); else next.delete(k);
        });
        if (!('page' in patch)) next.delete('page');
        setParams(next, { replace: true });
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResult(await listReports({ status, reason, questionId }, { page, pageSize: PAGE_SIZE }));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [status, reason, questionId, page]);
    useEffect(() => { load(); }, [load]);

    const onChanged = () => { load(); refreshCounts(); };

    return (
        <div className="adm-page">
            <header className="adm-header">
                <h1>Reports</h1>
                <p>Player reports on questions. Fix the question from its page, then resolve; dismiss reports that need no change.</p>
            </header>

            <div className="adm-tabs" role="tablist">
                {[...REPORT_STATUSES, ''].map((s) => (
                    <button key={s || 'all'} type="button" role="tab" aria-selected={status === s}
                        className={status === s ? 'active' : ''} onClick={() => set({ status: s })}>
                        {s ? label(s) : 'all'}
                    </button>
                ))}
            </div>
            <div className="adm-filters">
                <label className="adm-field">
                    <span>Reason</span>
                    <select value={reason} onChange={(e) => set({ reason: e.target.value })}>
                        <option value="">All</option>
                        {REPORT_REASONS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                    </select>
                </label>
                {questionId && <button type="button" className="adm-chip on" onClick={() => set({ question: '' })}>Question {questionId.slice(0, 8)} ✕</button>}
            </div>

            <ErrorNote error={error} onRetry={load} />
            {loading && <Empty>Loading…</Empty>}
            {!loading && !result.rows.length && !error && <Empty>No reports here.</Empty>}
            <div className="adm-stack">
                {result.rows.map((r) => <ReportCard key={`${r.id}:${r.status}`} report={r} onChanged={onChanged} />)}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={result.count} onPage={(p) => set({ page: p ? String(p) : '' })} />
        </div>
    );
};

export default Reports;
