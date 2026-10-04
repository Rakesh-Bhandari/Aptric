import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import {
    DIFFICULTIES, errorMessage, getContest, pickContestQuestions, saveContest, searchQuestions,
} from './api';
import { Badge, Empty, ErrorNote, TaxonomySelect } from './AdminUi';
import { label, plain, useDebounced, useTaxonomy } from './adminUtils';
import {
    durationMinutes, endFromDuration, fromInputValue, MAX_DESCRIPTION, MAX_QUESTIONS, MAX_TITLE, move, toInputValue,
    validateContest,
} from './contestUtils';

const blank = () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    start.setMinutes(0, 0, 0);
    const starts = toInputValue(start.toISOString());
    return { title: '', description: '', starts, ends: endFromDuration(starts, 60), questions: [], is_published: false };
};

const toDraft = (c) => ({
    title: c.title,
    description: c.description ?? '',
    starts: toInputValue(c.starts_at),
    ends: toInputValue(c.ends_at),
    questions: c.questions.map((q) => ({ id: q.question_id, stem: q.stem, difficulty: q.difficulty })),
    is_published: c.is_published,
});

// Add questions by searching the published bank.
const BankPicker = ({ taken, onAdd }) => {
    const [text, setText] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [rows, setRows] = useState([]);
    const [error, setError] = useState('');
    const search = useDebounced(text, 350);

    useEffect(() => {
        let alive = true;
        searchQuestions({ search, difficulty, status: 'published' }, { pageSize: 8 })
            .then((r) => { if (alive) { setRows(r.rows); setError(''); } })
            .catch((err) => { if (alive) setError(errorMessage(err)); });
        return () => { alive = false; };
    }, [search, difficulty]);

    return (
        <div className="adm-stack">
            <div className="adm-filters">
                <label className="adm-field adm-field-search">
                    <span>Search the bank</span>
                    <input type="search" placeholder="Question text or id" value={text} onChange={(e) => setText(e.target.value)} />
                </label>
                <label className="adm-field">
                    <span>Difficulty</span>
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                        <option value="">All</option>
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
            </div>
            <ErrorNote error={error} />
            <ul className="adm-plain-list">
                {rows.map((q) => (
                    <li key={q.id}>
                        <Badge value={q.difficulty} /> {plain(q.stem, 100)}
                        <span className="adm-sub"> · {q.subtopic.name} </span>
                        <button type="button" className="adm-btn adm-btn-small" disabled={taken.has(q.id)}
                            onClick={() => onAdd([{ id: q.id, stem: q.stem, difficulty: q.difficulty }])}>
                            {taken.has(q.id) ? 'Added' : 'Add'}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

// Add random servable questions for a section / topic / subtopic and difficulty.
const AutoPick = ({ taxonomy, current, onAdd, disabled }) => {
    const toast = useToast();
    const [scope, setScope] = useState({ sectionId: '', topicId: '', subtopicId: '' });
    const [difficulty, setDifficulty] = useState('');
    const [count, setCount] = useState(10);
    const [busy, setBusy] = useState(false);

    const pick = async () => {
        setBusy(true);
        try {
            const picked = await pickContestQuestions({ ...scope, difficulty }, Number(count), current);
            if (!picked.length) toast.info('No eligible questions match. They must be published, keyed, and not in another unfinished contest.');
            else if (picked.length < Number(count)) toast.info(`Only ${picked.length} eligible question${picked.length === 1 ? '' : 's'} found.`);
            onAdd(picked.map((q) => ({ id: q.id, stem: q.stem, difficulty: q.difficulty })));
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="adm-filters">
            <TaxonomySelect taxonomy={taxonomy} value={scope} onChange={setScope} disabled={disabled} />
            <label className="adm-field">
                <span>Difficulty</span>
                <select value={difficulty} disabled={disabled} onChange={(e) => setDifficulty(e.target.value)}>
                    <option value="">Any</option>
                    {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
            </label>
            <label className="adm-field">
                <span>How many</span>
                <input type="number" min="1" max={MAX_QUESTIONS} value={count} disabled={disabled} onChange={(e) => setCount(e.target.value)} />
            </label>
            <button type="button" className="adm-btn" disabled={disabled || busy || !(Number(count) >= 1)} onClick={pick}>
                {busy ? 'Picking…' : 'Auto-pick'}
            </button>
        </div>
    );
};

// /admin/contests/new and /admin/contests/:id.
const ContestEditor = () => {
    const { id } = useParams();
    const isNew = !id || id === 'new';
    const toast = useToast();
    const navigate = useNavigate();
    const taxonomy = useTaxonomy();
    const [draft, setDraft] = useState(isNew ? blank : null);
    const [contest, setContest] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (isNew) return;
        setError('');
        try {
            const c = await getContest(id);
            setContest(c);
            setDraft(toDraft(c));
        } catch (err) {
            setError(errorMessage(err));
        }
    }, [id, isNew]);
    useEffect(() => { load(); }, [load]);

    // Players have joined: the database locks the question list (and the start
    // time once the contest has begun), so the form does too.
    const locked = !!contest && contest.participants > 0;
    const startLocked = locked && new Date(contest.starts_at) <= new Date();

    const problems = useMemo(() => (draft ? validateContest(draft) : []), [draft]);
    const taken = useMemo(() => new Set(draft?.questions.map((q) => q.id)), [draft]);
    if (error) return <div className="adm-page"><ErrorNote error={error} onRetry={load} /></div>;
    if (!draft) return <div className="adm-page"><Empty>Loading…</Empty></div>;

    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const addQuestions = (list) => set({ questions: [...draft.questions, ...list.filter((q) => !taken.has(q.id))] });
    const minutes = durationMinutes(draft.starts, draft.ends);

    const submit = async (publish) => {
        const next = { ...draft, is_published: publish };
        const issues = validateContest(next);
        if (issues.length) { toast.error(issues[0]); return; }
        setSaving(true);
        try {
            const saved = await saveContest(isNew ? null : id, {
                title: next.title,
                description: next.description,
                starts_at: fromInputValue(next.starts),
                ends_at: fromInputValue(next.ends),
                question_ids: next.questions.map((q) => q.id),
                is_published: publish,
            });
            toast.success(isNew ? 'Contest created.' : 'Contest saved.');
            if (isNew) navigate(`/admin/contests/${saved.id}`, { replace: true });
            else { setContest(saved); setDraft(toDraft(saved)); }
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="adm-page">
            <header className="adm-header">
                <Link to="/admin/contests" className="adm-back">← Contests</Link>
                <h1>{isNew ? 'New contest' : draft.title || 'Contest'}</h1>
                {contest && (
                    <p>
                        <Badge value={contest.state} /> <span className="adm-sub">{contest.participants} participant{contest.participants === 1 ? '' : 's'}</span>
                        {' · '}<Link to="results">Results</Link>
                    </p>
                )}
            </header>

            <div className="adm-card adm-stack">
                <label className="adm-field adm-field-wide">
                    <span>Title</span>
                    <input type="text" value={draft.title} maxLength={MAX_TITLE} onChange={(e) => set({ title: e.target.value })} />
                </label>
                <label className="adm-field adm-field-wide">
                    <span>Description</span>
                    <textarea rows={3} value={draft.description} maxLength={MAX_DESCRIPTION} onChange={(e) => set({ description: e.target.value })} />
                </label>
                <div className="adm-filters">
                    <label className="adm-field">
                        <span>Starts</span>
                        <input type="datetime-local" value={draft.starts} disabled={startLocked}
                            onChange={(e) => set({ starts: e.target.value, ends: minutes > 0 ? endFromDuration(e.target.value, minutes) : draft.ends })} />
                    </label>
                    <label className="adm-field">
                        <span>Duration (minutes)</span>
                        <input type="number" min="1" value={minutes === '' ? '' : minutes}
                            onChange={(e) => set({ ends: endFromDuration(draft.starts, e.target.value) || draft.ends })} />
                    </label>
                    <label className="adm-field">
                        <span>Ends</span>
                        <input type="datetime-local" value={draft.ends} onChange={(e) => set({ ends: e.target.value })} />
                    </label>
                </div>
            </div>

            <section className="adm-section">
                <h2>Questions ({draft.questions.length})</h2>
                {locked && <p className="adm-warn">Players have joined, so the question list is locked.</p>}
                {!draft.questions.length && <Empty>No questions yet. Add some below.</Empty>}
                <ol className="adm-plain-list">
                    {draft.questions.map((q, i) => (
                        <li key={q.id}>
                            <Badge value={q.difficulty} /> <Link to={`/admin/questions/${q.id}`}>{plain(q.stem, 100)}</Link>
                            {!locked && (
                                <span className="adm-actions">
                                    <button type="button" className="adm-btn adm-btn-small" aria-label="Move up" disabled={i === 0}
                                        onClick={() => set({ questions: move(draft.questions, i, i - 1) })}>↑</button>
                                    <button type="button" className="adm-btn adm-btn-small" aria-label="Move down" disabled={i === draft.questions.length - 1}
                                        onClick={() => set({ questions: move(draft.questions, i, i + 1) })}>↓</button>
                                    <button type="button" className="adm-btn adm-btn-small" aria-label="Remove question"
                                        onClick={() => set({ questions: draft.questions.filter((x) => x.id !== q.id) })}>Remove</button>
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
                {!locked && (
                    <>
                        <h3>Auto-pick by topic and difficulty</h3>
                        <AutoPick taxonomy={taxonomy} current={draft.questions.map((q) => q.id)} onAdd={addQuestions} />
                        <h3>Choose from the question bank</h3>
                        <BankPicker taken={taken} onAdd={addQuestions} />
                    </>
                )}
            </section>

            {problems.length > 0 && (
                <ul className="adm-warn" aria-label="Problems">
                    {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
            )}
            <div className="adm-actions">
                <button type="button" className="adm-btn adm-btn-primary" disabled={saving || problems.length > 0}
                    onClick={() => submit(draft.is_published)}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="adm-btn" disabled={saving || validateContest({ ...draft, is_published: !draft.is_published }).length > 0}
                    onClick={() => submit(!draft.is_published)}>
                    {draft.is_published ? 'Unpublish' : 'Save & publish'}
                </button>
                <span className="adm-sub">{label(contest?.state ?? 'draft')}</span>
            </div>
        </div>
    );
};

export default ContestEditor;
