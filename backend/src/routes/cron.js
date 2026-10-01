import { Router } from 'express';
import dbPool from '../config/db.js';
import { getYesterdayDate } from '../utils/helpers.js';
import { topUpQuestionBank } from '../services/questionBank.js';

const router = Router();

const isCronRequest = (req) => req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;

// Called daily just after midnight Asia/Kolkata by Vercel Cron.
// Breaks the streak of anyone whose last streak day is before yesterday, i.e.
// who answered none of their daily questions yesterday. Idempotent, no score penalty.
router.get('/streak-check', async (req, res) => {
    if (!isCronRequest(req)) {
        return res.status(401).end('Unauthorized');
    }

    try {
        const [result] = await dbPool.query(
            'UPDATE users SET day_streak = 0 WHERE day_streak > 0 AND (last_streak_date IS NULL OR last_streak_date < ?)',
            [getYesterdayDate()]
        );
        console.log('[cron/streak-check] reset', result.affectedRows);
        res.status(200).json({ reset: result.affectedRows });
    } catch (e) {
        console.error('[cron/streak-check]', e);
        res.status(500).json({ error: e.message });
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
