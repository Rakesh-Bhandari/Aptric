import { api, qs } from '@/lib/http';

// Data access for the admin area, through the API's /admin and /rpc routes.
// Every call runs as the signed-in user, so RLS and the admin_* functions'
// own is_admin() checks decide what an admin may do; the UI's role check is
// only cosmetic. Writes are audited in Postgres (row triggers or the admin_*
// functions), never from here.

const rpc = (fn, args = {}) => api('POST', `/rpc/${fn}`, args);

export const STATUSES = ['draft', 'in_review', 'published', 'retired'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const REPORT_STATUSES = ['open', 'triaged', 'resolved', 'dismissed'];
export const REPORT_REASONS = ['wrong_answer', 'ambiguous', 'typo', 'duplicate', 'offensive', 'other'];
export const SOURCES = ['manual', 'ai', 'import'];
export const JOB_ACTIVE = ['queued', 'running'];

export const errorMessage = (error) => {
    if (!error) return '';
    if (error.code === '42501') return 'You are not allowed to do that (admin only).';
    return error.message || String(error);
};

// --- Taxonomy ---------------------------------------------------------------

// Sections > topics > subtopics, including inactive ones (admins see all), sorted.
export const loadTaxonomy = () => api('GET', '/admin/taxonomy');

export const loadTags = () => api('GET', '/admin/tags');

// --- Questions ---------------------------------------------------------------

// filters: { search, sectionId, topicId, subtopicId, difficulty, status, source, jobId }
// Resolves to { rows, count }; each row has subtopic.topic.section and open_reports.
export const searchQuestions = (filters = {}, { page = 0, pageSize = 25, order = 'newest' } = {}) =>
    api('GET', `/admin/questions${qs({ ...filters, search: filters.search?.trim(), page, pageSize, order })}`);

export const getQuestion = (id) => rpc('admin_get_question', { target_question_id: id });

// draft: { subtopic_id, stem, difficulty, est_seconds, options: string[], correct_index, explanation, hint, tags: string[] }
export const saveQuestion = (id, draft) => rpc('admin_save_question', {
    target_question_id: id,
    subtopic_id: draft.subtopic_id,
    stem: draft.stem,
    difficulty: draft.difficulty,
    est_seconds: Number(draft.est_seconds) || 60,
    options: draft.options,
    correct_index: draft.correct_index,
    explanation: draft.explanation,
    hint: draft.hint || null,
    tags: draft.tags ?? [],
});

// Resolves to how many questions moved. With fromStatus, only questions still
// in that status move (so a question another reviewer already handled is skipped).
export const setQuestionStatus = (ids, status, { note = null, fromStatus = null } = {}) =>
    rpc('admin_set_question_status', { question_ids: ids, new_status: status, note, from_status: fromStatus });

export const countByStatus = async (status) => (await api('GET', `/admin/questions/count${qs({ status })}`)).count;

// --- Users -------------------------------------------------------------------

// filters: { search, role, banned }
export const listUsers = async (filters = {}, { page = 0, pageSize = 25 } = {}) => {
    const rows = await rpc('admin_list_users', {
        search: filters.search?.trim() || null,
        only_role: filters.role || null,
        only_banned: filters.banned === '' || filters.banned === undefined ? null : filters.banned === 'true',
        page_size: pageSize,
        page_offset: page * pageSize,
    });
    return { rows, count: rows[0]?.total_count ?? 0 };
};

export const getUser = async (id) => (await rpc('admin_list_users', { target_user_id: id, page_size: 1 }))[0] ?? null;

export const setUserRole = (id, role) => rpc('admin_set_user_role', { target_user_id: id, new_role: role });

export const setUserBan = (id, banned, reason = null) =>
    rpc('admin_set_user_ban', { target_user_id: id, banned, reason });

export const listUserAttempts = (userId, { page = 0, pageSize = 25 } = {}) =>
    api('GET', `/admin/users/${encodeURIComponent(userId)}/attempts${qs({ page, pageSize })}`);

// --- Reports -----------------------------------------------------------------

// status '' lists every status.
export const listReports = ({ status = 'open', reason = '', questionId = '' } = {}, { page = 0, pageSize = 25 } = {}) =>
    api('GET', `/admin/reports${qs({ status: status || 'all', reason, questionId, page, pageSize })}`);

// Audited by the reports_audit trigger.
export const updateReport = (id, status, resolutionNote = null) =>
    api('PATCH', `/admin/reports/${encodeURIComponent(id)}`, { status, resolution_note: resolutionNote?.trim() || null });

export const countOpenReports = async () => (await api('GET', '/admin/reports/open-count')).count;

export const countActiveJobs = async () => (await api('GET', '/admin/jobs/active-count')).count;

// --- Generation jobs -----------------------------------------------------------

export const listJobs = ({ page = 0, pageSize = 20 } = {}) => api('GET', `/admin/jobs${qs({ page, pageSize })}`);

// POST /admin/generate-questions. Each call runs at most one batch and
// returns { job, batch? }; errors carry the HTTP status, Retry-After and job.
export const callGenerator = async (body) => {
    try {
        return await api('POST', '/admin/generate-questions', body);
    } catch (error) {
        const err = new Error(error.message);
        err.status = error.status;
        err.retryAfter = error.details?.retry_after_seconds;
        err.job = error.details?.job;
        throw err;
    }
};

// --- Audit log -----------------------------------------------------------------

// filters: { entityType, action, actorId, entityId, questionRef, since }
export const listAudit = (filters = {}, { page = 0, pageSize = 50 } = {}) =>
    api('GET', `/admin/audit${qs({
        ...filters, entityId: filters.entityId?.trim(), questionRef: filters.questionRef?.trim(), page, pageSize,
    })}`);

// --- Contests ------------------------------------------------------------------

export const CONTEST_STATES = ['draft', 'upcoming', 'live', 'ended'];

// Every contest, drafts included: { id, slug, title, description, starts_at, ends_at,
// is_published, state, question_count, participants }.
export const listContests = () => rpc('admin_list_contests');

// One contest plus its questions in order: [{ position, question_id, stem, difficulty, status }].
export const getContest = (id) => rpc('admin_get_contest', { target_contest_id: id });

// draft: { title, description, starts_at, ends_at (ISO), question_ids, is_published }. id null creates.
export const saveContest = (id, draft) => rpc('admin_save_contest', {
    target_contest_id: id,
    title: draft.title,
    description: draft.description || null,
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    question_ids: draft.question_ids,
    is_published: !!draft.is_published,
});

export const setContestPublished = (id, published) =>
    rpc('admin_set_contest_published', { target_contest_id: id, published });

// Refused by the database once any player has joined.
export const deleteContest = (id) => rpc('admin_delete_contest', { target_contest_id: id });

// filters: { sectionId, topicId, subtopicId, difficulty }. Resolves to random servable
// questions [{ id, stem, difficulty, subtopic }], skipping excludeIds.
export const pickContestQuestions = (filters, count, excludeIds = []) => rpc('admin_pick_contest_questions', {
    section_id: filters.sectionId || null,
    topic_id: filters.topicId || null,
    subtopic_id: filters.subtopicId || null,
    difficulty: filters.difficulty || null,
    question_count: count,
    exclude_ids: excludeIds,
});

// Resolves to { total, entries: [{ rank, user_id, handle, banned, score, correct, answered, time_ms, answers }] }.
export const getContestResults = (id, { page = 0, pageSize = 50 } = {}) =>
    rpc('admin_get_contest_results', { target_contest_id: id, page_size: pageSize, page_offset: page * pageSize });
