import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { getTodayDate } from '../utils/helpers.js';
import { findCorrectIndex } from './questionGenerator.js';

// In-memory map to track async activation progress
const activationStatus = new Map();

export function updateActivationStatus(userId, status) {
    activationStatus.set(userId, { ...status, timestamp: Date.now() });
    setTimeout(() => activationStatus.delete(userId), 300000);
}

export function getActivationStatus(userId) {
    return activationStatus.get(userId);
}

// --- Difficulty distribution by level ---
function getDifficultyDistribution(userLevel) {
    switch (userLevel) {
        case 'Beginner':     return { Easy: 7, Medium: 3, Hard: 0 };
        case 'Intermediate': return { Easy: 4, Medium: 5, Hard: 1 };
        case 'Advanced':     return { Easy: 2, Medium: 5, Hard: 3 };
        case 'Pro':          return { Easy: 1, Medium: 4, Hard: 5 };
        case 'Expert':       return { Easy: 0, Medium: 3, Hard: 7 };
        default:             return { Easy: 7, Medium: 3, Hard: 0 };
    }
}

// --- Get random sub-topics for AI prompt variety ---
function getRandomSubTopics() {
    const topics = [
        "Time & Work (Efficiency)", "Time & Work (Wages)", "Pipes & Cisterns",
        "Speed (Relative Speed)", "Speed (Trains)", "Speed (Boats & Streams)",
        "Probability (Coins)", "Probability (Dice)", "Probability (Cards)",
        "Permutation (Words)", "Profit & Loss (Discounts)", "Ages (Ratios)",
        "Blood Relations (Family Tree)", "Syllogisms (Possibility)", "Percentages (Election)",
        "Simple Interest vs Compound Interest", "Mensuration (Area vs Volume)"
    ];
    return topics.sort(() => 0.5 - Math.random()).slice(0, 3).join(", ");
}

// --- Generate fresh questions via AI and insert into question bank ---
async function generateAndSaveToBank(pool, difficulty, count, progressCallback, doneCount, totalCount) {
    const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPEN_ROUTER_API_KEY,
        defaultHeaders: {
            'HTTP-Referer': process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'Aptitude Master',
        },
    });

    const subTopics = getRandomSubTopics();
    const prompt = `
    You are an expert aptitude tutor. Generate ${count} unique ${difficulty} level aptitude questions.
    Focus on these sub-topics: ${subTopics}.

    STRICT RULES:
    1. Return ONLY valid JSON — no extra text.
    2. "correct_answer" MUST be an integer index 0–3.
    3. "options" must be an array of exactly 4 distinct strings.
    4. "explanation" must be detailed step-by-step.
    5. "category" must be one of: Quantitative Aptitude, Logical Reasoning, Verbal Ability, Data Interpretation, Puzzles, Technical Aptitude.

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
        model: 'google/gemini-2.0-flash-001',
        messages: [
            { role: 'system', content: 'You are a helpful AI that outputs strict JSON only.' },
            { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0].message.content;
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    const questions = (parsed.questions || []).map(q => ({ ...q, difficulty }));

    const savedIds = [];
    const today = getTodayDate();
    const conn = await pool.getConnection();

    try {
        for (const q of questions) {
            const qid = `Q${nanoid(10)}`;
            const correctIndex = findCorrectIndex(q.correct_answer, q.options);
            const [result] = await conn.query(
                `INSERT INTO questions 
                 (qid, question_text, options, correct_answer_index, explanation, hint, difficulty, category, generated_for_date) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    qid,
                    q.question_text,
                    JSON.stringify(q.options),
                    correctIndex,
                    q.explanation,
                    q.hint,
                    q.difficulty,
                    q.category || 'Quantitative Aptitude',
                    today
                ]
            );
            savedIds.push(result.insertId);

            if (progressCallback) {
                progressCallback({
                    progress: doneCount + savedIds.length,
                    total: totalCount,
                    message: `Saved question ${doneCount + savedIds.length}/${totalCount}...`
                });
            }
        }
    } finally {
        conn.release();
    }

    console.log(`[QuestionBank] Saved ${savedIds.length} new ${difficulty} questions to bank.`);
    return savedIds;
}

// --- SMART ASSIGNMENT: Reuse bank questions, generate only what's missing ---
// No-repeat logic: excludes qids the user has already been assigned (answered_qids)
async function assignQuestionsForUser(userId, userLevel, pool, progressCallback, totalCount = 10) {
    const distribution = getDifficultyDistribution(userLevel);
    const assignedIds = []; // question_id PKs to assign to user today
    let doneCount = 0;

    // Fetch the user's complete history of seen question qids
    let seenQids = [];
    const userConn = await pool.getConnection();
    try {
        const [[user]] = await userConn.query(
            'SELECT answered_qids FROM users WHERE user_id = ?',
            [userId]
        );
        if (user && user.answered_qids) {
            seenQids = typeof user.answered_qids === 'string'
                ? JSON.parse(user.answered_qids)
                : (user.answered_qids || []);
        }
    } finally {
        userConn.release();
    }

    console.log(`[QuestionBank] User ${userId} has seen ${seenQids.length} questions total.`);

    for (const [difficulty, needed] of Object.entries(distribution)) {
        if (needed === 0) continue;

        if (progressCallback) {
            progressCallback({
                progress: doneCount,
                total: totalCount,
                message: `Fetching ${difficulty} questions from bank...`
            });
        }

        // --- Step 1: Pull unused questions from the bank ---
        const bankConn = await pool.getConnection();
        let bankIds = [];
        try {
            let query = `SELECT question_id, qid FROM questions WHERE difficulty = ?`;
            const params = [difficulty];

            // Exclude questions the user has already seen
            if (seenQids.length > 0) {
                query += ` AND qid NOT IN (${seenQids.map(() => '?').join(',')})`;
                params.push(...seenQids);
            }

            // Also exclude questions already picked for today's session
            // (in case multiple difficulty loops pick the same question)
            if (assignedIds.length > 0) {
                query += ` AND question_id NOT IN (${assignedIds.map(() => '?').join(',')})`;
                params.push(...assignedIds);
            }

            query += ` ORDER BY RAND() LIMIT ?`;
            params.push(needed);

            const [rows] = await bankConn.query(query, params);
            bankIds = rows.map(r => r.question_id);
        } finally {
            bankConn.release();
        }

        assignedIds.push(...bankIds);
        doneCount += bankIds.length;

        console.log(`[QuestionBank] ${difficulty}: ${bankIds.length}/${needed} from bank, ${needed - bankIds.length} need AI generation.`);

        // --- Step 2: Generate missing questions via AI if bank ran dry ---
        const stillNeeded = needed - bankIds.length;
        if (stillNeeded > 0) {
            if (progressCallback) {
                progressCallback({
                    progress: doneCount,
                    total: totalCount,
                    message: `Generating ${stillNeeded} new ${difficulty} questions...`
                });
            }

            try {
                const newIds = await generateAndSaveToBank(
                    pool, difficulty, stillNeeded,
                    progressCallback, doneCount, totalCount
                );
                assignedIds.push(...newIds);
                doneCount += newIds.length;
            } catch (err) {
                console.error(`[QuestionBank] AI generation failed for ${difficulty}:`, err.message);
            }
        }
    }

    return assignedIds;
}

// --- PUBLIC: Called on login / activation to ensure today's questions exist ---
export async function ensureDailyQuestionsGenerated(user, pool, progressCallback = null) {
    const userId = user.user_id;
    const userLevel = user.level || 'Beginner';
    const today = getTodayDate();
    const totalCount = 10;

    let conn;
    try {
        conn = await pool.getConnection();

        // Already generated today? Skip entirely.
        const [logs] = await conn.query(
            'SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
            [userId, today]
        );

        if (logs.length > 0) {
            conn.release();
            if (progressCallback) {
                progressCallback({ progress: 10, total: 10, message: 'Questions already exist for today!' });
            }
            return;
        }

        conn.release(); // release before the slow AI work

        console.log(`[DailyGen] Assigning questions for user ${userId} (${userLevel})...`);

        if (progressCallback) {
            progressCallback({ progress: 0, total: totalCount, message: `Preparing ${userLevel} questions...` });
        }

        // Smart assignment: reuse bank, generate only what's missing
        const newQuestionIds = await assignQuestionsForUser(userId, userLevel, pool, progressCallback, totalCount);

        if (newQuestionIds && newQuestionIds.length > 0) {
            // Save the log entry linking user → today's questions
            const logConn = await pool.getConnection();
            try {
                await logConn.query(
                    'INSERT INTO user_daily_log (user_id, challenge_date, question_ids_json) VALUES (?, ?, ?)',
                    [userId, today, JSON.stringify(newQuestionIds)]
                );
            } finally {
                logConn.release();
            }

            console.log(`[DailyGen] Assigned ${newQuestionIds.length} questions to ${userId}.`);

            if (progressCallback) {
                progressCallback({ progress: newQuestionIds.length, total: totalCount, message: `All ${newQuestionIds.length} questions ready!` });
            }
        }
    } catch (err) {
        console.error(`[DailyGen] Error for ${userId}:`, err);
        if (progressCallback) {
            progressCallback({ progress: 0, total: totalCount, message: 'Error generating questions.' });
        }
        throw err;
    } finally {
        if (conn && !conn._released) {
            try { conn.release(); } catch (_) {}
        }
    }
}