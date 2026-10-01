// src/middleware/auth.js
import dbPool from '../config/db.js';
import { getTokenFromCookie } from '../utils/jwt.js';

// Resolves the cookie to a user row, or null if missing/invalid/revoked.
// A token is revoked once users.token_version moves past the version it was signed with.
export const getUserFromCookie = async (req) => {
    const token = getTokenFromCookie(req);
    if (!token) return null;

    const [users] = await dbPool.query('SELECT * FROM users WHERE user_id = ?', [token.userId]);
    const user = users?.[0];
    if (!user || (user.token_version ?? 0) !== token.tokenVersion) return null;
    return user;
};

// Reads JWT cookie → fetches user from DB → attaches to req.user
// Works on every Vercel request with zero shared state
export const isLoggedIn = async (req, res, next) => {
    try {
        const user = await getUserFromCookie(req);
        if (!user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (user.is_banned) {
            return res.status(403).json({ error: 'Account suspended' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('[isLoggedIn]', err.message);
        res.status(500).json({ error: 'Auth check failed' });
    }
};

// Admin = logged-in user with users.role = 'admin'.
// To grant admin to an existing account, run once against the DB:
//   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
export const isAdmin = (req, res, next) => {
    isLoggedIn(req, res, () => {
        if (req.user?.role === 'admin') return next();
        res.status(403).json({ error: 'Admin access required' });
    });
};
