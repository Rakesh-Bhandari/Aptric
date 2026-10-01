// src/routes/auth.js
import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import dbPool from '../config/db.js';
import transporter from '../config/mailer.js';
import { getOrAssignDailyLog } from '../services/questionBank.js';
import { isLoggedIn } from '../middleware/auth.js';
import { setAuthCookie, clearAuthCookie } from '../utils/jwt.js';
import {
    loginLimiter, signupLimiter, resendVerificationLimiter, forgotPasswordLimiter, resetPasswordLimiter,
} from '../middleware/rateLimit.js';
import { validate, email, password, loginPassword, displayName } from '../middleware/validate.js';

const router = Router();
const FRONTEND = () => process.env.VITE_FRONTEND_URL;

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;   // activation link lifetime (email says 24h)
const RESEND_COOLDOWN_MS = 60 * 1000;              // min gap between activation emails per account
const OTP_TTL_MS = 10 * 60 * 1000;                 // password reset code lifetime (email says 10 min)
const OTP_MAX_ATTEMPTS = 5;                        // wrong guesses before the code is invalidated
const OTP_COOLDOWN_MS = 60 * 1000;                 // min gap between reset emails per account

// OTPs are stored only as a SHA-256 hex digest.
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const otpMatches = (otp, storedHash) => {
  if (!storedHash) return false;
  const a = Buffer.from(hashOtp(otp), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const loginSchema = z.object({ email, password: loginPassword });
const signupSchema = z.object({
  name: displayName,
  email,
  password,
  confirmPassword: z.string({ error: 'Please confirm your password' }),
}).refine((b) => b.password === b.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
const emailOnlySchema = z.object({ email });
const resetPasswordSchema = z.object({
  email,
  otp: z.string({ error: 'Reset code is required' }).trim().regex(/^\d{6}$/, 'Reset code must be 6 digits'),
  newPassword: password,
});
// crypto.randomBytes(32).toString('hex')
const verifyParams = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Token invalid or already used') });

const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// ── Google OAuth ───────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/login/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user) => {
    if (err || !user) {
      console.error('[OAuth callback]', err?.message);
      return res.redirect(`${FRONTEND()}/?auth_error=oauth_failed`);
    }

    // Set JWT cookie — works across all Vercel invocations
    setAuthCookie(res, user.user_id, user.token_version);

    return res.redirect(`${FRONTEND()}/practice`);
  })(req, res, next);
});

router.get('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

// Revokes every session for this account (all devices), including the current one.
router.post('/logout-all', isLoggedIn, async (req, res) => {
  try {
    await dbPool.query('UPDATE users SET token_version = token_version + 1 WHERE user_id = ?', [req.user.user_id]);
    clearAuthCookie(res);
    res.json({ message: 'Logged out of all sessions' });
  } catch (err) {
    console.error('[logout-all]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Email/Password Login ───────────────────────────────────────
router.post('/login', loginLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await dbPool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });
    if (!user.is_verified) {
      return res.status(403).json({
        error: 'Email not verified. Check your inbox for the activation link, or request a new one.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    await dbPool.query('UPDATE users SET last_login = ? WHERE user_id = ?', [new Date(), user.user_id]);

    // Set JWT cookie
    setAuthCookie(res, user.user_id, user.token_version);

    res.json({ user_id: user.user_id, name: user.user_name });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Activation email ───────────────────────────────────────────
const sendVerificationEmail = (email, name, token) => transporter.sendMail({
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
          <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;">Welcome, ${escapeHtml(name)}</h1>
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

// ── Signup ─────────────────────────────────────────────────────
router.post('/signup', signupLimiter, validate({ body: signupSchema }), async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserId = nanoid(12);

    await dbPool.query('INSERT INTO users SET ?', {
      user_id: newUserId, user_name: name, email,
      password_hash: hashedPassword,
      verification_token: token,
      verification_expires: new Date(Date.now() + VERIFICATION_TTL_MS),
      is_verified: false,
      answered_qids: JSON.stringify([])
    });

    try {
      await sendVerificationEmail(email, name, token);
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

// ── Resend Verification Email ──────────────────────────────────
// Rate limited per account via the token's issue time (expires - TTL),
// so it holds across serverless instances.
router.post('/resend-verification', resendVerificationLimiter, validate({ body: emailOnlySchema }), async (req, res) => {
  const { email } = req.body;
  const generic = { message: 'If that account is awaiting activation, a new link has been sent.' };

  try {
    const [[user]] = await dbPool.query(
      'SELECT user_id, user_name, is_verified, verification_expires FROM users WHERE email = ?', [email]
    );
    if (!user || user.is_verified) return res.json(generic);

    if (user.verification_expires) {
      const issuedAt = new Date(user.verification_expires).getTime() - VERIFICATION_TTL_MS;
      const waitMs = issuedAt + RESEND_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        return res.status(429).json({ error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another email.` });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    await dbPool.query(
      'UPDATE users SET verification_token = ?, verification_expires = ? WHERE user_id = ?',
      [token, new Date(Date.now() + VERIFICATION_TTL_MS), user.user_id]
    );

    try {
      await sendVerificationEmail(email, user.user_name, token);
    } catch (mailErr) {
      console.error('[resend-verification] mail failed:', mailErr.message);
    }

    res.json(generic);
  } catch (err) {
    console.error('[resend-verification]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Forgot Password ────────────────────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, validate({ body: emailOnlySchema }), async (req, res) => {
  const { email } = req.body;
  // Same response whether or not the account exists, so this can't be used to enumerate emails.
  const generic = { message: 'If an account exists for that email, a reset code has been sent.' };

  try {
    const [[user]] = await dbPool.query('SELECT user_id, otp_expires FROM users WHERE email = ?', [email]);
    if (!user) return res.json(generic);

    // Silently skip if a code was issued within the cooldown (issue time = expires - TTL),
    // so a fresh code (and fresh attempt budget) can't be requested in a tight loop.
    if (user.otp_expires) {
      const issuedAt = new Date(user.otp_expires).getTime() - OTP_TTL_MS;
      if (Date.now() < issuedAt + OTP_COOLDOWN_MS) return res.json(generic);
    }

    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    await dbPool.query(
      'UPDATE users SET otp_hash = ?, otp_expires = ?, otp_attempts = 0 WHERE user_id = ?',
      [hashOtp(otp), new Date(Date.now() + OTP_TTL_MS), user.user_id]
    );

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

    res.json(generic);
  } catch (err) {
    console.error('[forgot-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Reset Password ─────────────────────────────────────────────
router.post('/reset-password', resetPasswordLimiter, validate({ body: resetPasswordSchema }), async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const invalid = { error: 'INVALID_OR_EXPIRED_OTP' };

  try {
    const [[user]] = await dbPool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (!user) return res.status(400).json(invalid);

    // Atomically spend one attempt on a live code. Done before comparing so concurrent
    // guesses can't exceed OTP_MAX_ATTEMPTS.
    const now = new Date();
    const [spent] = await dbPool.query(
      `UPDATE users SET otp_attempts = otp_attempts + 1
       WHERE user_id = ? AND otp_hash IS NOT NULL AND otp_expires > ? AND otp_attempts < ?`,
      [user.user_id, now, OTP_MAX_ATTEMPTS]
    );
    if (!spent.affectedRows) return res.status(400).json(invalid);

    const [[row]] = await dbPool.query('SELECT otp_hash, otp_attempts FROM users WHERE user_id = ?', [user.user_id]);
    if (!otpMatches(otp, row?.otp_hash)) {
      if (row && row.otp_attempts >= OTP_MAX_ATTEMPTS) {
        // Keep otp_expires so the forgot-password cooldown still applies after a lockout.
        await dbPool.query(
          'UPDATE users SET otp_hash = NULL WHERE user_id = ? AND otp_hash = ?',
          [user.user_id, row.otp_hash]
        );
      }
      return res.status(400).json(invalid);
    }

    // Consume the code, set the password, and bump token_version to revoke all existing sessions.
    // Conditioned on otp_hash so a concurrent request can't reuse the same code.
    const hash = await bcrypt.hash(newPassword, 10);
    const [updated] = await dbPool.query(
      `UPDATE users SET password_hash = ?, otp_hash = NULL, otp_expires = NULL, otp_attempts = 0,
              token_version = token_version + 1
       WHERE user_id = ? AND otp_hash = ?`,
      [hash, user.user_id, row.otp_hash]
    );
    if (!updated.affectedRows) return res.status(400).json(invalid);

    clearAuthCookie(res);
    res.json({ message: 'PASSWORD_RESET_SUCCESSFUL' });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Email Verification ─────────────────────────────────────────
router.get('/verify/:token', validate({ params: verifyParams }), async (req, res) => {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const [users] = await conn.query('SELECT * FROM users WHERE verification_token = ?', [req.params.token]);
    if (!users.length) {
      return res.status(400).json({ error: 'Token invalid or already used' });
    }

    const user = users[0];
    if (!user.verification_expires || new Date() > new Date(user.verification_expires)) {
      return res.status(400).json({ error: 'Activation link expired. Log in to request a new one.', code: 'TOKEN_EXPIRED' });
    }
    await conn.query('UPDATE users SET is_verified = true, verification_token = NULL, verification_expires = NULL WHERE user_id = ?', [user.user_id]);

    // Set JWT cookie
    setAuthCookie(res, user.user_id, user.token_version);

    res.json({
      message: 'Account activated.',
      user: { id: user.user_id, name: user.user_name }
    });
  } catch (err) {
    console.error('[verify]', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ── Activation status polling ──────────────────────────────────
// Assigns today's questions from the bank if needed (fast, no AI).
router.get('/activation-status', isLoggedIn, async (req, res) => {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const log = await getOrAssignDailyLog(conn, req.user.user_id);
    if (log) {
      return res.json({ status: 'complete', progress: 10, total: 10, message: 'Questions ready!' });
    }
    res.json({ status: 'generating', progress: 0, total: 10, message: 'Still preparing...' });
  } catch (err) {
    console.error('[activation-status]', err);
    res.status(500).json({ error: 'Status check failed' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;