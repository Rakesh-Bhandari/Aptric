// Access tokens (short-lived JWTs), opaque random tokens and their hashes.
// Refresh tokens and email-link tokens are stored as sha256 only.

import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const ISSUER = 'aptric';

/** JWT for the Authorization header: sub = user id, sid = session id. */
export function signAccessToken({ userId, email, sessionId }) {
  return jwt.sign({ email, sid: sessionId, role: 'authenticated' }, config.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    expiresIn: config.accessTokenSeconds,
  });
}

/** The verified claims, or null for a missing, forged or expired token. */
export function verifyAccessToken(token) {
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER });
    return typeof claims.sub === 'string' ? claims : null;
  } catch {
    return null;
  }
}

/** Short-lived signed value (OAuth state). */
export const signState = (payload, seconds) =>
  jwt.sign(payload, config.jwtSecret, { algorithm: 'HS256', issuer: `${ISSUER}:state`, expiresIn: seconds });

export function verifyState(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: `${ISSUER}:state` });
  } catch {
    return null;
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
