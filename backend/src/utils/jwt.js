// src/utils/jwt.js
// Replaces express-session + passport.session() with signed JWT cookies.
// Works perfectly on Vercel serverless — no shared memory needed.

import 'dotenv/config';
import jwt from 'jsonwebtoken';

const SECRET = process.env.VITE_SESSION_SECRET;
if (!SECRET) {
    throw new Error('VITE_SESSION_SECRET is not set — refusing to start without a JWT signing secret');
}
const isProd = process.env.VITE_NODE_ENV === 'production';
const COOKIE_NAME = 'aptric_token';
const EXPIRES_IN = '7d';

// Sign a token and set it as an httpOnly cookie.
// tokenVersion must match users.token_version; bumping that column revokes every issued token.
export function setAuthCookie(res, userId, tokenVersion = 0) {
    const token = jwt.sign({ userId, tv: tokenVersion }, SECRET, { expiresIn: EXPIRES_IN });
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    });
}

// Verify token from cookie, return { userId, tokenVersion } or null.
// Callers must compare tokenVersion against users.token_version.
export function getTokenFromCookie(req) {
    try {
        const token = req.cookies?.[COOKIE_NAME];
        if (!token) return null;
        const payload = jwt.verify(token, SECRET);
        if (!payload.userId) return null;
        // Tokens issued before token_version existed carry no tv; treat as version 0.
        return { userId: payload.userId, tokenVersion: payload.tv ?? 0 };
    } catch (_) {
        return null;
    }
}

// Clear the auth cookie (logout)
export function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
    });
}
