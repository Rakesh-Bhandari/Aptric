import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import dbPool from '../config/db.js';
import transporter from '../config/mailer.js';
import { ensureDailyQuestionsGenerated, updateActivationStatus, getActivationStatus } from '../services/dailyQuestions.js';
import { isLoggedIn } from '../middleware/auth.js';
import { getTodayDate } from '../utils/helpers.js';

const router = Router();

// --- Google OAuth ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/login/callback', (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) {
            console.error('Auth Callback Error:', err);
            return res.redirect(`${process.env.VITE_FRONTEND_URL}/?auth_error=session_collision`);
        }
        if (!user) return res.redirect(`${process.env.VITE_FRONTEND_URL}/?auth_error=no_user`);

        req.logIn(user, async (loginErr) => {
            if (loginErr) return next(loginErr);

            // ✅ CRITICAL: explicitly save session to TiDB BEFORE redirecting.
            // On Vercel serverless, without this the redirect fires before the
            // session write completes, so the next request finds no session → 401.
            req.session.save(async (saveErr) => {
                if (saveErr) {
                    console.error('[OAuth] Session save error:', saveErr);
                    return res.redirect(`${process.env.VITE_FRONTEND_URL}/?auth_error=session_error`);
                }
                // Generate daily questions in background — don't await (avoid timeout)
                ensureDailyQuestionsGenerated(req.user, dbPool).catch(console.error);
                return res.redirect(`${process.env.VITE_FRONTEND_URL}/practice`);
            });
        });
    })(req, res, next);
});

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        req.session.destroy();
        res.clearCookie('aptric_sid');
        res.json({ message: 'Logged out' });
    });
});

// --- Email/Password Signup ---
router.post('/signup', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    if (!name) return res.status(400).json({ error: 'Display Name is required for registration.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });

    try {
        const token = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserId = nanoid(12);

        const newUser = {
            user_id: newUserId,
            user_name: name,
            email,
            password_hash: hashedPassword,
            verification_token: token,
            is_verified: false,
            answered_qids: JSON.stringify([])
        };

        await dbPool.query('INSERT INTO users SET ?', newUser);

        try {
            const activationLink = `${process.env.VITE_FRONTEND_URL}/activate/${token}`;
            await transporter.sendMail({
                to: email,
                subject: 'Activate Your Account',
                html: `<h3>Welcome ${name}!</h3>
                       <p>Please click <a href="${activationLink}">here</a> to activate your account.</p>`
            });
        } catch (mailError) {
            console.error('Mail failed, but user was created:', mailError);
        }

        res.status(201).json({ message: 'Registration successful. Please check your email to activate.' });
    } catch (err) {
        console.error('Signup Error:', err);
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'This email is already registered.' });
        res.status(500).json({ error: 'System error during registration.' });
    }
});

// --- Email/Password Login ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await dbPool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.is_banned) return res.status(403).json({ error: 'Banned' });

        await dbPool.query('UPDATE users SET last_login = ? WHERE user_id = ?', [new Date(), user.user_id]);

        req.login(user, async (err) => {
            if (err) return res.status(500).json({ error: 'Login error' });

            // ✅ CRITICAL: save session to TiDB before sending response.
            // Without this on Vercel, the JSON response arrives at the
            // frontend before the session row exists in the DB → next
            // request gets 401 even though login appeared to succeed.
            req.session.save(async (saveErr) => {
                if (saveErr) {
                    console.error('[Login] Session save error:', saveErr);
                    return res.status(500).json({ error: 'Session save failed' });
                }
                // Generate daily questions in background
                ensureDailyQuestionsGenerated(user, dbPool).catch(console.error);
                res.json({ user_id: user.user_id, name: user.user_name });
            });
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Forgot Password ---
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const [[user]] = await dbPool.query('SELECT user_id FROM users WHERE email = ?', [email]);

    if (!user) return res.status(404).json({ error: 'Email not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60000);

    await dbPool.query('UPDATE users SET otp_code = ?, otp_expires = ? WHERE email = ?', [otp, expires, email]);

    await transporter.sendMail({
        to: email,
        subject: 'Your Password Reset OTP',
        text: `Your OTP is: ${otp}. It expires in 10 minutes.`
    });

    res.json({ message: 'OTP sent to your email.' });
});

// --- Reset Password ---
router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;

    try {
        const conn = await dbPool.getConnection();
        const [[user]] = await conn.query('SELECT user_id, otp_code, otp_expires FROM users WHERE email = ?', [email]);

        if (!user) { conn.release(); return res.status(404).json({ error: 'User not found.' }); }

        const now = new Date();
        if (user.otp_code !== otp || now > new Date(user.otp_expires)) {
            conn.release();
            return res.status(400).json({ error: 'INVALID_OR_EXPIRED_OTP' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await conn.query(
            'UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires = NULL WHERE email = ?',
            [hashedPassword, email]
        );

        conn.release();
        res.json({ message: 'PASSWORD_RESET_SUCCESSFUL' });
    } catch (err) {
        console.error('Reset Password Error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- Verify Email Token ---
router.get('/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const conn = await dbPool.getConnection();
        const [users] = await conn.query('SELECT * FROM users WHERE verification_token = ?', [token]);

        if (users.length === 0) {
            conn.release();
            return res.status(400).json({ error: 'Token invalid or already used. Please try logging in.' });
        }

        const user = users[0];
        await conn.query(
            'UPDATE users SET is_verified = true, verification_token = NULL WHERE user_id = ?',
            [user.user_id]
        );

        req.login(user, async (err) => {
            if (err) { conn.release(); return res.status(500).json({ error: 'Activation successful, but auto-login failed.' }); }
            conn.release();

            const userId = user.user_id;
            updateActivationStatus(userId, { status: 'generating', progress: 0, total: 10, message: 'Initializing question generation...' });

            req.session.save((saveErr) => {
                if (saveErr) console.error('[Verify] Session save error:', saveErr);
            });

            (async () => {
                try {
                    await ensureDailyQuestionsGenerated(user, dbPool, (progress) => {
                        updateActivationStatus(userId, { status: 'generating', ...progress });
                    });
                    updateActivationStatus(userId, { status: 'complete', progress: 10, total: 10, message: 'Questions ready!' });
                } catch (genErr) {
                    console.error('Generation error:', genErr);
                    updateActivationStatus(userId, { status: 'error', progress: 0, total: 10, message: 'Generation failed. Will retry on page load.' });
                }
            })();

            res.json({
                message: 'Account activated. Preparing questions...',
                user: { id: user.user_id, name: user.user_name },
                status: 'generating'
            });
        });
    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({ error: 'System error during activation.' });
    }
});

// --- Activation Status Polling ---
router.get('/activation-status', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;
    const status = getActivationStatus(userId);

    if (!status) {
        try {
            const conn = await dbPool.getConnection();
            const today = getTodayDate();
            const [[log]] = await conn.query(
                'SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
                [userId, today]
            );
            conn.release();

            if (log) {
                return res.json({ status: 'complete', progress: 10, total: 10, message: 'Questions ready!' });
            } else {
                return res.json({ status: 'pending', progress: 0, total: 10, message: 'Checking status...' });
            }
        } catch (err) {
            return res.status(500).json({ error: 'Status check failed' });
        }
    }

    res.json(status);
});

export default router;