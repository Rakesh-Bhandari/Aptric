# 🚀 Aptric – Daily Aptitude Practice

> Aptric helps students prepare for placements, competitive exams and technical interviews with a short daily challenge, focused practice, leagues and progress tracking, on a question bank grown with verified AI generation.

![Aptric](frontend/public/LOGO.png)

---

## 📖 Overview

Aptric v2 is a React + TypeScript single-page app on top of **Supabase** (Postgres, Auth, Realtime, Edge Functions, pg_cron). Every game rule (grading, hints, XP, streaks, levels, ratings, leagues, placement, contests) lives in Postgres as RLS policies and `SECURITY DEFINER` RPCs, so the browser never sees an answer key before it has spent its one scoring attempt.

The original v1 app (Express + TiDB/MySQL in `backend/`) is still in the repo and stays deployed until the v1 → v2 cutover in [supabase/MIGRATION.md](supabase/MIGRATION.md).

---

## ✨ Features

### Learners

- **Today**: a daily set per track and level, released at local midnight, with streak, daily goal ring, level and league position
- **Solve**: one question at a time, timer, keyboard shortcuts (`1`–`4`, `Enter`), paid hints, "Give up & see answer", explanations
- **Practice**: section → topic → subtopic with mastery stars, search, preferred difficulty and a weak-areas mode
- **Compete**: live weekly leagues (Bronze → Diamond, via Realtime), weekly / all-time / rating leaderboards, contests
- **Progress**: skill radar, activity heatmap, recent daily sets and a mistakes-to-review list
- **Onboarding**: pick a username, exam goal and daily target, then a 10-question placement test sets your starting level
- **Profile**: public profile at `/u/:handle`, badges, share card, time zone, theme (light / dark / device), reduced motion
- Email + password, magic link and Google sign-in (Supabase Auth)

### Admins

- Review queue for AI-generated questions, question search and editor, status changes (draft → in review → published → retired)
- User management (roles, bans), reports and feedback moderation, generation jobs, audit log
- Every write is audited in Postgres by triggers or the `admin_*` RPCs

### Question bank

Five sections: Quantitative Aptitude, Logical Reasoning, Verbal Ability, Data Interpretation and Technical Aptitude, split into topics and subtopics, with exam tags (`tcs-nqt`, `infosys`, `amcat`, `cat`, `gate`, `bank-po`, `ssc`) and easy / medium / hard difficulty. Questions support Markdown and KaTeX math.

AI-generated questions go through the `generate-questions` Edge Function. Each one is schema-validated, de-duplicated by hash and embedding similarity, arithmetic-checked where the options are numeric, and independently solved by a second model before it reaches the review queue. Nothing is published without an admin's approval.

---

## 🛠 Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, TanStack Query, React Router 7, Tailwind CSS v4, Radix UI, KaTeX, Marked |
| Backend | Supabase: Postgres 17 (RLS, RPCs, pg_cron, pgvector, pg_trgm), Auth, Realtime, Edge Functions (Deno) |
| AI | OpenRouter (or any OpenAI-compatible API) for generation and verification; Supabase `gte-small` embeddings |
| Tests | Vitest + Testing Library (frontend), pgTAP (`supabase test db`), `deno test` (Edge Function) |
| Hosting | Vercel (frontend), Supabase (database and functions) |
| Legacy v1 | Express, TiDB/MySQL, Passport, Cloudinary, Nodemailer, Vercel Cron (`backend/`) |

---

## 📂 Repository structure

```text
.
├── frontend/                 # v2 web app (React + TypeScript)
│   ├── src/
│   │   ├── pages/            # Today, Solve, Practice, Compete, Progress, Profile, Onboarding, …
│   │   ├── admin/            # admin area
│   │   ├── components/       # UI, layout, charts, markdown, solve
│   │   ├── context/          # session, preferences, toasts, auth dialog
│   │   └── lib/              # supabase client, typed RPC wrappers (api.ts), queries
│   └── .env.example
│
├── supabase/                 # v2 backend
│   ├── migrations/           # schema, RLS, RPCs, cron jobs, seeds (applied in order)
│   ├── functions/
│   │   └── generate-questions/   # AI question generation Edge Function
│   ├── tests/database/       # pgTAP tests
│   ├── types/                # generated database.types.ts
│   ├── scripts/              # v1 question / user import and rollback
│   ├── templates/            # auth email templates
│   ├── README.md             # schema, access model, RPCs, jobs
│   ├── AUTH.md               # auth dashboard settings
│   └── MIGRATION.md          # v1 → v2 user migration and cutover runbook
│
├── backend/                  # legacy v1 API (Express + TiDB), kept until cutover
└── README.md
```

---

## 🏗 Architecture

```text
 ┌──────────────────────────────┐
 │  React SPA (Vercel)          │
 │  supabase-js + TanStack Query│
 └──────┬──────────────┬────────┘
        │ Auth / RPC   │ Realtime (league channel)
        ▼              ▼
 ┌──────────────────────────────────────────────┐
 │  Supabase                                    │
 │  ┌────────────┐  ┌─────────────────────────┐ │
 │  │ Auth       │  │ Postgres                │ │
 │  └────────────┘  │  RLS + SECURITY DEFINER │ │
 │                  │  RPCs (game rules)      │ │
 │  ┌────────────┐  │  pg_cron jobs           │ │
 │  │ Edge Fn:   │─▶│  pgvector embeddings    │ │
 │  │ generate-  │  └─────────────────────────┘ │
 │  │ questions  │──▶ OpenRouter (generate +    │
 │  └────────────┘    independent solve)        │
 └──────────────────────────────────────────────┘
```

Scheduled jobs (pg_cron, UTC): daily set generation, hourly streak settlement with streak freezes, weekly league rollover, rating updates and leaderboard refreshes. See [supabase/README.md](supabase/README.md#scheduled-jobs-pg_cron).

---

## 📋 Prerequisites

- Node.js 20+ and npm
- A Supabase project (or Docker for the local stack)
- Supabase CLI (`npx supabase`)
- Deno (only to run the Edge Function tests)
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

Then configure Auth (site URL, redirect URLs, Google provider, SMTP, email templates) as described in [supabase/AUTH.md](supabase/AUTH.md).

### 3. AI question generation (optional)

```bash
npx supabase secrets set OPEN_ROUTER_API_KEY=sk-or-...
npx supabase functions deploy generate-questions
```

Optional secrets: `QUESTION_MODEL`, `QUESTION_VERIFY_MODEL`, `LLM_BASE_URL`, `SITE_URL`, `GENERATE_*` (see [supabase/README.md](supabase/README.md#ai-question-generation-generate-questions)).

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local    # set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                   # http://localhost:6969
```

Only the publishable (anon) key goes in the frontend. Never put the `service_role` key there.

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

# database (local stack running)
npx supabase test db

# Edge Function
deno test --allow-read --config supabase/functions/generate-questions/deno.json supabase/functions/generate-questions

# v1 import scripts
node --test supabase/scripts/*.test.mjs
```

After changing the schema, regenerate the types:

```bash
npx supabase gen types typescript --local --schema public > supabase/types/database.types.ts
```

---

## 🌐 Deployment

- **Frontend**: deploy `frontend/` to Vercel (`frontend/vercel.json`) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set.
- **Database**: `npx supabase db push` to the linked project. The pg_cron schedules are created by the migrations.
- **Edge Function**: `npx supabase functions deploy generate-questions`.
- **Legacy v1**: `backend/` deploys to Vercel with its own `.env` (see `backend/.env.example`) and Vercel Cron, until cutover.

---

## 🔄 Migrating from v1

- Questions: `supabase/scripts/import-v1-questions.mjs` turns a TiDB/MySQL export into one transactional SQL script ([details](supabase/README.md#importing-v1-questions)).
- Users, scores, streaks, history and feedback: export, dry run, import, verify and the cutover/rollback checklist are in [supabase/MIGRATION.md](supabase/MIGRATION.md).

---

## 📚 Further reading

- [supabase/README.md](supabase/README.md): access model, taxonomy, gameplay RPCs, progression, leagues, learner app, admin area, scheduled jobs
- [supabase/AUTH.md](supabase/AUTH.md): auth flows and dashboard settings
- [supabase/MIGRATION.md](supabase/MIGRATION.md): v1 → v2 user migration and cutover
- [frontend/README.md](frontend/README.md): screens, conventions, theming and accessibility

---

## ⭐ If you found this project useful, consider giving it a star!
