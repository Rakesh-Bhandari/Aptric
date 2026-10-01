# Aptitude Master — Backend

Express.js + MySQL backend for the Aptitude Master application.

## Folder Structure

```
backend/
├── src/
│   ├── certs/
│   │   └── isrgrootx1.pem          # TiDB SSL certificate
│   ├── config/
│   │   ├── db.js                   # MySQL connection pool
│   │   ├── cloudinary.js           # Cloudinary + Multer setup
│   │   ├── mailer.js               # Nodemailer transporter
│   │   └── passport.js             # Google OAuth strategy
│   ├── middleware/
│   │   └── auth.js                 # isLoggedIn, isAdmin guards
│   ├── routes/
│   │   ├── auth.js                 # /auth/* (Google OAuth, signup, login, verify)
│   │   ├── user.js                 # /api/user/* (profile, progress, avatar)
│   │   ├── game.js                 # /api/daily-questions, submit-answer, hint, give-up
│   │   ├── questions.js            # /api/leaderboard, questions/*, topics/stats
│   │   ├── feedback.js             # /api/feedback/*
│   │   ├── admin.js                # /api/admin/* (users, questions, generation)
│   │   └── cron.js                 # /api/cron/streak-check
│   ├── services/
│   │   └── questionBank.js         # AI generation (cron/admin) + bank-only daily assignment
│   ├── utils/
│   │   └── helpers.js              # Constants, calculateLevel, logActivity, etc.
│   └── server.js                   # App entry point
├── package.json
├── vercel.json
└── README.md
```

## Environment Variables (.env)

```env
VITE_PORT=5000
VITE_FRONTEND_URL=http://localhost:5173

# Database (TiDB)
VITE_DB_HOST=
VITE_DB_USER=
VITE_DB_PASSWORD=
VITE_DB_NAME=apti_db1

# Google OAuth
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_SECRET=
VITE_GOOGLE_REDIRECT_URI=

# Session
VITE_SESSION_SECRET=

# Email (Gmail)
EMAIL_USER=
EMAIL_PASS=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# AI (OpenRouter)
OPEN_ROUTER_API_KEY=

# Vercel Cron
CRON_SECRET=
QUESTION_BANK_MIN_UNUSED=50   # cron tops up a difficulty below this many unattempted questions
QUESTION_BANK_MAX_PER_RUN=20  # max questions generated per difficulty per cron run
```

## Scripts

```bash
npm start     # Production
npm run dev   # Development with hot reload (Node 18+)
```

## Admin Access

Admin access is role-based: any logged-in user with `users.role = 'admin'` can use `/admin` and `/api/admin/*`.
There is no admin password. To make your account an admin, run once against the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

Every admin write action is recorded in `activity_logs` under the admin's `user_id`.
