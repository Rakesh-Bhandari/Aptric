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
const FRONTEND_SLUG = process.env.VITE_FRONTEND_SLUG || 'aptric-bxno';
const ALLOWED_ORIGINS = [
    process.env.VITE_FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:6969',
    'http://localhost:3000',
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        // Allow any Vercel preview URL for this project
        try {
            const { hostname } = new URL(origin);
            if (hostname.endsWith('.vercel.app') && hostname.startsWith(FRONTEND_SLUG)) {
                return callback(null, true);
            }
        } catch (_) {}
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