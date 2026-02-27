import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { findCorrectIndex } from './questionGenerator.js';

export async function generateBulkQuestions(pool, category, difficulty, totalCount, subTopic = '') {
    if (!process.env.OPEN_ROUTER_API_KEY) {
        throw new Error('OPEN_ROUTER_API_KEY is missing from environment variables.');
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
    const BATCH_SIZE = 5;
    let generatedCount = 0;
    const topicString = subTopic ? `specifically focusing on the sub-topic: "${subTopic}"` : '';

    console.log(`[BulkGen] Starting: ${totalCount} ${difficulty} questions for ${category}`);

    for (let i = 0; i < totalCount; i += BATCH_SIZE) {
        const currentBatchSize = Math.min(BATCH_SIZE, totalCount - i);

        const prompt = `
        Generate ${currentBatchSize} unique ${difficulty} level aptitude questions for the category: "${category}" ${topicString}.
        
        STRICT JSON FORMAT REQUIRED:
        {
            "questions": [
                {
                    "question_text": "Question?",
                    "options": ["Opt A", "Opt B", "Opt C", "Opt D"],
                    "correct_answer": 0,
                    "explanation": "Detailed step-by-step solution.",
                    "hint": "Short clue."
                }
            ]
        }
        
        Rules:
        1. "correct_answer" must be the integer index (0-3).
        2. Ensure options are distinct.
        `;

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

            if (!parsed.questions || !Array.isArray(parsed.questions)) continue;

            const conn = await pool.getConnection();
            try {
                for (const q of parsed.questions) {
                    const qid = `GEN-${nanoid(8)}`;
                    const correctIndex = findCorrectIndex(q.correct_answer, q.options);

                    await conn.query(
                        `INSERT INTO questions 
                        (qid, question_text, options, correct_answer_index, explanation, hint, difficulty, category, generated_for_date) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
                        [qid, q.question_text, JSON.stringify(q.options), correctIndex, q.explanation, q.hint, difficulty, category]
                    );
                    generatedCount++;
                }
            } finally {
                conn.release();
            }
        } catch (err) {
            console.error('[BulkGen] Batch Error:', err);
        }
    }

    return generatedCount;
}
