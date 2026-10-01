// src/middleware/auth.js
import dbPool from '../config/db.js';
import { getUserIdFromCookie } from '../utils/jwt.js';

// Reads JWT cookie → fetches user from DB → attaches to req.user
// Works on every Vercel request with zero shared state
export const isLoggedIn = async (req, res, next) => {
    try {
        const userId = getUserIdFromCookie(req);
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [users] = await dbPool.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]
        );

        if (!users?.length) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (users[0].is_banned) {
            return res.status(403).json({ error: 'Account suspended' });
        }

        req.user = users[0];
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
