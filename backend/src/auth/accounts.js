// Accounts, sessions and single-use email/OAuth links in private.accounts,
// private.sessions and private.auth_tokens (migration 20261002000001).

import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { batch, query } from '../db.js';
import { HttpError } from '../http.js';
import { randomToken, sha256, signAccessToken } from './tokens.js';

const BCRYPT_ROUNDS = 10;
// Compared against when the account doesn't exist, so a wrong email takes as
// long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export const normaliseEmail = (email) => String(email ?? '').trim().toLowerCase();

export const isValidEmail = (email) =>
  email.length >= 3 && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Minimum 8 characters with letters and digits (the old Auth policy). */
export const passwordProblem = (password) => {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password must be at most 72 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain letters and digits.';
  return null;
};

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

export const isBanned = (account) =>
  account.banned_until !== null && account.banned_until !== undefined && new Date(account.banned_until) > new Date();

export const bannedError = () => new HttpError(403, 'user_banned', 'This account has been suspended.');

export async function findAccountByEmail(email) {
  const { rows } = await query('select * from private.accounts where email = $1', [email]);
  return rows[0] ?? null;
}

export async function findAccountById(id) {
  const { rows } = await query('select * from private.accounts where id = $1', [id]);
  return rows[0] ?? null;
}

/** Inserts an account; the on_account_created trigger creates its profile. */
export async function createAccount({ email, passwordHash = null, metadata = {}, verified = false, googleSub = null }) {
  const { rows } = await query(
    `insert into private.accounts (email, password_hash, metadata, email_verified_at, google_sub)
     values ($1, $2, $3, case when $4 then now() end, $5)
     returning *`,
    [email, passwordHash, JSON.stringify(metadata), verified, googleSub],
  );
  return rows[0];
}

/** Checks an email + password pair; throws the Auth-style error codes. */
export async function verifyPassword(email, password) {
  const account = await findAccountByEmail(email);
  const ok = await bcrypt.compare(String(password ?? ''), account?.password_hash ?? DUMMY_HASH);
  if (!account || !account.password_hash || !ok) {
    throw new HttpError(400, 'invalid_credentials', 'Invalid email or password.');
  }
  if (isBanned(account)) throw bannedError();
  if (!account.email_verified_at) throw new HttpError(400, 'email_not_confirmed', 'Email not confirmed.');
  return account;
}

// Sessions ------------------------------------------------------------------

const sessionResponse = (account, sessionId, refreshToken) => ({
  access_token: signAccessToken({ userId: account.id, email: account.email, sessionId }),
  token_type: 'bearer',
  expires_in: config.accessTokenSeconds,
  expires_at: Math.floor(Date.now() / 1000) + config.accessTokenSeconds,
  refresh_token: refreshToken,
  user: { id: account.id, email: account.email },
});

/** Starts a session (refresh token stored hashed) and records the sign-in. */
export async function createSession(account, userAgent) {
  if (isBanned(account)) throw bannedError();
  const refreshToken = randomToken();
  const [{ rows }] = await batch([
    [`insert into private.sessions (account_id, token_hash, user_agent, expires_at)
      values ($1, $2, left($3, 512), now() + make_interval(days => $4))
      returning id`,
    [account.id, sha256(refreshToken), userAgent ?? null, config.refreshTokenDays]],
    ['update private.accounts set last_sign_in_at = now() where id = $1', [account.id]],
  ]);
  return sessionResponse(account, rows[0].id, refreshToken);
}

/** Rotates a refresh token: the old one stops working, a new pair is issued. */
export async function refreshSession(refreshToken) {
  const invalid = new HttpError(401, 'refresh_token_not_found', 'Your session has expired. Please sign in again.');
  if (typeof refreshToken !== 'string' || !refreshToken) throw invalid;
  const next = randomToken();
  const { rows } = await query(
    `update private.sessions s
     set token_hash = $2, last_used_at = now(), expires_at = now() + make_interval(days => $3)
     from private.accounts a
     where s.token_hash = $1 and s.expires_at > now() and a.id = s.account_id
     returning s.id as session_id, a.*`,
    [sha256(refreshToken), sha256(next), config.refreshTokenDays],
  );
  const row = rows[0];
  if (!row) throw invalid;
  if (isBanned(row)) {
    await query('delete from private.sessions where account_id = $1', [row.id]);
    throw bannedError();
  }
  return sessionResponse(row, row.session_id, next);
}

export async function endSession(refreshToken) {
  if (typeof refreshToken !== 'string' || !refreshToken) return;
  await query('delete from private.sessions where token_hash = $1', [sha256(refreshToken)]);
}

export async function sessionCreatedAt(sessionId) {
  const { rows } = await query('select created_at from private.sessions where id = $1', [sessionId]);
  return rows[0]?.created_at ?? null;
}

/** New password; every other session of the account is signed out. */
export async function changePassword(accountId, keepSessionId, password) {
  const hash = await hashPassword(password);
  await batch([
    ['update private.accounts set password_hash = $2 where id = $1', [accountId, hash]],
    ['delete from private.sessions where account_id = $1 and id is distinct from $2::uuid', [accountId, keepSessionId ?? null]],
  ]);
}

// Single-use links ------------------------------------------------------------

export async function createLinkToken(accountId, purpose, minutes = config.emailLinkMinutes) {
  const token = randomToken();
  await query(
    `insert into private.auth_tokens (token_hash, account_id, purpose, expires_at)
     values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [sha256(token), accountId, purpose, minutes],
  );
  return token;
}

/**
 * Spends a link token. Email links also confirm the address. Returns the
 * account, or throws otp_expired for an unknown, used or expired link.
 */
export async function consumeLinkToken(token, purpose) {
  const expired = new HttpError(400, 'otp_expired', 'This link has expired or was already used.');
  if (typeof token !== 'string' || !token) throw expired;
  // One statement: spend the link, confirm the address, and retire the
  // account's other unused links of the same kind.
  const { rows } = await query(
    `with spent as (
       update private.auth_tokens set used_at = now()
       where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
       returning account_id
     ), others as (
       update private.auth_tokens t set used_at = now()
       from spent
       where t.account_id = spent.account_id and t.purpose = $2 and t.used_at is null and t.token_hash <> $1
     )
     update private.accounts a
     set email_verified_at = coalesce(a.email_verified_at, case when $2 <> 'oauth' then now() end)
     from spent
     where a.id = spent.account_id
     returning a.*`,
    [sha256(token), purpose],
  );
  if (!rows[0]) throw expired;
  return rows[0];
}
