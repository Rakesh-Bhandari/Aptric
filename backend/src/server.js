import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createRequire } from 'module';

import { configurePassport } from './config/passport.js';
import dbPool from './config/db.js';

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

// express-mysql-session is CommonJS — must use createRequire in ESM
const require = createRequire(import.meta.url);
const MySQLStoreFactory = require('express-mysql-session');
const MySQLStore = MySQLStoreFactory(session);

// ── CORS ───────────────────────────────────────────────────────
// Vercel creates a new preview URL on EVERY deployment like:
// aptric-bxno-q1kg2jvmq-rakesh-bhandaris-projects.vercel.app
// We must allow all subdomains of your project, not just the main one.
const ALLOWED_EXACT_ORIGINS = [
    process.env.VITE_FRONTEND_URL,   // main production frontend URL
    'http://localhost:5173',
    'http://localhost:6969',
    'http://localhost:3000',
].filter(Boolean);

// Allow any Vercel preview URL for your frontend project
// Pattern: aptric-bxno-*.vercel.app  (your frontend project slug)
const FRONTEND_SLUG = 'aptric-bxno'; // the part before the hash in preview URLs

function isOriginAllowed(origin) {
    if (!origin) return true;
    if (ALLOWED_EXACT_ORIGINS.includes(origin)) return true;
    // Allow all Vercel preview deployments for this project
    try {
        const url = new URL(origin);
        if (url.hostname.endsWith('.vercel.app') && url.hostname.startsWith(FRONTEND_SLUG)) {
            return true;
        }
    } catch (_) {}
    return false;
}

app.use(cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) return callback(null, true);
        console.warn(`[CORS] Blocked: ${origin}`);
        return callback(new Error(`Origin ${origin} not allowed`), false);
    },
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// ── SESSION STORE (TiDB) ───────────────────────────────────────
const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 604800000,
    createDatabaseTable: false,
    schema: {
        tableName: 'sessions',
        columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
    }
}, dbPool);

sessionStore.on('error', (err) => console.error('[SessionStore]', err.message));

app.use(session({
    key: 'aptric_sid',
    secret: process.env.VITE_SESSION_SECRET || 'fallback-secret-key',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProd,
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// ── Routes ─────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', gameRoutes);
app.use('/api', questionRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cron', cronRoutes);

app.get('/', (req, res) => {
    res.json({ status: 'Server running', env: isProd ? 'production' : 'development' });
});

app.get('/api/debug/session', (req, res) => {
    res.json({
        sessionID: req.sessionID,
        isAuthenticated: req.isAuthenticated?.() ?? false,
        user: req.user ? { id: req.user.user_id, name: req.user.user_name } : null,
        cookie: req.session?.cookie,
        isProd,
    });
});

app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
    console.error('[Server Error]', err.message);
    res.status(err.status || 500).json({
        error: isProd ? 'Internal server error' : err.message
    });
});

process.on('unhandledRejection', (reason) => console.error('[UnhandledRejection]', reason));
process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err.message);
    if (err.code === 'MODULE_NOT_FOUND') process.exit(1);
});

const port = process.env.VITE_PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));

export default app;