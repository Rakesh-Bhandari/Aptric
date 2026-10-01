import { Router } from 'express';
import dbPool from '../config/db.js';
import { isLoggedIn } from '../middleware/auth.js';
import { ensureDailyQuestionsGenerated } from '../services/dailyQuestions.js';
import { getTodayDate, calculateLevel, POINTS_CORRECT, POINTS_WRONG, POINTS_HINT, POINTS_GIVEUP } from '../utils/helpers.js';

const router = Router();

async function updateGameStats(userId, points, conn) {
    await conn.query('UPDATE users SET score = score + ? WHERE user_id = ?', [points, userId]);
    const [[{ score }]] = await conn.query('SELECT score FROM users WHERE user_id = ?', [userId]);
    const newLevel = calculateLevel(score);
    await conn.query('UPDATE users SET level = ? WHERE user_id = ?', [newLevel, userId]);
}

// --- Get Daily Questions ---
// NEVER generates questions here — generation happens at login time.
// If no questions exist yet, returns status:'generating' so frontend
// can poll and show a loading screen instead of timing out.
router.get('/daily-questions', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;
    const today = getTodayDate();
    let conn;

    try {
        conn = await dbPool.getConnection();
        const [logs] = await conn.query(
            'SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
            [userId, today]
        );

        // Questions not ready yet — tell frontend to poll
        if (logs.length === 0) {
            return res.status(202).json({
                status: 'generating',
                message: 'Your questions are being prepared. Please wait...'
            });
        }

        const questionIds = logs[0].question_ids_json;

        if (!questionIds || questionIds.length === 0) {
            await conn.query('DELETE FROM user_daily_log WHERE log_id = ?', [logs[0].log_id]);
            return res.status(202).json({
                status: 'generating',
                message: 'Retrying question preparation...'
            });
        }

        const [questions] = await conn.query(
            `SELECT question_id, qid, question_text, options, difficulty, category, hint, explanation, correct_answer_index 
             FROM questions WHERE question_id IN (?) ORDER BY FIELD(question_id, ?)`,
            [questionIds, ...questionIds]
        );

        if (questions.length === 0) {
            await conn.query('DELETE FROM user_daily_log WHERE log_id = ?', [logs[0].log_id]);
            return res.status(202).json({
                status: 'generating',
                message: 'Retrying question preparation...'
            });
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

        res.json({ status: 'ready', questions: dailyQuestions, logId: logs[0].log_id });
    } catch (err) {
        console.error('[daily-questions]', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// Shared guard for the scoring endpoints. Must run inside a transaction.
// Looks the question up by qid (the client's questionId is never trusted),
// rejects questions the user already attempted on an earlier date, and locks
// today's attempt row (FOR UPDATE) so parallel requests can't both score.
// Allowed questions are today's daily-log questions and never-attempted
// topic-practice questions; both cases reduce to "no attempt on an earlier date".
// Returns { error: [status, message] } or { question, existing }.
async function lockAttempt(conn, userId, qid, today, columns) {
    const [[question]] = await conn.query(`SELECT question_id, ${columns} FROM questions WHERE qid = ?`, [qid]);
    if (!question) return { error: [404, 'Question not found'] };

    const [[prior]] = await conn.query(
        'SELECT attempt_id FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date <> ? LIMIT 1',
        [userId, qid, today]
    );
    if (prior) return { error: [403, 'Already attempted on an earlier date'] };

    const [[existing]] = await conn.query(
        'SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ? FOR UPDATE',
        [userId, qid, today]
    );
    return { question, existing };
}

// A parallel request that lost the race on the (user_id, attempt_date, qid) unique key.
const isRaceError = (err) => err && (err.code === 'ER_DUP_ENTRY' || err.code === 'ER_LOCK_DEADLOCK');

// --- Submit Answer ---
// Scoring: correct = +100, wrong = -20, awarded once per question.
// A hint taken earlier was already charged (-10) by /use-hint and is NOT charged again,
// so correct + hint = +90 total and wrong + hint = -30 total.
// points_earned on the attempt row stores the net total for the question.
router.post('/submit-answer', isLoggedIn, async (req, res) => {
    const { qid, selectedAnswerIndex } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();

    if (selectedAnswerIndex === undefined || !qid) return res.status(400).json({ error: 'Missing data' });
    if (!Number.isInteger(selectedAnswerIndex)) return res.status(400).json({ error: 'Invalid answer index' });

    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const { error, question, existing } = await lockAttempt(conn, userId, qid, today, 'options, correct_answer_index, explanation, hint');
        if (error) { await conn.rollback(); return res.status(error[0]).json({ error: error[1] }); }

        if (existing && existing.status !== 'pending' && existing.status !== 'hint_used') {
            await conn.rollback();
            return res.status(403).json({ error: 'Already answered' });
        }

        const options = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
        if (selectedAnswerIndex < 0 || selectedAnswerIndex >= (options?.length || 0)) {
            await conn.rollback();
            return res.status(400).json({ error: 'Invalid answer index' });
        }

        const isCorrect = selectedAnswerIndex === question.correct_answer_index;
        const awarded = isCorrect ? POINTS_CORRECT : POINTS_WRONG;
        const hintPoints = existing && existing.status === 'hint_used' ? (existing.points_earned || 0) : 0;
        const points = awarded + hintPoints;

        const status = isCorrect ? 'correct' : 'wrong';

        if (existing) {
            await conn.query(
                'UPDATE user_attempts SET selected_answer_index = ?, status = ?, points_earned = ? WHERE attempt_id = ?',
                [selectedAnswerIndex, status, points, existing.attempt_id]
            );
        } else {
            await conn.query(
                'INSERT INTO user_attempts (user_id, qid, question_id, selected_answer_index, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, qid, question.question_id, selectedAnswerIndex, status, points, today]
            );
        }

        await updateGameStats(userId, awarded, conn);
        await conn.query(
            `UPDATE users SET answered_qids = JSON_ARRAY_APPEND(COALESCE(answered_qids, '[]'), '$', ?) WHERE user_id = ?`,
            [qid, userId]
        );

        await conn.commit();
        const { correct_answer_index, explanation, hint } = question;
        res.json({ status, pointsEarned: points, correct_answer_index, explanation, hint });
    } catch (err) {
        if (conn) await conn.rollback();
        if (isRaceError(err)) return res.status(409).json({ error: 'Already answered' });
        console.error('[submit-answer]', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Use Hint ---
// Scoring: -10, charged once per question, only while it is still unanswered.
// Asking again (or after answering) returns the hint for 0 points.
router.post('/use-hint', isLoggedIn, async (req, res) => {
    const { qid } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();
    if (!qid) return res.status(400).json({ error: 'Missing data' });
    let conn;

    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const { error, question, existing } = await lockAttempt(conn, userId, qid, today, 'hint');
        if (error) { await conn.rollback(); return res.status(error[0]).json({ error: error[1] }); }

        if (existing && existing.status !== 'pending') {
            await conn.rollback();
            return res.json({ hint: question.hint, pointsEarned: 0 });
        }

        if (!existing) {
            await conn.query(
                'INSERT INTO user_attempts (user_id, qid, question_id, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, qid, question.question_id, 'hint_used', POINTS_HINT, today]
            );
        } else {
            await conn.query(
                'UPDATE user_attempts SET status = ?, points_earned = ? WHERE attempt_id = ?',
                ['hint_used', POINTS_HINT, existing.attempt_id]
            );
        }

        await updateGameStats(userId, POINTS_HINT, conn);
        await conn.commit();
        res.json({ hint: question.hint, pointsEarned: POINTS_HINT });
    } catch (err) {
        if (conn) await conn.rollback();
        if (isRaceError(err)) return res.status(409).json({ error: 'Hint already used' });
        console.error('[use-hint]', err);
        res.status(500).json({ error: 'Error' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Give Up ---
// Scoring: +10, awarded once per question. A hint taken earlier was already
// charged (-10) by /use-hint and is NOT charged again, so give-up + hint = 0 total.
router.post('/give-up', isLoggedIn, async (req, res) => {
    const { qid } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();
    if (!qid) return res.status(400).json({ error: 'Missing data' });
    let conn;

    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const { error, question, existing } = await lockAttempt(conn, userId, qid, today, 'correct_answer_index, explanation, hint');
        if (error) { await conn.rollback(); return res.status(error[0]).json({ error: error[1] }); }

        if (existing && existing.status !== 'pending' && existing.status !== 'hint_used') {
            await conn.rollback();
            return res.status(403).json({ error: 'Already done' });
        }

        const hintPoints = existing && existing.status === 'hint_used' ? (existing.points_earned || 0) : 0;
        const points = POINTS_GIVEUP + hintPoints;

        if (existing) {
            await conn.query(
                'UPDATE user_attempts SET status = ?, points_earned = ?, selected_answer_index = NULL WHERE attempt_id = ?',
                ['gave_up', points, existing.attempt_id]
            );
        } else {
            await conn.query(
                'INSERT INTO user_attempts (user_id, qid, question_id, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, qid, question.question_id, 'gave_up', points, today]
            );
        }

        await updateGameStats(userId, POINTS_GIVEUP, conn);
        await conn.query(
            `UPDATE users SET answered_qids = JSON_ARRAY_APPEND(COALESCE(answered_qids, '[]'), '$', ?) WHERE user_id = ?`,
            [qid, userId]
        );

        await conn.commit();
        const { correct_answer_index, explanation, hint } = question;
        res.json({ status: 'gave_up', pointsEarned: points, correct_answer_index, explanation, hint });
    } catch (err) {
        if (conn) await conn.rollback();
        if (isRaceError(err)) return res.status(409).json({ error: 'Already done' });
        console.error('[give-up]', err);
        res.status(500).json({ error: 'Error' });
    } finally {
        if (conn) conn.release();
    }
});

export default router;