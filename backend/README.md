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
| `GET /push/config`, `POST /push/subscribe`, `POST /push/unsubscribe`, `PATCH /push/preferences`, `POST /push/test` | user | [Web Push](#push-notifications): the VAPID public key and the player's switches, register / remove this browser, change `daily` / `streak` / `contests` / `league` / `social` / `post_expiry` / `challenges` (booleans), send a test (10 an hour) |
| `POST /rpc/<community function>` | user + plan feature | Follow / friends ([Community](#community)): `follow_user`, `unfollow_user`, `remove_follower`, `respond_follow_request`, `get_follow_requests`, `block_user`, `unblock_user`, `get_blocks`, `report_user`, `get_followers`, `get_following`, `search_users`, `get_suggested_users`, `get_friend_activity`, `get_privacy`, `set_privacy`; plus the `friends_only` argument of `get_leaderboard` / `get_contest_standings`. 403 `feature_disabled` unless the player's plan has `community_follow` |
| `POST /rpc/<post function>` | user + plan feature | 48-hour posts ([Community](#community)): `create_post`, `delete_post`, `create_reply`, `delete_reply`, `react_post`, `vote_poll`, `report_post`, `mute_user`, `unmute_user`, `get_mutes`, `get_feed`, `get_post`, `get_replies`. 403 `feature_disabled` unless the plan has `community_posts`. A post that gives away a question's answer without the spoiler tick is 422 `SP422` |
| `POST /rpc/<challenge function>` | user + plan feature | 1v1 challenges ([Community](#community)): `create_challenge`, `start_challenge_run`, `accept_challenge`, `decline_challenge`, `cancel_challenge`, `get_challenge_run`, `submit_challenge_answer`, `challenge_hint`, `finish_challenge_run`, `get_challenge` (by id or share `token`), `list_challenges` (`incoming` / `outgoing` / `completed`), `request_rematch`. 403 `feature_disabled` unless the plan has `community_challenges`. The client never sends a result, a time or a winner: answers are graded in SQL and timed on the server |
| `POST /rpc/admin_list_post_reports`, `admin_moderate_post` | admin | the moderation queue (`only_status` `pending` or `all`) and `hide` / `restore` / `remove` / `dismiss`; the route refuses non-admins, the SQL checks again, every action is written to `audit_log` |
| `GET /cron/push` | `CRON_SECRET` | sends the notifications that are due; called hourly by a scheduler (GitHub Actions workflow) |
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

## Community

Slice 1: follow / friends (`supabase/migrations/20261012000001_follow_friends.sql`). The API stays a thin gateway: every rule (blocks, privacy, caps, paging) is in the SQL functions, which all start with `private.require_uid()` and answer "user not found" identically for a missing user, a banned user and a block in either direction.

- **Dark by default.** `src/routes/rpc.js` refuses the community calls (403 `feature_disabled`) unless the player's plan has `community_follow` in `plans.features`, and the app hides the screens. Turn it on for everyone with `update public.plans set features = features || '{"community_follow": true}';`, or for a pilot college by granting the `pilot` plan: `insert into public.subscriptions (user_id, plan_id, status, provider) select id, 'pilot', 'active', 'manual' from public.profiles where ...;` (entitlements are cached for 60 s).
- **Limits.** Following up to 1,000 people; 60 follows / unfollows an hour and 300 a day; 100 pending requests; 30 searches a minute; 100 blocks a day; 10 user reports a day. Each community call also has a flood limit in `RPCS[...].limit` (`hit()`), and a SQL limit raises `RL429`, which the API answers as 429 `over_request_rate_limit` with `Retry-After`. Reaching a cap is `54000` (409).
- **Argument checks.** `RPCS[...].check` / `.max` validate handles, search terms, cursors and report reasons before any SQL runs.
- **Paging.** Lists are cursor-paged (`"<timestamptz>|<id>"`, 30 per page; search and the feed 20) and the page size is fixed server-side.
- **48-hour posts** (`20261013000001_community_posts.sql`, flag `community_posts`; the `pilot` plan has both flags). The 48-hour rule is enforced twice: every read (RLS policies and RPCs) checks `expires_at > now()`, so a post is gone the second it expires, and the pg_cron job `aptric-posts-cleanup` (every 15 minutes) hard-deletes expired posts, replies, reactions, votes and reports in batches of 500 (idempotent, skips locked rows). `expires_at` is generated from `created_at`, nothing can edit a post and `created_at` cannot change, so a post cannot be extended, pinned or brought back. Reported or removed posts leave a snapshot (author id, SHA-256 of the text, reasons) for 30 days, then it is purged.
- **Post rules.** 5 posts and 30 replies a day, set per plan in `plans.limits.posts_per_day` / `replies_per_day` (no deploy; halved after two removals in 30 days, and after three removals new posts are hidden from everyone but their author until a moderator reviews them). Accounts under 24 hours old, or without a finished daily set, can reply but not post. Text is 500 / 280 characters, no HTML or images, banned phrases are in `community_banned_words` (edit in SQL), and links need a verified email. A post that links a question shows only its wording; if its text looks like it gives away the answer (cues like "the answer is", option letters, the correct option's text) the author must tick "Contains spoiler", and a spoiler is withheld by the server from anyone who has not attempted the question. Posts that link a question in a running contest are refused. Three different reporters hide a post until a moderator has reviewed it.
- **1v1 challenges** (`20261014000001_challenges.sql`, flag `community_challenges`). The challenger plays a set first and its score and time are locked in; the opponent sees only the target ("8/10 in 4:12"), accepts, and plays the same frozen question list. Questions are served by `accept_challenge` / `start_challenge_run` / `get_challenge_run` only to a player whose own run has started (the `question_ids` column is not readable through the table at all), graded in SQL against `question_answers`, one scoring attempt per question, timed by the server (the client sends no time), with no tutor; leaving the tab ends the attempt as in contests. Winner: more correct, then less total time, then fewer hints, otherwise a draw. 5 XP for taking part plus 10 for the winner, for at most 5 rewarded challenges per player per UTC day (counted under a per-player lock), and no rating change. The same two players can create 3 challenges a day (either way round). `accept_by` is 48 hours after sending, `complete_by` 24 hours after accepting; `pg_cron` job `aptric-challenges-settle` (every 10 minutes) expires and settles what nobody opened. You can challenge friends (mutual follows) by name; anyone with the share link (`/c/<token>`) can accept an open one, once. Identical results or a third challenge between the same pair in a day are written to `integrity_events` and earn no XP (the app has no device identifiers, so same-device pairs cannot be detected). `supabase/tests/concurrency/challenges.sh` race-tests accept, the pair limit and the XP cap with parallel sessions.
- **Cleanup.** Activity events older than 14 days are never returned and are deleted daily by the pg_cron job `aptric-friend-events-prune`.

## Push notifications

Web Push (VAPID) to browsers that opted in under **Settings → Notifications**; the frontend's `public/sw.js` shows them and opens the right page on click. Seven kinds, each its own switch:

| Kind | When | Sent to |
| --- | --- | --- |
| `daily` | 08:00-09:00 local time | players who have not earned XP yet that day |
| `streak` | 20:00-21:00 local time | players with a live streak (played yesterday) and nothing yet today |
| `contests` | within an hour of a published contest starting; within 3 hours of it ending | everyone opted in (start); players who entered (results, with their rank) |
| `league` | within 3 hours of the weekly rollover | league members: promoted, stayed or demoted |
| `social` | within 3 hours of a follow, a follow request, or an accepted request | the followed player / the requested player / the requester. One notification per (recipient, person), ever: follow / unfollow / follow-back loops cannot repeat it. Follows that came from an approved request are not announced to the approver |
| `challenges` | a friend challenges you (within 24 hours of it being sent), a challenge you can still accept or finish has 5 to 6 hours left, and its result (within 24 hours of finishing) | the opponent (received, expiring), both players (result). **Quiet hours: nothing is sent between 22:00 and 07:00 local time**; what is still due is sent by the next run after 07:00 |
| `post_expiry` | when one of your live posts has 5 to 6 hours left | **opt-in** (off until the player turns it on in Settings): the post's author, once per post |

**Setup**

1. `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`) and a `CRON_SECRET` in the API's environment. Without the keys push is off: the Settings section says so and `/cron/push` does nothing.
2. Apply `20261010000001_push_notifications.sql` (`npx supabase db push`).
3. Something has to call `GET /cron/push` with `Authorization: Bearer $CRON_SECRET` every hour (Vercel's Hobby plan rejects hourly crons, so `vercel.json` has none). The free option is `.github/workflows/push-notifications.yml`: add the repository secrets `API_URL` and `CRON_SECRET`, and GitHub Actions makes the call hourly (runs can start a few minutes late; test it from the Actions tab with *Run workflow*). [cron-job.org](https://cron-job.org) works the same way, and on Vercel Pro you can add `"crons": [{ "path": "/cron/push", "schedule": "0 * * * *" }]` to `vercel.json` instead. Every local-time window above is one hour wide, so an hourly run reaches every timezone, including `:30` and `:45` offsets.

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

To survive the burst at local midnight, nothing is generated ahead of time (inactive players cost nothing; a returning player gets today's set on their first call). The published-question pool and level bands are cached in memory (10 min, one in-flight load shared by concurrent players), and players with no topic preferences share one picked set per (track, level, league tier, local day); if more than 30% of that set is something the player had in the last 60 days they get their own pick instead. Players with preferences always get a personal pick.

- **Difficulty**: the player's level band (profile level, floored by the placement level) gives the easy / medium / hard counts from `levels`; each league step above Bronze (two at most) turns one easy into a medium, or a medium into a hard.
- **Seed**: `userId:date` drives a seeded random generator, so the same inputs always give the same set.
- **Topics**: excluded topics are never used (unless that would leave no question at all, then they are ignored); preferred topics are three times as likely to be picked; questions from the player's own sets in the last 60 days are avoided while enough others remain. A bank too small for the mix gives a shorter set, not an empty one.
- Results, streaks, XP, ratings and leagues work per `daily_set_id`, so they are unaffected by sets differing between players. `get_daily_result(target_set_id)` only returns sets the caller has played.
