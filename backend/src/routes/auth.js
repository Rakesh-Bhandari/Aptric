// src/routes/auth.js
import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import dbPool from '../config/db.js';
import transporter from '../config/mailer.js';
import { ensureDailyQuestionsGenerated } from '../services/dailyQuestions.js';
import { isLoggedIn } from '../middleware/auth.js';
import { setAuthCookie, clearAuthCookie } from '../utils/jwt.js';
import { getTodayDate } from '../utils/helpers.js';

const router = Router();
const FRONTEND = () => process.env.VITE_FRONTEND_URL;

// ── Google OAuth ───────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/login/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user) => {
        if (err || !user) {
            console.error('[OAuth callback]', err?.message);
            return res.redirect(`${FRONTEND()}/?auth_error=oauth_failed`);
        }

        // Set JWT cookie — works across all Vercel invocations
        setAuthCookie(res, user.user_id);

        // Generate daily questions in background (don't await — avoid timeout)
        ensureDailyQuestionsGenerated(user, dbPool).catch(console.error);

        return res.redirect(`${FRONTEND()}/practice`);
    })(req, res, next);
});

router.get('/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ message: 'Logged out' });
});

// ── Email/Password Login ───────────────────────────────────────
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await dbPool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });

        await dbPool.query('UPDATE users SET last_login = ? WHERE user_id = ?', [new Date(), user.user_id]);

        // Set JWT cookie
        setAuthCookie(res, user.user_id);

        // Generate daily questions in background
        ensureDailyQuestionsGenerated(user, dbPool).catch(console.error);

        res.json({ user_id: user.user_id, name: user.user_name });
    } catch (err) {
        console.error('[login]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;
    if (!name) return res.status(400).json({ error: 'Display name required' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });

    try {
        const token = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserId = nanoid(12);

        await dbPool.query('INSERT INTO users SET ?', {
            user_id: newUserId, user_name: name, email,
            password_hash: hashedPassword,
            verification_token: token,
            is_verified: false,
            answered_qids: JSON.stringify([])
        });

        try {
            await transporter.sendMail({
                to: email,
                subject: 'Activate Your Account',
                html: `<h3>Welcome ${name}!</h3>
                       <p>Click <a href="${FRONTEND()}/activate/${token}">here</a> to activate your account.</p>`
            });
        } catch (mailErr) {
            console.error('[signup] mail failed:', mailErr.message);
        }

        res.status(201).json({ message: 'Registration successful. Check your email to activate.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already registered' });
        console.error('[signup]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Forgot Password ────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const [[user]] = await dbPool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'Email not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60000);
    await dbPool.query('UPDATE users SET otp_code = ?, otp_expires = ? WHERE email = ?', [otp, expires, email]);

    try {
        await transporter.sendMail({
            to: email,
            subject: 'Password Reset OTP',
            text: `Your OTP is: ${otp}. Expires in 10 minutes.`
        });
    } catch (e) { console.error('[forgot-password] mail:', e.message); }

    res.json({ message: 'OTP sent' });
});

// ── Reset Password ─────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const conn = await dbPool.getConnection();
        const [[user]] = await conn.query('SELECT user_id, otp_code, otp_expires FROM users WHERE email = ?', [email]);
        if (!user) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
        if (user.otp_code !== otp || new Date() > new Date(user.otp_expires)) {
            conn.release(); return res.status(400).json({ error: 'INVALID_OR_EXPIRED_OTP' });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        await conn.query('UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires = NULL WHERE email = ?', [hash, email]);
        conn.release();
        res.json({ message: 'PASSWORD_RESET_SUCCESSFUL' });
    } catch (err) {
        console.error('[reset-password]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Email Verification ─────────────────────────────────────────
router.get('/verify/:token', async (req, res) => {
    try {
        const conn = await dbPool.getConnection();
        const [users] = await conn.query('SELECT * FROM users WHERE verification_token = ?', [req.params.token]);
        if (!users.length) {
            conn.release();
            return res.status(400).json({ error: 'Token invalid or already used' });
        }

        const user = users[0];
        await conn.query('UPDATE users SET is_verified = true, verification_token = NULL WHERE user_id = ?', [user.user_id]);
        conn.release();

        // Set JWT cookie
        setAuthCookie(res, user.user_id);

        // Generate questions in background
        ensureDailyQuestionsGenerated(user, dbPool).catch(console.error);

        res.json({
            message: 'Account activated.',
            user: { id: user.user_id, name: user.user_name },
            status: 'generating'
        });
    } catch (err) {
        console.error('[verify]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Activation status polling ──────────────────────────────────
router.get('/activation-status', isLoggedIn, async (req, res) => {
    try {
        const conn = await dbPool.getConnection();
        const today = getTodayDate();
        const [[log]] = await conn.query(
            'SELECT log_id FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
            [req.user.user_id, today]
        );
        conn.release();
        if (log) {
            return res.json({ status: 'complete', progress: 10, total: 10, message: 'Questions ready!' });
        }
        res.json({ status: 'generating', progress: 0, total: 10, message: 'Still preparing...' });
    } catch (err) {
        res.status(500).json({ error: 'Status check failed' });
    }
});

export default router;