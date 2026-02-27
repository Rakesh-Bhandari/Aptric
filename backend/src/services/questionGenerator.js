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

export async function generateDailyQuestionsForUser(userLevel, dbPool, progressCallback = null, totalCount = 10) {
    if (!process.env.OPEN_ROUTER_API_KEY) {
        console.error('❌ ERROR: OPEN_ROUTER_API_KEY is missing');
        return [];
    }

    const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPEN_ROUTER_API_KEY,
        defaultHeaders: {
            'HTTP-Referer': process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'Aptitude Master',
        },
    });

    const OPENROUTER_MODEL = 'google/gemini-2.0-flash-001';
    console.log(`[QuestionGen] Starting generation for level: ${userLevel}`);

    const distribution = getDifficultyDistribution(userLevel, totalCount);
    const difficulties = ['Easy', 'Medium', 'Hard'];
    let allQuestions = [];
    let questionsGenerated = 0;

    for (const diff of difficulties) {
        const count = distribution[diff];
        if (count === 0) continue;

        if (progressCallback) {
            progressCallback({ progress: questionsGenerated, total: totalCount, message: `Generating ${diff} level questions...` });
        }

        const subTopics = getRandomSubTopics();
        const prompt = `
        You are an expert mathematics tutor. Generate ${count} unique ${diff} level aptitude questions.
        Focus on these sub-topics: ${subTopics}.

        STRICT RULES:
        1. Return ONLY valid JSON.
        2. "correct_answer" SHOULD be the integer index (0-3).
        3. "options" must be an array of 4 distinct strings.
        4. "explanation" must be detailed.

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

        try {
            const completion = await openai.chat.completions.create({
                model: OPENROUTER_MODEL,
                messages: [
                    { role: 'system', content: 'You are a helpful AI that outputs strict JSON.' },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' }
            });

            const responseText = completion.choices[0].message.content;
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);

            const questions = parsed.questions || [];
            questions.forEach(q => q.difficulty = diff);
            allQuestions = [...allQuestions, ...questions];
            questionsGenerated += questions.length;

            if (progressCallback) {
                progressCallback({ progress: questionsGenerated, total: totalCount, message: `Generated ${questionsGenerated}/${totalCount} questions...` });
            }
        } catch (err) {
            console.error(`[QuestionGen] Error generating ${diff} questions:`, err.message);
        }
    }

    if (allQuestions.length === 0) return [];

    const generatedQuestionIds = [];
    const today = new Date().toISOString().split('T')[0];
    const conn = await dbPool.getConnection();

    try {
        if (progressCallback) {
            progressCallback({ progress: questionsGenerated, total: totalCount, message: 'Saving questions to database...' });
        }

        for (const q of allQuestions) {
            const qid = `Q${nanoid(10)}`;
            const correctIndex = findCorrectIndex(q.correct_answer, q.options);
            const [result] = await conn.query(
                `INSERT INTO questions 
                (qid, question_text, options, correct_answer_index, explanation, hint, difficulty, category, generated_for_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [qid, q.question_text, JSON.stringify(q.options), correctIndex, q.explanation, q.hint, q.difficulty, q.category || 'General Aptitude', today]
            );
            generatedQuestionIds.push(result.insertId);
        }
    } catch (err) {
        console.error('[QuestionGen] DB Insert Error:', err);
    } finally {
        conn.release();
    }

    console.log(`[QuestionGen] Created ${generatedQuestionIds.length} questions.`);

    if (progressCallback) {
        progressCallback({ progress: generatedQuestionIds.length, total: totalCount, message: 'All questions saved successfully!' });
    }

    return generatedQuestionIds;
}
