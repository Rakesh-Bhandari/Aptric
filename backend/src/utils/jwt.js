// src/utils/jwt.js
// Replaces express-session + passport.session() with signed JWT cookies.
// Works perfectly on Vercel serverless — no shared memory needed.

import jwt from 'jsonwebtoken';

const SECRET = process.env.VITE_SESSION_SECRET || 'fallback-secret-key';
const isProd = process.env.VITE_NODE_ENV === 'production';
const COOKIE_NAME = 'aptric_token';
const EXPIRES_IN = '7d';

// Sign a token and set it as an httpOnly cookie
export function setAuthCookie(res, userId) {
    const token = jwt.sign({ userId }, SECRET, { expiresIn: EXPIRES_IN });
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    });
}

// Verify token from cookie, return userId or null
export function getUserIdFromCookie(req) {
    try {
        const token = req.cookies?.[COOKIE_NAME];
        if (!token) return null;
        const payload = jwt.verify(token, SECRET);
        return payload.userId || null;
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