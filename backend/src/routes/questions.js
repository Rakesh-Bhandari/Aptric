import { Router } from 'express';
import dbPool from '../config/db.js';
import { isLoggedIn } from '../middleware/auth.js';
import { getTodayDate, ALL_CATEGORIES } from '../utils/helpers.js';

const router = Router();

// --- Leaderboard (public) ---
router.get('/leaderboard', async (req, res) => {
    try {
        const [rows] = await dbPool.query(
            `SELECT user_id, user_name, profile_pic, score, level, day_streak,
             (SELECT COUNT(*) FROM user_attempts WHERE user_id = u.user_id AND status = 'correct') as questions_solved,
             (SELECT COUNT(*) FROM user_attempts WHERE user_id = u.user_id AND status IN ('correct', 'wrong')) as total_attempted
             FROM users u
             ORDER BY score DESC
             LIMIT 100`
        );

        const leaderboard = rows.map((row, index) => ({
            rank: index + 1,
            userId: row.user_id,
            user: row.user_name,
            profilePic: row.profile_pic,
            score: row.score,
            level: row.level,
            questionsSolved: row.questions_solved,
            accuracy: row.total_attempted > 0 ? ((row.questions_solved / row.total_attempted) * 100).toFixed(0) : 0
        }));

        res.json(leaderboard);
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Get single question by QID ---
router.get('/single/:qid', isLoggedIn, async (req, res) => {
    const { qid } = req.params;
    const userId = req.user.user_id;
    const today = getTodayDate();

    try {
        const conn = await dbPool.getConnection();

        const [[question]] = await conn.query('SELECT * FROM questions WHERE qid = ?', [qid]);
        if (!question) { conn.release(); return res.status(404).json({ error: 'Question not found' }); }

        let attempt = null;
        const [[todayAttempt]] = await conn.query(
            'SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?',
            [userId, qid, today]
        );

        if (todayAttempt) {
            attempt = todayAttempt;
        } else {
            const [[solvedAttempt]] = await conn.query(
                "SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND status = 'correct'",
                [userId, qid]
            );
            if (solvedAttempt) attempt = solvedAttempt;
        }

        conn.release();

        res.json({
            questionId: question.question_id,
            qid: question.qid,
            questionText: question.question_text,
            options: question.options,
            difficulty: question.difficulty,
            category: question.category,
            status: attempt ? attempt.status : 'unattempted',
            selectedAnswerIndex: attempt ? attempt.selected_answer_index : null,
            ...(attempt && ['correct', 'wrong', 'gave_up'].includes(attempt.status) && {
                explanation: question.explanation,
                correctAnswerIndex: question.correct_answer_index,
                hint: question.hint
            }),
            ...(attempt && attempt.status === 'hint_used' && { hint: question.hint })
        });
    } catch (err) {
        console.error('Single question error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Get questions by category ---
router.get('/category', isLoggedIn, async (req, res) => {
    const { category } = req.query;
    if (!category) return res.status(400).json({ error: 'Category required' });

    try {
        const conn = await dbPool.getConnection();

        const [questions] = await conn.query(
            `SELECT question_id, qid, question_text, options, difficulty, category 
             FROM questions WHERE category = ? ORDER BY created_at DESC LIMIT 50`,
            [category]
        );

        const userId = req.user.user_id;
        const qids = questions.map(q => q.qid);

        let attemptsMap = new Map();
        if (qids.length > 0) {
            const [attempts] = await conn.query(
                'SELECT qid, status FROM user_attempts WHERE user_id = ? AND qid IN (?) ORDER BY attempt_date ASC',
                [userId, qids]
            );
            attemptsMap = new Map(attempts.map(a => [a.qid, a.status]));
        }

        conn.release();

        res.json(questions.map(q => ({ ...q, status: attemptsMap.get(q.qid) || 'unattempted' })));
    } catch (err) {
        console.error('Category fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Get topic stats ---
// NOTE: Returns empty stats for unauthenticated users instead of 401
// so the Topics page always renders (just shows 0 progress for guests)
router.get('/topics/stats', async (req, res) => {
    try {
        const conn = await dbPool.getConnection();
        const [totalRows] = await conn.query(`SELECT category, COUNT(*) as total FROM questions GROUP BY category`);

        // Build base stats from question bank (works for everyone)
        const stats = {};
        ALL_CATEGORIES.forEach(cat => { stats[cat] = { total: 0, solved: 0 }; });
        totalRows.forEach(row => {
            if (stats[row.category] !== undefined) {
                stats[row.category].total = row.total;
            }
        });

        // If logged in, also add the user's solved count
        if (req.isAuthenticated && req.isAuthenticated() && req.user) {
            const [solvedRows] = await conn.query(
                `SELECT q.category, COUNT(DISTINCT ua.question_id) as solved
                 FROM user_attempts ua
                 JOIN questions q ON ua.question_id = q.question_id
                 WHERE ua.user_id = ? AND ua.status = 'correct'
                 GROUP BY q.category`,
                [req.user.user_id]
            );
            solvedRows.forEach(row => {
                if (stats[row.category] !== undefined) {
                    stats[row.category].solved = row.solved;
                }
            });
        }

        conn.release();
        res.json(stats);
    } catch (err) {
        console.error('Topic stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;