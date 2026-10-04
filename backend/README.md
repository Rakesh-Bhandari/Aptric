# Aptric API (backend)

Node.js + Express API for Aptric. It is the only thing the browser talks to and the only thing that connects to the database. Supabase is used **only as Postgres**, reached with the **project URL and secret key** through `@supabase/supabase-js`: no Supabase Auth, Realtime or Edge Functions.

- **Auth**: email + password (with email confirmation), email sign-in links, password reset, Google sign-in, short-lived JWT access tokens and rotating refresh tokens. Accounts live in `private.accounts` (see [supabase/README.md](../supabase/README.md#accounts-20261002000001_backend_authsql)).
- **Game and admin data**: every rule stays in the Postgres functions in `supabase/migrations`. The API runs them **as the signed-in user** (`auth.uid()` = the user), so the `SECURITY DEFINER` checks apply unchanged. See [Database access](#database-access).
- **AI question generation**: the generate → validate → dedupe → computed check → independent solve pipeline, one batch per request.
- **Aptric Tutor**: a streamed AI chat on the solve screen, on free open-source models, grounded in the answer key in Postgres. See [Aptric Tutor](#aptric-tutor).
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
npm test                  # node:test: generation pipeline, RPC whitelist, tutor
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
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Google SMTP: `smtp.gmail.com`, `465`, the Gmail / Workspace address, a 16-character [app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification), `Aptric <that address>` |

   Optional: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `CRON_SECRET` for [push notifications](#push-notifications), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `OPEN_ROUTER_API_KEY` (+ the `QUESTION_*`, `EMBEDDING_*`, `GENERATE_*` settings, and the `TUTOR_*` settings for [Aptric Tutor](#aptric-tutor)), `CORS_ORIGINS`.
3. Deploy, check `GET <API_URL>/health` → `{"status":"ok","database":"ok","migrations":"ok","tutor":"configured"}` (`"tutor":"no_api_key"` means Aptric Tutor has no model key and falls back to stored hints). A 503 names the problem: missing or wrong environment variables (`server_misconfigured`, e.g. a publishable key in `SUPABASE_SECRET_KEY`), Supabase unreachable or the key rejected, or migrations not yet applied (`npx supabase db push`; `public.backend_sql` comes from `20261002000002_backend_gateway.sql`).
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
| `POST /rpc/admin_*_contest*` | admin | `admin_list_contests`, `admin_get_contest`, `admin_save_contest`, `admin_set_contest_published`, `admin_delete_contest`, `admin_pick_contest_questions`, `admin_get_contest_results`. The route returns 403 to non-admins before the call, the SQL function checks again, and every change is audited by the `contests` / `contest_items` triggers. Questions are locked and deletion is refused (`55000`) once a player has joined. |
| `POST /rpc/finish_contest` | user | `{ contest_id, violation? }` closes the player's contest attempt (`tab_hidden`, `window_blur`, `fullscreen_exit`, `page_left`). Idempotent: the first call records `finished_at` and the reason, later calls change nothing and return the same state; `submit_contest_answer` then refuses (`55000`, `attempt already submitted`). Answers given before count. |
| `GET` / `PATCH /me/profile` | user | own profile; editable: `handle`, `display_name`, `bio`, `timezone`, `exam_goal`, `daily_target`, `onboarded_at`, `detect_tab_switches_practice` (boolean, default true). The setting is for Practice only; Daily and contests always detect tab switches, and there is no field that could turn that off |
| `GET /me/placement` | user | last finished placement test |
| `POST /reports`, `POST /feedback` | user | report a question / send feedback |
| `GET` / `PATCH /me/preferences` | user | topics the daily set leans towards (`preferred_topic_ids`) and never uses unless nothing else is left (`excluded_topic_ids`); `PATCH` replaces both lists and rebuilds today's set if it has not been started |
| `GET /catalog/exam-tags`, `GET /catalog/levels`, `GET /catalog/topics` | user | small catalogs (topics: active ones with published questions, by section) |
| `GET /push/config`, `POST /push/subscribe`, `POST /push/unsubscribe`, `PATCH /push/preferences`, `POST /push/test` | user | [Web Push](#push-notifications): the VAPID public key and the player's switches, register / remove this browser, change `daily` / `streak` / `contests` / `league` (booleans), send a test (10 an hour) |
| `GET /cron/push` | `CRON_SECRET` | sends the notifications that are due; called hourly by Vercel Cron |
| `GET /questions/:id/subtopic` | user | subtopic of a question the user can see |
| `POST /tutor/chat` | user | one Aptric Tutor turn, streamed as server-sent events (see [Aptric Tutor](#aptric-tutor)) |
| `GET /tutor/history?question_id&context` | user | `{ available, messages }`: the stored chat for one question, and whether the tutor is configured |
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
│   ├── routes/             # auth, rpc, me (profile, catalogs, reports), admin, tutor, push, cron
│   ├── push/               # Web Push: due-notification queries, wording, VAPID sender
│   ├── generation/         # AI question pipeline, OpenAI-compatible LLM + embeddings, pg store
│   └── tutor/              # Aptric Tutor: streaming chat client + model fallback, prompt, leak guard
├── test/                   # node --test
└── vercel.json
```

## Push notifications

Web Push (VAPID) to browsers that opted in under **Settings → Notifications**; the frontend's `public/sw.js` shows them and opens the right page on click. Four kinds, each its own switch:

| Kind | When | Sent to |
| --- | --- | --- |
| `daily` | 08:00-09:00 local time | players who have not earned XP yet that day |
| `streak` | 20:00-21:00 local time | players with a live streak (played yesterday) and nothing yet today |
| `contests` | within an hour of a published contest starting; within 3 hours of it ending | everyone opted in (start); players who entered (results, with their rank) |
| `league` | within 3 hours of the weekly rollover | league members: promoted, stayed or demoted |

**Setup**

1. `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`) and a `CRON_SECRET` in the API's environment. Without the keys push is off: the Settings section says so and `/cron/push` does nothing.
2. Apply `20261010000001_push_notifications.sql` (`npx supabase db push`).
3. `vercel.json` registers a Vercel Cron that calls `GET /cron/push` every hour (`0 * * * *`) with `Authorization: Bearer $CRON_SECRET`. Vercel's Hobby plan only allows daily crons, so there, call that URL hourly from any other scheduler. Every local-time window above is one hour wide, so an hourly run reaches every timezone, including `:30` and `:45` offsets.

**How it stays safe.** `src/push/jobs.js` finds who is due and claims a `private.push_log` row per (player, key) in the same statement (`on conflict do nothing`), so an overlapping or repeated run never sends twice. Subscriptions the push service reports gone (404/410) are deleted. The API only POSTs to https endpoints on the browsers' own push services (`PUSH_ENDPOINT_HOSTS`), so a subscription cannot aim the server at anything else. Signing out removes that browser's subscription. iOS shows web push only for the app added to the Home Screen.

## Aptric Tutor

An AI chat on the daily and practice solve screens (`src/routes/tutor.js`, `src/tutor/`). It teaches around the current question and is grounded in the verified answer key; it is off for contests (until they end) and placement.

### Free, open-source models

Any OpenAI-compatible chat API, streamed, with no `response_format`:

| Provider | Settings |
| --- | --- |
| **OpenRouter free models** (default) | `OPEN_ROUTER_API_KEY` (or `TUTOR_LLM_API_KEY`). Model `meta-llama/llama-3.3-70b-instruct:free`, then `deepseek/deepseek-chat-v3-0324:free`, `qwen/qwen-2.5-72b-instruct:free`, `mistralai/mistral-small-3.1-24b-instruct:free` |
| **Groq** (free tier, Llama 3.x) | `TUTOR_LLM_BASE_URL=https://api.groq.com/openai/v1`, `TUTOR_LLM_API_KEY=gsk_...`, `TUTOR_MODEL=llama-3.3-70b-versatile`, `TUTOR_FALLBACK_MODELS=llama-3.1-8b-instant` |
| **Ollama** (self-hosted) | `TUTOR_LLM_BASE_URL=http://localhost:11434/v1`, `TUTOR_MODEL=llama3.1`, `TUTOR_FALLBACK_MODELS=` (no key needed for a local server) |

**Only free models by default.** On OpenRouter, models whose id doesn't end in `:free` are skipped unless `TUTOR_ALLOW_PAID_MODELS=true`; other providers (Groq's free tier, Ollama) are used as configured. A model that fails before its first token with 429, 5xx, 404 (retired free model), a timeout or a network error hands over to the next one; a bad key (401/403) does not. Without a key (and not a local URL), `POST /tutor/chat` answers `503 tutor_unavailable` and the app shows the stored hint (through `use_hint`, charged as before) and the official explanation instead.

| Variable | Default |
| --- | --- |
| `TUTOR_LLM_BASE_URL` | `LLM_BASE_URL`, else `https://openrouter.ai/api/v1` |
| `TUTOR_LLM_API_KEY` | `OPEN_ROUTER_API_KEY` |
| `TUTOR_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` |
| `TUTOR_FALLBACK_MODELS` | the three `:free` models above (comma-separated; empty = none) |
| `TUTOR_ALLOW_PAID_MODELS` | `false` |
| `TUTOR_MAX_TOKENS` / `TUTOR_TEMPERATURE` | `700` / `0.3` |
| `TUTOR_MESSAGES_PER_HOUR` / `TUTOR_MESSAGES_PER_DAY` | `60` / `200` per user, plus 1 request per 2 s |

### `POST /tutor/chat`

Body `{ question_id, context, intent, message?, history_id? }` (strict). `context` is `daily` or `practice` (`assessment` is refused as locked). `intent` is one of `hint`, `steps`, `next_step`, `understand`, `concept`, `explain`, `training`, `free` (`free` needs `message`, at most 500 characters). `history_id` retries a stored question turn after an error instead of storing it again.

1. Rate limits (`tutor:burst`, `tutor:hour`, `tutor:day` in `private.rate_limits`), then **`private.tutor_context`** from Postgres before every model call (scope, phase, verified answer key, attempt, hint state, learner profile; see [supabase/README.md](../supabase/README.md#aptric-tutor-20261003000001_tutorsql)). `42501` when the question isn't the player's to see in that context.
2. `phase = 'locked'` (live or upcoming contest, placement) → `403 tutor_locked`.
3. Not `verified` (not published, no answer key) → the fixed reply "This question isn't verified yet, so I can't tutor it. Please report it." without a model call.
4. While solving, `explain` or a typed request for the answer ("what's the answer?", "is it B?", "just tell me the correct option") → `409 tutor_requires_give_up`; the app runs the usual give-up confirm and `give_up` RPC, after which the phase is `answered`.
5. Typed messages: a keyword pre-check (prompt-injection attempts and clear off-topic requests get canned replies), then, for unclear ones, a one-word `on_topic|off_topic` classification by the same free model.
6. **Hint charging**: while solving, the first `hint`, `steps` or `next_step` calls the existing `use_hint` as the player, so the penalty applies exactly once (as before, questions without a stored hint cost nothing). `understand`, `concept` and `training` are free; typed questions before a paid hint are limited by the prompt to wording and concepts.
7. The prompt (`src/tutor/prompt.js`) carries the rules and the verified context in `<question>`, `<answer_key>` (model only), `<attempt>` and `<learner>` blocks, the last 8 turns, and the message in a `<user_message>` block treated as data.
8. **Leak guard** (`src/tutor/guard.js`), while solving: the reply is buffered by sentence and any sentence stating the correct option's letter or number as the answer ("answer is C", "option 3", "the third option"), its text or value as a result, or the explanation's final value, is replaced with "(I won't give the final answer yet. Try the next step!)" and logged. The answer key itself never reaches the browser before an attempt.
9. Both turns are stored in `public.tutor_messages` (through `private.tutor_append_message`).

Response: `text/event-stream` with

| Event | Data |
| --- | --- |
| `meta` | `{ phase, context, intent, hint_used, hint_charged, user_message_id }` |
| `delta` | `{ text }` (repeated) |
| `done` | `{ message_id, model, phase, hint_used, blocked }` (`blocked` = sentences the guard replaced) |
| `error` | `{ error: { code, message, user_message_id? } }`, the same shape as other errors (`tutor_unavailable` when every model failed) |

Errors before the stream are ordinary JSON: `400` bad body, `401`, `403 tutor_locked` / `42501`, `409 tutor_requires_give_up`, `429 over_request_rate_limit`, `503 tutor_unavailable` (no model key), `503 tutor_not_ready` (the database lacks `20261003000001_tutor.sql`; `/health` then lists `tutor` under `missing`). The app falls back to the stored hint and explanation for both 503s.

### Personal daily sets

`get_today_set`, `get_daily_result`, `submit_answer`, `use_hint` and `give_up` first call `ensurePersonalSet` (`src/personalSet.js`). Once per player and local day it picks a set and stores it as a `daily_sets` row with `user_id` set (migration `20261008000001`), so refreshes return the same set; `private.today_set_for` prefers it and falls back to the shared set if none could be made.

- **Difficulty**: the player's level band (profile level, floored by the placement level) gives the easy / medium / hard counts from `levels`; each league step above Bronze (two at most) turns one easy into a medium, or a medium into a hard.
- **Seed**: `userId:date` drives a seeded random generator, so the same inputs always give the same set.
- **Topics**: excluded topics are never used (unless that would leave no question at all, then they are ignored); preferred topics are three times as likely to be picked; questions from the player's own sets in the last 60 days are avoided while enough others remain. A bank too small for the mix gives a shorter set, not an empty one.
- Results, streaks, XP, ratings and leagues work per `daily_set_id`, so they are unaffected by sets differing between players. `get_daily_result(target_set_id)` only returns sets the caller has played.
