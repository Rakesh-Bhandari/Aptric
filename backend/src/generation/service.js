// AI question generation, admin only (POST /admin/generate-questions).
//
// { action: "create", subtopic_id, difficulty, count } → new job, runs its first batch
// { action: "run", job_id }                             → runs the job's next batch
// { action: "status", job_id }                          → the job row
// { action: "cancel", job_id }                          → stops the job
//
// Every response carries the job row. A job is worked one small batch per call
// so no request gets near the serverless time limit: the caller repeats "run"
// while job.status is "queued" or "running". Survivors are inserted as status
// 'in_review' for a human to publish. See supabase/README.md.

import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../http.js';
import { hit } from '../middleware/rateLimit.js';
import { apiEmbedder } from './embed.js';
import { openAiCompatible } from './llm.js';
import { runBatch } from './pipeline.js';
import { PROMPT_VERSION } from './prompts.js';
import { requestSchema } from './schemas.js';
import { dropForeignEmbeddings, pgStore } from './store.js';

const gen = config.generation;
const SIMILARITY_THRESHOLD = 0.92; // cosine similarity above this = duplicate

const BATCH = {
  batchSize: gen.batchSize,
  similarityThreshold: SIMILARITY_THRESHOLD,
  backfillLimit: 10,
  generateTimeoutMs: 60_000,
  solveTimeoutMs: 40_000,
};
// Longer than a batch can take (timeouts above + embeddings + database), so a
// lease only lapses when a request died; the job can then be resumed.
const LEASE_SECONDS = 170;
// A job gives up after this many batches per batch it needs.
const BATCH_ATTEMPTS = 3;

const store = pgStore({ similarityThreshold: SIMILARITY_THRESHOLD, embeddingModel: gen.embeddingModel });

async function loadJob(jobId) {
  const { rows } = await query('select to_jsonb(j) as job from public.question_generation_jobs j where id = $1', [jobId]);
  if (!rows[0]) throw new HttpError(404, 'P0002', 'job not found');
  return rows[0].job;
}

async function createJob(userId, subtopicId, difficulty, count) {
  await hit('generate-questions:create', userId, 3600, gen.jobsPerHour);

  const { rows: recent } = await query(
    `select coalesce(sum(requested), 0)::int as used from public.question_generation_jobs
     where created_by = $1 and created_at >= now() - interval '24 hours'`,
    [userId],
  );
  const used = recent[0].used;
  if (used + count > gen.questionsPerDay) {
    throw new HttpError(429, 'over_request_rate_limit',
      `daily limit: ${gen.questionsPerDay} questions per 24h, ${Math.max(0, gen.questionsPerDay - used)} left`);
  }

  const { rows: sub } = await query('select id from public.subtopics where id = $1', [subtopicId]);
  if (!sub[0]) throw new HttpError(404, 'P0002', 'subtopic not found');

  const { rows } = await query(
    `insert into public.question_generation_jobs
       (created_by, subtopic_id, difficulty, requested, max_batches, model, solver_model, prompt_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [userId, subtopicId, difficulty, count, Math.min(100, Math.ceil(count / BATCH.batchSize) * BATCH_ATTEMPTS),
      gen.questionModel, gen.verifyModel, PROMPT_VERSION],
  );
  return rows[0].id;
}

// Runs one batch under the job's lease and records the outcome.
async function runJob(jobId) {
  const { rows: claimedRows } = await query(
    'select to_jsonb(c) as job from public.gen_claim_job($1, $2) c',
    [jobId, LEASE_SECONDS],
  );
  const claimed = claimedRows[0]?.job;
  if (!claimed?.id) {
    const job = await loadJob(jobId);
    if (job.status === 'queued' || job.status === 'running') {
      const retry = Math.max(1, Math.ceil((Date.parse(job.locked_until ?? '') - Date.now()) / 1000)) || 1;
      throw new HttpError(409, 'job_running', 'a batch of this job is already running',
        { job, retry_after_seconds: retry }, { 'Retry-After': String(retry) });
    }
    return { job }; // already finished
  }

  let batch;
  let batchError = null;
  try {
    await dropForeignEmbeddings(gen.embeddingModel);
    batch = await runBatch(claimed, {
      complete: openAiCompatible({ baseUrl: gen.llmBaseUrl, apiKey: gen.llmApiKey ?? '', referer: gen.siteUrl }),
      embed: apiEmbedder({ baseUrl: gen.embeddingBaseUrl, apiKey: gen.embeddingApiKey ?? '', model: gen.embeddingModel, referer: gen.siteUrl }),
      store,
      config: BATCH,
    });
  } catch (err) {
    batchError = err.message;
    console.error(`[generate-questions] job ${jobId}: ${batchError}`);
  }

  const { rows } = await query(
    'select to_jsonb(public.gen_finish_batch($1, $2::jsonb, $3)) as job',
    [jobId, JSON.stringify(batch?.stats ?? {}), batchError],
  );
  return { job: rows[0].job, batch: batch ?? { error: batchError } };
}

/** Handles one request; returns { status, body, headers }. */
export async function generateQuestions(userId, body) {
  try {
    await hit('generate-questions', userId, 60, gen.requestsPerMinute);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'invalid request', {
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    const input = parsed.data;

    switch (input.action) {
      case 'create': {
        if (!gen.llmApiKey) throw new HttpError(503, 'not_configured', 'OPEN_ROUTER_API_KEY is not set');
        const jobId = await createJob(userId, input.subtopic_id, input.difficulty, input.count);
        return { status: 201, body: await runJob(jobId) };
      }
      case 'run':
        return { status: 200, body: await runJob(input.job_id) };
      case 'status':
        return { status: 200, body: { job: await loadJob(input.job_id) } };
      case 'cancel': {
        const { rows } = await query(
          `update public.question_generation_jobs j
           set status = 'cancelled', cancelled_by = $2, finished_at = now()
           where id = $1 and status in ('queued', 'running')
           returning to_jsonb(j) as job`,
          [input.job_id, userId],
        );
        return { status: 200, body: { job: rows[0]?.job ?? await loadJob(input.job_id) } };
      }
      default:
        throw new HttpError(400, 'bad_request', 'unknown action');
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return { status: err.status, body: { error: { code: err.code, message: err.message, ...err.extra } }, headers: err.headers };
    }
    throw err;
  }
}
