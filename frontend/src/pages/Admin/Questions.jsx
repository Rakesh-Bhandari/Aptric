import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { DIFFICULTIES, errorMessage, searchQuestions, setQuestionStatus, SOURCES, STATUSES } from '../../lib/admin';
import { Badge, Empty, ErrorNote, Pager, TaxonomySelect } from './AdminUi';
import { label, plain, timeAgo, useDebounced, useTaxonomy } from './adminUtils';

const PAGE_SIZE = 25;
const PARAM = { search: 'q', sectionId: 'section', topicId: 'topic', subtopicId: 'subtopic', difficulty: 'difficulty', status: 'status', source: 'source', jobId: 'job' };

// Search and filter the whole bank. Filters live in the URL so a view can be
// linked and survives opening a question and coming back.
const Questions = () => {
    const toast = useToast();
    const navigate = useNavigate();
    const { refreshCounts } = useOutletContext();
    const taxonomy = useTaxonomy();
    const [params, setParams] = useSearchParams();
    const filters = Object.fromEntries(Object.entries(PARAM).map(([k, p]) => [k, params.get(p) || '']));
    const page = Number(params.get('page')) || 0;
    const [searchText, setSearchText] = useState(filters.search);
    const debouncedSearch = useDebounced(searchText, 350);

    const [result, setResult] = useState({ rows: [], count: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [bulkStatus, setBulkStatus] = useState('');
    const [busy, setBusy] = useState(false);

    const update = useCallback((patch, keepPage = false) => {
        setParams((prev) => {
            const next = new URLSearchParams(prev);
            Object.entries(patch).forEach(([k, v]) => (v ? next.set(PARAM[k] ?? k, v) : next.delete(PARAM[k] ?? k)));
            if (!keepPage) next.delete('page');
            return next;
        }, { replace: true });
    }, [setParams]);

    useEffect(() => {
        if (debouncedSearch !== (params.get('q') || '')) update({ search: debouncedSearch });
    }, [debouncedSearch, params, update]);

    const key = params.toString();
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResult(await searchQuestions(filters, { page, pageSize: PAGE_SIZE, order: params.get('order') || 'newest' }));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
        // key stands in for filters/page/order.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    useEffect(() => { load(); setSelected(new Set()); }, [load]);

    const toggle = (id) => setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const allOnPage = result.rows.length > 0 && result.rows.every((r) => selected.has(r.id));
    const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(result.rows.map((r) => r.id)));

    const applyBulk = async () => {
        if (!bulkStatus || !selected.size) return;
        const ok = await toast.confirm({
            message: `Move ${selected.size} question${selected.size > 1 ? 's' : ''} to “${label(bulkStatus)}”?`,
            confirmText: 'Move', variant: bulkStatus === 'retired' ? 'danger' : 'info',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const moved = await setQuestionStatus([...selected], bulkStatus);
            toast.success(`${moved} question${moved === 1 ? '' : 's'} moved to ${label(bulkStatus)}.`);
            setBulkStatus('');
            refreshCounts();
            load();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="adm-page">
            <header className="adm-header">
                <h1>Questions</h1>
                <p>Search the bank by text or id, filter by section, topic, difficulty and status.</p>
            </header>

            <div className="adm-filters">
                <label className="adm-field adm-field-search">
                    <span>Search</span>
                    <input type="search" placeholder="Question text or id" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
                </label>
                <TaxonomySelect taxonomy={taxonomy} value={filters} onChange={(v) => update(v)} />
                <label className="adm-field">
                    <span>Difficulty</span>
                    <select value={filters.difficulty} onChange={(e) => update({ difficulty: e.target.value })}>
                        <option value="">All</option>
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <label className="adm-field">
                    <span>Status</span>
                    <select value={filters.status} onChange={(e) => update({ status: e.target.value })}>
                        <option value="">All</option>
                        {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                </label>
                <label className="adm-field">
                    <span>Source</span>
                    <select value={filters.source} onChange={(e) => update({ source: e.target.value })}>
                        <option value="">All</option>
                        {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                <label className="adm-field">
                    <span>Order</span>
                    <select value={params.get('order') || 'newest'} onChange={(e) => update({ order: e.target.value === 'newest' ? '' : e.target.value })}>
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                    </select>
                </label>
                {filters.jobId && <button type="button" className="adm-chip on" onClick={() => update({ jobId: '' })}>Job {filters.jobId.slice(0, 8)} ✕</button>}
            </div>

            {selected.size > 0 && (
                <div className="adm-bulk">
                    <span>{selected.size} selected</span>
                    <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} aria-label="New status">
                        <option value="">Move to…</option>
                        {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                    <button type="button" className="adm-btn adm-btn-primary" disabled={!bulkStatus || busy} onClick={applyBulk}>Apply</button>
                    <button type="button" className="adm-btn" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
            )}

            <ErrorNote error={error} onRetry={load} />

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" aria-label="Select page" checked={allOnPage} onChange={toggleAll} /></th>
                            <th>Question</th>
                            <th>Section › topic › subtopic</th>
                            <th>Difficulty</th>
                            <th>Status</th>
                            <th>Reports</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.rows.map((r) => (
                            <tr key={r.id} className="adm-row-link" onClick={() => navigate(`/admin/questions/${r.id}`)}>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" aria-label="Select question" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                                </td>
                                <td className="adm-cell-stem">
                                    <Link to={`/admin/questions/${r.id}`} onClick={(e) => e.stopPropagation()}>{plain(r.stem)}</Link>
                                    <span className="adm-sub">{r.source}{r.model ? ` · ${r.model}` : ''}</span>
                                </td>
                                <td className="adm-cell-path">{r.subtopic.topic.section.name} › {r.subtopic.topic.name} › {r.subtopic.name}</td>
                                <td><Badge value={r.difficulty} /></td>
                                <td><Badge value={r.status} title={r.review_note || undefined} /></td>
                                <td>{r.open_reports > 0 ? <span className="adm-flag">{r.open_reports}</span> : '—'}</td>
                                <td title={r.created_at}>{timeAgo(r.created_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!loading && !result.rows.length && !error && <Empty>No questions match these filters.</Empty>}
                {loading && <Empty>Loading…</Empty>}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={result.count} onPage={(p) => update({ page: p ? String(p) : '' }, true)} />
        </div>
    );
};

export default Questions;
