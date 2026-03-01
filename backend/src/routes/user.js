// src/routes/user.js
import { Router } from 'express';
import dbPool from '../config/db.js';
import { upload } from '../config/cloudinary.js';
import { isLoggedIn } from '../middleware/auth.js';
import { getUserIdFromCookie } from '../utils/jwt.js';
import { ALL_CATEGORIES } from '../utils/helpers.js';

const router = Router();

// ── GET /api/user — session check, never returns 401 ──────────
router.get('/', async (req, res) => {
    try {
        const userId = getUserIdFromCookie(req);
        if (!userId) return res.json({ authenticated: false });

        const [users] = await dbPool.query(
            'SELECT user_id, user_name, email, score, level, day_streak, last_login, is_banned FROM users WHERE user_id = ?',
            [userId]
        );
        if (!users?.length || users[0].is_banned) return res.json({ authenticated: false });

        const u = users[0];
        res.json({
            authenticated: true,
            user: { id: u.user_id, name: u.user_name, email: u.email, score: u.score, level: u.level, streak: u.day_streak, lastLogin: u.last_login }
        });
    } catch (err) {
        console.error('[GET /api/user]', err.message);
        res.json({ authenticated: false });
    }
});

// ── Avatar upload ──────────────────────────────────────────────
router.post('/avatar', isLoggedIn, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    try {
        await dbPool.query('UPDATE users SET profile_pic = ? WHERE user_id = ?', [req.file.path, req.user.user_id]);
        res.json({ message: 'Avatar updated', url: req.file.path });
    } catch (err) {
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ── Progress / dashboard ───────────────────────────────────────
router.get('/progress', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;
    try {
        const conn = await dbPool.getConnection();

        const [userRows] = await conn.query(
            'SELECT email, user_name, bio, profile_pic, score, level, day_streak, created_at, role FROM users WHERE user_id = ?', [userId]
        );
        const u = userRows[0];
        const [rankRes] = await conn.query('SELECT COUNT(*)+1 as `rank` FROM users WHERE score > ?', [u.score]);
        const [topicStats] = await conn.query(
            `SELECT q.category, COUNT(ua.attempt_id) AS total_attempted,
             SUM(CASE WHEN ua.status='correct' THEN 1 ELSE 0 END) AS total_correct
             FROM user_attempts ua JOIN questions q ON ua.question_id=q.question_id
             WHERE ua.user_id=? AND ua.status IN ('correct','wrong') GROUP BY q.category`, [userId]
        );
        const [activity] = await conn.query(
            `SELECT ua.attempt_date, ua.status, ua.points_earned, q.category, q.difficulty
             FROM user_attempts ua JOIN questions q ON ua.question_id=q.question_id
             WHERE ua.user_id=? ORDER BY ua.attempt_id DESC LIMIT 5`, [userId]
        );
        const [calRows] = await conn.query(
            `SELECT DATE_FORMAT(attempt_date,'%Y-%m-%d') as dateStr, COUNT(*) as count FROM user_attempts WHERE user_id=? GROUP BY dateStr`, [userId]
        );
        const [totals] = await conn.query(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status='correct' THEN 1 ELSE 0 END) as correct
             FROM user_attempts WHERE user_id=? AND status IN ('correct','wrong')`, [userId]
        );
        conn.release();

        const calendarMap = {};
        calRows.forEach(r => { calendarMap[r.dateStr] = r.count; });
        const total = totals[0].total, correct = totals[0].correct;

        const topics = ALL_CATEGORIES.map(cat => {
            const s = topicStats.find(t => t.category === cat);
            const tq = s?.total_attempted || 0, cq = s?.total_correct || 0;
            return { name: cat, progress: tq > 0 ? Number(((cq/tq)*100).toFixed(0)) : 0, total: tq, correct: cq };
        });

        res.json({
            profile: { name: u.user_name, email: u.email, bio: u.bio, profile_pic: u.profile_pic, joined: u.created_at, role: u.role },
            stats: { questionsAnswered: total, accuracy: total > 0 ? ((correct/total)*100).toFixed(0) : 0, streak: u.day_streak, score: u.score, level: u.level },
            topics, rank: rankRes[0].rank, activity, calendar: calendarMap
        });
    } catch (err) {
        console.error('[progress]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Update profile ─────────────────────────────────────────────
router.put('/update', isLoggedIn, async (req, res) => {
    const { bio, user_name } = req.body;
    try {
        await dbPool.query('UPDATE users SET bio=?, user_name=? WHERE user_id=?', [bio, user_name, req.user.user_id]);
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// ── Public profile ─────────────────────────────────────────────
router.get('/:id/public', async (req, res) => {
    try {
        const conn = await dbPool.getConnection();
        const [users] = await conn.query(
            'SELECT user_name, bio, profile_pic, score, level, day_streak, created_at FROM users WHERE user_id=?', [req.params.id]
        );
        if (!users.length) { conn.release(); return res.status(404).json({ error: 'Not found' }); }
        const u = users[0];

        const [topicStats] = await conn.query(
            `SELECT q.category, COUNT(ua.attempt_id) AS total_attempted,
             SUM(CASE WHEN ua.status='correct' THEN 1 ELSE 0 END) AS total_correct
             FROM user_attempts ua JOIN questions q ON ua.question_id=q.question_id
             WHERE ua.user_id=? AND ua.status IN ('correct','wrong') GROUP BY q.category`, [req.params.id]
        );
        const [totals] = await conn.query(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status='correct' THEN 1 ELSE 0 END) as correct
             FROM user_attempts WHERE user_id=? AND status IN ('correct','wrong')`, [req.params.id]
        );
        conn.release();

        const topics = ALL_CATEGORIES.map(cat => {
            const s = topicStats.find(t => t.category === cat);
            const tq = s?.total_attempted || 0, cq = s?.total_correct || 0;
            return { name: cat, progress: tq > 0 ? Number(((cq/tq)*100).toFixed(0)) : 0, total: tq, correct: cq };
        });

        res.json({
            name: u.user_name, bio: u.bio, profilePic: u.profile_pic,
            stats: { score: u.score, level: u.level, streak: u.day_streak,
                     solved: totals[0].correct||0,
                     accuracy: totals[0].total > 0 ? ((totals[0].correct/totals[0].total)*100).toFixed(0) : 0,
                     joined: u.created_at },
            topics
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;