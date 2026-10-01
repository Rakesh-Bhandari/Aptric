import { Router } from 'express';
import dbPool from '../config/db.js';
import { STREAK_LOSS } from '../utils/helpers.js';
import { topUpQuestionBank } from '../services/questionBank.js';

const router = Router();

const isCronRequest = (req) => req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;

// Called daily at midnight by Vercel Cron
router.get('/streak-check', async (req, res) => {
    if (!isCronRequest(req)) {
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

// Called by Vercel Cron. Keeps AI generation out of the request path:
// tops up any difficulty with fewer than QUESTION_BANK_MIN_UNUSED unused questions.
router.get('/question-bank', async (req, res) => {
    if (!isCronRequest(req)) {
        return res.status(401).end('Unauthorized');
    }

    try {
        const result = await topUpQuestionBank(dbPool);
        console.log('[cron/question-bank]', JSON.stringify(result));
        res.status(200).json(result);
    } catch (e) {
        console.error('[cron/question-bank]', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
