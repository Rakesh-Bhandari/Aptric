import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage, listAudit } from '../../lib/admin';
import { Empty, ErrorNote, Pager } from './AdminUi';
import { formatDate } from './adminUtils';

const PAGE_SIZE = 50;

const ENTITY_TYPES = [
    'questions', 'question_options', 'question_answers', 'question_tags', 'reports', 'profiles',
    'question_generation_jobs', 'feedback', 'sections', 'topics', 'subtopics', 'tags', 'tracks',
    'daily_sets', 'daily_set_items', 'levels', 'league_tiers', 'track_sections', 'cron',
];
const ACTIONS = ['insert', 'update', 'delete', 'approve', 'reject', 'set_status', 'set_role', 'ban', 'unban', 'create', 'cancel', 'finish'];
const NOISE = new Set(['updated_at', 'created_at']);

// Where an audit row's subject lives in the admin UI.
const entityLink = (row) => {
    if (row.question_ref) return { to: `/admin/questions/${row.question_ref}`, text: 'question' };
    if (row.entity_type === 'profiles') return { to: `/admin/users/${row.entity_id}`, text: 'user' };
    if (row.entity_type === 'question_generation_jobs') return { to: `/admin/jobs?job=${row.entity_id}`, text: 'job' };
    return null;
};

const show = (v) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// Changed fields for updates; every field for inserts and deletes.
const Changes = ({ before, after }) => {
    if (!before && !after) return <span className="adm-sub">contents not logged</span>;
    const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
        .filter((k) => !(before && after) || JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        .filter((k) => !(before && after && NOISE.has(k)));
    if (!keys.length) return <span className="adm-sub">no field changes</span>;
    return (
        <dl className="adm-diff">
            {keys.map((k) => (
                <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                        {before && <del>{show(before[k])}</del>}
                        {before && after && ' → '}
                        {after && <ins>{show(after[k])}</ins>}
                    </dd>
                </div>
            ))}
        </dl>
    );
};

export const AuditEntries = ({ rows }) => {
    const [open, setOpen] = useState(() => new Set());
    if (!rows.length) return <Empty>No audit entries.</Empty>;
    const toggle = (id) => setOpen((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    return (
        <div className="adm-table-wrap">
            <table className="adm-table adm-audit">
                <thead>
                    <tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Changes</th></tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const link = entityLink(r);
                        return (
                            <tr key={r.id}>
                                <td title={r.created_at}>{formatDate(r.created_at)}</td>
                                <td>{r.actor ? <Link to={`/admin/users/${r.actor.id}`}>@{r.actor.handle ?? r.actor.id.slice(0, 8)}</Link> : <span className="adm-sub">system</span>}</td>
                                <td><span className={`adm-action adm-action-${r.action}`}>{r.action}</span></td>
                                <td>
                                    <div>{r.entity_type}</div>
                                    <div className="adm-sub adm-mono">
                                        {link ? <Link to={link.to}>{r.entity_id?.slice(0, 8)}</Link> : r.entity_id?.slice(0, 8)}
                                    </div>
                                </td>
                                <td>
                                    {open.has(r.id)
                                        ? <><Changes before={r.before} after={r.after} /><button type="button" className="adm-link" onClick={() => toggle(r.id)}>hide</button></>
                                        : <button type="button" className="adm-link" onClick={() => toggle(r.id)}>show</button>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const AuditLog = () => {
    const [params, setParams] = useSearchParams();
    const filters = {
        entityType: params.get('entity_type') || '',
        action: params.get('action') || '',
        actorId: params.get('actor') || '',
        entityId: params.get('entity') || '',
        questionRef: params.get('question') || '',
    };
    const page = Number(params.get('page')) || 0;
    const [entityInput, setEntityInput] = useState(filters.entityId);
    const [result, setResult] = useState({ rows: [], count: 0 });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const set = (patch) => {
        const next = new URLSearchParams(params);
        Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
        if (!('page' in patch)) next.delete('page');
        setParams(next, { replace: true });
    };

    const key = params.toString();
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResult(await listAudit(filters, { page, pageSize: PAGE_SIZE }));
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
                <h1>Audit log</h1>
                <p>Every admin write, content change and scheduled job, newest first. Append-only.</p>
            </header>

            <div className="adm-filters">
                <label className="adm-field">
                    <span>Entity type</span>
                    <select value={filters.entityType} onChange={(e) => set({ entity_type: e.target.value })}>
                        <option value="">All</option>
                        {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <label className="adm-field">
                    <span>Action</span>
                    <select value={filters.action} onChange={(e) => set({ action: e.target.value })}>
                        <option value="">All</option>
                        {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </label>
                <form className="adm-field adm-field-search" onSubmit={(e) => { e.preventDefault(); set({ entity: entityInput.trim() }); }}>
                    <span>Entity id</span>
                    <input type="search" value={entityInput} placeholder="exact id, Enter to filter" onChange={(e) => setEntityInput(e.target.value)} />
                </form>
                {filters.actorId && <button type="button" className="adm-chip on" onClick={() => set({ actor: '' })}>Actor {filters.actorId.slice(0, 8)} ✕</button>}
                {filters.questionRef && <button type="button" className="adm-chip on" onClick={() => set({ question: '' })}>Question {filters.questionRef.slice(0, 8)} ✕</button>}
            </div>

            <ErrorNote error={error} onRetry={load} />
            {loading ? <Empty>Loading…</Empty> : <AuditEntries rows={result.rows} />}
            <Pager page={page} pageSize={PAGE_SIZE} count={result.count} onPage={(p) => set({ page: p ? String(p) : '' })} />
        </div>
    );
};

export default AuditLog;
