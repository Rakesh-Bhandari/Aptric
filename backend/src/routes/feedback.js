import { Router } from 'express';
import dbPool from '../config/db.js';
import { isLoggedIn } from '../middleware/auth.js';

const router = Router();

// --- Submit feedback ---
router.post('/', isLoggedIn, async (req, res) => {
    const { rating, comment } = req.body;
    const userId = req.user.user_id;

    if (!rating || rating < 0.5 || rating > 5) {
        return res.status(400).json({ error: 'Please provide a valid rating (0.5 - 5.0).' });
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.query('INSERT INTO user_feedback (user_id, rating, comment) VALUES (?, ?, ?)', [userId, rating, comment || null]);
        res.status(201).json({ message: 'Feedback submitted successfully' });
    } catch (err) {
        console.error('Feedback error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Get all public feedback ---
router.get('/', async (req, res) => {
    try {
        const [rows] = await dbPool.query(`
            SELECT f.feedback_id, f.rating, f.comment, f.created_at, u.user_name, f.user_id 
            FROM user_feedback f
            JOIN users u ON f.user_id = u.user_id
            ORDER BY f.created_at DESC
            LIMIT 50
        `);
        res.json(rows);
    } catch (err) {
        console.error('Fetch feedback error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Update own feedback ---
router.put('/:id', isLoggedIn, async (req, res) => {
    const feedbackId = req.params.id;
    const { rating, comment } = req.body;
    const userId = req.user.user_id;

    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Valid rating required' });

    let conn;
    try {
        conn = await dbPool.getConnection();
        const [rows] = await conn.query('SELECT user_id FROM user_feedback WHERE feedback_id = ?', [feedbackId]);

        if (rows.length === 0) { return res.status(404).json({ error: 'Feedback not found' }); }
        if (rows[0].user_id !== userId) { return res.status(403).json({ error: 'Unauthorized action' }); }

        await conn.query('UPDATE user_feedback SET rating = ?, comment = ? WHERE feedback_id = ?', [rating, comment, feedbackId]);
        res.json({ message: 'Feedback updated successfully' });
    } catch (err) {
        console.error('Edit feedback error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Delete own feedback ---
router.delete('/:id', isLoggedIn, async (req, res) => {
    const feedbackId = req.params.id;
    const userId = req.user.user_id;

    let conn;
    try {
        conn = await dbPool.getConnection();
        const [rows] = await conn.query('SELECT user_id FROM user_feedback WHERE feedback_id = ?', [feedbackId]);

        if (rows.length === 0) { return res.status(404).json({ error: 'Not found' }); }
        if (rows[0].user_id !== userId) { return res.status(403).json({ error: 'Unauthorized' }); }

        await conn.query('DELETE FROM user_feedback WHERE feedback_id = ?', [feedbackId]);
        res.json({ message: 'Feedback deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Report feedback ---
router.post('/:id/report', isLoggedIn, async (req, res) => {
    const feedbackId = req.params.id;
    const userId = req.user.user_id;

    let conn;
    try {
        conn = await dbPool.getConnection();
        const [existing] = await conn.query(
            'SELECT * FROM feedback_reports WHERE feedback_id = ? AND reporter_user_id = ?',
            [feedbackId, userId]
        );
        if (existing.length > 0) { return res.status(400).json({ error: 'Already reported' }); }

        await conn.query('INSERT INTO feedback_reports (feedback_id, reporter_user_id) VALUES (?, ?)', [feedbackId, userId]);
        res.json({ message: 'Feedback reported' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

export default router;
