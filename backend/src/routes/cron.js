import { Router } from 'express';
import dbPool from '../config/db.js';
import { getYesterdayDate } from '../utils/helpers.js';
import { topUpQuestionBank, processGenerationJobs } from '../services/questionBank.js';

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

// Called daily by Vercel Cron. Queues a generation job for any difficulty with
// fewer than QUESTION_BANK_MIN_UNUSED unused questions; /generation-jobs runs it.
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

// Called daily by Vercel Cron (Hobby plans allow daily crons only); can also be
// triggered more often by an external scheduler with the CRON_SECRET bearer token. Works through queued generation jobs
// (admin bulk requests and top-ups) one AI batch at a time within a time budget,
// so no single invocation approaches the function timeout.
router.get('/generation-jobs', async (req, res) => {
    if (!isCronRequest(req)) {
        return res.status(401).end('Unauthorized');
    }

    try {
        const result = await processGenerationJobs(dbPool);
        if (result.chunks > 0) console.log('[cron/generation-jobs]', JSON.stringify(result));
        res.status(200).json(result);
    } catch (e) {
        console.error('[cron/generation-jobs]', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
