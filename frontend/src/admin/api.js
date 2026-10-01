import { supabase } from '@/lib/supabase';

// Data access for the admin area. Every call runs as the signed-in user, so
// RLS and the admin_* functions' own is_admin() checks decide what an admin
// may do; the UI's role check is only cosmetic. Writes are audited in
// Postgres (row triggers or the admin_* functions), never from here.

const unwrap = ({ data, error, count }) => {
    if (error) throw error;
    return count === undefined || count === null ? data : { rows: data, count };
};

const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args));

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

// Sections > topics > subtopics, including inactive ones (admins see all).
export const loadTaxonomy = async () => {
    const data = unwrap(await supabase
        .from('sections')
        .select('id, name, is_active, sort_order, topics(id, name, is_active, sort_order, subtopics(id, name, is_active, sort_order))')
        .order('sort_order'));
    const bySort = (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
    return data.map((s) => ({
        ...s,
        topics: [...s.topics].sort(bySort).map((t) => ({ ...t, subtopics: [...t.subtopics].sort(bySort) })),
    }));
};

export const loadTags = async () =>
    unwrap(await supabase.from('tags').select('slug, name, kind, is_active').order('kind').order('sort_order'));

// --- Questions ---------------------------------------------------------------

const QUESTION_LIST_COLUMNS = `
    id, stem, difficulty, status, source, model, created_at, updated_at, reviewed_at, review_note,
    subtopic:subtopics!inner(id, name, topic:topics!inner(id, name, section:sections!inner(id, name))),
    open_reports:reports(count)
`;

// filters: { search, sectionId, topicId, subtopicId, difficulty, status, source, jobId }
export const searchQuestions = async (filters = {}, { page = 0, pageSize = 25, order = 'newest' } = {}) => {
    let q = supabase.from('questions').select(QUESTION_LIST_COLUMNS, { count: 'exact' });
    const search = filters.search?.trim();
    if (search) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search)) q = q.eq('id', search);
        else q = q.ilike('stem', `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    if (filters.subtopicId) q = q.eq('subtopic_id', filters.subtopicId);
    else if (filters.topicId) q = q.eq('subtopic.topic_id', filters.topicId);
    else if (filters.sectionId) q = q.eq('subtopic.topic.section_id', filters.sectionId);
    if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.source) q = q.eq('source', filters.source);
    if (filters.jobId) q = q.eq('generation_job_id', filters.jobId);
    // Only count open reports in the embedded aggregate.
    q = q.in('open_reports.status', ['open', 'triaged']);
    q = order === 'oldest' ? q.order('created_at', { ascending: true }) : q.order('created_at', { ascending: false });
    q = q.order('id').range(page * pageSize, page * pageSize + pageSize - 1);
    const { rows, count } = unwrap(await q);
    return {
        count,
        rows: rows.map((r) => ({ ...r, open_reports: r.open_reports?.[0]?.count ?? 0 })),
    };
};

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

export const countByStatus = async (status) =>
    unwrap(await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('status', status)).count ?? 0;

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

export const listUserAttempts = async (userId, { page = 0, pageSize = 25 } = {}) => unwrap(await supabase
    .from('attempts')
    .select('id, context, is_correct, used_hint, xp_awarded, time_ms, created_at, question:questions(id, stem, difficulty, status)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1));

// --- Reports -----------------------------------------------------------------

export const listReports = async ({ status = 'open', reason = '', questionId = '' } = {}, { page = 0, pageSize = 25 } = {}) => {
    let q = supabase
        .from('reports')
        .select(`id, reason, details, status, resolution_note, created_at, resolved_at,
                 reporter:profiles!reports_reporter_id_fkey(id, handle),
                 resolver:profiles!reports_resolved_by_fkey(id, handle),
                 question:questions(id, stem, status)`, { count: 'exact' });
    if (status) q = q.eq('status', status);
    if (reason) q = q.eq('reason', reason);
    if (questionId) q = q.eq('question_id', questionId);
    return unwrap(await q
        .order('created_at', { ascending: status === 'open' || status === 'triaged' })
        .range(page * pageSize, page * pageSize + pageSize - 1));
};

// Audited by the reports_audit trigger.
export const updateReport = async (id, status, resolutionNote = null) => unwrap(await supabase
    .from('reports')
    .update({ status, resolution_note: resolutionNote?.trim() || null })
    .eq('id', id)
    .select('id')
    .single());

export const countOpenReports = async () =>
    unwrap(await supabase.from('reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'triaged'])).count ?? 0;

// --- Generation jobs -----------------------------------------------------------

export const listJobs = async ({ page = 0, pageSize = 20 } = {}) => unwrap(await supabase
    .from('question_generation_jobs')
    .select(`*, creator:profiles!question_generation_jobs_created_by_fkey(handle),
             subtopic:subtopics(id, name, topic:topics(name, section:sections(name)))`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1));

// The generate-questions Edge Function. Each call runs at most one batch and
// returns { job, batch? }; errors carry the HTTP status and body.
export const callGenerator = async (body) => {
    const { data, error } = await supabase.functions.invoke('generate-questions', { body });
    if (error) {
        let payload = {};
        try { payload = await error.context?.json?.(); } catch { /* not JSON */ }
        const err = new Error(payload?.error || error.message);
        err.status = error.context?.status;
        err.retryAfter = payload?.retry_after_seconds;
        err.job = payload?.job;
        throw err;
    }
    return data;
};

// --- Audit log -----------------------------------------------------------------

// filters: { entityType, action, actorId, entityId, questionRef, since }
export const listAudit = async (filters = {}, { page = 0, pageSize = 50 } = {}) => {
    let q = supabase
        .from('audit_log')
        .select('id, action, entity_type, entity_id, question_ref, before, after, created_at, actor:profiles(id, handle)', { count: 'exact' });
    if (filters.entityType) q = q.eq('entity_type', filters.entityType);
    if (filters.action) q = q.eq('action', filters.action);
    if (filters.actorId) q = q.eq('actor_id', filters.actorId);
    if (filters.entityId) q = q.eq('entity_id', filters.entityId.trim());
    if (filters.questionRef) q = q.eq('question_ref', filters.questionRef.trim());
    if (filters.since) q = q.gte('created_at', filters.since);
    return unwrap(await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1));
};
