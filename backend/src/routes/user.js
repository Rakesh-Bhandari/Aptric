import { Router } from 'express';
import dbPool from '../config/db.js';
import { upload } from '../config/cloudinary.js';
import { isLoggedIn } from '../middleware/auth.js';
import { ALL_CATEGORIES } from '../utils/helpers.js';

const router = Router();

// --- Get current user (basic) ---
router.get('/', isLoggedIn, (req, res) => {
    const { user_id, user_name, email, score, level, day_streak, last_login, is_banned } = req.user;
    res.json({
        authenticated: true,
        user: { id: user_id, name: user_name, email, score, level, streak: day_streak, lastLogin: last_login, is_banned }
    });
});

// --- Upload avatar ---
router.post('/avatar', isLoggedIn, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const userId = req.user.user_id;
        const fileUrl = req.file.path;
        await dbPool.query('UPDATE users SET profile_pic = ? WHERE user_id = ?', [fileUrl, userId]);
        res.json({ message: 'Avatar updated', url: fileUrl });
    } catch (err) {
        console.error('Cloudinary upload error:', err);
        res.status(500).json({ error: 'Server error during cloud upload' });
    }
});

// --- Get user progress / dashboard ---
router.get('/progress', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;

    try {
        const conn = await dbPool.getConnection();

        const [userRows] = await conn.query(
            'SELECT email, user_name, bio, profile_pic, score, level, day_streak, created_at, role FROM users WHERE user_id = ?',
            [userId]
        );
        const userInfo = userRows[0];

        const [rankResult] = await conn.query('SELECT COUNT(*) + 1 as `rank` FROM users WHERE score > ?', [userInfo.score]);
        const userRank = rankResult[0].rank;

        const [topicStats] = await conn.query(
            `SELECT q.category,
              COUNT(ua.attempt_id) AS total_attempted,
              SUM(CASE WHEN ua.status = 'correct' THEN 1 ELSE 0 END) AS total_correct
            FROM user_attempts ua
            JOIN questions q ON ua.question_id = q.question_id
            WHERE ua.user_id = ? AND ua.status IN ('correct', 'wrong')
            GROUP BY q.category`,
            [userId]
        );

        const [recentActivity] = await conn.query(
            `SELECT ua.attempt_date, ua.status, ua.points_earned, q.category, q.difficulty 
            FROM user_attempts ua
            JOIN questions q ON ua.question_id = q.question_id
            WHERE ua.user_id = ?
            ORDER BY ua.attempt_id DESC LIMIT 5`,
            [userId]
        );

        const [calendarRows] = await conn.query(
            `SELECT DATE_FORMAT(attempt_date, '%Y-%m-%d') as dateStr, COUNT(*) as count 
            FROM user_attempts WHERE user_id = ? GROUP BY dateStr`,
            [userId]
        );

        const calendarMap = {};
        calendarRows.forEach(row => { calendarMap[row.dateStr] = row.count; });

        const [totalAnswered] = await conn.query(
            `SELECT COUNT(*) as count FROM user_attempts WHERE user_id = ? AND status IN ('correct', 'wrong')`,
            [userId]
        );
        const [totalCorrect] = await conn.query(
            `SELECT COUNT(*) as count FROM user_attempts WHERE user_id = ? AND status = 'correct'`,
            [userId]
        );

        conn.release();

        const total = totalAnswered[0].count;
        const correct = totalCorrect[0].count;

        const topics = ALL_CATEGORIES.map(category => {
            const stats = topicStats.find(t => t.category === category);
            const totalQs = stats ? stats.total_attempted : 0;
            const correctQs = stats ? stats.total_correct : 0;
            return {
                name: category,
                progress: totalQs > 0 ? Number(((correctQs / totalQs) * 100).toFixed(0)) : 0,
                total: totalQs,
                correct: correctQs
            };
        });

        res.json({
            profile: {
                name: userInfo.user_name,
                email: userInfo.email,
                bio: userInfo.bio,
                profile_pic: userInfo.profile_pic,
                joined: userInfo.created_at,
                role: userInfo.role
            },
            stats: {
                questionsAnswered: total,
                accuracy: total > 0 ? ((correct / total) * 100).toFixed(0) : 0,
                streak: userInfo.day_streak,
                score: userInfo.score,
                level: userInfo.level
            },
            topics,
            rank: userRank,
            activity: recentActivity,
            calendar: calendarMap
        });
    } catch (err) {
        console.error('Error fetching profile data:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Update profile ---
router.put('/update', isLoggedIn, async (req, res) => {
    const { bio, user_name } = req.body;
    const userId = req.user.user_id;

    try {
        const conn = await dbPool.getConnection();
        await conn.query('UPDATE users SET bio = ?, user_name = ? WHERE user_id = ?', [bio, user_name, userId]);
        conn.release();
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// --- Public user profile ---
router.get('/:id/public', async (req, res) => {
    const targetUserId = req.params.id;
    try {
        const conn = await dbPool.getConnection();

        const [users] = await conn.query(
            'SELECT user_name, bio, profile_pic, score, level, day_streak, created_at FROM users WHERE user_id = ?',
            [targetUserId]
        );
        if (users.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
        const user = users[0];

        const [topicStats] = await conn.query(
            `SELECT q.category,
            COUNT(ua.attempt_id) AS total_attempted,
            SUM(CASE WHEN ua.status = 'correct' THEN 1 ELSE 0 END) AS total_correct
            FROM user_attempts ua
            JOIN questions q ON ua.question_id = q.question_id
            WHERE ua.user_id = ? AND ua.status IN ('correct', 'wrong')
            GROUP BY q.category`,
            [targetUserId]
        );

        const [totals] = await conn.query(
            `SELECT COUNT(*) as total, 
             SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) as correct 
             FROM user_attempts WHERE user_id = ? AND status IN ('correct', 'wrong')`,
            [targetUserId]
        );

        conn.release();

        const topics = ALL_CATEGORIES.map(category => {
            const stats = topicStats.find(t => t.category === category);
            const totalQs = stats ? stats.total_attempted : 0;
            const correctQs = stats ? stats.total_correct : 0;
            return {
                name: category,
                progress: totalQs > 0 ? Number(((correctQs / totalQs) * 100).toFixed(0)) : 0,
                total: totalQs,
                correct: correctQs
            };
        });

        res.json({
            name: user.user_name,
            bio: user.bio,
            profilePic: user.profile_pic,
            stats: {
                score: user.score,
                level: user.level,
                streak: user.day_streak,
                solved: totals[0].correct || 0,
                accuracy: totals[0].total > 0 ? ((totals[0].correct / totals[0].total) * 100).toFixed(0) : 0,
                joined: user.created_at
            },
            topics
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
