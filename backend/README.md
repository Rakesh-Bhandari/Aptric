# Aptric API (backend)

Node.js + Express API for Aptric. It is the only thing the browser talks to and the only thing that connects to the database. Supabase is used **only as Postgres**, reached with the **project URL and secret key** through `@supabase/supabase-js`: no Supabase Auth, Realtime or Edge Functions.

- **Auth**: email + password (with email confirmation), email sign-in links, password reset, Google sign-in, short-lived JWT access tokens and rotating refresh tokens. Accounts live in `private.accounts` (see [supabase/README.md](../supabase/README.md#accounts-20261002000001_backend_authsql)).
- **Game and admin data**: every rule stays in the Postgres functions in `supabase/migrations`. The API runs them **as the signed-in user** (`auth.uid()` = the user), so the `SECURITY DEFINER` checks apply unchanged. See [Database access](#database-access).
- **AI question generation**: the generate → validate → dedupe → computed check → independent solve pipeline, one batch per request.
- **Scheduled jobs** stay in Postgres (`pg_cron`): daily sets, streaks, leagues, ratings, leaderboards, auth-token cleanup.

```text
 React SPA (Vercel) ──HTTPS + Bearer token──▶ Aptric API (Vercel, Express)
                                                 │  supabase-js: SUPABASE_URL + SUPABASE_SECRET_KEY
                                                 │  POST /rest/v1/rpc/backend_sql
                                                 ▼
                                           Supabase Postgres
                                           (SQL functions, pg_cron)
```

## Run locally

```bash
cd backend
cp .env.example .env      # SUPABASE_URL, SUPABASE_SECRET_KEY, JWT_SECRET (openssl rand -base64 48), FRONTEND_URL, ...
npm install
npm run dev               # http://localhost:5000 (restarts on change)
npm test                  # node:test: generation pipeline + RPC whitelist
```

Database: either the local stack (`npx supabase start && npx supabase db reset`, then `SUPABASE_URL=http://127.0.0.1:54321` and the "Secret key" from `npx supabase status`) or the hosted project's URL and secret key. Without `SMTP_HOST`, email links are printed to the console instead of sent.

Then point the frontend at it: `VITE_API_URL=http://localhost:5000` in `frontend/.env.local`.

## Deploy to Vercel

1. New Vercel project from this repository, **Root Directory `backend`**, Framework Preset **Other** (`vercel.json` sets it). No build command is needed; `api/index.js` serves every path.
2. Environment variables (all from `.env.example`). The required ones:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Supabase → Project Settings → Data API → **Project URL** (`https://<project-ref>.supabase.co`) |
   | `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_...`; the legacy `service_role` key also works) |
   | `JWT_SECRET` | 32+ random characters |
   | `FRONTEND_URL` | the frontend's URL, e.g. `https://aptric.app` |
   | `API_URL` | this project's URL, e.g. `https://api.aptric.app` |
   | `NODE_ENV` | `production` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | any SMTP provider (Resend: `smtp.resend.com`, 465, `resend`, API key) |

   Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `OPEN_ROUTER_API_KEY` (+ the `QUESTION_*`, `EMBEDDING_*`, `GENERATE_*` settings), `CORS_ORIGINS`.
3. Deploy, check `GET <API_URL>/health` → `{"status":"ok","database":"ok","migrations":"ok"}`. A 503 names the problem: missing or wrong environment variables (`server_misconfigured`, e.g. a publishable key in `SUPABASE_SECRET_KEY`), Supabase unreachable or the key rejected, or migrations not yet applied (`npx supabase db push`; `public.backend_sql` comes from `20261002000002_backend_gateway.sql`).
4. In the frontend's Vercel project set `VITE_API_URL=<API_URL>` and redeploy it.

`api/index.js` allows up to 300 s per request (`vercel.json`), enough for one generation batch.

### Google sign-in

Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application):

- Authorized redirect URI: `<API_URL>/auth/google/callback` (and `http://localhost:5000/auth/google/callback` for development).

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. A Google account whose verified email matches an existing account signs in to that account.

### Lock down the Supabase project

- Authentication → Sign In / Providers: turn **off** "Allow new users to sign up" (nobody should create `auth.users` rows any more, so nobody gets an `authenticated` token for the Data API).
- Project Settings → Data API: keep it **enabled** with `public` exposed; the API calls `public.backend_sql` through it. Only `service_role` (the secret key) may execute that function.
- Keep the secret key only in the API's environment. It is as powerful as the database password: anyone holding it can run any SQL through `backend_sql`. Rotate it under API Keys if it leaks.

## Database access

`src/db.js` sends every statement to one SQL function, `public.backend_sql(statements jsonb, as_user uuid)` ([migration](../supabase/migrations/20261002000002_backend_gateway.sql)), with `supabase.rpc()`:

- `query(text, params)` / `batch([[text, params], ...])`: server-side work (accounts, sessions, rate limits, generation jobs). A batch runs in one transaction.
- `asUser(userId, text, params)` / `asUserBatch(userId, [...])`: on a player's behalf. `request.jwt.claims` carries their id, so `auth.uid()`, `private.is_admin()`, `private.is_banned()`, column defaults and audit triggers see them.
- `$1, $2, ...` are inlined as quoted literals (single quotes doubled; the function forces `standard_conforming_strings`), which Postgres types exactly like untyped parameters.
- The function runs as its owner, so **RLS and column grants don't apply** to these statements. Every `/rpc` function is `SECURITY DEFINER` and checks the caller itself (a test enforces this); the few direct queries in `src/routes/me.js` carry their policy's conditions explicitly, and `/admin` is behind `requireAdmin`.
- Rows come back as JSON (`to_jsonb`): bigint and numeric as numbers, dates as `YYYY-MM-DD`, timestamps as ISO strings. Database errors keep their SQLSTATE as `code`; Data API or network failures answer 503 `database_unavailable`.

## Auth flows

Every email link and the Google callback lands on the frontend's `/auth/callback?token=…&type=…&next=…`, which trades the single-use token for a session with `POST /auth/verify`.

| Flow | Request | Then |
| --- | --- | --- |
| Sign up | `POST /auth/signup { email, password, display_name?, timezone?, next? }` | email (`type=signup`) → session → `next` |
| Sign in | `POST /auth/login { email, password }` | `{ session }`; `email_not_confirmed` until the link is clicked |
| Email link | `POST /auth/magic-link { email, next?, timezone? }` (creates the account on first use) | email (`type=magiclink`) → session → `next` |
| Resend confirmation | `POST /auth/resend { email, next? }` | as sign up |
| Password reset | `POST /auth/recover { email }` | email (`type=recovery`) → session → `/auth/reset-password` → `POST /auth/password { password }` |
| Google | browser goes to `GET /auth/google?next=…` | Google → `/auth/google/callback` → `/auth/callback?type=oauth` → session |
| Refresh | `POST /auth/refresh { refresh_token }` | new `{ session }`; the old refresh token stops working |
| Sign out | `POST /auth/logout { refresh_token }` | that session is deleted |

- A session is `{ access_token, refresh_token, expires_at, user: { id, email } }`. Access tokens are HS256 JWTs (15 minutes) with `sub` = user id and `sid` = session id; refresh tokens (30 days) are random and stored as sha256.
- Passwords: bcrypt, 8–72 characters with letters and digits. Accounts copied from Supabase Auth keep their bcrypt hashes, so old passwords keep working.
- Changing the password needs the current one (`current_password`) unless the session is less than 15 minutes old (just signed in, or opened from a reset link), and signs out every other session.
- Sign-up, email-link, resend and reset answer the same way whether or not the email has an account. Rate limits (per IP and per address) are counted in Postgres (`private.rate_limits`), so they hold across serverless instances.
- Bans (`admin_set_user_ban`) set `private.accounts.banned_until` and delete the user's sessions; banned users can't sign in or refresh, and every gameplay function refuses them.

## API

All bodies are JSON. Errors are `{ "error": { "code", "message", ... } }`; database errors keep their SQLSTATE as `code` (`42501` not allowed, `23505` already answered, `P0002` not found, `22023` bad argument, `55000` not open), auth errors use the codes above (`invalid_credentials`, `email_not_confirmed`, `otp_expired`, `user_banned`, `weak_password`, `over_request_rate_limit`, ...).

| Route | Auth | Does |
| --- | --- | --- |
| `GET /health` | – | database check |
| `/auth/*` | – / user | see above; `GET /auth/user` returns the token's user |
| `POST /rpc/:name` | user | runs a whitelisted SQL function as the user with named arguments (`src/routes/rpc.js`): `get_today_set`, `submit_answer`, `use_hint`, `give_up`, `get_daily_result`, `get_practice_tree`, `get_practice_questions`, `get_mistakes`, `get_activity`, `start_placement`, `finish_placement`, `get_my_league`, `get_leaderboard`, `get_player_profile`, contests, and the `admin_*` functions |
| `GET` / `PATCH /me/profile` | user | own profile; editable: `handle`, `display_name`, `bio`, `timezone`, `exam_goal`, `daily_target`, `onboarded_at` |
| `GET /me/placement` | user | last finished placement test |
| `POST /reports`, `POST /feedback` | user | report a question / send feedback |
| `GET /catalog/exam-tags`, `GET /catalog/levels` | user | small catalogs |
| `GET /questions/:id/subtopic` | user | subtopic of a question the user can see |
| `/admin/*` | admin | taxonomy, tags, question search and counts, user attempts, reports (list, update, open count), generation jobs (list, active count), `POST /admin/generate-questions`, audit log |

## Layout

```text
backend/
├── api/index.js            # Vercel entry (exports the Express app)
├── src/
│   ├── app.js              # Express app: CORS, JSON, routes, errors
│   ├── server.js           # local server
│   ├── config.js           # environment
│   ├── db.js               # supabase-js client, backend_sql calls, asUser() (JWT claims)
│   ├── http.js             # HttpError, error → JSON (SQLSTATE codes)
│   ├── auth/               # accounts + sessions, tokens, mailer, Google
│   ├── middleware/         # requireUser / requireAdmin, Postgres-backed rate limits
│   ├── routes/             # auth, rpc, me (profile, catalogs, reports), admin
│   └── generation/         # AI question pipeline, OpenAI-compatible LLM + embeddings, pg store
├── test/                   # node --test
└── vercel.json
```
