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
│   │   └── cron.js                 # /api/cron/streak-check, question-bank, generation-jobs
│   ├── services/
│   │   └── questionBank.js         # AI generation jobs, draft review, bank-only daily assignment
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
QUESTION_MODEL=google/gemini-2.0-flash-001     # generates questions
QUESTION_FALLBACK_MODEL=openai/gpt-4o-mini     # used when the primary call fails or returns bad JSON
QUESTION_VERIFY_MODEL=                         # solves each question independently; defaults to QUESTION_MODEL
QUESTION_AI_TIMEOUT_MS=25000                   # per AI call

# Vercel Cron
CRON_SECRET=
QUESTION_BANK_MIN_UNUSED=50   # daily cron queues a top-up for a difficulty below this many unattempted questions
QUESTION_BANK_MAX_PER_RUN=20  # max questions queued per difficulty per top-up
GENERATION_JOB_BUDGET_MS=20000 # /api/cron/generation-jobs starts new chunks only within this time

# Rate limiting (Upstash Redis) — optional but recommended in production.
# Without these, limits fall back to in-memory counters per serverless instance.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
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

## Question Generation

AI generation never runs inside a user or admin request:

1. An admin bulk request (`POST /api/admin/generate-bulk`) or the daily top-up
   (`/api/cron/question-bank`) inserts a row into `question_generation_jobs`.
2. `/api/cron/generation-jobs` (daily at 23:45 UTC, 15 minutes after the top-up) claims a job with a short lease and
   processes it one batch of up to 10 questions at a time. The admin Questions tab
   shows each job's progress.
3. Each generated question is checked against a zod schema (4 distinct non-empty
   options, integer `correct_answer` 0-3, known category, non-empty text), skipped if
   its normalised text already exists (`questions.question_hash`, unique), and kept
   only if the model, solving it independently, picks the same answer.
4. Survivors are saved with `status = 'draft'`. Only `published` questions are served
   to users; admins approve or reject drafts from the Questions tab.

Vercel Hobby only allows daily crons, so `/api/cron/generation-jobs` runs once a day and
works through as many batches as fit in `GENERATION_JOB_BUDGET_MS`. To drain jobs faster,
call it more often from an external scheduler with the `CRON_SECRET` bearer token
(`Authorization: Bearer $CRON_SECRET`), or move to Vercel Pro and set the schedule to `*/5 * * * *`.

Existing databases need `migrations/006_question_review_and_jobs.sql`.

