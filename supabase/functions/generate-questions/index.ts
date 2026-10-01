// generate-questions: admin-only AI question generation.
//
// POST { action: "create", subtopic_id, difficulty, count }  → new job, runs its first batch
// POST { action: "run", job_id }                             → runs the job's next batch
// POST { action: "status", job_id }                          → the job row
// POST { action: "cancel", job_id }                          → stops the job
//
// Every response carries the job row. A job is worked one small batch per call
// so no invocation gets near the Edge Function time limit: the caller repeats
// "run" while job.status is "queued" or "running". Survivors are inserted as
// status 'in_review' for a human to publish. See supabase/README.md.

import { createClient } from '@supabase/supabase-js';
import { openAiCompatible } from './llm.ts';
import { type BatchConfig, type BatchResult, type Job, runBatch } from './pipeline.ts';
import { PROMPT_VERSION } from './prompts.ts';
import { requestSchema } from './schemas.ts';
import { supabaseStore } from './store.ts';

const env = (name: string, fallback?: string) => Deno.env.get(name) || fallback;
const intEnv = (name: string, fallback: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.parseInt(env(name) ?? '', 10) || fallback));

const SUPABASE_URL = env('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')!;

// The solver defaults to a different
// vendor's model than the generator so its pass is genuinely independent.
const QUESTION_MODEL = env('QUESTION_MODEL', 'google/gemini-2.0-flash-001')!;
const QUESTION_VERIFY_MODEL = env('QUESTION_VERIFY_MODEL', 'openai/gpt-4o-mini')!;

const EMBEDDING_MODEL = 'gte-small'; // Supabase.ai built-in, 384 dimensions
const SIMILARITY_THRESHOLD = 0.92; // cosine similarity above this = duplicate

const BATCH: BatchConfig = {
  batchSize: intEnv('GENERATE_BATCH_SIZE', 5, 1, 10),
  similarityThreshold: SIMILARITY_THRESHOLD,
  backfillLimit: 10,
  generateTimeoutMs: 60_000,
  solveTimeoutMs: 40_000,
};
// Longer than a batch can take (timeouts above + embeddings + database), so a
// lease only lapses when an invocation died; the job can then be resumed.
const LEASE_SECONDS = 170;
// A job gives up after this many batches per batch it needs.
const BATCH_ATTEMPTS = 3;

// Per-admin limits.
const REQUESTS_PER_MINUTE = intEnv('GENERATE_REQUESTS_PER_MINUTE', 20, 1, 1000);
const JOBS_PER_HOUR = intEnv('GENERATE_JOBS_PER_HOUR', 10, 1, 1000);
const QUESTIONS_PER_DAY = intEnv('GENERATE_QUESTIONS_PER_DAY', 300, 1, 100_000);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}, readonly headers: Record<string, string> = {}) {
    super(message);
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...headers } });
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The Edge Runtime's built-in inference (Supabase.ai). Reached through
// globalThis because `deno check` does not pick up the runtime's global typings.
type EmbedSession = { run(input: string, opts: { mean_pool: boolean; normalize: boolean }): unknown };
const supabaseAi = (globalThis as unknown as { Supabase: { ai: { Session: new (model: string) => EmbedSession } } }).Supabase?.ai;

let embedSession: EmbedSession | undefined;
async function embed(text: string): Promise<number[]> {
  if (!supabaseAi) throw new Error('Supabase.ai is not available in this runtime');
  embedSession ??= new supabaseAi.Session(EMBEDDING_MODEL);
  const out = await embedSession.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}

const store = supabaseStore(db, { similarityThreshold: SIMILARITY_THRESHOLD, embeddingModel: EMBEDDING_MODEL });

// -----------------------------------------------------------------------------

async function requireAdmin(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'missing bearer token');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'invalid or expired session');
  const { data: profile, error: pErr } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (pErr) throw new Error(`load profile: ${pErr.message}`);
  if (profile?.role !== 'admin') throw new HttpError(403, 'admin only');
  return data.user.id;
}

async function rateLimit(userId: string, bucket: string, windowSeconds: number, max: number) {
  const { data, error } = await db.rpc('gen_rate_limit', {
    p_subject: userId, p_bucket: bucket, p_window_seconds: windowSeconds, p_max: max,
  });
  if (error) throw new Error(`rate limit: ${error.message}`);
  const row = (data as { allowed: boolean; retry_after_seconds: number }[])[0];
  if (!row.allowed) {
    throw new HttpError(429, `rate limit: at most ${max} per ${windowSeconds}s`,
      { retry_after_seconds: row.retry_after_seconds }, { 'Retry-After': String(row.retry_after_seconds) });
  }
}

async function loadJob(jobId: string) {
  const { data, error } = await db.from('question_generation_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(`load job: ${error.message}`);
  if (!data) throw new HttpError(404, 'job not found');
  return data;
}

async function createJob(userId: string, subtopicId: string, difficulty: Job['difficulty'], count: number) {
  await rateLimit(userId, 'generate-questions:create', 3600, JOBS_PER_HOUR);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: recent, error: rErr } = await db.from('question_generation_jobs')
    .select('requested').eq('created_by', userId).gte('created_at', since);
  if (rErr) throw new Error(`load recent jobs: ${rErr.message}`);
  const used = (recent ?? []).reduce((n: number, r: { requested: number }) => n + r.requested, 0);
  if (used + count > QUESTIONS_PER_DAY) {
    throw new HttpError(429, `daily limit: ${QUESTIONS_PER_DAY} questions per 24h, ${Math.max(0, QUESTIONS_PER_DAY - used)} left`);
  }

  const { data: sub, error: sErr } = await db.from('subtopics').select('id').eq('id', subtopicId).maybeSingle();
  if (sErr) throw new Error(`load subtopic: ${sErr.message}`);
  if (!sub) throw new HttpError(404, 'subtopic not found');

  const { data, error } = await db.from('question_generation_jobs').insert({
    created_by: userId,
    subtopic_id: subtopicId,
    difficulty,
    requested: count,
    max_batches: Math.min(100, Math.ceil(count / BATCH.batchSize) * BATCH_ATTEMPTS),
    model: QUESTION_MODEL,
    solver_model: QUESTION_VERIFY_MODEL,
    prompt_version: PROMPT_VERSION,
  }).select('id').single();
  if (error) throw new Error(`create job: ${error.message}`);
  return data.id as string;
}

// Runs one batch under the job's lease and records the outcome.
async function runJob(jobId: string) {
  const { data: claimed, error } = await db.rpc('gen_claim_job', { p_job_id: jobId, p_lease_seconds: LEASE_SECONDS });
  if (error) throw new Error(`claim job: ${error.message}`);
  if (!claimed?.id) {
    const job = await loadJob(jobId);
    if (job.status === 'queued' || job.status === 'running') {
      const retry = Math.max(1, Math.ceil((Date.parse(job.locked_until ?? '') - Date.now()) / 1000)) || 1;
      throw new HttpError(409, 'a batch of this job is already running', { job, retry_after_seconds: retry }, { 'Retry-After': String(retry) });
    }
    return { job }; // already finished
  }

  let batch: BatchResult | undefined;
  let batchError: string | null = null;
  try {
    batch = await runBatch(claimed as Job, {
      complete: openAiCompatible({
        baseUrl: env('LLM_BASE_URL', 'https://openrouter.ai/api/v1')!,
        apiKey: env('OPEN_ROUTER_API_KEY') ?? env('OPENROUTER_API_KEY') ?? '',
        referer: env('SITE_URL'),
      }),
      embed,
      store,
      config: BATCH,
    });
  } catch (err) {
    batchError = (err as Error).message;
    console.error(`[generate-questions] job ${jobId}: ${batchError}`);
  }

  const { data: job, error: fErr } = await db.rpc('gen_finish_batch', {
    p_job_id: jobId,
    p_stats: batch?.stats ?? {},
    p_error: batchError,
  });
  if (fErr) throw new Error(`finish batch: ${fErr.message}`);
  return { job, batch: batch ?? { error: batchError } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const userId = await requireAdmin(req);
    await rateLimit(userId, 'generate-questions', 60, REQUESTS_PER_MINUTE);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'body must be JSON');
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid request', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    const input = parsed.data;

    switch (input.action) {
      case 'create': {
        if (!(env('OPEN_ROUTER_API_KEY') ?? env('OPENROUTER_API_KEY'))) throw new Error('OPEN_ROUTER_API_KEY is not set');
        const jobId = await createJob(userId, input.subtopic_id, input.difficulty, input.count);
        return json(await runJob(jobId), 201);
      }
      case 'run':
        return json(await runJob(input.job_id));
      case 'status':
        return json({ job: await loadJob(input.job_id) });
      case 'cancel': {
        const { data, error } = await db.from('question_generation_jobs')
          .update({ status: 'cancelled', cancelled_by: userId, finished_at: new Date().toISOString() })
          .eq('id', input.job_id).in('status', ['queued', 'running'])
          .select('*').maybeSingle();
        if (error) throw new Error(`cancel job: ${error.message}`);
        return json({ job: data ?? await loadJob(input.job_id) });
      }
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status, err.headers);
    console.error('[generate-questions]', err);
    return json({ error: 'internal error' }, 500);
  }
});
