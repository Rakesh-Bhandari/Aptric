import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { DIFFICULTIES, errorMessage, getQuestion, searchQuestions, setQuestionStatus, SOURCES } from './api';
import { Badge, Empty, ErrorNote, Pager, TaxonomySelect } from './AdminUi';
import { plain, timeAgo, useTaxonomy } from './adminUtils';
import QuestionEditor, { QuestionMeta } from './QuestionEditor';

const PAGE_SIZE = 20;

// in_review questions, oldest first. Approve publishes, reject retires; both
// only apply if the question is still in review (admin_set_question_status
// with from_status), so two reviewers never decide the same question twice.
const ReviewQueue = () => {
    const toast = useToast();
    const { refreshCounts } = useOutletContext();
    const taxonomy = useTaxonomy();
    const [params, setParams] = useSearchParams();
    const filters = {
        sectionId: params.get('section') || '',
        topicId: params.get('topic') || '',
        subtopicId: params.get('subtopic') || '',
        difficulty: params.get('difficulty') || '',
        source: params.get('source') || '',
        jobId: params.get('job') || '',
    };
    const filterKey = params.toString();

    const [page, setPage] = useState(0);
    const [list, setList] = useState({ rows: [], count: 0 });
    const [listError, setListError] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [question, setQuestion] = useState(null);
    const [questionError, setQuestionError] = useState('');
    const [note, setNote] = useState('');
    const [deciding, setDeciding] = useState(false);

    const setFilter = (patch) => {
        const next = new URLSearchParams(params);
        const keys = { sectionId: 'section', topicId: 'topic', subtopicId: 'subtopic', difficulty: 'difficulty', source: 'source', jobId: 'job' };
        Object.entries(patch).forEach(([k, v]) => (v ? next.set(keys[k], v) : next.delete(keys[k])));
        setParams(next, { replace: true });
        setPage(0);
    };

    const loadList = useCallback(async () => {
        setLoading(true);
        setListError('');
        try {
            const result = await searchQuestions({ ...filters, status: 'in_review' }, { page, pageSize: PAGE_SIZE, order: 'oldest' });
            setList(result);
            setSelectedId((cur) => (cur && result.rows.some((r) => r.id === cur) ? cur : result.rows[0]?.id ?? null));
        } catch (err) {
            setListError(errorMessage(err));
        } finally {
            setLoading(false);
        }
        // filterKey stands in for the filters object.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey, page]);

    useEffect(() => { loadList(); }, [loadList]);

    useEffect(() => {
        setQuestion(null);
        setNote('');
        setQuestionError('');
        if (!selectedId) return undefined;
        let alive = true;
        getQuestion(selectedId)
            .then((q) => { if (alive) setQuestion(q); })
            .catch((err) => { if (alive) setQuestionError(errorMessage(err)); });
        return () => { alive = false; };
    }, [selectedId]);

    // Drop the decided question and move on to the next one.
    const advance = (id) => {
        const idx = list.rows.findIndex((r) => r.id === id);
        const rows = list.rows.filter((r) => r.id !== id);
        setList({ rows, count: Math.max(0, list.count - 1) });
        setSelectedId(rows[Math.min(idx, rows.length - 1)]?.id ?? null);
        refreshCounts();
        if (!rows.length) loadList();
    };

    const decide = async (status, save) => {
        if (status === 'retired' && !note.trim()) {
            const ok = await toast.confirm({ message: 'Reject without a note? A note tells the next reviewer (and the audit log) why.', confirmText: 'Reject' });
            if (!ok) return;
        }
        setDeciding(true);
        try {
            if (status === 'published') await save(); // throws (and shows) on invalid edits
            const moved = await setQuestionStatus([question.id], status, { note, fromStatus: 'in_review' });
            if (moved === 0) toast.warning('Someone else already decided this question.');
            else toast.success(status === 'published' ? 'Approved and published.' : 'Rejected.');
            advance(question.id);
        } catch (err) {
            if (!err?.shown) toast.error(errorMessage(err));
        } finally {
            setDeciding(false);
        }
    };

    return (
        <div className="adm-page">
            <header className="adm-header">
                <h1>Review queue</h1>
                <p>{list.count} question{list.count === 1 ? '' : 's'} waiting. Edits are saved before approval; every decision is audited.</p>
            </header>

            <div className="adm-filters">
                <TaxonomySelect taxonomy={taxonomy} value={filters} onChange={setFilter} />
                <label className="adm-field">
                    <span>Difficulty</span>
                    <select value={filters.difficulty} onChange={(e) => setFilter({ difficulty: e.target.value })}>
                        <option value="">All</option>
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <label className="adm-field">
                    <span>Source</span>
                    <select value={filters.source} onChange={(e) => setFilter({ source: e.target.value })}>
                        <option value="">All</option>
                        {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                {filters.jobId && (
                    <button type="button" className="adm-chip on" onClick={() => setFilter({ jobId: '' })}>Job {filters.jobId.slice(0, 8)} ✕</button>
                )}
            </div>

            <ErrorNote error={listError} onRetry={loadList} />

            <div className="adm-review">
                <aside className="adm-review-list" aria-label="Questions in review">
                    {loading && !list.rows.length && <Empty>Loading…</Empty>}
                    {!loading && !list.rows.length && !listError && <Empty>Nothing to review. 🎉</Empty>}
                    <ul>
                        {list.rows.map((r) => (
                            <li key={r.id}>
                                <button type="button" className={`adm-review-item ${r.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(r.id)}>
                                    <span className="adm-review-stem">{plain(r.stem, 110)}</span>
                                    <span className="adm-review-sub">
                                        <Badge value={r.difficulty} /> {r.subtopic.name} · {r.source} · {timeAgo(r.created_at)}
                                        {r.open_reports > 0 && <span className="adm-flag">· {r.open_reports} report{r.open_reports > 1 ? 's' : ''}</span>}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <Pager page={page} pageSize={PAGE_SIZE} count={list.count} onPage={setPage} />
                </aside>

                <div className="adm-review-detail">
                    <ErrorNote error={questionError} />
                    {selectedId && !question && !questionError && <Empty>Loading question…</Empty>}
                    {question && (
                        <article className="adm-card adm-review-card" aria-label="Question under review">
                            <div className="adm-detail-head">
                                <span className="adm-path">{question.section.name} › {question.topic.name} › {question.subtopic.name}</span>
                                <Link to={`/admin/questions/${question.id}`}>Open full page</Link>
                            </div>
                            <QuestionMeta question={question} />
                            <QuestionEditor
                                question={question}
                                onSaved={setQuestion}
                                footer={({ dirty, saving, problems, save }) => (
                                    <div className="adm-decision">
                                        <label className="adm-field adm-field-wide">
                                            <span>Review note <small>saved with the decision and in the audit log</small></span>
                                            <input type="text" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
                                                placeholder="e.g. fixed the key; option C was correct" />
                                        </label>
                                        <div className="adm-actions">
                                            <button type="button" className="adm-btn adm-btn-primary" disabled={saving || deciding || problems.length > 0}
                                                title={problems.length ? problems.join(' ') : undefined}
                                                onClick={() => decide('published', save)}>
                                                {dirty ? 'Save & approve' : 'Approve'}
                                            </button>
                                            {dirty && (
                                                <button type="button" className="adm-btn" disabled={saving || deciding}
                                                    onClick={() => save().then(() => toast.success('Saved.')).catch(() => {})}>
                                                    Save edits
                                                </button>
                                            )}
                                            <button type="button" className="adm-btn adm-btn-danger" disabled={saving || deciding}
                                                onClick={() => decide('retired', save)}>
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                )}
                            />
                        </article>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReviewQueue;
