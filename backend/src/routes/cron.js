import { Router } from 'express';
import dbPool from '../config/db.js';
import { STREAK_LOSS } from '../utils/helpers.js';

const router = Router();

// Called daily at midnight by Vercel Cron
router.get('/streak-check', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).end('Unauthorized');
    }

    console.log('Running daily streak check via Vercel Cron...');
    const conn = await dbPool.getConnection();
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];

        const [users] = await conn.query(
            'SELECT user_id, day_streak FROM users WHERE last_login < ? AND day_streak > 0',
            [yStr]
        );

        for (const u of users) {
            const penalty = u.day_streak * STREAK_LOSS;
            await conn.query(
                'UPDATE users SET day_streak = 0, score = score + ? WHERE user_id = ?',
                [penalty, u.user_id]
            );
        }

        res.status(200).json({ processed: users.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});

export default router;
