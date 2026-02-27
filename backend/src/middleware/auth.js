// Middleware: Check if user is logged in via session
export const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) {
        if (req.user.is_banned) {
            req.logout((err) => {
                req.session.destroy();
                res.clearCookie('connect.sid');
                return res.status(403).json({ error: 'Your account has been suspended.' });
            });
        } else {
            return next();
        }
    } else {
        res.status(401).json({ error: 'User not authenticated' });
    }
};

// Middleware: Check if admin session is active
export const isAdmin = (req, res, next) => {
    if (req.session.adminLoggedIn === true) {
        return next();
    }
    res.status(401).json({ error: 'Admin authentication required' });
};
