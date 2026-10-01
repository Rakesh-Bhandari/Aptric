// /admin: lists and searches for the admin area. Queries run as the signed-in
// admin, so RLS still decides what is visible; writes go through the admin_*
// SQL functions (POST /rpc/...) or row updates that triggers audit.

import { Router } from 'express';
import { asUser } from '../db.js';
import { badRequest } from '../http.js';
import { requireAdmin, requireUser } from '../middleware/auth.js';
import { generateQuestions } from '../generation/service.js';

const router = Router();
router.use(requireUser, requireAdmin);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const uuid = (v) => {
  const s = str(v);
  if (s && !UUID_RE.test(s)) throw badRequest('Malformed id.');
  return s;
};
const paging = (q, defaultSize) => {
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(q.pageSize, 10) || defaultSize));
  const page = Math.max(0, Number.parseInt(q.page, 10) || 0);
  return { limit: pageSize, offset: page * pageSize };
};
const likePattern = (s) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Collects `column = $n` style conditions with numbered parameters. */
function filters() {
  const where = [];
  const params = [];
  return {
    add(sql, value) {
      if (value === null || value === undefined || value === '') return;
      params.push(value);
      where.push(sql.replaceAll('?', `$${params.length}`));
    },
    raw(sql) {
      where.push(sql);
    },
    param(value) {
      params.push(value);
      return `$${params.length}`;
    },
    where: () => (where.length ? `where ${where.join(' and ')}` : ''),
    params,
  };
}

/** count(*) and one page of rows, in the same transaction. */
async function pageOf(userId, { from, select, orderBy, f, limit, offset }) {
  return asUser(userId, async (db) => {
    const count = await db.query(`select count(*)::int as n ${from} ${f.where()}`, f.params);
    const rows = await db.query(
      `select ${select} ${from} ${f.where()} order by ${orderBy} limit ${limit} offset ${offset}`,
      f.params,
    );
    return { rows: rows.rows, count: count.rows[0].n };
  });
}

// --- Taxonomy and tags ---------------------------------------------------------

// Sections > topics > subtopics, including inactive ones.
router.get('/taxonomy', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) => db.query(`
    select s.id, s.name, s.is_active, s.sort_order,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'is_active', t.is_active, 'sort_order', t.sort_order,
          'subtopics', coalesce((
            select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'is_active', st.is_active, 'sort_order', st.sort_order)
                             order by st.sort_order, st.name)
            from public.subtopics st where st.topic_id = t.id), '[]'::jsonb)
        ) order by t.sort_order, t.name)
        from public.topics t where t.section_id = s.id), '[]'::jsonb) as topics
    from public.sections s
    order by s.sort_order, s.name`));
  res.json(rows);
});

router.get('/tags', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query('select slug, name, kind, is_active from public.tags order by kind, sort_order'));
  res.json(rows);
});

// --- Questions -------------------------------------------------------------------

router.get('/questions', async (req, res) => {
  const q = req.query;
  const f = filters();
  const search = str(q.search);
  if (search && UUID_RE.test(search)) f.add('q.id = ?::uuid', search);
  else if (search) f.add('q.stem ilike ?', likePattern(search));
  if (q.subtopicId) f.add('q.subtopic_id = ?::uuid', uuid(q.subtopicId));
  else if (q.topicId) f.add('st.topic_id = ?::uuid', uuid(q.topicId));
  else if (q.sectionId) f.add('t.section_id = ?::uuid', uuid(q.sectionId));
  f.add('q.difficulty = ?::public.question_difficulty', str(q.difficulty));
  f.add('q.status = ?::public.question_status', str(q.status));
  f.add('q.source = ?::public.question_source', str(q.source));
  f.add('q.generation_job_id = ?::uuid', uuid(q.jobId));

  res.json(await pageOf(req.user.id, {
    ...paging(q, 25),
    f,
    from: `from public.questions q
           join public.subtopics st on st.id = q.subtopic_id
           join public.topics t on t.id = st.topic_id
           join public.sections s on s.id = t.section_id`,
    select: `q.id, q.stem, q.difficulty, q.status, q.source, q.model, q.created_at, q.updated_at, q.reviewed_at, q.review_note,
             jsonb_build_object('id', st.id, 'name', st.name,
               'topic', jsonb_build_object('id', t.id, 'name', t.name,
                 'section', jsonb_build_object('id', s.id, 'name', s.name))) as subtopic,
             (select count(*)::int from public.reports r
              where r.question_id = q.id and r.status in ('open', 'triaged')) as open_reports`,
    orderBy: q.order === 'oldest' ? 'q.created_at asc, q.id' : 'q.created_at desc, q.id',
  }));
});

router.get('/questions/count', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query('select count(*)::int as n from public.questions where status = $1::public.question_status', [req.query.status]));
  res.json({ count: rows[0].n });
});

// --- Users -------------------------------------------------------------------------

router.get('/users/:id/attempts', async (req, res) => {
  const f = filters();
  f.add('a.user_id = ?::uuid', uuid(req.params.id));
  res.json(await pageOf(req.user.id, {
    ...paging(req.query, 25),
    f,
    from: 'from public.attempts a left join public.questions q on q.id = a.question_id',
    select: `a.id, a.context, a.is_correct, a.used_hint, a.xp_awarded, a.time_ms, a.created_at,
             case when q.id is null then null
                  else jsonb_build_object('id', q.id, 'stem', q.stem, 'difficulty', q.difficulty, 'status', q.status) end as question`,
    orderBy: 'a.created_at desc, a.id',
  }));
});

// --- Reports -----------------------------------------------------------------------

router.get('/reports', async (req, res) => {
  const q = req.query;
  // Default: open reports; 'all' lists every status.
  const status = q.status === 'all' ? null : (str(q.status) ?? 'open');
  const f = filters();
  f.add('r.status = ?::public.report_status', status);
  f.add('r.reason = ?::public.report_reason', str(q.reason));
  f.add('r.question_id = ?::uuid', uuid(q.questionId));
  const ascending = status === 'open' || status === 'triaged';
  res.json(await pageOf(req.user.id, {
    ...paging(q, 25),
    f,
    from: `from public.reports r
           left join public.profiles rp on rp.id = r.reporter_id
           left join public.profiles rs on rs.id = r.resolved_by
           left join public.questions qq on qq.id = r.question_id`,
    select: `r.id, r.reason, r.details, r.status, r.resolution_note, r.created_at, r.resolved_at,
             case when rp.id is null then null else jsonb_build_object('id', rp.id, 'handle', rp.handle) end as reporter,
             case when rs.id is null then null else jsonb_build_object('id', rs.id, 'handle', rs.handle) end as resolver,
             case when qq.id is null then null else jsonb_build_object('id', qq.id, 'stem', qq.stem, 'status', qq.status) end as question`,
    orderBy: ascending ? 'r.created_at asc, r.id' : 'r.created_at desc, r.id',
  }));
});

router.get('/reports/open-count', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query(`select count(*)::int as n from public.reports where status in ('open', 'triaged')`));
  res.json({ count: rows[0].n });
});

// Audited by the reports_audit trigger.
router.patch('/reports/:id', async (req, res) => {
  const { status, resolution_note: note } = req.body ?? {};
  const { rows } = await asUser(req.user.id, (db) =>
    db.query(
      `update public.reports set status = $2::public.report_status, resolution_note = $3
       where id = $1::uuid returning id`,
      [uuid(req.params.id), status, str(note)],
    ));
  if (!rows[0]) throw badRequest('Report not found.');
  res.json(rows[0]);
});

// --- Generation jobs -----------------------------------------------------------------

router.get('/jobs', async (req, res) => {
  const result = await pageOf(req.user.id, {
    ...paging(req.query, 20),
    f: filters(),
    from: `from public.question_generation_jobs j
           left join public.profiles p on p.id = j.created_by
           left join public.subtopics st on st.id = j.subtopic_id
           left join public.topics t on t.id = st.topic_id
           left join public.sections s on s.id = t.section_id`,
    select: `to_jsonb(j) || jsonb_build_object(
               'creator', case when p.id is null then null else jsonb_build_object('handle', p.handle) end,
               'subtopic', case when st.id is null then null else jsonb_build_object('id', st.id, 'name', st.name,
                 'topic', jsonb_build_object('name', t.name, 'section', jsonb_build_object('name', s.name))) end) as row`,
    orderBy: 'j.created_at desc, j.id',
  });
  res.json({ count: result.count, rows: result.rows.map((r) => r.row) });
});

router.get('/jobs/active-count', async (req, res) => {
  const { rows } = await asUser(req.user.id, (db) =>
    db.query(`select count(*)::int as n from public.question_generation_jobs where status in ('queued', 'running')`));
  res.json({ count: rows[0].n });
});

// One batch per call; see generation/service.js.
router.post('/generate-questions', async (req, res) => {
  const { status, body, headers } = await generateQuestions(req.user.id, req.body);
  res.set(headers ?? {}).status(status).json(body);
});

// --- Audit log -------------------------------------------------------------------------

router.get('/audit', async (req, res) => {
  const q = req.query;
  const f = filters();
  f.add('a.entity_type = ?', str(q.entityType));
  f.add('a.action = ?', str(q.action));
  f.add('a.actor_id = ?::uuid', uuid(q.actorId));
  f.add('a.entity_id = ?', str(q.entityId));
  f.add('a.question_ref = ?', str(q.questionRef));
  f.add('a.created_at >= ?::timestamptz', str(q.since));
  res.json(await pageOf(req.user.id, {
    ...paging(q, 50),
    f,
    from: 'from public.audit_log a left join public.profiles p on p.id = a.actor_id',
    select: `a.id, a.action, a.entity_type, a.entity_id, a.question_ref, a.before, a.after, a.created_at,
             case when p.id is null then null else jsonb_build_object('id', p.id, 'handle', p.handle) end as actor`,
    orderBy: 'a.created_at desc, a.id desc',
  }));
});

export default router;
