import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import passport from 'passport';
import { configurePassport } from './config/passport.js';

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

// ── CORS ──────────────────────────────────────────────────────
// Exact allow-list: production frontend + local dev ports.
const ALLOWED_ORIGINS = [
    process.env.VITE_FRONTEND_URL?.replace(/\/+$/, ''),
    'http://localhost:5173',
    'http://localhost:6969',
    'http://localhost:3000',
].filter(Boolean);

// Optional Vercel preview deployments for this project + team only, e.g.
// https://aptric-bxno-abc123-my-team.vercel.app. Disabled unless the team slug is set.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FRONTEND_SLUG = process.env.VITE_FRONTEND_SLUG || 'aptric-bxno';
const VERCEL_TEAM_SLUG = process.env.VITE_VERCEL_TEAM_SLUG;
const PREVIEW_ORIGIN_RE = VERCEL_TEAM_SLUG
    ? new RegExp(`^https://${escapeRegex(FRONTEND_SLUG)}-[a-z0-9]+-${escapeRegex(VERCEL_TEAM_SLUG)}\\.vercel\\.app$`)
    : null;

app.use(cors({
    origin: (origin, callback) => {
        // No Origin header (same-origin, curl, server-to-server): no CORS headers.
        if (!origin) return callback(null, false);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        if (PREVIEW_ORIGIN_RE && PREVIEW_ORIGIN_RE.test(origin)) return callback(null, true);
        console.warn(`[CORS] Blocked: ${origin}`);
        return callback(new Error(`Origin ${origin} not allowed`), false);
    },
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// ── Passport (OAuth only — no session) ────────────────────────
configurePassport();
app.use(passport.initialize());
// NOTE: No passport.session() — we use JWT cookies instead

// ── Routes ────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', gameRoutes);
app.use('/api', questionRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cron', cronRoutes);

app.get('/', (req, res) => {
    res.json({ status: 'running', env: isProd ? 'production' : 'development' });
});

app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(err.status || 500).json({ error: isProd ? 'Server error' : err.message });
});

process.on('unhandledRejection', (r) => console.error('[UnhandledRejection]', r));
process.on('uncaughtException', (e) => {
    console.error('[UncaughtException]', e.message);
    if (e.code === 'MODULE_NOT_FOUND') process.exit(1);
});

const port = process.env.VITE_PORT || 5000;
app.listen(port, () => console.log(`Server on port ${port}`));

export default app;