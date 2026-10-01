import { label } from './adminUtils';

// Small components shared by the admin pages.

export const Badge = ({ value, title }) => (
    <span className={`adm-badge adm-badge-${value}`} title={title}>{label(value)}</span>
);

export const Pager = ({ page, pageSize, count, onPage }) => {
    const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
    if (!count) return null;
    return (
        <div className="adm-pager">
            <button type="button" className="adm-btn" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
            <span>Page {page + 1} of {pages} · {count} total</span>
            <button type="button" className="adm-btn" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
    );
};

export const Empty = ({ children }) => <div className="adm-empty">{children}</div>;

export const ErrorNote = ({ error, onRetry }) => (error ? (
    <div className="adm-error" role="alert">
        {error}
        {onRetry && <button type="button" className="adm-btn adm-btn-small" onClick={onRetry}>Retry</button>}
    </div>
) : null);

const inactive = (item) => (item.is_active ? '' : ' (inactive)');

// Section > topic > subtopic pickers. value = { sectionId, topicId, subtopicId }.
// With required, a subtopic must be chosen (the editor); otherwise each level
// has an "All" choice (filters).
export const TaxonomySelect = ({ taxonomy, value, onChange, required = false, disabled = false }) => {
    const section = taxonomy.find((s) => s.id === value.sectionId);
    const topic = section?.topics.find((t) => t.id === value.topicId);
    const any = required ? 'Choose…' : 'All';
    return (
        <>
            <label className="adm-field">
                <span>Section</span>
                <select value={value.sectionId || ''} disabled={disabled}
                    onChange={(e) => onChange({ sectionId: e.target.value, topicId: '', subtopicId: '' })}>
                    <option value="">{any}</option>
                    {taxonomy.map((s) => <option key={s.id} value={s.id}>{s.name}{inactive(s)}</option>)}
                </select>
            </label>
            <label className="adm-field">
                <span>Topic</span>
                <select value={value.topicId || ''} disabled={disabled || !section}
                    onChange={(e) => onChange({ ...value, topicId: e.target.value, subtopicId: '' })}>
                    <option value="">{any}</option>
                    {section?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}{inactive(t)}</option>)}
                </select>
            </label>
            <label className="adm-field">
                <span>Subtopic</span>
                <select value={value.subtopicId || ''} disabled={disabled || !topic}
                    onChange={(e) => onChange({ ...value, subtopicId: e.target.value })}>
                    <option value="">{any}</option>
                    {topic?.subtopics.map((st) => <option key={st.id} value={st.id}>{st.name}{inactive(st)}</option>)}
                </select>
            </label>
        </>
    );
};
