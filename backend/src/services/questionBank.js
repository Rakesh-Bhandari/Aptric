import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getTodayDate, ALL_CATEGORIES } from '../utils/helpers.js';

// Single home for the question bank: AI generation (async jobs processed by
// cron), the draft → published review workflow, and fast bank-only daily
// assignment (request path).

// Model names are configurable; the fallback is tried when the primary call
// fails or returns unusable output.
const QUESTION_MODEL = process.env.QUESTION_MODEL || 'google/gemini-2.0-flash-001';
const QUESTION_FALLBACK_MODEL = process.env.QUESTION_FALLBACK_MODEL || 'openai/gpt-4o-mini';
const QUESTION_VERIFY_MODEL = process.env.QUESTION_VERIFY_MODEL || QUESTION_MODEL;
const AI_TIMEOUT_MS = parseInt(process.env.QUESTION_AI_TIMEOUT_MS) || 25000;

const AI_BATCH_SIZE = 10;
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const QUESTION_STATUSES = ['draft', 'published', 'rejected'];
export const DAILY_QUESTION_COUNT = 10;

const SUB_TOPICS = [
    "Time & Work (Efficiency)", "Time & Work (Wages)", "Pipes & Cisterns",
    "Speed (Relative Speed)", "Speed (Trains)", "Speed (Boats & Streams)",
    "Probability (Coins)", "Probability (Dice)", "Probability (Cards)",
    "Permutation (Words)", "Profit & Loss (Discounts)", "Ages (Ratios)",
    "Blood Relations (Family Tree)", "Syllogisms (Possibility)", "Percentages (Election)",
    "Simple Interest vs Compound Interest", "Mensuration (Area vs Volume)"
];

// --- Difficulty distribution by level ---
export function getDifficultyDistribution(userLevel) {
    switch (userLevel) {
        case 'Beginner': return { Easy: 7, Medium: 3, Hard: 0 };
        case 'Intermediate': return { Easy: 4, Medium: 5, Hard: 1 };
        case 'Advanced': return { Easy: 2, Medium: 5, Hard: 3 };
        case 'Pro': return { Easy: 1, Medium: 4, Hard: 5 };
        case 'Expert': return { Easy: 0, Medium: 3, Hard: 7 };
        default: return { Easy: 7, Medium: 3, Hard: 0 };
    }
}

function getRandomSubTopics() {
    return [...SUB_TOPICS].sort(() => 0.5 - Math.random()).slice(0, 3).join(", ");
}

// Duplicate key for questions.question_hash. The migration backfill
// (migrations/006) uses the same normalisation in SQL: lower-case, runs of
// anything other than [a-z0-9] become one space, trimmed.
export function questionHash(text) {
    const normalised = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return createHash('sha256').update(normalised).digest('hex');
}

// ─────────────────────────────────────────────────────────────
// AI output validation
// ─────────────────────────────────────────────────────────────

const aiText = (max) => z.string().trim().min(1).max(max);
const optionalAiText = (max) => z.string().trim().max(max).nullish().transform((v) => v || '');

// One generated question. Anything that fails is dropped, never repaired.
export const aiQuestionSchema = z.object({
    question_text: aiText(2000),
    options: z.array(aiText(500)).length(4)
        .refine((opts) => new Set(opts.map((o) => o.toLowerCase())).size === 4, 'Options must be distinct'),
    correct_answer: z.number().int().min(0).max(3),
    explanation: optionalAiText(4000),
    hint: optionalAiText(1000),
    category: z.enum(ALL_CATEGORIES),
});

const verifyAnswerSchema = z.object({ answer: z.number().int().min(0).max(3) });

// ─────────────────────────────────────────────────────────────
// AI generation (never call from a user-facing request)
// ─────────────────────────────────────────────────────────────

let openaiClient;
function getOpenAI() {
    if (!process.env.OPEN_ROUTER_API_KEY) {
        throw new Error('OPEN_ROUTER_API_KEY is missing from environment variables.');
    }
    openaiClient ??= new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPEN_ROUTER_API_KEY,
        timeout: AI_TIMEOUT_MS,
        maxRetries: 0,
        defaultHeaders: {
            'HTTP-Referer': process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'Aptitude Master',
        },
    });
    return openaiClient;
}

// One JSON chat completion. Tries each distinct model in order and returns the
// first parseable JSON object; throws the last error if every model fails.
async function completeJson(models, system, prompt) {
    const openai = getOpenAI();
    let lastErr;
    for (const model of [...new Set(models.filter(Boolean))]) {
        try {
            const completion = await openai.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' }
            });
            const raw = completion.choices?.[0]?.message?.content ?? '';
            return JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (err) {
            lastErr = err;
            console.warn(`[QuestionBank] ${model} failed: ${err.message}`);
        }
    }
    throw lastErr;
}

// One AI call → up to `count` raw (unvalidated) question objects. If `category`
// is given every question is asked for in it; otherwise the model picks.
async function requestQuestions({ difficulty, count, category, subTopic }) {
    const focus = category
        ? `for the category "${category}"${subTopic ? `, specifically focusing on the sub-topic "${subTopic}"` : ''}`
        : `focusing on these sub-topics: ${getRandomSubTopics()}`;

    const prompt = `
    You are an expert aptitude tutor. Generate ${count} unique ${difficulty} level aptitude questions ${focus}.

    STRICT RULES:
    1. Return ONLY valid JSON — no extra text.
    2. "correct_answer" MUST be an integer index 0–3.
    3. "options" must be an array of exactly 4 distinct, non-empty strings.
    4. "explanation" must be detailed step-by-step.
    5. "category" must be exactly one of: ${ALL_CATEGORIES.join(', ')}.
    6. Every question must have exactly one correct option.

    JSON Output Format:
    {
      "questions": [
        {
          "question_text": "string",
          "options": ["A", "B", "C", "D"],
          "correct_answer": 0,
          "explanation": "string",
          "hint": "string",
          "category": "string"
        }
      ]
    }`;

    const parsed = await completeJson(
        [QUESTION_MODEL, QUESTION_FALLBACK_MODEL],
        'You are a helpful AI that outputs strict JSON only.',
        prompt
    );
    return Array.isArray(parsed?.questions) ? parsed.questions : [];
}

// Asks the model to solve the question from scratch (it never sees the
// generator's answer). Resolves true only when its answer matches.
async function verifyQuestion(q) {
    const prompt = `
    Solve this multiple-choice aptitude question. Work it out carefully, then
    reply with ONLY this JSON: {"answer": <index of the correct option, 0-3>}

    Question: ${q.question_text}
    Options:
    ${q.options.map((opt, i) => `${i}. ${opt}`).join('\n    ')}`;

    try {
        const parsed = await completeJson(
            [QUESTION_VERIFY_MODEL, QUESTION_FALLBACK_MODEL],
            'You are a careful aptitude expert that outputs strict JSON only.',
            prompt
        );
        const result = verifyAnswerSchema.safeParse(parsed);
        return result.success && result.data.answer === q.correct_answer;
    } catch {
        return false; // unverifiable counts as failed
    }
}

// Generates one batch (≤ AI_BATCH_SIZE) and saves the survivors as drafts:
// schema validation → duplicate check → independent verification → insert.
// Returns { saved, invalid, duplicate, unverified }.
export async function generateBatch(pool, { difficulty, count, category = '', subTopic = '' }) {
    const stats = { saved: 0, invalid: 0, duplicate: 0, unverified: 0 };
    count = Math.min(count, AI_BATCH_SIZE);
    const raw = await requestQuestions({ difficulty, count, category, subTopic });

    // 1. Schema
    const valid = [];
    for (const item of raw) {
        const result = aiQuestionSchema.safeParse(item);
        if (result.success) valid.push(result.data);
        else stats.invalid++;
    }

    // 2. Duplicates within the batch and against the bank
    const byHash = new Map();
    for (const q of valid) {
        const hash = questionHash(q.question_text);
        if (byHash.has(hash)) stats.duplicate++;
        else byHash.set(hash, { ...q, hash });
    }
    if (byHash.size > 0) {
        const [existing] = await pool.query(
            'SELECT question_hash FROM questions WHERE question_hash IN (?)',
            [[...byHash.keys()]]
        );
        for (const row of existing) {
            byHash.delete(row.question_hash);
            stats.duplicate++;
        }
    }

    // 3. Independent verification (extras beyond the requested count are ignored)
    const candidates = [...byHash.values()].slice(0, count);
    const verdicts = await Promise.all(candidates.map(verifyQuestion));
    const verified = candidates.filter((_, i) => verdicts[i]);
    stats.unverified += candidates.length - verified.length;

    // 4. Save as drafts. A concurrent insert of the same hash is a no-op
    // (affectedRows 0) thanks to the unique key.
    const today = getTodayDate();
    for (const q of verified) {
        const [result] = await pool.query(
            `INSERT INTO questions
             (qid, question_text, question_hash, options, correct_answer_index, explanation, hint, difficulty, category, status, generated_for_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
             ON DUPLICATE KEY UPDATE question_id = question_id`,
            [`Q${nanoid(10)}`, q.question_text, q.hash, JSON.stringify(q.options), q.correct_answer,
                q.explanation, q.hint, difficulty, category || q.category, today]
        );
        if (result.affectedRows === 1) stats.saved++;
        else stats.duplicate++;
    }

    console.log(`[QuestionBank] ${difficulty}${category ? ` ${category}` : ''}: ` +
        `saved ${stats.saved}/${raw.length} (invalid ${stats.invalid}, duplicate ${stats.duplicate}, unverified ${stats.unverified}).`);
    return stats;
}

// ─────────────────────────────────────────────────────────────
// Generation jobs (async; processed in chunks by /api/cron/generation-jobs)
// ─────────────────────────────────────────────────────────────

const JOB_LEASE_SECONDS = 120;
// An item gives up after this many AI calls per batch it needs, so a job whose
// output keeps failing validation/verification still finishes.
const MAX_CALLS_PER_BATCH = 3;

const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export function formatJob(row) {
    return {
        job_id: row.job_id,
        source: row.source,
        status: row.status,
        items: parseJson(row.items),
        total_requested: row.total_requested,
        total_saved: row.total_saved,
        total_dropped: row.total_dropped,
        error: row.error,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        finished_at: row.finished_at,
    };
}

// items: [{ category, difficulty, count, subTopic }]. Returns the new job_id.
export async function createGenerationJob(pool, items, { createdBy = null, source = 'admin' } = {}) {
    const jobItems = items.map(({ category = '', difficulty, count, subTopic = '' }) => ({
        category, difficulty, subTopic,
        requested: count, saved: 0, invalid: 0, duplicate: 0, unverified: 0, calls: 0,
    }));
    const total = jobItems.reduce((sum, i) => sum + i.requested, 0);
    const [result] = await pool.query(
        'INSERT INTO question_generation_jobs (created_by, source, items, total_requested) VALUES (?, ?, ?, ?)',
        [createdBy, source, JSON.stringify(jobItems), total]
    );
    return result.insertId;
}

const maxCalls = (item) => Math.ceil(item.requested / AI_BATCH_SIZE) * MAX_CALLS_PER_BATCH;
const nextItem = (items) => items.find((i) => i.saved < i.requested && i.calls < maxCalls(i));

// Claims the oldest unfinished job whose lease is free. Returns the row or null.
async function claimJob(pool) {
    const [candidates] = await pool.query(
        `SELECT job_id FROM question_generation_jobs
         WHERE status IN ('queued', 'running') AND (locked_until IS NULL OR locked_until < NOW())
         ORDER BY job_id LIMIT 5`
    );
    for (const { job_id } of candidates) {
        const [result] = await pool.query(
            `UPDATE question_generation_jobs
             SET status = 'running', locked_until = NOW() + INTERVAL ${JOB_LEASE_SECONDS} SECOND
             WHERE job_id = ? AND status IN ('queued', 'running') AND (locked_until IS NULL OR locked_until < NOW())`,
            [job_id]
        );
        if (result.affectedRows === 1) {
            const [[row]] = await pool.query('SELECT * FROM question_generation_jobs WHERE job_id = ?', [job_id]);
            return row;
        }
    }
    return null;
}

// Runs one batch of the claimed job, records progress and releases the lease.
async function runJobChunk(pool, row) {
    const items = parseJson(row.items);
    const item = nextItem(items);

    if (item) {
        item.calls++;
        try {
            const stats = await generateBatch(pool, {
                difficulty: item.difficulty,
                count: Math.min(AI_BATCH_SIZE, item.requested - item.saved),
                category: item.category,
                subTopic: item.subTopic,
            });
            for (const key of ['saved', 'invalid', 'duplicate', 'unverified']) item[key] += stats[key];
        } catch (err) {
            // The call is counted, so a persistently failing item runs out of
            // calls rather than blocking the job.
            console.error(`[GenerationJob ${row.job_id}] batch failed:`, err.message);
            item.error = err.message.slice(0, 300);
        }
    }

    const totalSaved = items.reduce((sum, i) => sum + i.saved, 0);
    const totalDropped = items.reduce((sum, i) => sum + i.invalid + i.duplicate + i.unverified, 0);
    const finished = !nextItem(items);
    const status = !finished ? 'running' : (totalSaved === 0 && row.total_requested > 0 ? 'failed' : 'done');
    const error = status === 'failed'
        ? (items.find((i) => i.error)?.error || 'No questions passed validation and verification')
        : null;

    await pool.query(
        `UPDATE question_generation_jobs
         SET items = ?, total_saved = ?, total_dropped = ?, status = ?, error = ?,
             locked_until = NULL, finished_at = ${finished ? 'NOW()' : 'NULL'}
         WHERE job_id = ?`,
        [JSON.stringify(items), totalSaved, totalDropped, status, error, row.job_id]
    );
    return { job_id: row.job_id, status, saved: totalSaved, requested: row.total_requested };
}

// Cron entry point: processes job chunks one after another until `budgetMs`
// has elapsed (a chunk is only started inside the budget) or no job is ready.
export async function processGenerationJobs(pool, {
    budgetMs = parseInt(process.env.GENERATION_JOB_BUDGET_MS) || 20000,
} = {}) {
    const started = Date.now();
    const chunks = [];
    while (Date.now() - started < budgetMs) {
        const row = await claimJob(pool);
        if (!row) break;
        chunks.push(await runJobChunk(pool, row));
    }
    return { chunks: chunks.length, results: chunks };
}

// ─────────────────────────────────────────────────────────────
// Top-up
// ─────────────────────────────────────────────────────────────

// "Unused" = no user has attempted it yet. Drafts count too (they are waiting
// for review), so an unreviewed backlog doesn't trigger more generation.
export async function countUnusedByDifficulty(pool) {
    const [rows] = await pool.query(
        `SELECT q.difficulty, COUNT(*) AS unused
         FROM questions q
         WHERE q.status IN ('draft', 'published')
           AND NOT EXISTS (SELECT 1 FROM user_attempts a WHERE a.question_id = q.question_id)
         GROUP BY q.difficulty`
    );
    const counts = Object.fromEntries(DIFFICULTIES.map(d => [d, 0]));
    for (const r of rows) {
        if (r.difficulty in counts) counts[r.difficulty] = Number(r.unused);
    }
    return counts;
}

// Queues a generation job for every difficulty with fewer than `minUnused`
// unused questions (at most `maxPerDifficulty` each). Skipped while an earlier
// top-up job is still unfinished. Returns { minUnused, before, queued, jobId }.
export async function topUpQuestionBank(pool, {
    minUnused = parseInt(process.env.QUESTION_BANK_MIN_UNUSED) || 50,
    maxPerDifficulty = parseInt(process.env.QUESTION_BANK_MAX_PER_RUN) || 20,
    createdBy = null,
} = {}) {
    const [[pending]] = await pool.query(
        "SELECT job_id FROM question_generation_jobs WHERE source = 'topup' AND status IN ('queued', 'running') LIMIT 1"
    );
    const before = await countUnusedByDifficulty(pool);
    if (pending) return { minUnused, before, queued: {}, jobId: pending.job_id, alreadyQueued: true };

    const queued = {};
    for (const difficulty of DIFFICULTIES) {
        const deficit = minUnused - before[difficulty];
        if (deficit > 0) queued[difficulty] = Math.min(deficit, maxPerDifficulty);
    }
    const items = Object.entries(queued).map(([difficulty, count]) => ({ difficulty, count }));
    const jobId = items.length > 0 ? await createGenerationJob(pool, items, { createdBy, source: 'topup' }) : null;
    return { minUnused, before, queued, jobId };
}

// ─────────────────────────────────────────────────────────────
// Daily assignment (bank only, no AI — safe in the request path)
// ─────────────────────────────────────────────────────────────

// A question counts as seen if the user has an attempt on it, or it was in any
// earlier daily set (assigned but skipped counts too).
const UNSEEN_CONDITION = `
    NOT EXISTS (SELECT 1 FROM user_attempts a WHERE a.user_id = ? AND a.question_id = q.question_id)
    AND NOT EXISTS (SELECT 1 FROM user_daily_log l
                    WHERE l.user_id = ? AND JSON_CONTAINS(l.question_ids_json, CAST(q.question_id AS JSON)))`;

// Picks up to DAILY_QUESTION_COUNT unseen published question_ids from the bank following
// the level's difficulty mix; shortfalls are filled from any difficulty.
// Randomness: each slot seeks from a random question_id pivot along the primary
// key and takes the first unseen row (wrapping to the start if none follows),
// so no full-table ORDER BY RAND() sort is needed.
async function pickQuestionsFromBank(conn, userId, userLevel) {
    const [[range]] = await conn.query('SELECT MIN(question_id) AS minId, MAX(question_id) AS maxId FROM questions');
    if (range?.minId == null) return [];
    const minId = Number(range.minId);
    const maxId = Number(range.maxId);
    const picked = [];

    const pickOne = async (difficulty) => {
        const pivot = minId + Math.floor(Math.random() * (maxId - minId + 1));
        let query = `SELECT q.question_id FROM questions q WHERE q.status = 'published' AND ${UNSEEN_CONDITION}`;
        const params = [userId, userId];
        if (difficulty) { query += ' AND q.difficulty = ?'; params.push(difficulty); }
        if (picked.length > 0) { query += ' AND q.question_id NOT IN (?)'; params.push(picked); }

        const [after] = await conn.query(`${query} AND q.question_id >= ? ORDER BY q.question_id LIMIT 1`, [...params, pivot]);
        if (after.length > 0) return after[0].question_id;
        const [before] = await conn.query(`${query} AND q.question_id < ? ORDER BY q.question_id LIMIT 1`, [...params, pivot]);
        return before.length > 0 ? before[0].question_id : null;
    };

    const pick = async (difficulty, limit) => {
        for (let i = 0; i < limit; i++) {
            const id = await pickOne(difficulty);
            if (id == null) return; // no unseen questions left for this difficulty
            picked.push(id);
        }
    };

    for (const [difficulty, needed] of Object.entries(getDifficultyDistribution(userLevel))) {
        if (needed > 0) await pick(difficulty, needed);
    }
    if (picked.length < DAILY_QUESTION_COUNT) {
        await pick(null, DAILY_QUESTION_COUNT - picked.length);
    }
    return picked;
}

// Returns today's user_daily_log row, creating it from the existing bank if
// missing. Returns null only when the bank has no unseen questions for the user.
// Safe under concurrency: the (user_id, challenge_date) unique key makes the
// second parallel insert a no-op, and both callers then read the same row.
export async function getOrAssignDailyLog(conn, userId) {
    const today = getTodayDate();
    const selectLog = async () => {
        const [[log]] = await conn.query(
            'SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
            [userId, today]
        );
        return log || null;
    };

    const existing = await selectLog();
    if (existing) return existing;

    const [[user]] = await conn.query('SELECT level FROM users WHERE user_id = ?', [userId]);
    const questionIds = await pickQuestionsFromBank(conn, userId, user?.level || 'Beginner');
    if (questionIds.length === 0) {
        console.warn(`[DailyQuestions] Bank has no unseen questions for ${userId}.`);
        return null;
    }

    try {
        await conn.query(
            'INSERT INTO user_daily_log (user_id, challenge_date, question_ids_json) VALUES (?, ?, ?)',
            [userId, today, JSON.stringify(questionIds)]
        );
    } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
    }
    return selectLog();
}
