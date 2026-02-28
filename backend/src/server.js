import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import { configurePassport } from './config/passport.js';

// Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import gameRoutes from './routes/game.js';
import questionRoutes from './routes/questions.js';
import feedbackRoutes from './routes/feedback.js';
import adminRoutes from './routes/admin.js';
import cronRoutes from './routes/cron.js';

dotenv.config();

const app = express();
const isProd = process.env.VITE_NODE_ENV === 'production';

// -------------------------------------------------------
// CORS — credentials: true is required for cookies to
// work cross-port (frontend :6969 <-> backend :5000)
// -------------------------------------------------------
const ALLOWED_ORIGINS = [
    process.env.VITE_FRONTEND_URL,   // e.g. http://localhost:6969
    'http://localhost:5173',          // Vite default fallback
    'http://localhost:3000',          // CRA fallback
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (Postman, server-to-server, cron)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        console.warn(`[CORS] Blocked origin: ${origin}`);
        return callback(new Error(`CORS policy: origin ${origin} not allowed`), false);
    },
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use(session({
    secret: process.env.VITE_SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        // secure: true requires HTTPS — false locally, true in production
        secure: isProd,
        httpOnly: true,
        // sameSite 'none' needed for cross-domain cookies in production
        sameSite: isProd? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

// --- Passport ---
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// --- Routes ---
app.use('/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', gameRoutes);
app.use('/api', questionRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cron', cronRoutes);

// --- Health Check ---
app.get('/', (req, res) => {
    res.json({ status: 'Server is active and running smoothly!' });
});

// --- Global 404 handler ---
app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// --- Global error handler (prevents unhandled crashes) ---
app.use((err, req, res, next) => {
    console.error('[Server Error]', err.message);
    const message = process.env.VITE_NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;
    res.status(err.status || 500).json({ error: message });
});

// --- Prevent crashes from unhandled promise rejections ---
process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
    // Log but do NOT exit — keeps server alive
});

process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err.message);
    if (err.code === 'MODULE_NOT_FOUND') {
        console.error('Fatal: missing module. Exiting.');
        process.exit(1);
    }
    // All other errors: log and stay alive
});

// --- Start ---
const port = process.env.VITE_PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));

export default app;