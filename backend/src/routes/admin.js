import { Router } from 'express';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import dbPool from '../config/db.js';
import { isAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/helpers.js';
import { generateQuestions, topUpQuestionBank } from '../services/questionBank.js';

const router = Router();

// --- Admin Stats ---
router.get('/stats', isAdmin, async (req, res) => {
    let conn;
    try {
        conn = await dbPool.getConnection();
        const [[{ total_users }]] = await conn.query('SELECT COUNT(*) as total_users FROM users');
        const [[{ total_questions }]] = await conn.query('SELECT COUNT(*) as total_questions FROM questions');
        const [[{ total_feedback }]] = await conn.query('SELECT COUNT(*) as total_feedback FROM user_feedback');
        const [[{ pending_reports }]] = await conn.query("SELECT COUNT(*) as pending_reports FROM feedback_reports WHERE status = 'pending'");
        res.json({ total_users, total_questions, total_feedback, pending_reports });
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

router.post('/users', isAdmin, async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserId = nanoid(12);
        const newUser = {
            user_id: newUserId, user_name: name, email,
            password_hash: hashedPassword, level: 'Beginner', role: role || 'user', created_at: new Date()
        };
        await dbPool.query('INSERT INTO users SET ?', newUser);
        await logActivity(dbPool, req.user.user_id, 'Admin Create User', `Created user ${newUserId} (${email}) with role ${role || 'user'}`);
        res.json({ message: 'User created successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

router.get('/users/:id', isAdmin, async (req, res) => {
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

router.put('/users/:id', isAdmin, async (req, res) => {
    const { user_name, email, role } = req.body;
    try {
        await dbPool.query('UPDATE users SET user_name = ?, email = ?, role = ? WHERE user_id = ?', [user_name, email, role, req.params.id]);
        await logActivity(dbPool, req.user.user_id, 'Admin Update User', `Updated user ${req.params.id} (name=${user_name}, email=${email}, role=${role})`);
        res.json({ message: 'User updated' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

router.post('/users/:id/promote', isAdmin, async (req, res) => {
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

router.post('/users/:id/ban-toggle', isAdmin, async (req, res) => {
    const { is_banned } = req.body;
    try {
        await dbPool.query('UPDATE users SET is_banned = ? WHERE user_id = ?', [is_banned, req.params.id]);
        await logActivity(dbPool, req.user.user_id, is_banned ? 'Admin Ban User' : 'Admin Unban User', `${is_banned ? 'Banned' : 'Unbanned'} user ${req.params.id}`);
        res.json({ message: `User ${is_banned ? 'banned' : 'unbanned'}` });
    } catch (err) {
        res.status(500).json({ error: 'Error toggling ban' });
    }
});

router.post('/users/:id/reset-password', isAdmin, async (req, res) => {
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

router.delete('/users/:id', isAdmin, async (req, res) => {
    try {
        await dbPool.query('DELETE FROM users WHERE user_id = ?', [req.params.id]);
        await logActivity(dbPool, req.user.user_id, 'Admin Delete User', `Deleted user ${req.params.id}`);
        res.json({ message: 'User deleted permanently' });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting user' });
    }
});

// --- Question Management ---
router.get('/questions', isAdmin, async (req, res) => {
    try {
        const [questions] = await dbPool.query('SELECT * FROM questions ORDER BY created_at DESC LIMIT 1000');
        res.json(questions);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching questions' });
    }
});

router.get('/questions/:id', isAdmin, async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT * FROM questions WHERE question_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Question not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching question' });
    }
});

router.put('/questions/:id', isAdmin, async (req, res) => {
    const { question_text, options, correct_answer_index, difficulty, category, hint, explanation } = req.body;
    try {
        await dbPool.query(
            'UPDATE questions SET question_text = ?, options = ?, correct_answer_index = ?, difficulty = ?, category = ?, hint = ?, explanation = ? WHERE question_id = ?',
            [question_text, JSON.stringify(options), correct_answer_index, difficulty, category, hint, explanation, req.params.id]
        );
        await logActivity(dbPool, req.user.user_id, 'Admin Update Question', `Updated question ${req.params.id}`);
        res.json({ message: 'Question updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

router.delete('/questions/:id', isAdmin, async (req, res) => {
    try {
        await dbPool.query('DELETE FROM questions WHERE question_id = ?', [req.params.id]);
        await logActivity(dbPool, req.user.user_id, 'Admin Delete Question', `Deleted question ${req.params.id}`);
        res.json({ message: 'Question deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting question' });
    }
});

// --- Question Generation ---
// Same top-up the cron job runs: fills any difficulty that is running low.
router.post('/generate-questions', isAdmin, async (req, res) => {
    try {
        const { generated } = await topUpQuestionBank(dbPool);
        const total = Object.values(generated).reduce((a, b) => a + b, 0);
        await logActivity(dbPool, req.user.user_id, 'Admin Generate Questions', `Generated ${total} questions`);
        res.json({ message: `Generated ${total} questions`, details: generated });
    } catch (err) {
        console.error('Generate Questions Error:', err);
        res.status(500).json({ error: 'Generation failed' });
    }
});

router.post('/generate-bulk', isAdmin, async (req, res) => {
    const { jobs } = req.body;

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: 'No generation jobs provided' });
    }

    const totalRequested = jobs.reduce((sum, job) => sum + (parseInt(job.count) || 0), 0);
    if (totalRequested > 100) {
        return res.status(400).json({ error: 'Max 100 questions per batch allowed.' });
    }

    try {
        let totalGenerated = 0;
        const results = [];

        for (const job of jobs) {
            const { category, difficulty, count, subTopic } = job;
            if (count > 0) {
                const countGen = await generateQuestions(dbPool, { category, difficulty, count: parseInt(count), subTopic });
                totalGenerated += countGen;
                results.push({ category, difficulty, generated: countGen });
            }
        }

        await logActivity(dbPool, req.user.user_id, 'Admin Generate Bulk', `Generated ${totalGenerated} questions in bulk`);
        res.json({ message: `Batch complete. Generated ${totalGenerated} questions.`, details: results });
    } catch (err) {
        console.error('Bulk Generation Error:', err);
        res.status(500).json({ error: 'Server error during generation' });
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

router.delete('/feedback/:id', isAdmin, async (req, res) => {
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

router.post('/reports/:id/dismiss', isAdmin, async (req, res) => {
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
