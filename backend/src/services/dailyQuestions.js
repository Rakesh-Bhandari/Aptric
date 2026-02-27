import { generateDailyQuestionsForUser } from './questionGenerator.js';
import { getTodayDate } from '../utils/helpers.js';

// In-memory map to track async activation progress
const activationStatus = new Map();

export function updateActivationStatus(userId, status) {
    activationStatus.set(userId, {
        ...status,
        timestamp: Date.now()
    });
    // Auto-cleanup after 5 minutes
    setTimeout(() => activationStatus.delete(userId), 300000);
}

export function getActivationStatus(userId) {
    return activationStatus.get(userId);
}

export async function ensureDailyQuestionsGenerated(user, pool, progressCallback = null) {
    const userId = user.user_id;
    const userLevel = user.level || 'Beginner';
    const today = getTodayDate();

    let conn;
    try {
        conn = await pool.getConnection();
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

        console.log(`[DailyGen] Generating questions for user ${userId} (${userLevel})...`);

        if (progressCallback) {
            progressCallback({ progress: 0, total: 10, message: `Generating ${userLevel} level questions...` });
        }

        const newQuestionIds = await generateDailyQuestionsForUser(userLevel, pool, progressCallback);

        if (newQuestionIds && newQuestionIds.length > 0) {
            await conn.query(
                'INSERT INTO user_daily_log (user_id, challenge_date, question_ids_json) VALUES (?, ?, ?)',
                [userId, today, JSON.stringify(newQuestionIds)]
            );
            console.log(`[DailyGen] Assigned ${newQuestionIds.length} questions to ${userId}.`);

            if (progressCallback) {
                progressCallback({ progress: newQuestionIds.length, total: 10, message: `All ${newQuestionIds.length} questions ready!` });
            }
        }
    } catch (err) {
        console.error(`[DailyGen] Error for ${userId}:`, err);
        if (progressCallback) {
            progressCallback({ progress: 0, total: 10, message: 'Error generating questions' });
        }
        throw err;
    } finally {
        if (conn) conn.release();
    }
}
