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
        subject: '🎯 Activate Your Aptric Account',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#0d2818,#1a3a2a);padding:32px 40px;text-align:center;border-bottom:1px solid #2ea04320;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;color:#2ea043;font-weight:600;">APTRIC // IDENTITY SYSTEM</p>
          <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;">Welcome, ${name}</h1>
          <p style="margin:10px 0 0;color:#8b949e;font-size:14px;">Your operative registration is almost complete.</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="color:#c9d1d9;font-size:15px;line-height:1.7;margin:0 0 24px;">You've successfully registered with Aptric. To activate your account and begin your practice sessions, click the button below:</p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 32px;">
            <a href="${FRONTEND()}/activate/${token}" style="display:inline-block;background:linear-gradient(135deg,#238636,#2ea043);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;letter-spacing:1px;">ACTIVATE ACCOUNT</a>
          </td></tr></table>
          <p style="color:#8b949e;font-size:12px;text-align:center;margin:0;">This activation link expires in <strong style="color:#c9d1d9;">24 hours</strong>. If you didn't create this account, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="background:#0d1117;padding:16px 40px;text-align:center;border-top:1px solid #30363d;">
          <p style="margin:0;color:#484f58;font-size:11px;letter-spacing:1px;">APTRIC LEARNING PLATFORM // DO NOT REPLY</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
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
      subject: '🔐 Your Aptric Password Reset Code',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#0D2C23,#0B4C32);padding:32px 40px;text-align:center;border-bottom:1px solid #a855f720;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;color:#00FF88;font-weight:600;">APTRIC // SECURITY PROTOCOL</p>
          <h1 style="margin:0;font-size:28px;font-weight:700;color:#00FF88;">Password Reset</h1>
          <p style="margin:10px 0 0;color:#8b949e;font-size:14px;">One-time access code requested</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="color:#c9d1d9;font-size:15px;line-height:1.7;margin:0 0 28px;">We received a request to reset the password for your Aptric account. Use the code below to proceed:</p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 28px;">
            <div style="display:inline-block;background:#0d1117;border:2px solid #00FF88;border-radius:10px;padding:20px 40px;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#8b949e;">YOUR OTP CODE</p>
              <p style="margin:0;font-size:40px;font-weight:700;letter-spacing:10px;color:#00FF88;font-family:'Courier New',monospace;">${otp}</p>
            </div>
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c2128;border:1px solid #30363d;border-radius:8px;margin-bottom:24px;"><tr><td style="padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:#8b949e;">⏱  This code expires in <strong style="color:#f0883e;">10 minutes</strong></p>
          </td></tr></table>
          <p style="color:#8b949e;font-size:12px;text-align:center;margin:0;">If you did not request a password reset, please ignore this email. Your account remains secure.</p>
        </td></tr>
        <tr><td style="background:#0d1117;padding:16px 40px;text-align:center;border-top:1px solid #30363d;">
          <p style="margin:0;color:#484f58;font-size:11px;letter-spacing:1px;">APTRIC LEARNING PLATFORM // DO NOT REPLY</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    });
  } catch (e) { console.error('[forgot-password] mail:', e.message); }

  res.json({ message: 'OTP sent' });
});

// ── Reset Password ─────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  let conn;
  try {
    conn = await dbPool.getConnection();
    const [[user]] = await conn.query('SELECT user_id, otp_code, otp_expires FROM users WHERE email = ?', [email]);
    if (!user) { return res.status(404).json({ error: 'User not found' }); }
    if (user.otp_code !== otp || new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({ error: 'INVALID_OR_EXPIRED_OTP' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await conn.query('UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires = NULL WHERE email = ?', [hash, email]);
    res.json({ message: 'PASSWORD_RESET_SUCCESSFUL' });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ── Email Verification ─────────────────────────────────────────
router.get('/verify/:token', async (req, res) => {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const [users] = await conn.query('SELECT * FROM users WHERE verification_token = ?', [req.params.token]);
    if (!users.length) {
      return res.status(400).json({ error: 'Token invalid or already used' });
    }

    const user = users[0];
    await conn.query('UPDATE users SET is_verified = true, verification_token = NULL WHERE user_id = ?', [user.user_id]);

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
  } finally {
    if (conn) conn.release();
  }
});

// ── Activation status polling ──────────────────────────────────
router.get('/activation-status', isLoggedIn, async (req, res) => {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const today = getTodayDate();
    const [[log]] = await conn.query(
      'SELECT log_id FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
      [req.user.user_id, today]
    );
    if (log) {
      return res.json({ status: 'complete', progress: 10, total: 10, message: 'Questions ready!' });
    }
    res.json({ status: 'generating', progress: 0, total: 10, message: 'Still preparing...' });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;