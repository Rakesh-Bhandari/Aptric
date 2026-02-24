import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import mysql from 'mysql2/promise';
import dbPool from './db.js';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { nanoid } from 'nanoid';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { generateDailyQuestionsForUser } from './question_generator_module.js';
import { generateBulkQuestions } from './bulk_generator.js';

// --- PATH SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from two levels up
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});


const {
    VITE_GOOGLE_CLIENT_ID,
    VITE_GOOGLE_CLIENT_SECRET,
    VITE_GOOGLE_REDIRECT_URI,
    VITE_PORT,
    VITE_FRONTEND_URL,
    VITE_DB_HOST,
    VITE_DB_USER,
    VITE_DB_PASSWORD,
    VITE_DB_NAME,
    VITE_SESSION_SECRET,
    VITE_ADMIN_PASSWORD
} = process.env;

const ADMIN_PASSWORD = VITE_ADMIN_PASSWORD;

// --- CONSTANTS ---
const POINTS_CORRECT = 100;
const POINTS_GIVEUP = 10;
const POINTS_HINT = -10;
const POINTS_WRONG = -20;
const STREAK_LOSS = -50;

// --- DATABASE CONNECTION ---
// const dbPool = mysql.createPool({
//     host: VITE_DB_HOST,
//     user: VITE_DB_USER,
//     password: VITE_DB_PASSWORD,
//     database: VITE_DB_NAME,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
// });

// --- INITIALIZE APP (MOVED UP) ---
const app = express();

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'avatars',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }] // Auto-resize
  }
});

const upload = multer({ storage: storage });

const transporter = nodemailer.createTransport({
    service: 'gmail', // or your provider
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // Use an App Password for Gmail
    }
});

const activationStatus = new Map();

function updateActivationStatus(userId, status) {
    activationStatus.set(userId, {
        ...status,
        timestamp: Date.now()
    });
    
    // Auto-cleanup after 5 minutes
    setTimeout(() => {
        activationStatus.delete(userId);
    }, 300000);
}

// --- MIDDLEWARE ---
app.use(cors({
    origin: VITE_FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: VITE_SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS in production
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// --- LOGGING HELPER ---
async function logActivity(userId, action, details) {
    try {
        await dbPool.query('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)', [userId, action, details]);
    } catch (e) {
        console.error("Logging failed", e);
    }
}

// --- HELPER FUNCTIONS ---

function calculateLevel(score) {
    if (score <= 25000) return 'Beginner';
    if (score <= 50000) return 'Intermediate';
    if (score <= 75000) return 'Advanced';
    if (score <= 100000) return 'Pro';
    return 'Expert';
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

const isLoggedIn = (req, res, next) => {
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

const isAdmin = (req, res, next) => {
    if (req.session.adminLoggedIn === true) {
        return next();
    }
    res.status(401).json({ error: 'Admin authentication required' });
};

// --- DAILY GENERATION LOGIC ---
async function ensureDailyQuestionsGenerated(user, pool, progressCallback = null) {
    const userId = user.user_id;
    const userLevel = user.level || 'Beginner';
    const today = getTodayDate();

    let conn;
    try {
        conn = await pool.getConnection();
        const [logs] = await conn.query(
            'SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
            [userId, today]
        );

        if (logs.length > 0) {
            conn.release();
            if (progressCallback) {
                progressCallback({
                    progress: 10,
                    total: 10,
                    message: 'Questions already exist for today!'
                });
            }
            return;
        }

        console.log(`Generating new questions for user ${userId} (${userLevel})...`);
        
        if (progressCallback) {
            progressCallback({
                progress: 0,
                total: 10,
                message: `Generating ${userLevel} level questions...`
            });
        }

        const newQuestionIds = await generateDailyQuestionsForUser(
            userLevel, 
            pool,
            progressCallback // Pass the callback down
        );

        if (newQuestionIds && newQuestionIds.length > 0) {
            await conn.query(
                'INSERT INTO user_daily_log (user_id, challenge_date, question_ids_json) VALUES (?, ?, ?)',
                [userId, today, JSON.stringify(newQuestionIds)]
            );
            console.log(`Assigned ${newQuestionIds.length} questions.`);
            
            if (progressCallback) {
                progressCallback({
                    progress: newQuestionIds.length,
                    total: 10,
                    message: `All ${newQuestionIds.length} questions ready!`
                });
            }
        }
    } catch (err) {
        console.error(`Error ensuring daily questions for ${userId}:`, err);
        if (progressCallback) {
            progressCallback({
                progress: 0,
                total: 10,
                message: 'Error generating questions'
            });
        }
        throw err;
    } finally {
        if (conn) conn.release();
    }
}


// --- HELPER: Calculate Streak from Activity History ---
async function calculateRealStreak(userId, pool) {
    // 1. Fetch all distinct dates where the user made an attempt (ordered latest first)
    // We cast to CHAR to ensure we get 'YYYY-MM-DD' strings consistently
    const [rows] = await pool.query(
        "SELECT DISTINCT DATE_FORMAT(attempt_date, '%Y-%m-%d') as dateStr FROM user_attempts WHERE user_id = ? ORDER BY attempt_date DESC",
        [userId]
    );

    if (rows.length === 0) return 0;

    // 2. Setup dates for comparison
    const now = new Date();
    const toDateString = (date) => date.toISOString().split('T')[0];

    const todayStr = toDateString(now);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateString(yesterday);

    // 3. Check if the streak is active (latest activity must be today or yesterday)
    const latestActivity = rows[0].dateStr;

    // If the last game was played before yesterday, the streak is broken (0)
    if (latestActivity !== todayStr && latestActivity !== yesterdayStr) {
        return 0;
    }

    // 4. Count consecutive days
    let streak = 0;
    let expectedDate = new Date(latestActivity); // Start counting from the latest active day

    for (const row of rows) {
        const actualDateStr = row.dateStr;
        const expectedDateStr = toDateString(expectedDate);

        if (actualDateStr === expectedDateStr) {
            streak++;
            // Move expected date back by one day for the next iteration
            expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
            // Gap found, stop counting
            break;
        }
    }

    return streak;
}

// --- PASSPORT CONFIG ---
// --- UPDATED PASSPORT CONFIG ---
passport.use(new GoogleStrategy({
    clientID: VITE_GOOGLE_CLIENT_ID,
    clientSecret: VITE_GOOGLE_CLIENT_SECRET,
    callbackURL: VITE_GOOGLE_REDIRECT_URI,
    proxy: true
},
    async (accessToken, refreshToken, profile, done) => {
        const { id, displayName, emails } = profile;
        const email = emails[0].value;
        const now = new Date();

        try {
            const conn = await dbPool.getConnection();
            
            // Use INSERT ... ON DUPLICATE KEY UPDATE to handle race conditions
            // This ensures that even if two requests hit at once, the DB handles the "merge"
            await conn.query(`
                INSERT INTO users (user_id, google_id, user_name, email, last_login, level, answered_qids)
                VALUES (?, ?, ?, ?, ?, 'Beginner', JSON_ARRAY())
                ON DUPLICATE KEY UPDATE 
                    google_id = VALUES(google_id),
                    last_login = VALUES(last_login)
            `, [nanoid(12), id, displayName, email, now]);

            // Now fetch the user record (whether it was just created or just updated)
            const [users] = await conn.query('SELECT * FROM users WHERE email = ?', [email]);
            const user = users[0];

            conn.release();
            return done(null, user);
        } catch (err) {
            console.error("Google Auth Race Condition Error:", err);
            return done(err, null);
        }
    }
));

passport.serializeUser((user, done) => done(null, user.user_id));
passport.deserializeUser(async (id, done) => {
    try {
        const [users] = await dbPool.query('SELECT * FROM users WHERE user_id = ?', [id]);
        done(null, users[0]);
    } catch (err) {
        done(err, null);
    }
});

// --- ROUTES ---

// 1. Auth Routes
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/login/callback', (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) {
            // This catches the "Failed to obtain access token" or "Duplicate entry"
            console.error("Auth Callback Error:", err);
            return res.redirect(`${VITE_FRONTEND_URL}/?auth_error=session_collision`);
        }
        if (!user) {
            return res.redirect(`${VITE_FRONTEND_URL}/?auth_error=no_user`);
        }
        
        req.logIn(user, async (loginErr) => {
            if (loginErr) return next(loginErr);
            
            // Success logic
            await ensureDailyQuestionsGenerated(req.user, dbPool);
            return res.redirect(`${VITE_FRONTEND_URL}/practice`);
        });
    })(req, res, next);
});

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        req.session.destroy();
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out' });
    });
});

app.post('/auth/signup', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // Validation: Ensure name is provided
    if (!name) {
        return res.status(400).json({ error: 'Display Name is required for registration.' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
        const token = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserId = nanoid(12);

        const newUser = {
            user_id: newUserId,
            user_name: name,
            email: email,
            password_hash: hashedPassword,
            verification_token: token,
            is_verified: false,
            answered_qids: JSON.stringify([]) 
        };

        await dbPool.query('INSERT INTO users SET ?', newUser);
        
        // Attempt to send activation email
        try {
            const activationLink = `${process.env.VITE_FRONTEND_URL}/activate/${token}`;
            await transporter.sendMail({
                to: email,
                subject: 'Activate Your Account',
                html: `<h3>Welcome ${name}!</h3>
                       <p>Please click <a href="${activationLink}">here</a> to activate your account.</p>`
            });
        } catch (mailError) {
            console.error("Mail failed to send, but user was created:", mailError);
        }

        res.status(201).json({ message: 'Registration successful. Please check your email to activate.' });
    } catch (err) {
        console.error("Signup DB Error:", err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'This email is already registered.' });
        }
        res.status(500).json({ error: 'System error during registration.' });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await dbPool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.is_banned) return res.status(403).json({ error: 'Banned' });

        await dbPool.query('UPDATE users SET last_login = ? WHERE user_id = ?', [new Date(), user.user_id]);

        req.login(user, async (err) => {
            if (err) return res.status(500).json({ error: 'Login error' });
            await ensureDailyQuestionsGenerated(user, dbPool);
            res.json({ user_id: user.user_id, name: user.user_name });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const [[user]] = await dbPool.query('SELECT user_id FROM users WHERE email = ?', [email]);

    if (!user) return res.status(404).json({ error: 'Email not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60000); // 10 mins

    await dbPool.query('UPDATE users SET otp_code = ?, otp_expires = ? WHERE email = ?', [otp, expires, email]);

    await transporter.sendMail({
        to: email,
        subject: 'Your Password Reset OTP',
        text: `Your OTP is: ${otp}. It expires in 10 minutes.`
    });

    res.json({ message: 'OTP sent to your email.' });
});

// --- NEW ROUTE: Verify OTP & Reset Password ---
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;

    try {
        const conn = await dbPool.getConnection();
        const [[user]] = await conn.query(
            'SELECT user_id, otp_code, otp_expires FROM users WHERE email = ?', 
            [email]
        );

        if (!user) {
            conn.release();
            return res.status(404).json({ error: 'User not found.' });
        }

        // Check if OTP matches and hasn't expired
        const now = new Date();
        if (user.otp_code !== otp || now > new Date(user.otp_expires)) {
            conn.release();
            return res.status(400).json({ error: 'INVALID_OR_EXPIRED_OTP' });
        }

        // Hash new password and clear OTP fields
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await conn.query(
            'UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires = NULL WHERE email = ?',
            [hashedPassword, email]
        );

        conn.release();
        res.json({ message: 'PASSWORD_RESET_SUCCESSFUL' });
    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const conn = await dbPool.getConnection();
        
        const [users] = await conn.query(
            'SELECT * FROM users WHERE verification_token = ?', 
            [token]
        );
        
        if (users.length === 0) {
            conn.release();
            return res.status(400).json({ 
                error: 'Token invalid or already used. Please try logging in.' 
            });
        }

        const user = users[0];

        // Activate account
        await conn.query(
            'UPDATE users SET is_verified = true, verification_token = NULL WHERE user_id = ?', 
            [user.user_id]
        );

        // Create session
        req.login(user, async (err) => {
            if (err) {
                conn.release();
                return res.status(500).json({ 
                    error: 'Activation successful, but auto-login failed.' 
                });
            }

            conn.release();

            const userId = user.user_id;
            
            // Initialize status
            updateActivationStatus(userId, {
                status: 'generating',
                progress: 0,
                total: 10,
                message: 'Initializing question generation...'
            });

            // Start async generation (non-blocking)
            (async () => {
                try {
                    console.log(`🔄 Starting async generation for ${userId}...`);
                    
                    await ensureDailyQuestionsGenerated(user, dbPool, (progress) => {
                        updateActivationStatus(userId, {
                            status: 'generating',
                            ...progress
                        });
                    });
                    
                    updateActivationStatus(userId, {
                        status: 'complete',
                        progress: 10,
                        total: 10,
                        message: 'Questions ready!'
                    });
                    
                    console.log(`✅ Generation complete for ${userId}`);
                } catch (genErr) {
                    console.error('Generation error:', genErr);
                    updateActivationStatus(userId, {
                        status: 'error',
                        progress: 0,
                        total: 10,
                        message: 'Generation failed. Will retry on page load.'
                    });
                }
            })();
            
            // Return immediately
            res.json({ 
                message: 'Account activated. Preparing questions...',
                user: { id: user.user_id, name: user.user_name },
                status: 'generating'
            });
        });
    } catch (err) {
        console.error("Verification error:", err);
        res.status(500).json({ error: 'System error during activation.' });
    }
});

app.get('/api/activation-status', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;
    const status = activationStatus.get(userId);
    
    if (!status) {
        // No status found, check if questions already exist in database
        try {
            const conn = await dbPool.getConnection();
            const today = getTodayDate();
            const [[log]] = await conn.query(
                'SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?',
                [userId, today]
            );
            conn.release();
            
            if (log) {
                return res.json({
                    status: 'complete',
                    progress: 10,
                    total: 10,
                    message: 'Questions ready!'
                });
            } else {
                return res.json({
                    status: 'pending',
                    progress: 0,
                    total: 10,
                    message: 'Checking status...'
                });
            }
        } catch (err) {
            console.error('Status check error:', err);
            return res.status(500).json({ error: 'Status check failed' });
        }
    } else {
        res.json(status);
    }
});

// --- NEW ROUTE: Upload Avatar ---
app.post('/api/user/avatar', isLoggedIn, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const userId = req.user.user_id;
    const fileUrl = req.file.path; // Cloudinary returns the full URL in .path

    // Update DB with the cloud URL
    await dbPool.query('UPDATE users SET profile_pic = ? WHERE user_id = ?', [fileUrl, userId]);

    res.json({ message: 'Avatar updated', url: fileUrl });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ error: 'Server error during cloud upload' });
  }
});

// 2. User Data Route
app.get('/api/user', isLoggedIn, (req, res) => {
    const { user_id, user_name, email, score, level, day_streak, last_login, is_banned } = req.user;
    res.json({
        authenticated: true,
        user: { id: user_id, name: user_name, email, score, level, streak: day_streak, lastLogin: last_login, is_banned }
    });
});

// --- ADMIN ROUTES (Enhanced) ---
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        req.session.adminLoggedIn = true;
        res.json({ message: 'Admin logged in' });
    } else { res.status(401).json({ error: 'Invalid' }); }
});

// Admin Stats
app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
        const conn = await dbPool.getConnection();
        const [[{ total_users }]] = await conn.query('SELECT COUNT(*) as total_users FROM users');
        const [[{ total_questions }]] = await conn.query('SELECT COUNT(*) as total_questions FROM questions');
        const [[{ total_feedback }]] = await conn.query('SELECT COUNT(*) as total_feedback FROM user_feedback');
        const [[{ pending_reports }]] = await conn.query("SELECT COUNT(*) as pending_reports FROM feedback_reports WHERE status = 'pending'");
        conn.release();
        res.json({ total_users, total_questions, total_feedback, pending_reports });
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Admin User List
app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const [users] = await dbPool.query('SELECT user_id, user_name, email, score, role, is_banned, created_at FROM users ORDER BY created_at DESC');
        res.json(users);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Admin Create User
app.post('/api/admin/users', isAdmin, async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserId = nanoid(12);
        const newUser = {
            user_id: newUserId, user_name: name, email, password_hash: hashedPassword,
            level: 'Beginner', role: role || 'user', created_at: new Date()
        };
        await dbPool.query('INSERT INTO users SET ?', newUser);
        logActivity(newUserId, 'Admin Created', `User created by Admin`);
        res.json({ message: 'User created successfully' });
    } catch (err) { res.status(500).json({ error: 'Failed to create user' }); }
});

// Admin Get Single User Details & Logs
app.get('/api/admin/users/:id', isAdmin, async (req, res) => {
    try {
        const [users] = await dbPool.query('SELECT user_id, user_name, email, score, level, day_streak, role, is_banned, created_at, last_login FROM users WHERE user_id = ?', [req.params.id]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const [logs] = await dbPool.query('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.id]);

        res.json({ ...users[0], logs });
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Admin Update User Profile
app.put('/api/admin/users/:id', isAdmin, async (req, res) => {
    const { user_name, email, role } = req.body;
    try {
        await dbPool.query('UPDATE users SET user_name = ?, email = ?, role = ? WHERE user_id = ?', [user_name, email, role, req.params.id]);
        res.json({ message: 'User updated' });
    } catch (err) { res.status(500).json({ error: 'Update failed' }); }
});

// --- NEW ROUTE: Promote User Level ---
app.post('/api/admin/users/:id/promote', isAdmin, async (req, res) => {
    const userId = req.params.id;
    const levels = ['Beginner', 'Intermediate', 'Advanced', 'Pro', 'Expert'];
    // Scores required to maintain the level: 
    // Intermediate > 25000, Advanced > 50000, Pro > 75000, Expert > 100000
    const levelThresholds = {
        'Intermediate': 25001,
        'Advanced': 50001,
        'Pro': 75001,
        'Expert': 100001
    };

    try {
        const conn = await dbPool.getConnection();
        const [users] = await conn.query('SELECT level, score FROM users WHERE user_id = ?', [userId]);

        if (users.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'User not found' });
        }

        const currentLevel = users[0].level;
        const currentScore = users[0].score;
        const currentIndex = levels.indexOf(currentLevel);

        if (currentIndex === -1 || currentIndex === levels.length - 1) {
            conn.release();
            return res.status(400).json({ error: 'User is already at max level or invalid level' });
        }

        const newLevel = levels[currentIndex + 1];
        const newMinScore = levelThresholds[newLevel];

        // Only bump score if it's below the threshold for the new level
        let query = 'UPDATE users SET level = ?';
        let params = [newLevel];

        if (currentScore < newMinScore) {
            query += ', score = ?';
            params.push(newMinScore);
        }

        query += ' WHERE user_id = ?';
        params.push(userId);

        await conn.query(query, params);

        await logActivity(userId, 'Admin Promotion', `Promoted to ${newLevel} by Admin (Score boosted to ${Math.max(currentScore, newMinScore)})`);

        conn.release();
        res.json({ message: `User promoted to ${newLevel}`, newLevel });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin Toggle Ban
app.post('/api/admin/users/:id/ban-toggle', isAdmin, async (req, res) => {
    const { is_banned } = req.body;
    try {
        await dbPool.query('UPDATE users SET is_banned = ? WHERE user_id = ?', [is_banned, req.params.id]);
        res.json({ message: `User ${is_banned ? 'banned' : 'unbanned'}` });
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Admin Reset Password
app.post('/api/admin/users/:id/reset-password', isAdmin, async (req, res) => {
    const { newPassword } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await dbPool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hashedPassword, req.params.id]);
        res.json({ message: 'Password reset successfully' });
    } catch (err) { res.status(500).json({ error: 'Error resetting password' }); }
});

// Admin Delete User
app.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
    try {
        await dbPool.query('DELETE FROM users WHERE user_id = ?', [req.params.id]);
        res.json({ message: 'User deleted permanently' });
    } catch (err) { res.status(500).json({ error: 'Error deleting user' }); }
});

// 3. Daily Questions Route
// 3. Daily Questions Route (Fixed)
app.get('/api/daily-questions', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;
    const today = getTodayDate();
    const conn = await dbPool.getConnection();

    try {
        // 1. Get the Daily Log
        let [logs] = await conn.query('SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?', [userId, today]);

        // 2. If no log exists, generate one
        if (logs.length === 0) {
            await ensureDailyQuestionsGenerated(req.user, dbPool);
            [logs] = await conn.query('SELECT * FROM user_daily_log WHERE user_id = ? AND challenge_date = ?', [userId, today]);
        }

        if (logs.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'Could not generate questions.' });
        }

        const questionIds = logs[0].question_ids_json;

        // Safety Check 1: Log exists but has no IDs
        if (!questionIds || questionIds.length === 0) {
            // Delete corrupted log
            await conn.query('DELETE FROM user_daily_log WHERE log_id = ?', [logs[0].log_id]);
            conn.release();
            return res.status(404).json({ error: 'Empty log found. Please refresh.' });
        }

        // 3. Fetch Questions
        const [questions] = await conn.query(
            `SELECT question_id, qid, question_text, options, difficulty, category, hint, explanation, correct_answer_index 
             FROM questions WHERE question_id IN (?) ORDER BY FIELD(question_id, ?)`,
            [questionIds, ...questionIds]
        );

        // Safety Check 2: Log points to questions that don't exist anymore
        if (questions.length === 0) {
            console.log("Found orphan log. Deleting...");
            await conn.query('DELETE FROM user_daily_log WHERE log_id = ?', [logs[0].log_id]);
            conn.release();
            return res.status(404).json({ error: 'Question data missing. Please refresh to regenerate.' });
        }

        const qids = questions.map(q => q.qid);

        // 4. Fetch Attempts (Only if qids exist)
        let attempts = [];
        if (qids.length > 0) {
            const [rows] = await conn.query(
                'SELECT * FROM user_attempts WHERE user_id = ? AND attempt_date = ? AND qid IN (?)',
                [userId, today, qids]
            );
            attempts = rows;
        }

        const attemptsMap = new Map(attempts.map(a => [a.qid, a]));

        // 5. Build Response
        const dailyQuestions = questions.map(q => {
            const attempt = attemptsMap.get(q.qid);
            const isAnswered = attempt && ['correct', 'wrong', 'gave_up'].includes(attempt.status);

            return {
                questionId: q.question_id,
                qid: q.qid,
                questionText: q.question_text,
                options: q.options,
                difficulty: q.difficulty,
                category: q.category,
                // Only reveal details if answered
                ...(isAnswered && {
                    hint: q.hint,
                    explanation: q.explanation,
                    correctAnswerIndex: q.correct_answer_index,
                    selectedAnswerIndex: attempt.selected_answer_index,
                    status: attempt.status,
                    pointsEarned: attempt.points_earned
                }),
                // Reveal hint if used
                ...(attempt && attempt.status === 'hint_used' && {
                    hint: q.hint,
                    status: 'hint_used',
                    pointsEarned: attempt.points_earned
                })
            };
        });

        conn.release();
        res.json({ questions: dailyQuestions, logId: logs[0].log_id });

    } catch (err) {
        if (conn) conn.release();
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 4. LEADERBOARD ROUTE
app.get('/api/leaderboard', async (req, res) => {
    try {
        const [rows] = await dbPool.query(
            `SELECT user_id, user_name, profile_pic, score, level, day_streak,
             (SELECT COUNT(*) FROM user_attempts WHERE user_id = u.user_id AND status = 'correct') as questions_solved,
             (SELECT COUNT(*) FROM user_attempts WHERE user_id = u.user_id AND status IN ('correct', 'wrong')) as total_attempted
             FROM users u
             ORDER BY score DESC
             LIMIT 100`
        );

        const leaderboard = rows.map((row, index) => ({
            rank: index + 1,
            userId: row.user_id,
            user: row.user_name,
            profilePic: row.profile_pic,
            score: row.score,
            level: row.level,
            questionsSolved: row.questions_solved,
            accuracy: row.total_attempted > 0 ? ((row.questions_solved / row.total_attempted) * 100).toFixed(0) : 0
        }));

        res.json(leaderboard);
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- NEW ROUTE: Get Public User Profile (View Others) ---
app.get('/api/users/:id/public', async (req, res) => {
    const targetUserId = req.params.id;
    try {
        const conn = await dbPool.getConnection();

        // 1. Basic Info
        const [users] = await conn.query(
            'SELECT user_name, bio, profile_pic, score, level, day_streak, created_at FROM users WHERE user_id = ?',
            [targetUserId]
        );

        if (users.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'User not found' });
        }
        const user = users[0];

        // 2. Topic Stats
        const [topicStats] = await conn.query(
            `SELECT q.category,
            COUNT(ua.attempt_id) AS total_attempted,
            SUM(CASE WHEN ua.status = 'correct' THEN 1 ELSE 0 END) AS total_correct
            FROM user_attempts ua
            JOIN questions q ON ua.question_id = q.question_id
            WHERE ua.user_id = ? AND ua.status IN ('correct', 'wrong')
            GROUP BY q.category`,
            [targetUserId]
        );

        // 3. Totals
        const [totals] = await conn.query(
            `SELECT COUNT(*) as total, 
             SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) as correct 
             FROM user_attempts WHERE user_id = ? AND status IN ('correct', 'wrong')`,
            [targetUserId]
        );

        conn.release();

        // Process Topics
        const allCategories = [
            'Quantitative Aptitude',
            'Logical Reasoning',
            'Verbal Ability',
            'Data Interpretation',
            'Puzzles',
            'Technical Aptitude'
        ];
        const topics = allCategories.map(category => {
            const stats = topicStats.find(t => t.category === category);
            const totalQs = stats ? stats.total_attempted : 0;
            const correctQs = stats ? stats.total_correct : 0;
            const progress = totalQs > 0 ? ((correctQs / totalQs) * 100).toFixed(0) : 0;

            return {
                name: category,
                progress: Number(progress),
                total: totalQs,
                correct: correctQs
            };
        });

        res.json({
            name: user.user_name,
            bio: user.bio,
            profilePic: user.profile_pic,
            stats: {
                score: user.score,
                level: user.level,
                streak: user.day_streak,
                solved: totals[0].correct || 0,
                accuracy: totals[0].total > 0 ? ((totals[0].correct / totals[0].total) * 100).toFixed(0) : 0,
                joined: user.created_at
            },
            topics: topics
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 5. PROFILE/PROGRESS & DASHBOARD ROUTE (UPDATED with role)
app.get('/api/user/progress', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;

    try {
        const conn = await dbPool.getConnection();

        // 1. Get Basic User Info & Rank
        // Added 'role' to the query
        const [userRows] = await conn.query(
            'SELECT email, user_name, bio, profile_pic, score, level, day_streak, created_at, role FROM users WHERE user_id = ?',
            [userId]
        );
        const userInfo = userRows[0];

        const [rankResult] = await conn.query(
            'SELECT COUNT(*) + 1 as `rank` FROM users WHERE score > ?',
            [userInfo.score]
        );
        const userRank = rankResult[0].rank;

        // 2. Get Topic Stats
        const [topicStats] = await conn.query(
            `SELECT 
          q.category,
          COUNT(ua.attempt_id) AS total_attempted,
          SUM(CASE WHEN ua.status = 'correct' THEN 1 ELSE 0 END) AS total_correct
       FROM user_attempts ua
       JOIN questions q ON ua.question_id = q.question_id
       WHERE ua.user_id = ? AND ua.status IN ('correct', 'wrong')
       GROUP BY q.category`,
            [userId]
        );

        // 3. Get Recent Activity
        const [recentActivity] = await conn.query(
            `SELECT ua.attempt_date, ua.status, ua.points_earned, q.category, q.difficulty 
         FROM user_attempts ua
         JOIN questions q ON ua.question_id = q.question_id
         WHERE ua.user_id = ?
         ORDER BY ua.attempt_id DESC LIMIT 5`,
            [userId]
        );

        // --- NEW SECTION: Get Calendar Heatmap Data (Last 365 Days) ---
        const [calendarRows] = await conn.query(
            `SELECT DATE_FORMAT(attempt_date, '%Y-%m-%d') as dateStr, COUNT(*) as count 
         FROM user_attempts 
         WHERE user_id = ? 
         GROUP BY dateStr`,
            [userId]
        );

        // Convert array to object for O(1) lookup: { "2023-10-25": 5, ... }
        const calendarMap = {};
        calendarRows.forEach(row => {
            calendarMap[row.dateStr] = row.count;
        });

        // 4. Calculate Totals
        const [totalAnswered] = await conn.query(
            `SELECT COUNT(*) as count FROM user_attempts WHERE user_id = ? AND status IN ('correct', 'wrong')`,
            [userId]
        );
        const [totalCorrect] = await conn.query(
            `SELECT COUNT(*) as count FROM user_attempts WHERE user_id = ? AND status = 'correct'`,
            [userId]
        );

        conn.release();

        // Process Topic Data
        const total = totalAnswered[0].count;
        const correct = totalCorrect[0].count;
        const allCategories = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation', 'Puzzles', 'Technical Aptitude'];

        const topics = allCategories.map(category => {
            const stats = topicStats.find(t => t.category === category);
            const totalQs = stats ? stats.total_attempted : 0;
            const correctQs = stats ? stats.total_correct : 0;
            const progress = totalQs > 0 ? ((correctQs / totalQs) * 100).toFixed(0) : 0;

            // ADDED: total and correct fields
            return {
                name: category,
                progress: Number(progress),
                total: totalQs,
                correct: correctQs
            };
        });

        res.json({
            profile: {
                name: userInfo.user_name,
                email: userInfo.email,
                bio: userInfo.bio,
                profile_pic: userInfo.profile_pic,
                joined: userInfo.created_at,
                role: userInfo.role // Pass the role to the frontend
            },
            stats: {
                questionsAnswered: total,
                accuracy: total > 0 ? ((correct / total) * 100).toFixed(0) : 0,
                streak: userInfo.day_streak,
                score: userInfo.score,
                level: userInfo.level
            },
            topics: topics,
            rank: userRank,
            activity: recentActivity,
            calendar: calendarMap
        });

    } catch (err) {
        console.error('Error fetching profile data:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/user/update', isLoggedIn, async (req, res) => {
    const { bio, user_name } = req.body;
    const userId = req.user.user_id;

    try {
        const conn = await dbPool.getConnection();
        await conn.query('UPDATE users SET bio = ?, user_name = ? WHERE user_id = ?', [bio, user_name, userId]);
        conn.release();
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// 6. FEEDBACK ROUTES
app.post('/api/feedback', isLoggedIn, async (req, res) => {
    const { rating, comment } = req.body;
    const userId = req.user.user_id;

    if (!rating || rating < 0.5 || rating > 5) {
        return res.status(400).json({ error: 'Please provide a valid rating (0.5 - 5.0).' });
    }

    try {
        const conn = await dbPool.getConnection();
        await conn.query(
            'INSERT INTO user_feedback (user_id, rating, comment) VALUES (?, ?, ?)',
            [userId, rating, comment || null]
        );
        conn.release();
        res.status(201).json({ message: 'Feedback submitted successfully' });
    } catch (err) {
        console.error('Feedback error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/feedback', async (req, res) => {
    try {
        const [rows] = await dbPool.query(`
            SELECT f.feedback_id, f.rating, f.comment, f.created_at, u.user_name, f.user_id 
            FROM user_feedback f
            JOIN users u ON f.user_id = u.user_id
            ORDER BY f.created_at DESC
            LIMIT 50
        `);
        res.json(rows);
    } catch (err) {
        console.error('Fetch feedback error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/feedback/:id', isLoggedIn, async (req, res) => {
    const feedbackId = req.params.id;
    const userId = req.user.user_id;
    try {
        const conn = await dbPool.getConnection();
        const [rows] = await conn.query('SELECT user_id FROM user_feedback WHERE feedback_id = ?', [feedbackId]);

        if (rows.length === 0) { conn.release(); return res.status(404).json({ error: 'Not found' }); }
        if (rows[0].user_id !== userId) { conn.release(); return res.status(403).json({ error: 'Unauthorized' }); }

        await conn.query('DELETE FROM user_feedback WHERE feedback_id = ?', [feedbackId]);
        conn.release();
        res.json({ message: 'Feedback deleted' });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/feedback/:id/report', isLoggedIn, async (req, res) => {
    const feedbackId = req.params.id;
    const userId = req.user.user_id;
    try {
        const conn = await dbPool.getConnection();
        const [existing] = await conn.query('SELECT * FROM feedback_reports WHERE feedback_id = ? AND reporter_user_id = ?', [feedbackId, userId]);
        if (existing.length > 0) { conn.release(); return res.status(400).json({ error: 'Already reported' }); }

        await conn.query('INSERT INTO feedback_reports (feedback_id, reporter_user_id) VALUES (?, ?)', [feedbackId, userId]);
        conn.release();
        res.json({ message: 'Feedback reported' });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/feedback/:id', isLoggedIn, async (req, res) => {
    const feedbackId = req.params.id;
    const { rating, comment } = req.body;
    const userId = req.user.user_id;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Valid rating required' });
    }

    try {
        const conn = await dbPool.getConnection();

        // 1. Check ownership
        const [rows] = await conn.query('SELECT user_id FROM user_feedback WHERE feedback_id = ?', [feedbackId]);

        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'Feedback not found' });
        }

        if (rows[0].user_id !== userId) {
            conn.release();
            return res.status(403).json({ error: 'Unauthorized action' });
        }

        // 2. Update
        await conn.query(
            'UPDATE user_feedback SET rating = ?, comment = ? WHERE feedback_id = ?',
            [rating, comment, feedbackId]
        );

        conn.release();
        res.json({ message: 'Feedback updated successfully' });
    } catch (err) {
        console.error("Edit feedback error:", err);
        res.status(500).json({ error: 'Server error' });
    }
});
// 7. Game Logic Routes
async function updateGameStats(userId, points, conn) {
    await conn.query('UPDATE users SET score = score + ? WHERE user_id = ?', [points, userId]);
    const [[{ score }]] = await conn.query('SELECT score FROM users WHERE user_id = ?', [userId]);
    const newLevel = calculateLevel(score);
    await conn.query('UPDATE users SET level = ? WHERE user_id = ?', [newLevel, userId]);
}

app.post('/api/submit-answer', isLoggedIn, async (req, res) => {
    const { questionId, qid, selectedAnswerIndex } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();

    if (selectedAnswerIndex === undefined || !qid) return res.status(400).json({ error: 'Missing data' });

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const [existing] = await conn.query('SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?', [userId, qid, today]);
        if (existing.length > 0 && existing[0].status !== 'pending' && existing[0].status !== 'hint_used') {
            await conn.rollback(); conn.release();
            return res.status(403).json({ error: 'Already answered' });
        }

        const [[qData]] = await conn.query('SELECT correct_answer_index, explanation, hint FROM questions WHERE qid = ?', [qid]);
        if (!qData) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Question not found' }); }

        const isCorrect = parseInt(selectedAnswerIndex) === qData.correct_answer_index;
        const hadHint = existing.length > 0 && existing[0].status === 'hint_used';

        let points = isCorrect ? POINTS_CORRECT : POINTS_WRONG;
        if (hadHint) points += (existing[0]?.points_earned || POINTS_HINT);

        const status = isCorrect ? 'correct' : 'wrong';

        if (existing.length > 0) {
            await conn.query('UPDATE user_attempts SET selected_answer_index = ?, status = ?, points_earned = ? WHERE attempt_id = ?',
                [selectedAnswerIndex, status, points, existing[0].attempt_id]);
        } else {
            await conn.query('INSERT INTO user_attempts (user_id, qid, question_id, selected_answer_index, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, qid, questionId, selectedAnswerIndex, status, points, today]);
        }

        await updateGameStats(userId, points, conn);
        await conn.query(`UPDATE users SET answered_qids = JSON_ARRAY_APPEND(COALESCE(answered_qids, '[]'), '$', ?) WHERE user_id = ?`, [qid, userId]);

        await conn.commit();
        res.json({ status, pointsEarned: points, ...qData });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        conn.release();
    }
});

app.post('/api/use-hint', isLoggedIn, async (req, res) => {
    const { questionId, qid } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const [existing] = await conn.query('SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?', [userId, qid, today]);

        if (existing.length > 0 && existing[0].status !== 'pending') {
            const [[q]] = await conn.query('SELECT hint FROM questions WHERE qid = ?', [qid]);
            await conn.rollback(); conn.release();
            return res.json({ hint: q.hint, pointsEarned: 0 });
        }

        const [[qData]] = await conn.query('SELECT hint FROM questions WHERE qid = ?', [qid]);

        if (existing.length === 0) {
            await conn.query('INSERT INTO user_attempts (user_id, qid, question_id, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, qid, questionId, 'hint_used', POINTS_HINT, today]);
        } else {
            await conn.query('UPDATE user_attempts SET status = ?, points_earned = ? WHERE attempt_id = ?', ['hint_used', POINTS_HINT, existing[0].attempt_id]);
        }

        await updateGameStats(userId, POINTS_HINT, conn);
        await conn.commit();
        res.json({ hint: qData.hint, pointsEarned: POINTS_HINT });
    } catch (err) {
        await conn.rollback();
        conn.release();
        res.status(500).json({ error: 'Error' });
    }
});

app.post('/api/give-up', isLoggedIn, async (req, res) => {
    const { questionId, qid } = req.body;
    const userId = req.user.user_id;
    const today = getTodayDate();

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const [existing] = await conn.query('SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?', [userId, qid, today]);

        if (existing.length > 0 && existing[0].status !== 'pending' && existing[0].status !== 'hint_used') {
            await conn.rollback(); conn.release();
            return res.status(403).json({ error: 'Already done' });
        }

        const [[qData]] = await conn.query('SELECT correct_answer_index, explanation, hint FROM questions WHERE qid = ?', [qid]);

        const hadHint = existing.length > 0 && existing[0].status === 'hint_used';
        const points = POINTS_GIVEUP + (hadHint ? POINTS_HINT : 0);

        if (existing.length > 0) {
            await conn.query('UPDATE user_attempts SET status = ?, points_earned = ?, selected_answer_index = NULL WHERE attempt_id = ?', ['gave_up', points, existing[0].attempt_id]);
        } else {
            await conn.query('INSERT INTO user_attempts (user_id, qid, question_id, status, points_earned, attempt_date) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, qid, questionId, 'gave_up', points, today]);
        }

        await updateGameStats(userId, points, conn);
        await conn.query(`UPDATE users SET answered_qids = JSON_ARRAY_APPEND(COALESCE(answered_qids, '[]'), '$', ?) WHERE user_id = ?`, [qid, userId]);

        await conn.commit();
        res.json({ status: 'gave_up', pointsEarned: points, ...qData });
    } catch (err) {
        await conn.rollback();
        conn.release();
        res.status(500).json({ error: 'Error' });
    }
});

// --- ADMIN ROUTES ---

app.post('/api/admin/generate-questions', isAdmin, async (req, res) => {
    try {
        const ids = await generateDailyQuestionsForUser('Beginner', dbPool, 10);
        res.json({ message: `Generated ${ids.length} questions` });
    } catch (err) {
        res.status(500).json({ error: 'Generation failed' });
    }
});
// QUESTION MANAGEMENT ROUTES
// 1. GET ALL QUESTIONS (Updated limit for filtering)
app.get('/api/admin/questions', isAdmin, async (req, res) => {
    try {
        const [questions] = await dbPool.query('SELECT * FROM questions ORDER BY created_at DESC LIMIT 1000');
        res.json(questions);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// 2. NEW: GET SINGLE QUESTION (For Editing)
app.get('/api/admin/questions/:id', isAdmin, async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT * FROM questions WHERE question_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Question not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// 3. NEW: UPDATE QUESTION
app.put('/api/admin/questions/:id', isAdmin, async (req, res) => {
    const { question_text, options, correct_answer_index, difficulty, category, hint, explanation } = req.body;
    try {
        await dbPool.query(
            'UPDATE questions SET question_text = ?, options = ?, correct_answer_index = ?, difficulty = ?, category = ?, hint = ?, explanation = ? WHERE question_id = ?',
            [question_text, JSON.stringify(options), correct_answer_index, difficulty, category, hint, explanation, req.params.id]
        );
        res.json({ message: 'Question updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

// 4. DELETE QUESTION (Existing)
app.delete('/api/admin/questions/:id', isAdmin, async (req, res) => {
    try {
        await dbPool.query('DELETE FROM questions WHERE question_id = ?', [req.params.id]);
        res.json({ message: 'Question deleted' });
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// 5. Generate Bulk Questions
// --- NEW ROUTE: Bulk Generate Questions ---
app.post('/api/admin/generate-bulk', isAdmin, async (req, res) => {
    const { jobs } = req.body; // Expecting an array of objects

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: 'No generation jobs provided' });
    }

    // Safety Cap: Maximum 100 questions per request to prevent server overload
    const totalRequested = jobs.reduce((sum, job) => sum + (parseInt(job.count) || 0), 0);
    if (totalRequested > 100) {
        return res.status(400).json({ error: 'Max 100 questions per batch allowed.' });
    }

    try {
        let totalGenerated = 0;
        const results = [];

        // PROCESS JOBS SEQUENTIALLY (To avoid Rate Limits)
        for (const job of jobs) {
            const { category, difficulty, count, subTopic } = job;
            if (count > 0) {
                const countGen = await generateBulkQuestions(dbPool, category, difficulty, count, subTopic);
                totalGenerated += countGen;
                results.push({ category, difficulty, generated: countGen });
            }
        }

        res.json({
            message: `Batch complete. Generated ${totalGenerated} questions.`,
            details: results
        });

    } catch (err) {
        console.error("Bulk Generation Error:", err);
        res.status(500).json({ error: 'Server error during generation' });
    }
});

app.get('/api/admin/feedback', isAdmin, async (req, res) => {
    try {
        const [rows] = await dbPool.query(`
            SELECT f.feedback_id, f.rating, f.comment, f.created_at, u.user_name 
            FROM user_feedback f
            JOIN users u ON f.user_id = u.user_id
            ORDER BY f.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Fetch all feedback error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/feedback/:id', isAdmin, async (req, res) => {
    try {
        await dbPool.query('DELETE FROM user_feedback WHERE feedback_id = ?', [req.params.id]);
        res.json({ message: 'Feedback deleted successfully' });
    } catch (err) {
        console.error('Error deleting feedback:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/feedback-reports', isAdmin, async (req, res) => {
    try {
        const [reports] = await dbPool.query(
            `SELECT r.report_id, r.feedback_id, r.status, f.comment, f.rating
             FROM feedback_reports r
             JOIN user_feedback f ON r.feedback_id = f.feedback_id
             WHERE r.status = 'pending'`
        );
        res.json(reports);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// --- NEW ROUTE: Get Single Question by QID (With Retry Logic) ---
app.get('/api/questions/single/:qid', isLoggedIn, async (req, res) => {
    const { qid } = req.params;
    const userId = req.user.user_id;
    const today = getTodayDate();

    try {
        const conn = await dbPool.getConnection();

        // 1. Get Question Details
        const [[question]] = await conn.query(
            'SELECT * FROM questions WHERE qid = ?',
            [qid]
        );

        if (!question) {
            conn.release();
            return res.status(404).json({ error: 'Question not found' });
        }

        // 2. RETRY LOGIC:
        // Prioritize today's attempt. If none, allow retry unless ALREADY Solved correctly in history.

        let attempt = null;

        // Check today's attempt first
        const [[todayAttempt]] = await conn.query(
            'SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND attempt_date = ?',
            [userId, qid, today]
        );

        if (todayAttempt) {
            attempt = todayAttempt;
        } else {
            // Check if ever solved correctly in the past
            const [[solvedAttempt]] = await conn.query(
                "SELECT * FROM user_attempts WHERE user_id = ? AND qid = ? AND status = 'correct'",
                [userId, qid]
            );
            if (solvedAttempt) {
                attempt = solvedAttempt; // Locked as solved
            }
            // If neither today attempt nor historical correct, attempt stays NULL (Unattempted/Retryable)
        }

        conn.release();

        // 3. Construct Response
        const response = {
            questionId: question.question_id,
            qid: question.qid,
            questionText: question.question_text,
            options: question.options,
            difficulty: question.difficulty,
            category: question.category,
            status: attempt ? attempt.status : 'unattempted',
            selectedAnswerIndex: attempt ? attempt.selected_answer_index : null,
            // Reveal info ONLY if solved/given up
            ...(attempt && ['correct', 'wrong', 'gave_up'].includes(attempt.status) && {
                explanation: question.explanation,
                correctAnswerIndex: question.correct_answer_index,
                hint: question.hint
            }),
            // Reveal hint if they bought it
            ...(attempt && attempt.status === 'hint_used' && {
                hint: question.hint
            })
        };

        res.json(response);

    } catch (err) {
        console.error("Single Question Error:", err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- NEW ROUTE: Get Questions by Category ---
app.get('/api/questions/category', isLoggedIn, async (req, res) => {
    const { category } = req.query; // e.g., ?category=Technical Aptitude
    if (!category) return res.status(400).json({ error: 'Category required' });

    try {
        const conn = await dbPool.getConnection();

        // Fetch questions for this category (limit to 50 to prevent overload)
        const [questions] = await conn.query(
            `SELECT question_id, qid, question_text, options, difficulty, category 
             FROM questions 
             WHERE category = ? 
             ORDER BY created_at DESC LIMIT 50`,
            [category]
        );

        // Check if user has attempted them (to show status like 'Solved')
        const userId = req.user.user_id;
        const qids = questions.map(q => q.qid);

        let attemptsMap = new Map();
        if (qids.length > 0) {
            // ORDER BY attempt_date ASC ensures the latest attempt overwrites earlier ones in the Map
            const [attempts] = await conn.query(
                'SELECT qid, status FROM user_attempts WHERE user_id = ? AND qid IN (?) ORDER BY attempt_date ASC',
                [userId, qids]
            );
            attemptsMap = new Map(attempts.map(a => [a.qid, a.status]));
        }

        conn.release();

        // Merge status into questions
        const result = questions.map(q => ({
            ...q,
            status: attemptsMap.get(q.qid) || 'unattempted'
        }));

        res.json(result);

    } catch (err) {
        console.error("Category fetch error:", err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- NEW ROUTE: Get Stats per Category (Total vs Solved) ---
app.get('/api/topics/stats', isLoggedIn, async (req, res) => {
    const userId = req.user.user_id;
    try {
        const conn = await dbPool.getConnection();

        // 1. Get Total Questions per Category (Global)
        const [totalRows] = await conn.query(
            `SELECT category, COUNT(*) as total FROM questions GROUP BY category`
        );

        // 2. Get User's Solved Questions per Category
        const [solvedRows] = await conn.query(
            `SELECT q.category, COUNT(DISTINCT ua.question_id) as solved
             FROM user_attempts ua
             JOIN questions q ON ua.question_id = q.question_id
             WHERE ua.user_id = ? AND ua.status = 'correct'
             GROUP BY q.category`,
            [userId]
        );

        conn.release();

        // 3. Merge Data into a dictionary: { "Logic": { total: 10, solved: 2 } }
        const stats = {};
        totalRows.forEach(row => {
            stats[row.category] = { total: row.total, solved: 0 };
        });
        solvedRows.forEach(row => {
            if (stats[row.category]) {
                stats[row.category].solved = row.solved;
            }
        });

        res.json(stats);
    } catch (err) {
        console.error("Topic stats error:", err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- CRON JOB ---
cron.schedule('0 0 * * *', async () => {
    console.log('Running daily streak check...');
    const conn = await dbPool.getConnection();
    try {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];

        const [users] = await conn.query('SELECT user_id, day_streak FROM users WHERE last_login < ? AND day_streak > 0', [yStr]);
        for (const u of users) {
            const penalty = u.day_streak * STREAK_LOSS;
            await conn.query('UPDATE users SET day_streak = 0, score = score + ? WHERE user_id = ?', [penalty, u.user_id]);
        }
    } catch (e) { console.error(e); }
    finally { conn.release(); }
}, { timezone: "UTC" });

const port = VITE_PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));