# 🚀 Aptric – Daily Aptitude Practice

> Aptric helps students prepare for placements, competitive exams and technical interviews with a short daily challenge, focused practice, leagues and progress tracking, on a question bank grown with verified AI generation.

![Aptric](frontend/public/LOGO.png)

---

## 📖 Overview

Aptric is a React + TypeScript single-page app with a **Node.js (Express) API**, deployable to Vercel, on a **Supabase Postgres** database (Supabase is used only as the database). The API owns sign-in (email + password, email links, Google), sessions and AI question generation. Every game rule (grading, hints, XP, streaks, levels, ratings, leagues, placement, contests) lives in Postgres as RLS policies and `SECURITY DEFINER` functions that the API runs as the signed-in user, so the browser never sees an answer key before it has spent its one scoring attempt.

---

## ✨ Features

### Learners

- **Today**: a daily set per track and level, released at local midnight, with streak, daily goal ring, level and league position
- **Solve**: one question at a time, timer, keyboard shortcuts (`1`–`4`, `Enter`), paid hints, "Give up & see answer", explanations
- **Practice**: section → topic → subtopic with mastery stars, search, preferred difficulty and a weak-areas mode
- **Compete**: weekly leagues (Bronze → Diamond, standings refresh every 20 s), weekly / all-time / rating leaderboards, contests
- **Progress**: skill radar, activity heatmap, recent daily sets and a mistakes-to-review list
- **Onboarding**: pick a username, exam goal and daily target, then a 10-question placement test sets your starting level
- **Profile**: public profile at `/u/:handle`, badges, share card, time zone, theme (light / dark / device), reduced motion
- Email + password, magic link and Google sign-in (handled by the API)

### Admins

- Review queue for AI-generated questions, question search and editor, status changes (draft → in review → published → retired)
- User management (roles, bans), reports and feedback moderation, generation jobs, audit log
- Every write is audited in Postgres by triggers or the `admin_*` RPCs

### Question bank

Five sections: Quantitative Aptitude, Logical Reasoning, Verbal Ability, Data Interpretation and Technical Aptitude, split into topics and subtopics, with exam tags (`tcs-nqt`, `infosys`, `amcat`, `cat`, `gate`, `bank-po`, `ssc`) and easy / medium / hard difficulty. Questions support Markdown and KaTeX math.

AI-generated questions go through the API's generation pipeline (`backend/src/generation`). Each one is schema-validated, de-duplicated by hash and embedding similarity, arithmetic-checked where the options are numeric, and independently solved by a second model before it reaches the review queue. Nothing is published without an admin's approval.

---

## 🛠 Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, TanStack Query, React Router 7, Tailwind CSS v4, Radix UI, KaTeX, Marked |
| Backend | Node.js 22, Express 5, `pg`, bcrypt, JWT, Nodemailer (SMTP), Google OAuth |
| Database | Supabase Postgres 17 (RLS, SQL functions, pg_cron, pgvector, pg_trgm) |
| AI | OpenRouter (or any OpenAI-compatible API) for generation, verification and embeddings |
| Tests | Vitest + Testing Library (frontend), `node --test` (backend), pgTAP (`supabase test db`) |
| Hosting | Vercel (frontend and API), Supabase (database) |

---

## 📂 Repository structure

```text
.
├── frontend/                 # web app (React + TypeScript), deployed to Vercel
│   ├── src/
│   │   ├── pages/            # Today, Solve, Practice, Compete, Progress, Profile, Onboarding, …
│   │   ├── admin/            # admin area
│   │   ├── components/       # UI, layout, charts, markdown, solve
│   │   ├── context/          # session, preferences, toasts, auth dialog
│   │   └── lib/              # API client + session (http.ts), auth.ts, typed wrappers (api.ts), queries
│   └── .env.example
│
├── backend/                  # API (Node.js + Express), deployed to Vercel
│   ├── api/index.js          # Vercel entry
│   ├── src/                  # routes (auth, rpc, me, admin), auth, db, AI generation
│   ├── test/                 # node --test
│   ├── vercel.json
│   ├── .env.example
│   └── README.md             # setup, deploy, auth flows, API reference
│
├── supabase/                 # database only
│   ├── migrations/           # schema, RLS, SQL functions, cron jobs, seeds (applied in order)
│   ├── tests/database/       # pgTAP tests
│   ├── types/                # generated database.types.ts
│   └── README.md             # schema, access model, functions, jobs
│
└── README.md
```

---

## 🏗 Architecture

```text
 ┌──────────────────────────────┐
 │  React SPA (Vercel)          │
 │  TanStack Query + fetch      │
 └──────────────┬───────────────┘
                │ HTTPS, Bearer access token
                ▼
 ┌──────────────────────────────┐      ┌──────────────────────┐
 │  Aptric API (Vercel)         │─────▶│ OpenRouter (generate,│
 │  Express: auth, sessions,    │      │ solve, embeddings)   │
 │  /rpc, /admin, AI generation │      └──────────────────────┘
 └──────────────┬───────────────┘
                │ pg (Supabase pooler), runs SQL as the signed-in user
                ▼
 ┌──────────────────────────────┐
 │  Supabase Postgres           │
 │  RLS + SECURITY DEFINER      │
 │  functions (game rules),     │
 │  accounts, pg_cron, pgvector │
 └──────────────────────────────┘
```

Scheduled jobs (pg_cron, UTC): daily set generation, hourly streak settlement with streak freezes, weekly league rollover, rating updates, leaderboard refreshes and expired-session cleanup. See [supabase/README.md](supabase/README.md#scheduled-jobs-pg_cron).

---

## 📋 Prerequisites

- Node.js 22+ and npm
- A Supabase project (or Docker for the local stack)
- Supabase CLI (`npx supabase`)
- An SMTP provider for sign-up / sign-in emails (e.g. Resend; optional locally)
- A Google OAuth client (only for Google sign-in)
- An OpenRouter API key (only for AI question generation)

---

## ⚙ Getting started

### 1. Clone

```bash
git clone https://github.com/Rakesh-Bhandari/Aptric.git
cd Aptric
```

### 2. Database

Local stack:

```bash
npx supabase start            # needs Docker
npx supabase db reset         # applies supabase/migrations + seed.sql
```

Hosted project:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push          # applies any migrations the project doesn't have yet
```

`20261002000001_backend_auth.sql` moves accounts off Supabase Auth: existing users are copied into `private.accounts` with their passwords. Afterwards turn off sign-ups in Supabase Auth; keep the Data API enabled, since the API reaches `public.backend_sql` through it (see [backend/README.md](backend/README.md#lock-down-the-supabase-project)).

### 3. API (backend)

```bash
cd backend
cp .env.example .env          # SUPABASE_URL, SUPABASE_SECRET_KEY, JWT_SECRET, FRONTEND_URL, API_URL, SMTP_*, GOOGLE_* ...
npm install
npm run dev                   # http://localhost:5000
```

For the local stack use `SUPABASE_URL=http://127.0.0.1:54321` and the "Secret key" from `npx supabase status`. Without SMTP settings the sign-up / sign-in links are printed in this terminal. AI generation needs `OPEN_ROUTER_API_KEY` (see [backend/.env.example](backend/.env.example)).

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local    # set VITE_API_URL=http://localhost:5000
npm install
npm run dev                   # http://localhost:6969
```

The frontend only knows the API's URL; no keys or database credentials go there.

### 5. Make yourself an admin

After signing up, run this in the SQL editor:

```sql
update public.profiles set role = 'admin' where handle = '<your-handle>';
```

---

## 🧪 Tests and checks

```bash
# frontend
cd frontend && npm run lint && npm run typecheck && npm test
cd frontend && npm run e2e        # Playwright: axe, 360px layout, reduced motion, layout shift (mocked API)

# API
cd backend && npm test

# database (local stack running)
npx supabase test db
```

After changing the schema, regenerate the types:

```bash
npx supabase gen types typescript --local --schema public > supabase/types/database.types.ts
```

---

## 🌐 Deployment

- **Database**: `npx supabase db push` to the linked project. The pg_cron schedules are created by the migrations.
- **API**: a Vercel project with Root Directory `backend/` (`backend/vercel.json`) and the variables from `backend/.env.example` (`SUPABASE_URL` = the project URL, `SUPABASE_SECRET_KEY` = the project's secret key). Details in [backend/README.md](backend/README.md#deploy-to-vercel).
- **Frontend**: a Vercel project with Root Directory `frontend/` (`frontend/vercel.json`) and `VITE_API_URL` set to the API's URL.

---

## 📚 Further reading

- [backend/README.md](backend/README.md): API setup, Vercel deploy, auth flows, routes
- [supabase/README.md](supabase/README.md): access model, accounts, taxonomy, gameplay functions, progression, leagues, learner app, admin area, AI generation, scheduled jobs
- [frontend/README.md](frontend/README.md): screens, conventions, theming and accessibility

---

## ⭐ If you found this project useful, consider giving it a star!
