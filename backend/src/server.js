import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import passport from 'passport';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

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
        console.warn(`[CORS] Blocked: ${origin}`);
        return callback(new Error(`Origin ${origin} not allowed`), false);
    },
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// SESSION STORE — MySQL/TiDB
// Vercel is stateless: default in-memory sessions are lost between
// requests. Storing in TiDB keeps sessions alive across cold starts.
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 604800000,
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
    }
}, dbPool);

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