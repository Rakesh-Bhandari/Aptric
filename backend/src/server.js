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

// --- Middleware ---
app.use(cors({
    origin: process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: process.env.VITE_SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
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

// --- Start ---
const port = process.env.VITE_PORT || 5000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

export default app;
