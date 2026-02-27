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
│   │   ├── questionGenerator.js    # AI daily question generation (OpenRouter)
│   │   ├── bulkGenerator.js        # Admin bulk question generation
│   │   └── dailyQuestions.js       # Ensures daily questions exist per user
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

# Admin
VITE_ADMIN_PASSWORD=

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
```

## Scripts

```bash
npm start     # Production
npm run dev   # Development with hot reload (Node 18+)
```
