// /auth: sign-up, password and email-link sign-in, Google, sessions.
//
// Email links and the Google callback all land on the frontend's
// /auth/callback?token=…&type=…&next=…, which trades the single-use token for
// a session with POST /auth/verify. Responses to sign-up, magic link, resend
// and recovery are the same whether or not the email has an account.

import { Router } from 'express';
import { config, googleEnabled } from '../config.js';
import { query } from '../db.js';
import { badRequest, HttpError } from '../http.js';
import { requireUser } from '../middleware/auth.js';
import { hit, limitByIp } from '../middleware/rateLimit.js';
import {
  bannedError, changePassword, consumeLinkToken, createAccount, createLinkToken, createSession, endSession,
  findAccountByEmail, hashPassword, isBanned, isValidEmail, normaliseEmail, passwordProblem, refreshSession,
  sessionCreatedAt, verifyPassword,
} from '../auth/accounts.js';
import { googleAuthorizeUrl, googleProfile } from '../auth/google.js';
import { sendAuthEmail } from '../auth/mailer.js';
import { randomToken, signState, verifyState } from '../auth/tokens.js';

const router = Router();

const LINK_TYPES = new Set(['signup', 'magiclink', 'recovery', 'oauth']);
// A session younger than this may change its password without the old one
// (it was just created by signing in or by a recovery link).
const RECENT_SIGN_IN_MS = 15 * 60 * 1000;
const STATE_COOKIE = 'aptric_oauth_state';

// Same-origin paths only (no open redirects).
const safeNext = (value, fallback = '/') =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value.slice(0, 512)
    : fallback;

const callbackUrl = (params) => `${config.frontendUrl}/auth/callback?${new URLSearchParams(params)}`;

const sanitiseMetadata = (body) => {
  const meta = {};
  if (typeof body.display_name === 'string' && body.display_name.trim()) meta.display_name = body.display_name.trim().slice(0, 64);
  if (typeof body.timezone === 'string' && body.timezone.length <= 64) meta.timezone = body.timezone;
  return meta;
};

const readEmail = (body) => {
  const email = normaliseEmail(body?.email);
  if (!isValidEmail(email)) throw new HttpError(400, 'validation_failed', 'Please enter a valid email address.');
  return email;
};

// Per address, so nobody can flood one inbox; per IP comes from the route.
const limitEmail = (email) => hit('auth:email-to', email, 3600, 6);

async function sendLink(account, purpose, next) {
  const token = await createLinkToken(account.id, purpose);
  await sendAuthEmail(account.email, purpose, callbackUrl({ token, type: purpose, next: safeNext(next) }));
}

// Like sendLink, but a mail failure is reported instead of thrown.
async function trySendLink(account, purpose, next) {
  try {
    await sendLink(account, purpose, next);
    return true;
  } catch (err) {
    if (err instanceof HttpError && err.code === 'email_unavailable') return false;
    throw err;
  }
}

// Sign-up with email + password; the account works once the email is confirmed.
router.post('/signup', limitByIp('auth:signup', 3600, 20), async (req, res) => {
  const email = readEmail(req.body);
  const problem = passwordProblem(req.body.password);
  if (problem) throw new HttpError(400, 'weak_password', problem);
  await limitEmail(email);

  let emailSent = true;
  const existing = await findAccountByEmail(email);
  if (!existing) {
    const account = await createAccount({ email, passwordHash: await hashPassword(req.body.password), metadata: sanitiseMetadata(req.body) });
    emailSent = await trySendLink(account, 'signup', req.body.next);
  } else if (!existing.email_verified_at && !isBanned(existing)) {
    // Signing up again before confirming replaces the password and resends.
    await query('update private.accounts set password_hash = $2 where id = $1', [existing.id, await hashPassword(req.body.password)]);
    emailSent = await trySendLink(existing, 'signup', req.body.next);
  }
  // email_sent is false only when the mail provider failed; the account exists
  // and the client offers "resend" (rate limited) instead of dead-ending.
  res.json({ ok: true, email_sent: emailSent });
});

router.post('/login', limitByIp('auth:login', 300, 30), async (req, res) => {
  const email = readEmail(req.body);
  await hit('auth:login-email', email, 300, 10);
  const account = await verifyPassword(email, req.body.password);
  res.json({ session: await createSession(account, req.get('user-agent')) });
});

// Email link sign-in; creates the account on first use (confirmed by the click).
router.post('/magic-link', limitByIp('auth:email', 3600, 20), async (req, res) => {
  const email = readEmail(req.body);
  await limitEmail(email);
  const account = (await findAccountByEmail(email)) ?? (await createAccount({ email, metadata: sanitiseMetadata(req.body) }));
  if (!isBanned(account)) await sendLink(account, 'magiclink', req.body.next);
  res.json({ ok: true });
});

router.post('/resend', limitByIp('auth:email', 3600, 20), async (req, res) => {
  const email = readEmail(req.body);
  await limitEmail(email);
  const account = await findAccountByEmail(email);
  if (account && !account.email_verified_at && !isBanned(account)) await sendLink(account, 'signup', req.body.next);
  res.json({ ok: true });
});

router.post('/recover', limitByIp('auth:email', 3600, 20), async (req, res) => {
  const email = readEmail(req.body);
  await limitEmail(email);
  const account = await findAccountByEmail(email);
  if (account && !isBanned(account)) await sendLink(account, 'recovery', '/auth/reset-password');
  res.json({ ok: true });
});

// Trades a single-use link token for a session.
router.post('/verify', limitByIp('auth:verify', 300, 30), async (req, res) => {
  const type = req.body?.type;
  if (!LINK_TYPES.has(type)) throw badRequest('Unknown link type.');
  const account = await consumeLinkToken(req.body.token, type);
  if (isBanned(account)) throw bannedError();
  res.json({ type, session: await createSession(account, req.get('user-agent')) });
});

router.post('/refresh', limitByIp('auth:refresh', 300, 120), async (req, res) => {
  res.json({ session: await refreshSession(req.body?.refresh_token) });
});

router.post('/logout', limitByIp('auth:logout', 300, 120), async (req, res) => {
  await endSession(req.body?.refresh_token);
  res.status(204).end();
});

router.get('/user', requireUser, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

// New password. Needs the current password unless the session is fresh
// (just signed in, or opened from a recovery link).
router.post('/password', requireUser, async (req, res) => {
  // The current-password check is a password oracle for anyone holding a stolen
  // access token, so it is limited per account (and per IP).
  await hit('auth:password-change', req.user.id, 3600, 10);
  await hit('auth:password-change-ip', req.ip ?? 'unknown', 3600, 30);
  const problem = passwordProblem(req.body?.password);
  if (problem) throw new HttpError(400, 'weak_password', problem);
  const { rows } = await query('select password_hash, email from private.accounts where id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, '401', 'Your session has expired. Please sign in again.');

  const createdAt = await sessionCreatedAt(req.user.sessionId);
  const recent = createdAt && Date.now() - new Date(createdAt).getTime() < RECENT_SIGN_IN_MS;
  if (!recent) {
    if (typeof req.body.current_password !== 'string') {
      throw new HttpError(401, 'reauthentication_needed', 'Please sign in again before changing your password.');
    }
    await verifyPassword(rows[0].email, req.body.current_password);
  }
  await changePassword(req.user.id, req.user.sessionId, req.body.password);
  res.json({ ok: true });
});

// Google ---------------------------------------------------------------------

router.get('/google', (req, res) => {
  if (!googleEnabled()) {
    return res.redirect(callbackUrl({ error_description: 'Google sign-in is not available right now.' }));
  }
  const nonce = randomToken(16);
  const state = signState({ nonce, next: safeNext(req.query.next) }, 600);
  // Binds the flow to this browser (checked in the callback).
  res.cookie(STATE_COOKIE, nonce, {
    httpOnly: true, secure: config.isProd, sameSite: 'lax', maxAge: 600_000, path: '/auth/google',
  });
  res.redirect(googleAuthorizeUrl(state));
});

const readCookie = (req, name) =>
  (req.get('cookie') ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

/**
 * The account for a Google profile: linked by Google id, else by verified
 * email, else new. Null when the email matches an account but Google hasn't
 * verified it.
 */
async function googleAccount(profile) {
  const email = normaliseEmail(profile.email);
  // Two callbacks for a new address can race to create it; the loser finds
  // the winner's account on the second pass.
  for (let attempt = 0; ; attempt += 1) {
    const { rows: bySub } = await query('select * from private.accounts where google_sub = $1', [profile.sub]);
    if (bySub[0]) return bySub[0];
    const existing = await findAccountByEmail(email);
    if (existing) {
      if (!profile.email_verified) return null;
      // Google proved the address. If it was never confirmed, whoever set the
      // password didn't own it, so the password goes.
      const { rows } = await query(
        `update private.accounts
         set google_sub = $2,
             password_hash = case when email_verified_at is null then null else password_hash end,
             email_verified_at = coalesce(email_verified_at, now())
         where id = $1 returning *`,
        [existing.id, profile.sub],
      );
      return rows[0];
    }
    try {
      return await createAccount({
        email,
        verified: Boolean(profile.email_verified),
        googleSub: profile.sub,
        metadata: { full_name: profile.name, avatar_url: profile.picture },
      });
    } catch (err) {
      if (err.code !== '23505' || attempt > 0) throw err;
    }
  }
}

router.get('/google/callback', async (req, res) => {
  const fail = (message) => res.redirect(callbackUrl({ error_description: message }));
  res.clearCookie(STATE_COOKIE, { path: '/auth/google' });
  if (req.query.error) return fail('Google sign-in was cancelled.');

  const state = verifyState(String(req.query.state ?? ''));
  if (!state || !state.nonce || readCookie(req, STATE_COOKIE) !== state.nonce || typeof req.query.code !== 'string') {
    return fail('This sign-in attempt expired. Please try again.');
  }

  let profile;
  try {
    profile = await googleProfile(req.query.code);
  } catch (err) {
    console.error('[auth] google', err.message);
    return fail("We couldn't complete Google sign-in. Please try again.");
  }

  const account = await googleAccount(profile);

  if (!account) return fail('Please verify your Google email address first.');
  if (isBanned(account)) return fail('This account has been suspended.');
  const token = await createLinkToken(account.id, 'oauth', 2);
  res.redirect(callbackUrl({ token, type: 'oauth', next: state.next }));
});

export default router;
