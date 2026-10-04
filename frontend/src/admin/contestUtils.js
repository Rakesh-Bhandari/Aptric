// Form helpers for the contest editor. validateContest mirrors the checks in
// admin_save_contest so problems show before a round trip; the database
// remains the authority.

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const MAX_QUESTIONS = 100;
export const MAX_DAYS = 14;

const pad = (n) => String(n).padStart(2, '0');

/** ISO timestamp -> value for <input type="datetime-local"> (local time). */
export const toInputValue = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** datetime-local value -> ISO timestamp, or '' when empty or invalid. */
export const fromInputValue = (value) => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : '';
};

/** Whole minutes between two datetime-local values, or '' when either is unset. */
export const durationMinutes = (start, end) => {
    const a = fromInputValue(start);
    const b = fromInputValue(end);
    return a && b ? Math.round((new Date(b) - new Date(a)) / 60_000) : '';
};

/** The datetime-local value `minutes` after `start`, or '' when not computable. */
export const endFromDuration = (start, minutes) => {
    const a = fromInputValue(start);
    const m = Number(minutes);
    if (!a || !Number.isFinite(m) || m <= 0) return '';
    return toInputValue(new Date(new Date(a).getTime() + m * 60_000).toISOString());
};

// draft: { title, description, starts, ends (datetime-local), questions: [{ id }], is_published }
export const validateContest = (draft) => {
    const problems = [];
    const title = draft.title.trim();
    if (!title) problems.push('Give the contest a title.');
    else if (title.length > MAX_TITLE) problems.push(`The title is at most ${MAX_TITLE} characters.`);
    if (draft.description.trim().length > MAX_DESCRIPTION) problems.push(`The description is at most ${MAX_DESCRIPTION} characters.`);
    const minutes = durationMinutes(draft.starts, draft.ends);
    if (minutes === '') problems.push('Set a start and an end time.');
    else if (minutes <= 0) problems.push('The contest must end after it starts.');
    else if (minutes > MAX_DAYS * 1440) problems.push(`A contest can run for at most ${MAX_DAYS} days.`);
    if (draft.questions.length > MAX_QUESTIONS) problems.push(`A contest holds at most ${MAX_QUESTIONS} questions.`);
    if (new Set(draft.questions.map((q) => q.id)).size !== draft.questions.length) problems.push('A question can only appear once.');
    if (draft.is_published && !draft.questions.length) problems.push('Add at least one question before publishing.');
    return problems;
};

/** The database refuses to delete a contest once players have joined; unpublish instead. */
export const canDelete = (contest) => contest.participants === 0;

/** Moves item `from` to index `to` in a copy of `list`. */
export const move = (list, from, to) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
};
