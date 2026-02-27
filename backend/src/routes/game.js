import { Router } from 'express';
import dbPool from '../config/db.js';
import { isLoggedIn } from '../middleware/auth.js';
import { ensureDailyQuestionsGenerated } from '../services/dailyQuestions.js';
import { getTodayDate, calculateLevel, POINTS_CORRECT, POINTS_WRONG, POINTS_HINT, POINTS_GIVEUP } from '../utils/helpers.js';

const router = Router();

// --- Shared: Update score and level after a game action ---
async function updateGameStats(userId, points, conn) {
    await conn.query('UPDATE users SET score = score + ? WHERE user_id = ?', [points, userId]);
    const [[{ score }]] = await conn.query('SELECT score FROM users WHERE user_id = ?', [userId]);
    const newLevel = calculateLevel(score);
    await conn.query('UPDATE users SET level = ? WHERE user_id = ?', [newLevel, userId]);
}

// --- Get Daily Questions ---
router.get('/daily-questions', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;
    const today = getTodayDate();
    const conn = await dbPool.getConnection();

    try {
        let [logs] = await conn.query('SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?', [userId, today]);

        if (logs.length === 0) {
            await ensureDailyQuestionsGenerated(req.user, dbPool);
            [logs] = await conn.query('SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?', [userId, today]);
        }

        if (logs.length === 0) { conn.release(); return res.status(404).json({ error: 'Could not generate questions.' }); }

        const questionIds = logs[0].question_ids_json;

        if (!questionIds || questionIds.length === 0) {
            await conn.query('DELETE FROM user_daily_log WHERE log_id = ?', [logs[0].log_id]);
            conn.release();
            return res.status(404).json({ error: 'Empty log found. Please refresh.' });
        }

        const [questions] = await conn.query(
            `SELECT question_id, qid, question_text, options, difficulty, category, hint, explanation, correct_answer_index 
             FROM questions WHERE question_id IN (?) ORDER BY FIELD(question_id, ?)`,
            [questionIds, ...questionIds]
        );

        if (questions.length === 0) {
            await conn.query('DELETE FROM user_daily_log WHERE log_id = ?', [logs[0].log_id]);
            conn.release();
            return res.status(404).json({ error: 'Question data missing. Please refresh to regenerate.' });
        }

        const qids = questions.map(q => q.qid);
        let attempts = [];
        if (qids.length > 0) {
            const [rows] = await conn.query(
                'SELECT * FROM user_attempts WHERE user_id = ? AND attempt_date = ? AND qid IN (?)',
                [userId, today, qids]
            );
            attempts = rows;
        }

        const attemptsMap = new Map(attempts.map(a => [a.qid, a]));

        const dailyQuestions = questions.map(q => {
            const attempt = attemptsMap.get(q.qid);
            const isAnswered = attempt && ['correct', 'wrong', 'gave_up'].includes(attempt.status);

            return {
                questionId: q.question_id,
                qid: q.qid,
                questionText: q.question_text,
                options: q.options,
                difficulty: q.difficulty,
                category: q.category,
                ...(isAnswered && {
                    hint: q.hint,
                    explanation: q.explanation,
                    correctAnswerIndex: q.correct_answer_index,
                    selectedAnswerIndex: attempt.selected_answer_index,
                    status: attempt.status,
                    pointsEarned: attempt.points_earned
                }),
                ...(attempt && attempt.status === 'hint_used' && {
                    hint: q.hint,
                    status: 'hint_used',
                    pointsEarned: attempt.points_earned
                })
            };
        });

        conn.release();
        res.json({ questions: dailyQuestions, logId: logs[0].log_id });
    } catch (err) {
        if (conn) conn.release();
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Submit Answer ---
router.post('/submit-answer', isLoggedIn, async (req, res) => {
    const { questionId, qid, selectedAnswerIndex } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();

    if (selectedAnswerIndex === undefined || !qid) return res.status(400).json({ error: 'Missing data' });

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const [existing] = await conn.query(
            'SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?',
            [userId, qid, today]
        );
        if (existing.length > 0 && existing[0].status !== 'pending' && existing[0].status !== 'hint_used') {
            await conn.rollback(); conn.release();
            return res.status(403).json({ error: 'Already answered' });
        }

        const [[qData]] = await conn.query('SELECT correct_answer_index, explanation, hint FROM questions WHERE qid = ?', [qid]);
        if (!qData) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Question not found' }); }

        const isCorrect = parseInt(selectedAnswerIndex) === qData.correct_answer_index;
        const hadHint = existing.length > 0 && existing[0].status === 'hint_used';
        let points = isCorrect ? POINTS_CORRECT : POINTS_WRONG;
        if (hadHint) points += (existing[0]?.points_earned || POINTS_HINT);

        const status = isCorrect ? 'correct' : 'wrong';

        if (existing.length > 0) {
            await conn.query(
                'UPDATE user_attempts SET selected_answer_index = ?, status = ?, points_earned = ? WHERE attempt_id = ?',
                [selectedAnswerIndex, status, points, existing[0].attempt_id]
            );
        } else {
            await conn.query(
                'INSERT INTO user_attempts (user_id, qid, question_id, selected_answer_index, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, qid, questionId, selectedAnswerIndex, status, points, today]
            );
        }

        await updateGameStats(userId, points, conn);
        await conn.query(
            `UPDATE users SET answered_qids = JSON_ARRAY_APPEND(COALESCE(answered_qids, '[]'), '$', ?) WHERE user_id = ?`,
            [qid, userId]
        );

        await conn.commit();
        res.json({ status, pointsEarned: points, ...qData });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        conn.release();
    }
});

// --- Use Hint ---
router.post('/use-hint', isLoggedIn, async (req, res) => {
    const { questionId, qid } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const [existing] = await conn.query(
            'SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?',
            [userId, qid, today]
        );

        if (existing.length > 0 && existing[0].status !== 'pending') {
            const [[q]] = await conn.query('SELECT hint FROM questions WHERE qid = ?', [qid]);
            await conn.rollback(); conn.release();
            return res.json({ hint: q.hint, pointsEarned: 0 });
        }

        const [[qData]] = await conn.query('SELECT hint FROM questions WHERE qid = ?', [qid]);

        if (existing.length === 0) {
            await conn.query(
                'INSERT INTO user_attempts (user_id, qid, question_id, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, qid, questionId, 'hint_used', POINTS_HINT, today]
            );
        } else {
            await conn.query(
                'UPDATE user_attempts SET status = ?, points_earned = ? WHERE attempt_id = ?',
                ['hint_used', POINTS_HINT, existing[0].attempt_id]
            );
        }

        await updateGameStats(userId, POINTS_HINT, conn);
        await conn.commit();
        res.json({ hint: qData.hint, pointsEarned: POINTS_HINT });
    } catch (err) {
        await conn.rollback();
        conn.release();
        res.status(500).json({ error: 'Error' });
    }
});

// --- Give Up ---
router.post('/give-up', isLoggedIn, async (req, res) => {
    const { questionId, qid } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const [existing] = await conn.query(
            'SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?',
            [userId, qid, today]
        );

        if (existing.length > 0 && existing[0].status !== 'pending' && existing[0].status !== 'hint_used') {
            await conn.rollback(); conn.release();
            return res.status(403).json({ error: 'Already done' });
        }

        const [[qData]] = await conn.query('SELECT correct_answer_index, explanation, hint FROM questions WHERE qid = ?', [qid]);
        const hadHint = existing.length > 0 && existing[0].status === 'hint_used';
        const points = POINTS_GIVEUP + (hadHint ? POINTS_HINT : 0);

        if (existing.length > 0) {
            await conn.query(
                'UPDATE user_attempts SET status = ?, points_earned = ?, selected_answer_index = NULL WHERE attempt_id = ?',
                ['gave_up', points, existing[0].attempt_id]
            );
        } else {
            await conn.query(
                'INSERT INTO user_attempts (user_id, qid, question_id, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, qid, questionId, 'gave_up', points, today]
            );
        }

        await updateGameStats(userId, points, conn);
        await conn.query(
            `UPDATE users SET answered_qids = JSON_ARRAY_APPEND(COALESCE(answered_qids, '[]'), '$', ?) WHERE user_id = ?`,
            [qid, userId]
        );

        await conn.commit();
        res.json({ status: 'gave_up', pointsEarned: points, ...qData });
    } catch (err) {
        await conn.rollback();
        conn.release();
        res.status(500).json({ error: 'Error' });
    }
});

export default router;
