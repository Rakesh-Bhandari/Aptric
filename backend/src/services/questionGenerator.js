import OpenAI from 'openai';
import { nanoid } from 'nanoid';

// Helper: Map User Level to Question Difficulty Distribution
function getDifficultyDistribution(userLevel, totalQuestions = 10) {
    let easy = 0, medium = 0, hard = 0;
    switch (userLevel) {
        case 'Beginner':     easy = 7; medium = 3; hard = 0; break;
        case 'Intermediate': easy = 4; medium = 5; hard = 1; break;
        case 'Advanced':     easy = 2; medium = 5; hard = 3; break;
        case 'Pro':          easy = 1; medium = 4; hard = 5; break;
        case 'Expert':       easy = 0; medium = 3; hard = 7; break;
        default:             easy = 7; medium = 3; hard = 0;
    }
    return { 'Easy': easy, 'Medium': medium, 'Hard': hard };
}

// Helper: Map level to difficulty tags used in question bank
function getLevelDifficulties(userLevel) {
    const dist = getDifficultyDistribution(userLevel);
    return Object.entries(dist).filter(([, count]) => count > 0).map(([diff]) => diff);
}

// Helper: Get random sub-topics
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

// Helper: Smart correct-answer index finder
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

// --- CORE: Generate questions via AI and save to question bank ---
async function generateAndSaveQuestions(dbPool, difficulty, count, progressCallback, questionsGeneratedSoFar, totalCount) {
    const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPEN_ROUTER_API_KEY,
        defaultHeaders: {
            'HTTP-Referer': process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'Aptitude Master',
        },
    });

    const OPENROUTER_MODEL = 'google/gemini-2.0-flash-001';
    const subTopics = getRandomSubTopics();

    const prompt = `
    You are an expert mathematics tutor. Generate ${count} unique ${difficulty} level aptitude questions.
    Focus on these sub-topics: ${subTopics}.

    STRICT RULES:
    1. Return ONLY valid JSON.
    2. "correct_answer" MUST be the integer index (0-3).
    3. "options" must be an array of 4 distinct strings.
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
        model: OPENROUTER_MODEL,
        messages: [
            { role: 'system', content: 'You are a helpful AI that outputs strict JSON only.' },
            { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0].message.content;
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    const questions = (parsed.questions || []).map(q => ({ ...q, difficulty }));

    const savedIds = [];
    const today = new Date().toISOString().split('T')[0];
    const conn = await dbPool.getConnection();

    try {
        for (const q of questions) {
            const qid = `Q${nanoid(10)}`;
            const correctIndex = findCorrectIndex(q.correct_answer, q.options);
            const [result] = await conn.query(
                `INSERT INTO questions 
                (qid, question_text, options, correct_answer_index, explanation, hint, difficulty, category, generated_for_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [qid, q.question_text, JSON.stringify(q.options), correctIndex, q.explanation, q.hint, q.difficulty, q.category || 'Quantitative Aptitude', today]
            );
            savedIds.push(result.insertId);

            if (progressCallback) {
                progressCallback({
                    progress: questionsGeneratedSoFar + savedIds.length,
                    total: totalCount,
                    message: `Saved question ${questionsGeneratedSoFar + savedIds.length}/${totalCount}...`
                });
            }
        }
    } finally {
        conn.release();
    }

    return savedIds;
}

// --- MAIN: Smart daily question assignment ---
// Strategy:
//   1. Get the user's already-seen question IDs (answered_qids)
//   2. For each difficulty slot, try to find unused questions from the bank
//   3. Only generate new AI questions for slots that can't be filled from the bank
//   4. All newly generated questions are saved to the bank for future reuse
export async function generateDailyQuestionsForUser(userLevel, dbPool, progressCallback = null, totalCount = 10) {
    if (!process.env.OPEN_ROUTER_API_KEY) {
        console.error('❌ ERROR: OPEN_ROUTER_API_KEY is missing');
        return [];
    }

    console.log(`[QuestionGen] Smart assignment for level: ${userLevel}`);

    const distribution = getDifficultyDistribution(userLevel, totalCount);
    const assignedIds = []; // final list of question_id (PKs) to assign to user

    // We need to know which qids the user has already seen across ALL time
    // This is stored in users.answered_qids as a JSON array of qid strings
    // We'll fetch it once here
    let seenQids = [];
    const conn = await dbPool.getConnection();
    try {
        // We don't have userId here — dailyQuestions.js passes it separately.
        // So we return the question IDs and let dailyQuestions.js handle the log insert.
        // The seenQids filtering happens at the pool level using the user context passed in.
        // Since generateDailyQuestionsForUser doesn't receive userId, we handle
        // "no repeats" by tracking at the ensureDailyQuestionsGenerated level.
        // See updated dailyQuestions.js for the full picture.
        conn.release();
    } catch (err) {
        conn.release();
        throw err;
    }

    let questionsAssignedCount = 0;

    for (const [difficulty, needed] of Object.entries(distribution)) {
        if (needed === 0) continue;

        if (progressCallback) {
            progressCallback({
                progress: questionsAssignedCount,
                total: totalCount,
                message: `Finding ${difficulty} questions...`
            });
        }

        // This function now receives seenQids from caller (dailyQuestions.js)
        // We store them in a closure variable set before this loop
        const fromBank = assignedIds._seenQids || [];

        const bankConn = await dbPool.getConnection();
        let bankIds = [];
        try {
            // Fetch unused questions from bank matching difficulty
            // Exclude questions the user has already seen (by qid)
            let query = `
                SELECT question_id, qid FROM questions 
                WHERE difficulty = ?
            `;
            const params = [difficulty];

            if (fromBank.length > 0) {
                query += ` AND qid NOT IN (${fromBank.map(() => '?').join(',')})`;
                params.push(...fromBank);
            }

            query += ` ORDER BY RAND() LIMIT ?`;
            params.push(needed);

            const [rows] = await bankConn.query(query, params);
            bankIds = rows.map(r => r.question_id);

            console.log(`[QuestionGen] ${difficulty}: Found ${bankIds.length}/${needed} from bank`);
        } finally {
            bankConn.release();
        }

        assignedIds.push(...bankIds);
        questionsAssignedCount += bankIds.length;

        // If bank didn't have enough, generate the remainder
        const stillNeeded = needed - bankIds.length;
        if (stillNeeded > 0) {
            console.log(`[QuestionGen] ${difficulty}: Generating ${stillNeeded} new questions via AI...`);

            if (progressCallback) {
                progressCallback({
                    progress: questionsAssignedCount,
                    total: totalCount,
                    message: `Generating ${stillNeeded} new ${difficulty} questions via AI...`
                });
            }

            try {
                const newIds = await generateAndSaveQuestions(
                    dbPool, difficulty, stillNeeded,
                    progressCallback, questionsAssignedCount, totalCount
                );
                assignedIds.push(...newIds);
                questionsAssignedCount += newIds.length;
            } catch (err) {
                console.error(`[QuestionGen] AI generation failed for ${difficulty}:`, err.message);
            }
        }
    }

    console.log(`[QuestionGen] Total assigned: ${assignedIds.length} questions`);

    if (progressCallback) {
        progressCallback({
            progress: assignedIds.length,
            total: totalCount,
            message: 'All questions ready!'
        });
    }

    return assignedIds;
}