import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Markdown from '../../components/Markdown/Markdown';
import { DIFFICULTIES, errorMessage, saveQuestion } from '../../lib/admin';
import { Badge, TaxonomySelect } from './AdminUi';
import { findSubtopic, formatDate, useTags, useTaxonomy } from './adminUtils';

const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;

// admin_get_question result -> editable draft.
const toDraft = (q) => {
    const options = q.options.map((o) => o.body);
    return {
        sectionId: q.section.id,
        topicId: q.topic.id,
        subtopic_id: q.subtopic_id,
        stem: q.stem,
        difficulty: q.difficulty,
        est_seconds: q.est_seconds,
        options: options.length ? options : ['', ''],
        // -1 until a key exists, so a keyless question needs an explicit pick.
        correct_index: q.options.findIndex((o) => o.id === q.answer?.correct_option_id),
        hasKey: !!q.answer,
        explanation: q.answer?.explanation ?? '',
        hint: q.answer?.hint ?? '',
        tags: q.tags ?? [],
    };
};

const comparable = (d) => JSON.stringify([d.subtopic_id, d.stem, d.difficulty, Number(d.est_seconds), d.options,
    d.correct_index, d.explanation, d.hint || '', [...d.tags].sort()]);

// Mirrors admin_save_question's checks so problems show before a round trip.
const validate = (d) => {
    const problems = [];
    if (!d.subtopic_id) problems.push('Choose a subtopic.');
    if (!d.stem.trim()) problems.push('The question text is empty.');
    const opts = d.options.map((o) => o.trim());
    if (opts.some((o) => !o)) problems.push('Options cannot be empty.');
    if (new Set(opts).size !== opts.length) problems.push('Options must be distinct.');
    if (!(d.correct_index >= 0 && d.correct_index < opts.length)) problems.push('Mark the correct option.');
    if (!d.explanation.trim()) problems.push('The explanation is empty.');
    const est = Number(d.est_seconds);
    if (!Number.isInteger(est) || est < 5 || est > 3600) problems.push('Estimated time must be 5–3600 seconds.');
    return problems;
};

export const QuestionPreview = ({ draft }) => (
    <div className="adm-preview">
        <div className="adm-preview-meta">
            <Badge value={draft.difficulty} /> <span>~{draft.est_seconds}s</span>
        </div>
        <Markdown className="adm-md" text={draft.stem || '*No question text*'} />
        <ol className="adm-preview-options" type="A">
            {draft.options.map((o, i) => (
                <li key={i} className={i === draft.correct_index ? 'is-correct' : ''}>
                    <Markdown className="adm-md" text={o || '*empty*'} />
                </li>
            ))}
        </ol>
        {draft.hint?.trim() && (
            <div className="adm-preview-block"><h4>Hint</h4><Markdown className="adm-md" text={draft.hint} /></div>
        )}
        <div className="adm-preview-block">
            <h4>Explanation</h4>
            <Markdown className="adm-md" text={draft.explanation || '*No explanation*'} />
        </div>
    </div>
);

// Question metadata: where it came from and where it stands.
export const QuestionMeta = ({ question }) => (
    <dl className="adm-meta">
        <div><dt>Status</dt><dd><Badge value={question.status} /></dd></div>
        <div><dt>Source</dt><dd>{question.source}{question.model ? ` · ${question.model}` : ''}</dd></div>
        {question.prompt_version && <div><dt>Prompt</dt><dd>{question.prompt_version}</dd></div>}
        {question.generation_job_id && (
            <div><dt>Job</dt><dd><Link to={`/admin/jobs?job=${question.generation_job_id}`}>{question.generation_job_id.slice(0, 8)}</Link></dd></div>
        )}
        <div><dt>Created</dt><dd>{formatDate(question.created_at)}{question.created_by_handle ? ` by @${question.created_by_handle}` : ''}</dd></div>
        {question.reviewed_at && (
            <div><dt>Last decision</dt><dd>{formatDate(question.reviewed_at)}{question.reviewed_by_handle ? ` by @${question.reviewed_by_handle}` : ''}{question.review_note ? ` — “${question.review_note}”` : ''}</dd></div>
        )}
        <div><dt>Attempts</dt><dd>{question.attempts}</dd></div>
        <div><dt>Open reports</dt><dd>{question.open_reports ? <Link to={`/admin/reports?question=${question.id}&status=`}>{question.open_reports}</Link> : 0}</dd></div>
    </dl>
);

// Edits a question (from admin_get_question) with a live KaTeX preview.
// footer({ dirty, saving, problems, save }) renders the action buttons; save()
// resolves to the saved question (or the unchanged one when nothing changed)
// and rejects on a validation or server error, after showing it (err.shown).
const QuestionEditor = ({ question, onSaved, footer }) => {
    const taxonomy = useTaxonomy();
    const tagCatalog = useTags();
    const [draft, setDraft] = useState(() => toDraft(question));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState('split'); // split | edit | preview

    const original = useMemo(() => comparable(toDraft(question)), [question]);
    useEffect(() => { setDraft(toDraft(question)); setError(''); }, [question]);

    // Questions in an inactive subtopic still resolve their path from the taxonomy.
    useEffect(() => {
        if (!draft.sectionId && taxonomy.length && draft.subtopic_id) {
            const found = findSubtopic(taxonomy, draft.subtopic_id);
            if (found) setDraft((d) => ({ ...d, sectionId: found.section.id, topicId: found.topic.id }));
        }
    }, [taxonomy, draft.sectionId, draft.subtopic_id]);

    const dirty = comparable(draft) !== original;
    const problems = validate(draft);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

    const setOption = (i, body) => set({ options: draft.options.map((o, j) => (j === i ? body : o)) });
    const addOption = () => draft.options.length < MAX_OPTIONS && set({ options: [...draft.options, ''] });
    const removeOption = (i) => {
        if (draft.options.length <= MIN_OPTIONS) return;
        const options = draft.options.filter((_, j) => j !== i);
        let correct = draft.correct_index;
        if (i === correct) correct = -1;
        else if (i < correct) correct -= 1;
        set({ options, correct_index: correct });
    };
    const moveOption = (i, delta) => {
        const j = i + delta;
        if (j < 0 || j >= draft.options.length) return;
        const options = [...draft.options];
        [options[i], options[j]] = [options[j], options[i]];
        let correct = draft.correct_index;
        if (correct === i) correct = j; else if (correct === j) correct = i;
        set({ options, correct_index: correct });
    };
    const toggleTag = (slug) => set({ tags: draft.tags.includes(slug) ? draft.tags.filter((t) => t !== slug) : [...draft.tags, slug] });

    const save = async () => {
        if (!dirty) return question;
        if (problems.length) {
            setError(problems.join(' '));
            throw Object.assign(new Error(problems.join(' ')), { shown: true });
        }
        setSaving(true);
        setError('');
        try {
            const saved = await saveQuestion(question.id, {
                ...draft,
                options: draft.options.map((o) => o.trim()),
            });
            onSaved?.(saved);
            return saved;
        } catch (err) {
            const msg = err.code === '23505' && err.details
                ? `This edit would duplicate question ${err.details}.`
                : errorMessage(err);
            setError(msg);
            err.shown = true;
            throw err;
        } finally {
            setSaving(false);
        }
    };

    const reset = () => { setDraft(toDraft(question)); setError(''); };
    const extraTags = draft.tags.filter((t) => !tagCatalog.some((c) => c.slug === t));

    return (
        <div className="adm-editor">
            <div className="adm-editor-toolbar">
                <div className="adm-segmented" role="tablist" aria-label="Editor layout">
                    {['edit', 'split', 'preview'].map((v) => (
                        <button key={v} type="button" role="tab" aria-selected={view === v}
                            className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v}</button>
                    ))}
                </div>
                {dirty && <span className="adm-dirty">Unsaved changes</span>}
                {dirty && <button type="button" className="adm-btn adm-btn-small" onClick={reset} disabled={saving}>Discard</button>}
            </div>

            <div className={`adm-editor-body adm-view-${view}`}>
                {view !== 'preview' && (
                    <form className="adm-form" onSubmit={(e) => { e.preventDefault(); save().catch(() => {}); }}>
                        <div className="adm-row">
                            <TaxonomySelect taxonomy={taxonomy} required
                                value={{ sectionId: draft.sectionId, topicId: draft.topicId, subtopicId: draft.subtopic_id }}
                                onChange={(v) => set({ sectionId: v.sectionId, topicId: v.topicId, subtopic_id: v.subtopicId })} />
                        </div>
                        <div className="adm-row">
                            <label className="adm-field">
                                <span>Difficulty</span>
                                <select value={draft.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                                    {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </label>
                            <label className="adm-field">
                                <span>Est. seconds</span>
                                <input type="number" min="5" max="3600" value={draft.est_seconds}
                                    onChange={(e) => set({ est_seconds: e.target.value })} />
                            </label>
                        </div>

                        <label className="adm-field adm-field-wide">
                            <span>Question <small>Markdown · math with $…$ or $$…$$</small></span>
                            <textarea rows={6} value={draft.stem} onChange={(e) => set({ stem: e.target.value })} />
                        </label>

                        <fieldset className="adm-options">
                            <legend>Options <small>select the correct one</small></legend>
                            {!draft.hasKey && <p className="adm-warn">This question has no answer key yet; saving sets the selected option as correct.</p>}
                            {draft.options.map((o, i) => (
                                <div key={i} className={`adm-option ${i === draft.correct_index ? 'is-correct' : ''}`}>
                                    <input type="radio" name="correct" aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
                                        checked={i === draft.correct_index} onChange={() => set({ correct_index: i })} />
                                    <span className="adm-option-letter">{String.fromCharCode(65 + i)}</span>
                                    <textarea rows={1} value={o} onChange={(e) => setOption(i, e.target.value)} />
                                    <div className="adm-option-tools">
                                        <button type="button" title="Move up" onClick={() => moveOption(i, -1)} disabled={i === 0}>↑</button>
                                        <button type="button" title="Move down" onClick={() => moveOption(i, 1)} disabled={i === draft.options.length - 1}>↓</button>
                                        <button type="button" title="Remove" onClick={() => removeOption(i)} disabled={draft.options.length <= MIN_OPTIONS}>✕</button>
                                    </div>
                                </div>
                            ))}
                            {draft.options.length < MAX_OPTIONS && (
                                <button type="button" className="adm-btn adm-btn-small" onClick={addOption}>Add option</button>
                            )}
                        </fieldset>

                        <label className="adm-field adm-field-wide">
                            <span>Explanation</span>
                            <textarea rows={5} value={draft.explanation} onChange={(e) => set({ explanation: e.target.value })} />
                        </label>
                        <label className="adm-field adm-field-wide">
                            <span>Hint <small>optional</small></span>
                            <input type="text" value={draft.hint} onChange={(e) => set({ hint: e.target.value })} />
                        </label>

                        <div className="adm-field adm-field-wide">
                            <span>Tags</span>
                            <div className="adm-chips">
                                {[...tagCatalog.filter((t) => t.is_active || draft.tags.includes(t.slug)), ...extraTags.map((slug) => ({ slug, name: slug }))].map((t) => (
                                    <button key={t.slug} type="button" aria-pressed={draft.tags.includes(t.slug)}
                                        className={`adm-chip ${draft.tags.includes(t.slug) ? 'on' : ''}`} onClick={() => toggleTag(t.slug)}>
                                        {t.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
                    </form>
                )}
                {view !== 'edit' && <QuestionPreview draft={draft} />}
            </div>

            {error && <div className="adm-error" role="alert">{error}</div>}
            {!error && problems.length > 0 && <div className="adm-warn">{problems.join(' ')}</div>}
            {footer?.({ dirty, saving, problems, save })}
        </div>
    );
};

export default QuestionEditor;
