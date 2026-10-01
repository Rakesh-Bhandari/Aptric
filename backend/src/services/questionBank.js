import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { getTodayDate } from '../utils/helpers.js';

// Single home for the question bank: AI generation (cron + admin only),
// and fast bank-only daily assignment (request path).

const OPENROUTER_MODEL = 'google/gemini-2.0-flash-001';
const AI_BATCH_SIZE = 10;
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const DAILY_QUESTION_COUNT = 10;

const SUB_TOPICS = [
    "Time & Work (Efficiency)", "Time & Work (Wages)", "Pipes & Cisterns",
    "Speed (Relative Speed)", "Speed (Trains)", "Speed (Boats & Streams)",
    "Probability (Coins)", "Probability (Dice)", "Probability (Cards)",
    "Permutation (Words)", "Profit & Loss (Discounts)", "Ages (Ratios)",
    "Blood Relations (Family Tree)", "Syllogisms (Possibility)", "Percentages (Election)",
    "Simple Interest vs Compound Interest", "Mensuration (Area vs Volume)"
];

const CATEGORIES = 'Quantitative Aptitude, Logical Reasoning, Verbal Ability, Data Interpretation, Puzzles, Technical Aptitude';

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

// Smart correct-answer index finder (AI output is not always a clean 0-3 integer)
export function findCorrectIndex(rawAnswer, options) {
    if (typeof rawAnswer === 'number' && rawAnswer >= 0 && rawAnswer <= 3) return rawAnswer;

    const strAns = String(rawAnswer).trim();
    if (/^[a-dA-D]$/.test(strAns)) {
        return { 'a': 0, 'b': 1, 'c': 2, 'd': 3 }[strAns.toLowerCase()];
    }
    if (/^\d$/.test(strAns)) {
        const num = parseInt(strAns);
        if (num >= 0 && num <= 3) return num;
    }

    const lowerAns = strAns.toLowerCase();
    const idx = options.findIndex(opt => {
        const lowerOpt = String(opt).toLowerCase();
        return lowerOpt === lowerAns || lowerOpt.includes(lowerAns) || lowerAns.includes(lowerOpt);
    });
    if (idx !== -1) return idx;

    const match = strAns.match(/(?:option|answer)\s*([a-d0-3])/i);
    if (match) {
        const val = match[1].toLowerCase();
        if (val >= '0' && val <= '3') return parseInt(val);
        return { 'a': 0, 'b': 1, 'c': 2, 'd': 3 }[val];
    }

    return 0;
}

// ─────────────────────────────────────────────────────────────
// AI generation (never call from a user-facing request)
// ─────────────────────────────────────────────────────────────

function getOpenAI() {
    if (!process.env.OPEN_ROUTER_API_KEY) {
        throw new Error('OPEN_ROUTER_API_KEY is missing from environment variables.');
    }
    return new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPEN_ROUTER_API_KEY,
        defaultHeaders: {
            'HTTP-Referer': process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'Aptitude Master',
        },
    });
}

// One AI call → up to `count` questions. If `category` is given every question
// uses it; otherwise the model picks from CATEGORIES.
async function requestQuestions(openai, { difficulty, count, category, subTopic }) {
    const focus = category
        ? `for the category "${category}"${subTopic ? `, specifically focusing on the sub-topic "${subTopic}"` : ''}`
        : `focusing on these sub-topics: ${getRandomSubTopics()}`;

    const prompt = `
    You are an expert aptitude tutor. Generate ${count} unique ${difficulty} level aptitude questions ${focus}.

    STRICT RULES:
    1. Return ONLY valid JSON — no extra text.
    2. "correct_answer" MUST be an integer index 0–3.
    3. "options" must be an array of exactly 4 distinct strings.
    4. "explanation" must be detailed step-by-step.
    5. "category" must be one of: ${CATEGORIES}.

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

    const completion = await openai.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
            { role: 'system', content: 'You are a helpful AI that outputs strict JSON only.' },
            { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    if (!Array.isArray(parsed.questions)) return [];

    return parsed.questions
        .filter(q => q && q.question_text && Array.isArray(q.options) && q.options.length === 4)
        .map(q => ({ ...q, difficulty, category: category || q.category || 'Quantitative Aptitude' }));
}

async function saveQuestions(pool, questions) {
    if (questions.length === 0) return 0;
    const today = getTodayDate();
    const rows = questions.map(q => [
        `Q${nanoid(10)}`,
        q.question_text,
        JSON.stringify(q.options),
        findCorrectIndex(q.correct_answer, q.options),
        q.explanation,
        q.hint,
        q.difficulty,
        q.category,
        today
    ]);
    const [result] = await pool.query(
        `INSERT INTO questions
         (qid, question_text, options, correct_answer_index, explanation, hint, difficulty, category, generated_for_date)
         VALUES ?`,
        [rows]
    );
    return result.affectedRows;
}

// Generate `count` questions of one difficulty (in parallel batches) and save
// them to the bank. Returns the number saved. Failed batches are logged and skipped.
export async function generateQuestions(pool, { difficulty, count, category = '', subTopic = '' }) {
    const openai = getOpenAI();
    const batches = [];
    for (let i = 0; i < count; i += AI_BATCH_SIZE) {
        batches.push(Math.min(AI_BATCH_SIZE, count - i));
    }

    const results = await Promise.all(batches.map(async (batchCount) => {
        try {
            const questions = await requestQuestions(openai, { difficulty, count: batchCount, category, subTopic });
            return await saveQuestions(pool, questions);
        } catch (err) {
            console.error(`[QuestionBank] ${difficulty} batch failed:`, err.message);
            return 0;
        }
    }));

    const saved = results.reduce((a, b) => a + b, 0);
    console.log(`[QuestionBank] Saved ${saved}/${count} new ${difficulty} questions${category ? ` (${category})` : ''}.`);
    return saved;
}

// "Unused" = no user has attempted it yet.
export async function countUnusedByDifficulty(pool) {
    const [rows] = await pool.query(
        `SELECT q.difficulty, COUNT(*) AS unused
         FROM questions q
         WHERE NOT EXISTS (SELECT 1 FROM user_attempts a WHERE a.qid = q.qid)
         GROUP BY q.difficulty`
    );
    const counts = Object.fromEntries(DIFFICULTIES.map(d => [d, 0]));
    for (const r of rows) {
        if (r.difficulty in counts) counts[r.difficulty] = Number(r.unused);
    }
    return counts;
}

// Top up every difficulty that has fewer than `minUnused` unused questions,
// generating at most `maxPerDifficulty` per run so we fit in the function timeout.
export async function topUpQuestionBank(pool, {
    minUnused = parseInt(process.env.QUESTION_BANK_MIN_UNUSED) || 50,
    maxPerDifficulty = parseInt(process.env.QUESTION_BANK_MAX_PER_RUN) || 20,
} = {}) {
    const before = await countUnusedByDifficulty(pool);
    const generated = {};

    await Promise.all(DIFFICULTIES.map(async (difficulty) => {
        const deficit = minUnused - before[difficulty];
        if (deficit <= 0) { generated[difficulty] = 0; return; }
        generated[difficulty] = await generateQuestions(pool, {
            difficulty,
            count: Math.min(deficit, maxPerDifficulty)
        });
    }));

    return { minUnused, before, generated };
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

// Picks up to DAILY_QUESTION_COUNT unseen question_ids from the bank following
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
        let query = `SELECT q.question_id FROM questions q WHERE ${UNSEEN_CONDITION}`;
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
