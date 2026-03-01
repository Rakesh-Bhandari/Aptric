import dbPool from '../config/db.js';

// ─────────────────────────────────────────────────────────────
// isLoggedIn — works on Vercel serverless
//
// The problem with passport.session() on Vercel:
// Every request is a fresh process. passport.initialize() resets
// internal state. Even if the session cookie and TiDB session row
// are valid, req.isAuthenticated() returns false because Passport
// hasn't "seen" this user in this process instance.
//
// Solution: read req.session.passport.user directly (the user_id
// that serializeUser stored), then fetch the user from DB ourselves.
// This bypasses Passport's broken in-process state entirely.
// ─────────────────────────────────────────────────────────────
export const isLoggedIn = async (req, res, next) => {
    try {
        // passport stores serialized user here after serializeUser runs
        const userId = req.session?.passport?.user;

        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // If passport already deserialized (works in long-running server),
        // use it directly. Otherwise fetch from DB (Vercel serverless path).
        if (req.user && req.user.user_id === userId) {
            if (req.user.is_banned) {
                req.session.destroy(() => {});
                res.clearCookie('aptric_sid');
                return res.status(403).json({ error: 'Your account has been suspended.' });
            }
            return next();
        }

        // Fetch user from DB directly
        const [users] = await dbPool.query(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );

        if (!users || users.length === 0) {
            req.session.destroy(() => {});
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const user = users[0];

        if (user.is_banned) {
            req.session.destroy(() => {});
            res.clearCookie('aptric_sid');
            return res.status(403).json({ error: 'Your account has been suspended.' });
        }

        // Attach user to request so route handlers can use req.user normally
        req.user = user;
        return next();

    } catch (err) {
        console.error('[isLoggedIn] Error:', err.message);
        return res.status(500).json({ error: 'Authentication check failed' });
    }
};

// Admin session check — unchanged, uses express-session directly
export const isAdmin = (req, res, next) => {
    if (req.session?.adminLoggedIn === true) {
        return next();
    }
    res.status(401).json({ error: 'Admin authentication required' });
};