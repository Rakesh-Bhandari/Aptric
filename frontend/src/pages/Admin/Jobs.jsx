import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { callGenerator, DIFFICULTIES, errorMessage, JOB_ACTIVE, listJobs } from '../../lib/admin';
import { Badge, Empty, ErrorNote, Pager, TaxonomySelect } from './AdminUi';
import { formatDate, timeAgo, useTaxonomy } from './adminUtils';

const PAGE_SIZE = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isActive = (job) => JOB_ACTIVE.includes(job.status);

const DROPS = [
    ['dropped_invalid', 'invalid'],
    ['dropped_duplicate_hash', 'exact dup'],
    ['dropped_duplicate_similar', 'near dup'],
    ['dropped_computed', 'computed check'],
    ['dropped_solver', 'solver disagreed'],
];

const JobRow = ({ job, driving, highlighted, onResume, onCancel }) => {
    const pct = Math.min(100, Math.round((100 * job.inserted) / job.requested));
    const drops = DROPS.filter(([k]) => job[k] > 0);
    const st = job.subtopic;
    return (
        <article className={`adm-card adm-job ${highlighted ? 'adm-highlight' : ''}`}>
            <header className="adm-job-head">
                <Badge value={job.status} />
                <strong>{st ? `${st.topic?.section?.name} › ${st.topic?.name} › ${st.name}` : 'deleted subtopic'}</strong>
                <Badge value={job.difficulty} />
                <span className="adm-sub">by @{job.creator?.handle ?? '—'} · {timeAgo(job.created_at)}</span>
            </header>
            <div className="adm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={job.requested} aria-valuenow={job.inserted}
                aria-label={`${job.inserted} of ${job.requested} questions`}>
                <div className={`adm-progress-bar ${isActive(job) ? 'is-active' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="adm-job-stats">
                <span><strong>{job.inserted}</strong> / {job.requested} questions</span>
                <span>batch {job.batches} / {job.max_batches}</span>
                {drops.length > 0 && <span className="adm-sub">dropped: {drops.map(([k, l]) => `${job[k]} ${l}`).join(', ')}</span>}
                {driving && <span className="adm-running">running in this tab…</span>}
            </div>
            {job.last_error && <div className="adm-error">Last batch error: {job.last_error}</div>}
            <div className="adm-sub">
                {job.model} · solver {job.solver_model} · {job.prompt_version}
                {job.finished_at && ` · finished ${formatDate(job.finished_at)}`}
            </div>
            <div className="adm-actions">
                {job.inserted > 0 && <Link className="adm-btn adm-btn-small" to={`/admin/review?job=${job.id}`}>Review questions</Link>}
                {job.inserted > 0 && <Link className="adm-btn adm-btn-small" to={`/admin/questions?job=${job.id}`}>All questions</Link>}
                {isActive(job) && !driving && <button type="button" className="adm-btn adm-btn-small adm-btn-primary" onClick={() => onResume(job.id)}>Resume</button>}
                {isActive(job) && <button type="button" className="adm-btn adm-btn-small adm-btn-danger" onClick={() => onCancel(job)}>Cancel</button>}
                <Link className="adm-link" to={`/admin/audit?entity_type=question_generation_jobs&entity=${job.id}`}>audit</Link>
            </div>
        </article>
    );
};

// AI generation jobs. The generate-questions Edge Function runs one batch per
// call, so this page drives a job by calling `run` until it finishes. Closing
// the tab just pauses the job; Resume (here or in another tab) continues it.
const Jobs = () => {
    const toast = useToast();
    const { refreshCounts } = useOutletContext();
    const taxonomy = useTaxonomy();
    const [params] = useSearchParams();
    const highlight = params.get('job');
    const [page, setPage] = useState(0);
    const [result, setResult] = useState({ rows: [], count: 0 });
    const [error, setError] = useState('');
    const [form, setForm] = useState({ sectionId: '', topicId: '', subtopicId: '', difficulty: 'medium', count: 10 });
    const [creating, setCreating] = useState(false);
    const [drivingIds, setDrivingIds] = useState(() => new Set());
    const driving = useRef(new Set());
    const mounted = useRef(true);

    useEffect(() => {
        const running = driving.current;
        mounted.current = true;
        return () => { mounted.current = false; running.clear(); };
    }, []);

    const load = useCallback(async () => {
        try {
            setResult(await listJobs({ page, pageSize: PAGE_SIZE }));
            setError('');
        } catch (err) {
            setError(errorMessage(err));
        }
    }, [page]);
    useEffect(() => { load(); }, [load]);

    // Live progress, including jobs another tab or admin is running.
    const anyActive = result.rows.some(isActive);
    useEffect(() => {
        if (!anyActive) return undefined;
        const t = setInterval(load, 4000);
        return () => clearInterval(t);
    }, [anyActive, load]);

    const upsert = (job) => setResult((r) => ({
        ...r,
        rows: r.rows.map((row) => (row.id === job.id ? { ...row, ...job } : row)),
    }));

    const syncDriving = () => setDrivingIds(new Set(driving.current));

    const drive = useCallback(async (jobId) => {
        if (driving.current.has(jobId)) return;
        driving.current.add(jobId);
        syncDriving();
        try {
            while (mounted.current && driving.current.has(jobId)) {
                try {
                    const { job } = await callGenerator({ action: 'run', job_id: jobId });
                    upsert(job);
                    if (!isActive(job)) {
                        if (job.status === 'done') toast.success(`Job finished: ${job.inserted} question${job.inserted === 1 ? '' : 's'} ready for review.`);
                        else if (job.status === 'failed') toast.error(`Job failed${job.last_error ? `: ${job.last_error}` : '.'}`);
                        break;
                    }
                } catch (err) {
                    if (err.status === 409 || err.status === 429) {
                        if (err.job) upsert(err.job);
                        await sleep(Math.max(1, Number(err.retryAfter) || 5) * 1000);
                        continue;
                    }
                    toast.error(`Job stopped: ${errorMessage(err)}`);
                    break;
                }
            }
        } finally {
            driving.current.delete(jobId);
            if (mounted.current) { syncDriving(); refreshCounts(); load(); }
        }
    }, [toast, refreshCounts, load]);

    const create = async (e) => {
        e.preventDefault();
        if (!form.subtopicId) { toast.warning('Choose a subtopic.'); return; }
        setCreating(true);
        try {
            const { job } = await callGenerator({ action: 'create', subtopic_id: form.subtopicId, difficulty: form.difficulty, count: Number(form.count) });
            toast.info('Job created; the first batch is done.');
            setPage(0);
            await load();
            if (isActive(job)) drive(job.id);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const cancel = async (job) => {
        const ok = await toast.confirm({ message: `Cancel this job? Questions it already inserted stay in review.`, confirmText: 'Cancel job' });
        if (!ok) return;
        driving.current.delete(job.id);
        syncDriving();
        try {
            const { job: updated } = await callGenerator({ action: 'cancel', job_id: job.id });
            upsert(updated);
            refreshCounts();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    return (
        <div className="adm-page">
            <header className="adm-header">
                <h1>Generation jobs</h1>
                <p>AI-written questions are verified (schema, duplicates, computed check, independent solver) and land in the review queue. Keep this tab open while a job runs.</p>
            </header>

            <form className="adm-card adm-filters" onSubmit={create}>
                <TaxonomySelect taxonomy={taxonomy} required value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
                <label className="adm-field">
                    <span>Difficulty</span>
                    <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}>
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <label className="adm-field">
                    <span>Questions</span>
                    <input type="number" min="1" max="50" value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} />
                </label>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={creating || !form.subtopicId}>
                    {creating ? 'Starting…' : 'Generate'}
                </button>
            </form>

            <ErrorNote error={error} onRetry={load} />
            {!result.rows.length && !error && <Empty>No jobs yet.</Empty>}
            <div className="adm-stack">
                {result.rows.map((job) => (
                    <JobRow key={job.id} job={job} driving={drivingIds.has(job.id)} highlighted={job.id === highlight}
                        onResume={drive} onCancel={cancel} />
                ))}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={result.count} onPage={setPage} />
        </div>
    );
};

export default Jobs;
