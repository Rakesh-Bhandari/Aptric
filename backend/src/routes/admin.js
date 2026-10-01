import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import dbPool from '../config/db.js';
import { isAdmin } from '../middleware/auth.js';
import { logActivity, makeHandle } from '../utils/helpers.js';
import {
    topUpQuestionBank, createGenerationJob, formatJob, questionHash, QUESTION_STATUSES,
} from '../services/questionBank.js';
import { bulkGenerateLimiter } from '../middleware/rateLimit.js';
import {
    validate, email, password, displayName, role, category, difficulty, userIdParams, numericIdParams,
} from '../middleware/validate.js';

const router = Router();

const createUserSchema = z.object({ name: displayName, email, password, role: role.default('user') });
const updateUserSchema = z.object({ user_name: displayName, email, role });
const banToggleSchema = z.object({ is_banned: z.boolean({ error: 'is_banned must be true or false' }) });
const resetPasswordSchema = z.object({ newPassword: password });

const optionalText = (label, max) => z.string({ error: `${label} must be text` })
    .max(max, `${label} must be at most ${max} characters`).nullable().default('');

const updateQuestionSchema = z.object({
    question_text: z.string({ error: 'Question text is required' }).trim()
        .min(1, 'Question text is required').max(2000, 'Question text must be at most 2000 characters'),
    options: z.array(
        z.string({ error: 'Each option must be text' }).trim()
            .min(1, 'Options cannot be empty').max(500, 'Each option must be at most 500 characters'),
        { error: 'Options must be a list' }
    ).min(2, 'At least 2 options are required').max(6, 'At most 6 options are allowed'),
    correct_answer_index: z.number({ error: 'Correct answer index is required' }).int('Invalid answer index').min(0, 'Invalid answer index'),
    difficulty,
    category,
    hint: optionalText('Hint', 1000),
    explanation: optionalText('Explanation', 4000),
}).refine((q) => q.correct_answer_index < q.options.length, {
    message: 'Correct answer index must point to one of the options',
    path: ['correct_answer_index'],
});

const questionListQuery = z.object({
    status: z.enum([...QUESTION_STATUSES, 'all'], { error: `Status must be one of: ${QUESTION_STATUSES.join(', ')}, all` }).default('all'),
});

const MAX_BULK_QUESTIONS = 100;
const generateBulkSchema = z.object({
    jobs: z.array(z.object({
        category,
        difficulty,
        count: z.coerce.number({ error: 'Count must be a number' }).int('Count must be a whole number')
            .min(1, 'Count must be at least 1').max(MAX_BULK_QUESTIONS, `Count must be at most ${MAX_BULK_QUESTIONS}`),
        subTopic: z.string({ error: 'Sub-topic must be text' }).trim().max(100, 'Sub-topic must be at most 100 characters').optional().default(''),
    }), { error: 'No generation jobs provided' }).min(1, 'No generation jobs provided'),
}).refine((b) => b.jobs.reduce((sum, j) => sum + j.count, 0) <= MAX_BULK_QUESTIONS, {
    message: `Max ${MAX_BULK_QUESTIONS} questions per batch allowed.`,
    path: ['jobs'],
});

// --- Admin Stats ---
router.get('/stats', isAdmin, async (req, res) => {
    let conn;
    try {
        conn = await dbPool.getConnection();
        const [[{ total_users }]] = await conn.query('SELECT COUNT(*) as total_users FROM users');
        const [[{ total_questions }]] = await conn.query("SELECT COUNT(*) as total_questions FROM questions WHERE status = 'published'");
        const [[{ draft_questions }]] = await conn.query("SELECT COUNT(*) as draft_questions FROM questions WHERE status = 'draft'");
        const [[{ total_feedback }]] = await conn.query('SELECT COUNT(*) as total_feedback FROM user_feedback');
        const [[{ pending_reports }]] = await conn.query("SELECT COUNT(*) as pending_reports FROM feedback_reports WHERE status = 'pending'");
        res.json({ total_users, total_questions, draft_questions, total_feedback, pending_reports });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching stats' });
    } finally {
        if (conn) conn.release();
    }
});

// --- User Management ---
router.get('/users', isAdmin, async (req, res) => {
    try {
        const [users] = await dbPool.query(
            'SELECT user_id, user_name, email, score, role, is_banned, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching users' });
    }
});

router.post('/users', isAdmin, validate({ body: createUserSchema }), async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserId = nanoid(12);
        const newUser = {
            user_id: newUserId, user_name: name, handle: makeHandle(name), email,
            password_hash: hashedPassword, is_verified: true, level: 'Beginner', role, created_at: new Date()
        };
        await dbPool.query('INSERT INTO users SET ?', newUser);
        await logActivity(dbPool, req.user.user_id, 'Admin Create User', `Created user ${newUserId} (${email}) with role ${role}`);
        res.json({ message: 'User created successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

router.get('/users/:id', isAdmin, validate({ params: userIdParams }), async (req, res) => {
    try {
        const [users] = await dbPool.query(
            'SELECT user_id, user_name, email, score, level, day_streak, role, is_banned, created_at, last_login FROM users WHERE user_id = ?',
            [req.params.id]
        );
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const [logs] = await dbPool.query(
            'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [req.params.id]
        );
        res.json({ ...users[0], logs });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching user' });
    }
});

router.put('/users/:id', isAdmin, validate({ params: userIdParams, body: updateUserSchema }), async (req, res) => {
    const { user_name, email, role } = req.body;
    try {
        await dbPool.query('UPDATE users SET user_name = ?, email = ?, role = ? WHERE user_id = ?', [user_name, email, role, req.params.id]);
        await logActivity(dbPool, req.user.user_id, 'Admin Update User', `Updated user ${req.params.id} (name=${user_name}, email=${email}, role=${role})`);
        res.json({ message: 'User updated' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

router.post('/users/:id/promote', isAdmin, validate({ params: userIdParams }), async (req, res) => {
    const userId = req.params.id;
    const levels = ['Beginner', 'Intermediate', 'Advanced', 'Pro', 'Expert'];
    const levelThresholds = { 'Intermediate': 25001, 'Advanced': 50001, 'Pro': 75001, 'Expert': 100001 };
    let conn;

    try {
        conn = await dbPool.getConnection();
        const [users] = await conn.query('SELECT level, score FROM users WHERE user_id = ?', [userId]);

        if (users.length === 0) { return res.status(404).json({ error: 'User not found' }); }

        const currentLevel = users[0].level;
        const currentScore = users[0].score;
        const currentIndex = levels.indexOf(currentLevel);

        if (currentIndex === -1 || currentIndex === levels.length - 1) {
            return res.status(400).json({ error: 'User is already at max level or invalid level' });
        }

        const newLevel = levels[currentIndex + 1];
        const newMinScore = levelThresholds[newLevel];

        let query = 'UPDATE users SET level = ?';
        let params = [newLevel];
        if (currentScore < newMinScore) { query += ', score = ?'; params.push(newMinScore); }
        query += ' WHERE user_id = ?';
        params.push(userId);

        await conn.query(query, params);
        await logActivity(dbPool, req.user.user_id, 'Admin Promote User', `Promoted user ${userId} to ${newLevel}`);

        res.json({ message: `User promoted to ${newLevel}`, newLevel });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

router.post('/users/:id/ban-toggle', isAdmin, validate({ params: userIdParams, body: banToggleSchema }), async (req, res) => {
    const { is_banned } = req.body;
    try {
        await dbPool.query('UPDATE users SET is_banned = ? WHERE user_id = ?', [is_banned, req.params.id]);
        await logActivity(dbPool, req.user.user_id, is_banned ? 'Admin Ban User' : 'Admin Unban User', `${is_banned ? 'Banned' : 'Unbanned'} user ${req.params.id}`);
        res.json({ message: `User ${is_banned ? 'banned' : 'unbanned'}` });
    } catch (err) {
        res.status(500).json({ error: 'Error toggling ban' });
    }
});

router.post('/users/:id/reset-password', isAdmin, validate({ params: userIdParams, body: resetPasswordSchema }), async (req, res) => {
    const { newPassword } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await dbPool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hashedPassword, req.params.id]);
        await logActivity(dbPool, req.user.user_id, 'Admin Reset Password', `Reset password for user ${req.params.id}`);
        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error resetting password' });
    }
});

router.delete('/users/:id', isAdmin, validate({ params: userIdParams }), async (req, res) => {
    try {
        await dbPool.query('DELETE FROM users WHERE user_id = ?', [req.params.id]);
        await logActivity(dbPool, req.user.user_id, 'Admin Delete User', `Deleted user ${req.params.id}`);
        res.json({ message: 'User deleted permanently' });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting user' });
    }
});

// --- Question Management ---
router.get('/questions', isAdmin, validate({ query: questionListQuery }), async (req, res) => {
    const { status } = req.valid.query;
    try {
        const [questions] = status === 'all'
            ? await dbPool.query('SELECT * FROM questions ORDER BY created_at DESC LIMIT 1000')
            : await dbPool.query('SELECT * FROM questions WHERE status = ? ORDER BY created_at DESC LIMIT 1000', [status]);
        res.json(questions);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching questions' });
    }
});

router.get('/questions/:id', isAdmin, validate({ params: numericIdParams }), async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT * FROM questions WHERE question_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Question not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching question' });
    }
});

router.put('/questions/:id', isAdmin, validate({ params: numericIdParams, body: updateQuestionSchema }), async (req, res) => {
    const { question_text, options, correct_answer_index, difficulty, category, hint, explanation } = req.body;
    try {
        await dbPool.query(
            'UPDATE questions SET question_text = ?, question_hash = ?, options = ?, correct_answer_index = ?, difficulty = ?, category = ?, hint = ?, explanation = ? WHERE question_id = ?',
            [question_text, questionHash(question_text), JSON.stringify(options), correct_answer_index, difficulty, category, hint, explanation, req.params.id]
        );
        await logActivity(dbPool, req.user.user_id, 'Admin Update Question', `Updated question ${req.params.id}`);
        res.json({ message: 'Question updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Another question already has this text', fields: { question_text: 'Duplicate question' } });
        }
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

// Review: drafts (and previously rejected questions) can be published; only
// drafts can be rejected. Published questions may already sit in users' daily
// sets, so they are deleted rather than unpublished.
const reviewTransitions = {
    approve: { to: 'published', from: ['draft', 'rejected'], action: 'Admin Approve Question' },
    reject: { to: 'rejected', from: ['draft'], action: 'Admin Reject Question' },
};

for (const [verb, { to, from, action }] of Object.entries(reviewTransitions)) {
    router.post(`/questions/:id/${verb}`, isAdmin, validate({ params: numericIdParams }), async (req, res) => {
        try {
            const [result] = await dbPool.query(
                'UPDATE questions SET status = ? WHERE question_id = ? AND status IN (?)',
                [to, req.params.id, from]
            );
            if (result.affectedRows === 0) {
                const [[row]] = await dbPool.query('SELECT status FROM questions WHERE question_id = ?', [req.params.id]);
                if (!row) return res.status(404).json({ error: 'Question not found' });
                return res.status(409).json({ error: `Cannot ${verb} a ${row.status} question` });
            }
            await logActivity(dbPool, req.user.user_id, action, `Set question ${req.params.id} to ${to}`);
            res.json({ message: `Question ${to}`, status: to });
        } catch (err) {
            console.error(`${action} error:`, err);
            res.status(500).json({ error: `Failed to ${verb} question` });
        }
    });
}

router.delete('/questions/:id', isAdmin, validate({ params: numericIdParams }), async (req, res) => {
    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();
        // The delete cascades to user_attempts; take those answers back out of the
        // users.questions_solved / questions_attempted counters first.
        await conn.query(
            `UPDATE users u JOIN (
                SELECT user_id, SUM(status = 'correct') AS solved, SUM(status IN ('correct', 'wrong')) AS attempted
                FROM user_attempts WHERE question_id = ? GROUP BY user_id
             ) a ON a.user_id = u.user_id
             SET u.questions_solved = GREATEST(u.questions_solved - a.solved, 0),
                 u.questions_attempted = GREATEST(u.questions_attempted - a.attempted, 0)`,
            [req.params.id]
        );
        await conn.query('DELETE FROM questions WHERE question_id = ?', [req.params.id]);
        await conn.commit();
        await logActivity(dbPool, req.user.user_id, 'Admin Delete Question', `Deleted question ${req.params.id}`);
        res.json({ message: 'Question deleted' });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: 'Error deleting question' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Question Generation ---
// Generation is asynchronous: these endpoints only queue a job, which
// /api/cron/generation-jobs processes in chunks. Poll /generation-jobs for progress.
// New questions are saved as drafts and need approval before users see them.

// Same top-up the daily cron runs: queues a job for any difficulty running low.
router.post('/generate-questions', isAdmin, async (req, res) => {
    try {
        const { queued, jobId, alreadyQueued } = await topUpQuestionBank(dbPool, { createdBy: req.user.user_id });
        if (alreadyQueued) return res.json({ message: `A top-up job (#${jobId}) is already in progress`, jobId });
        if (!jobId) return res.json({ message: 'Question bank is already topped up', jobId: null });
        const total = Object.values(queued).reduce((a, b) => a + b, 0);
        await logActivity(dbPool, req.user.user_id, 'Admin Generate Questions', `Queued top-up job ${jobId} for ${total} questions`);
        res.status(202).json({ message: `Queued ${total} questions (job #${jobId})`, jobId, details: queued });
    } catch (err) {
        console.error('Generate Questions Error:', err);
        res.status(500).json({ error: 'Failed to queue generation' });
    }
});

router.post('/generate-bulk', isAdmin, bulkGenerateLimiter, validate({ body: generateBulkSchema }), async (req, res) => {
    const { jobs } = req.body;
    try {
        const jobId = await createGenerationJob(dbPool, jobs, { createdBy: req.user.user_id });
        const total = jobs.reduce((sum, j) => sum + j.count, 0);
        await logActivity(dbPool, req.user.user_id, 'Admin Generate Bulk', `Queued bulk job ${jobId} for ${total} questions`);
        res.status(202).json({ message: `Queued ${total} questions (job #${jobId}). New questions arrive as drafts.`, jobId });
    } catch (err) {
        console.error('Bulk Generation Error:', err);
        res.status(500).json({ error: 'Failed to queue generation' });
    }
});

router.get('/generation-jobs', isAdmin, async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT * FROM question_generation_jobs ORDER BY job_id DESC LIMIT 10');
        res.json(rows.map(formatJob));
    } catch (err) {
        console.error('Fetch generation jobs error:', err);
        res.status(500).json({ error: 'Error fetching generation jobs' });
    }
});

router.get('/generation-jobs/:id', isAdmin, validate({ params: numericIdParams }), async (req, res) => {
    try {
        const [[row]] = await dbPool.query('SELECT * FROM question_generation_jobs WHERE job_id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Job not found' });
        res.json(formatJob(row));
    } catch (err) {
        res.status(500).json({ error: 'Error fetching generation job' });
    }
});

// --- Feedback Management ---
router.get('/feedback', isAdmin, async (req, res) => {
    try {
        const [rows] = await dbPool.query(`
            SELECT f.feedback_id, f.rating, f.comment, f.created_at, u.user_name 
            FROM user_feedback f
            JOIN users u ON f.user_id = u.user_id
            ORDER BY f.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Fetch all feedback error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/feedback/:id', isAdmin, validate({ params: numericIdParams }), async (req, res) => {
    try {
        await dbPool.query('DELETE FROM user_feedback WHERE feedback_id = ?', [req.params.id]);
        await logActivity(dbPool, req.user.user_id, 'Admin Delete Feedback', `Deleted feedback ${req.params.id}`);
        res.json({ message: 'Feedback deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/feedback-reports', isAdmin, async (req, res) => {
    try {
        const [reports] = await dbPool.query(
            `SELECT r.report_id, r.feedback_id, r.status, f.comment, f.rating
             FROM feedback_reports r
             JOIN user_feedback f ON r.feedback_id = f.feedback_id
             WHERE r.status = 'pending'`
        );
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching reports' });
    }
});

router.post('/reports/:id/dismiss', isAdmin, validate({ params: numericIdParams }), async (req, res) => {
    try {
        const [result] = await dbPool.query(
            "UPDATE feedback_reports SET status = 'dismissed' WHERE report_id = ?",
            [req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Report not found' });
        await logActivity(dbPool, req.user.user_id, 'Admin Dismiss Report', `Dismissed report ${req.params.id}`);
        res.json({ message: 'Report dismissed' });
    } catch (err) {
        res.status(500).json({ error: 'Error dismissing report' });
    }
});

export default router;
