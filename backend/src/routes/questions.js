import { Router } from 'express';
import { z } from 'zod';
import dbPool from '../config/db.js';
import { isLoggedIn, getUserFromCookie } from '../middleware/auth.js';
import { getTodayDate, ALL_CATEGORIES } from '../utils/helpers.js';
import { leaderboardLimiter, topicStatsLimiter } from '../middleware/rateLimit.js';
import { validate, qid, category, pageQuery } from '../middleware/validate.js';

const router = Router();

// --- Leaderboard (public) ---
// Reads the users.questions_solved / questions_attempted counters (kept by the
// answer transactions) and the idx_score index. Cached 60 s at the Vercel edge.
router.get('/leaderboard', leaderboardLimiter, async (req, res) => {
    try {
        const [rows] = await dbPool.query(
            `SELECT handle, user_name, profile_pic, score, level, questions_solved, questions_attempted
             FROM users
             ORDER BY score DESC
             LIMIT 100`
        );

        const leaderboard = rows.map((row, index) => ({
            rank: index + 1,
            handle: row.handle,
            user: row.user_name,
            profilePic: row.profile_pic,
            score: row.score,
            level: row.level,
            questionsSolved: row.questions_solved,
            accuracy: row.questions_attempted > 0 ? ((row.questions_solved / row.questions_attempted) * 100).toFixed(0) : 0
        }));

        // Vary: Origin so the edge never serves one origin's CORS headers to another
        // (cors only adds it when the request carries an Origin).
        res.vary('Origin');
        res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=30');
        res.json(leaderboard);
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Get single question by QID ---
router.get('/single/:qid', isLoggedIn, validate({ params: z.object({ qid }) }), async (req, res) => {
    const { qid } = req.params;
    const userId = req.user.user_id;
    const today = getTodayDate();
    let conn;

    try {
        conn = await dbPool.getConnection();

        const [[question]] = await conn.query('SELECT * FROM questions WHERE qid = ?', [qid]);
        if (!question) { return res.status(404).json({ error: 'Question not found' }); }

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
    } finally {
        if (conn) conn.release();
    }
});

// --- Get questions by category ---
// Newest first, paged with ?limit= (1-100, default 50) and ?offset= (default 0).
// Responds { questions, total, limit, offset, hasMore }.
router.get('/category', isLoggedIn, validate({ query: z.object({ category, ...pageQuery(50, 100) }) }), async (req, res) => {
    const { category, limit, offset } = req.valid.query;
    let conn;

    try {
        conn = await dbPool.getConnection();

        const [questions] = await conn.query(
            `SELECT question_id, qid, question_text, options, difficulty, category 
             FROM questions WHERE category = ? ORDER BY created_at DESC, question_id DESC LIMIT ? OFFSET ?`,
            [category, limit, offset]
        );
        const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM questions WHERE category = ?', [category]);

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

        res.json({
            questions: questions.map(q => ({ ...q, status: attemptsMap.get(q.qid) || 'unattempted' })),
            total, limit, offset,
            hasMore: offset + questions.length < total
        });
    } catch (err) {
        console.error('Category fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Get topic stats ---
// NOTE: Returns empty stats for unauthenticated users instead of 401
// so the Topics page always renders (just shows 0 progress for guests)
router.get('/topics/stats', topicStatsLimiter, async (req, res) => {
    let conn;
    try {
        conn = await dbPool.getConnection();
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
        const userId = (await getUserFromCookie(req))?.user_id;
        if (userId) {
            const [solvedRows] = await conn.query(
                `SELECT q.category, COUNT(DISTINCT ua.question_id) as solved
                 FROM user_attempts ua
                 JOIN questions q ON ua.question_id = q.question_id
                 WHERE ua.user_id = ? AND ua.status = 'correct'
                 GROUP BY q.category`,
                [userId]
            );
            solvedRows.forEach(row => {
                if (stats[row.category] !== undefined) {
                    stats[row.category].solved = row.solved;
                }
            });
        }

        res.json(stats);
    } catch (err) {
        console.error('Topic stats error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

export default router;