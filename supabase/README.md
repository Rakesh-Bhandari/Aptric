# Aptric – Supabase (database)

Postgres schema, RLS and generated types for Aptric, managed with the Supabase CLI. Supabase is used **only as the database**: the Node API in [`backend/`](../backend/README.md) owns accounts, sessions, email links, Google sign-in and AI generation, and is the only thing that connects to Postgres (project URL + secret key, through the Data API's `public.backend_sql`). Supabase Auth, Realtime and Edge Functions are not used by the app.

```bash
npx supabase start          # local stack (Docker)
npx supabase db reset       # re-apply migrations + seed.sql
npx supabase test db        # pgTAP tests in tests/database
npx supabase gen types typescript --local --schema public > supabase/types/database.types.ts
npx supabase db push        # apply migrations to the linked remote project
```

Regenerate `types/database.types.ts` after every migration.

### How the API talks to Postgres (`20261002000002_backend_gateway.sql`)

The API uses the project URL and the secret key (`service_role`) with supabase-js, and sends all of its SQL to one function through the Data API:

```sql
select public.backend_sql('[{"sql": "select ...", "rows": true}, ...]'::jsonb, as_user => '<user id>');
```

- The statements run in order in one transaction and come back as one JSON array of row objects per statement.
- With `as_user`, `request.jwt.claims` / `request.jwt.claim.sub` carry that user's id, so `auth.uid()`, `private.is_admin()`, `private.is_banned()`, `default auth.uid()` columns and the audit triggers see the player.
- It is `SECURITY DEFINER` and runs as its owner, so **RLS and column grants are not applied** to these statements: every function the API exposes under `/rpc` is `SECURITY DEFINER` and checks the caller itself, and the API's few direct queries spell out their policy's conditions.
- `EXECUTE` is granted to `service_role` only; anon and authenticated can't call it. The Data API must stay enabled with `public` exposed.

### Accounts (`20261002000001_backend_auth.sql`)

- `private.accounts`: one row per user: lower-cased `email`, bcrypt `password_hash` (null for Google/magic-link-only accounts), `email_verified_at`, `google_sub`, sign-up `metadata`, `banned_until`, `last_sign_in_at`. Inserting a row creates the `public.profiles` row (trigger `on_account_created` → `private.handle_new_user()`, same rules as before). `profiles.id` references `private.accounts(id)` with `on delete cascade`.
- `private.sessions`: refresh tokens, stored as sha256 only, rotated on every refresh, 30 days.
- `private.auth_tokens`: single-use email links (`signup`, `magiclink`, `recovery`) and the 2-minute Google hand-off (`oauth`), sha256 only.
- The migration copied every existing `auth.users` row (same ids, emails, bcrypt hashes, confirmation, bans, Google identities), so existing players keep their accounts and passwords.
- None of these tables is readable by `anon`/`authenticated`. `aptric-purge-auth-tokens` (daily) deletes expired sessions and links.

## Access model

| Who | Can |
| --- | --- |
| `anon` | nothing |
| authenticated user | read active taxonomy and tag catalog, published questions/options/tags (plus questions they've attempted), released daily sets, levels, league tiers, track sections; read the badge catalog; read own profile, attempts, xp_events, tutor_messages, reports, feedback, streak freeze uses/awards, league memberships, rating events, badges; update own `handle`, `display_name`, `avatar_url`, `bio`, `timezone`, `track_id`; insert reports/feedback; play via `get_today_set`, `submit_answer`, `use_hint`, `give_up`; standings via `get_my_league`, `get_leaderboard`, `get_player_profile`, `get_daily_result` |
| admin (`profiles.role = 'admin'`) | everything above + full CRUD on content tables, read all profiles/attempts/xp/reports/feedback/audit_log/`question_generation_jobs`, update report/feedback status; AI generation (`POST /admin/generate-questions` in the API); `admin_get_question_answer`, `admin_upsert_question_answer`, `admin_set_user_role`, `admin_set_user_ban`, `admin_list_users`, `admin_get_question`, `admin_save_question`, `admin_set_question_status` RPCs (see [Admin area](#admin-area)) |
| connection role (the API's server-side work) / `service_role` / SECURITY DEFINER functions | everything; the only roles that can read `question_answers` (also through `private.tutor_context`) or write `attempts`, `xp_events`, `hint_uses`, `tutor_messages`, league tables, `streak_freeze_uses`/`_awards`, `rating_events`, `user_badges`, `question_generation_jobs` and `profiles.role/level/xp/rating/streak*/league_tier`; read the leaderboard materialized views |

Notes:

- `question_answers` has RLS on, no policies and no grants for `anon`/`authenticated`. Admins reach it only through the `admin_*` RPCs. The audit trigger records that an answer changed, never its contents.
- Column-level privileges (not RLS) protect the game columns on `profiles`, so the rule holds for admins too.
- `xp_events`, `rating_events` and `audit_log` are append-only: updates, direct deletes and truncates raise errors even for `service_role`. Rows still go away when a user is deleted (FK cascade).
- Attempt uniqueness is `(user_id, question_id, context, daily_set_id)` with `NULLS NOT DISTINCT`, so a user gets one practice attempt per question and one attempt per question per daily set.
- `questions.content_hash` is a lowercase sha256 hex digest the writer computes over the normalised stem + options: lower-case each, turn every run of characters other than `[a-z0-9]` into one space, trim; then hash the stem, a newline, and the options sorted and newline-joined (so reordered options still collide). `private.content_hash()` computes it in the database and `contentHash()` in `backend/src/generation/dedup.js` in the API; both are tested against the same digests.
- `question_tags.tag` must name a row in `tags` (the catalog; `kind` is `exam` or `general`).
- Content changes (taxonomy, tags, questions, options, answers, question tags, daily sets and their items) are written to `audit_log` by trigger, with `actor_id = auth.uid()`; so are admin updates/deletes of reports and feedback. Role, ban and question status changes are logged by the RPCs that make them, and generation jobs by trigger (actor = `created_by` / `cancelled_by`).
- Banned users (`profiles.banned_at`) can't play (every gameplay RPC goes through `private.require_uid()`), file reports or feedback, or edit their profile; the ban also sets `private.accounts.banned_until` (no sign-in or token refresh) and deletes their sessions.

## Taxonomy and tags

Seeded by `20261001000010_taxonomy_seed.sql` (every environment, not just local; rows are `ON CONFLICT DO NOTHING`, so later admin edits stick):

| Section | Topics → subtopics |
| --- | --- |
| Quantitative Aptitude | Arithmetic (Number System, Percentages, Profit & Loss, Simple & Compound Interest, Ratio & Proportion, Averages, Mixtures & Alligations, Problems on Ages) · Time, Work & Distance (Time & Work, Pipes & Cisterns, Time Speed & Distance, Trains, Boats & Streams) · Counting & Probability (P&C, Probability) · Geometry & Mensuration · Algebra (Equations & Inequalities, Progressions, Logarithms) · Data Sufficiency |
| Logical Reasoning | Verbal Reasoning (Series, Coding-Decoding, Blood Relations, Direction Sense) · Arrangements & Puzzles (Seating, Puzzles, Input-Output) · Deductive Reasoning (Syllogism, Statement & Conclusion) · Clocks & Calendars · Non-Verbal Reasoning (Cubes & Dice, Venn Diagrams) |
| Verbal Ability | Reading (RC, Para Jumbles, Cloze Test) · Grammar & Usage (Sentence Correction, Fill in the Blanks) · Vocabulary (Synonyms & Antonyms, Idioms & Phrases) |
| Data Interpretation | Tables & Caselets · Charts (Bar, Line, Pie) · Mixed (Mixed Graphs) |
| Technical Aptitude | Programming (Output Prediction, OOP, DSA) · CS Fundamentals (DBMS, Operating Systems, Computer Networks) |

Exam tags (`tags.kind = 'exam'`): `tcs-nqt`, `infosys`, `amcat`, `cat`, `gate`, `bank-po`, `ssc`.

## AI question generation (`generate-questions`)

Admin only, in the API: `POST /admin/generate-questions` (`backend/src/generation`). A **job** is one subtopic + difficulty + count (1–50). Each call works through **one batch** of up to 5 questions (`GENERATE_BATCH_SIZE`, max 10), so no request gets near the serverless time limit; the caller repeats `run` while the job is `queued` or `running`. Every response is `{ job, batch? }`, where `job` is the `question_generation_jobs` row.

```js
const call = (body) => api('POST', '/admin/generate-questions', body); // frontend/src/lib/http.ts
let data = await call({ action: 'create', subtopic_id, difficulty: 'medium', count: 20 }); // runs the first batch
while (data.job.status === 'queued' || data.job.status === 'running') {
  data = await call({ action: 'run', job_id: data.job.id });
}
// also: { action: 'status', job_id } and { action: 'cancel', job_id }
```

Errors: `401` no/invalid session, `403` not an admin, `400` bad body, `404` unknown job/subtopic, `409` a batch of that job is already running (`retry_after_seconds`), `429` rate limited (`Retry-After`).

**One batch** (`pipeline.js`); anything that fails a step is dropped and counted on the job, never repaired:

1. Embed (`EMBEDDING_MODEL` through any OpenAI-compatible `/embeddings` API, 384 dimensions; default `openai/text-embedding-3-small` with `dimensions: 384`) up to 10 existing questions in the subtopic that have no embedding yet (imports, hand-written questions, edited stems), so they count for step 4.
2. Generate with `QUESTION_MODEL` using structured output: the JSON schema is derived from the zod schemas in `schemas.js`, and every item is validated with zod (4 distinct options, key index, explanation, hint, `est_seconds`, `computation`) → `dropped_invalid`.
3. Exact duplicates by `content_hash`, within the batch and against the bank → `dropped_duplicate_hash`.
4. Near duplicates: cosine similarity of stem + options embeddings **> 0.92** to another question in the batch or any non-retired question → `dropped_duplicate_similar`.
5. Computed check, for Quantitative Aptitude questions whose options are all numbers (`₹1,250`, `12.5%`, `3/4`, `45 km/h`): the generator must give `computation`, an arithmetic expression (numbers, `+ - * / ^`, `sqrt`, `nCr`, `fact`, …; no variables) that `numeric.js` evaluates without `eval`. It must equal the keyed option and no other option → `dropped_computed`. Integers, one-decimal values and fractions must match exactly; options shown with 2+ decimals, or any option when the stem says "approximately", match anything that rounds to them.
6. Independent solve with `QUESTION_VERIFY_MODEL` (by default a different vendor's model), temperature 0, options shuffled, never shown the key or explanation. It must choose the keyed option → `dropped_solver` (a failed or timed-out solve counts as a disagreement). If it gives a computation for a numeric question, that must match too → `dropped_computed`.
7. Insert through `gen_insert_question`: one transaction that, under an advisory lock, re-checks the hash and similarity (so concurrent jobs can't both insert a question) and the job's quota, then writes the question as **`status = 'in_review'`, `source = 'ai'`**, its options in a fresh random order, the answer key, and the embedding.

**Provenance.** Every generated question has `model` (the generator), `prompt_version` (`PROMPT_VERSION` in `prompts.js`; bump it whenever a prompt, schema or check changes) and `generation_job_id`; the job also records `solver_model` and `created_by`. A check constraint requires `model` and `prompt_version` on every `source = 'ai'` question.

**Jobs.** `gen_claim_job` takes a 170 s lease (`locked_until`), so two calls never run the same job at once; a call that dies mid-batch leaves a lease that simply expires, and the next `run` resumes the job. A job finishes `done` once it has inserted `requested` questions, or after `3 × ceil(requested / batch size)` batches: `done` if it inserted anything, `failed` if not. `last_error` holds the latest batch's error (bad API key, timeouts, malformed output). Admins can read jobs; only the API (server-side) writes them.

**Limits per admin** (fixed windows in `private.rate_limits`): 20 requests a minute, 10 new jobs an hour, 300 requested questions per 24 h (`GENERATE_REQUESTS_PER_MINUTE`, `GENERATE_JOBS_PER_HOUR`, `GENERATE_QUESTIONS_PER_DAY`).

**Embeddings** live in `private.question_embeddings` (HNSW, cosine), outside the Data API and `audit_log`. Editing a question's stem drops its embedding; it is re-embedded the next time a job runs in that subtopic. Embeddings made with another model than the current `EMBEDDING_MODEL` (e.g. the old Edge Function's `gte-small`) are dropped at the start of a batch and re-made the same way. The similarity check covers every embedded question, but only subtopics that have had a job are backfilled.

**Setup.**

Set `OPEN_ROUTER_API_KEY` in the API's environment (`backend/.env`, or the Vercel project). Optional: `QUESTION_MODEL` (default `google/gemini-2.5-flash`), `QUESTION_VERIFY_MODEL` (default `openai/gpt-4o-mini`), `LLM_BASE_URL` (any OpenAI-compatible API with `json_schema` response_format; default OpenRouter), `EMBEDDING_MODEL` / `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY`, `SITE_URL`, `GENERATE_*`. Unit tests: `cd backend && npm test`.

Review queue: `select q.*, j.solver_model from public.questions q join public.question_generation_jobs j on j.id = q.generation_job_id where q.status = 'in_review';`

## Tracks and daily sets

Each user follows one track (`profiles.track_id`; `NULL` means the track with `is_default`). There is one daily set per track per level per date (`daily_sets (track_id, set_date, level)` is unique). `levels` maps `profiles.level` to a band (highest `min_profile_level` not above it) and sets each band's easy/medium/hard mix. A player gets their band's set, else the nearest lower band's; once they have answered in a set it stays theirs for the day. "Today" is the calendar date in the user's `profiles.timezone`, so a set for date D must have `published_at` no later than D 00:00 in the earliest timezone (UTC+14, i.e. D-1 10:00 UTC) to be visible to everyone at their midnight.

## Scheduled jobs (pg_cron)

Plain SQL in `20261001000009_scheduled_jobs.sql`; nothing calls an AI model. pg_cron runs in UTC. Every job is idempotent and writes a summary row to `audit_log` (`entity_type = 'cron'`); run history is in `cron.job_run_details`.

| Job | Schedule | Does |
| --- | --- | --- |
| `aptric-daily-sets` | `0 18 * * *` (23:30 IST) | `private.generate_daily_sets(date?)`: tomorrow's (IST) set for every active track × active level that has none yet |
| `aptric-streaks` | `5 * * * *` | `private.settle_broken_streaks()`: settles every live streak whose player missed their local yesterday |
| `aptric-league-rollover` | `35 18 * * 0` (Mon 00:05 IST) | `private.rollover_leagues()`: ranks every unfinished past-week league, promotes/demotes |
| `aptric-ratings` | `15 * * * *` | `private.rate_finished_sets()`: rates started-but-unfinished daily sets once their date is over everywhere (see [Progression](#progression)) |
| `aptric-leaderboards` | `*/5 * * * *` | `private.refresh_leaderboards()`: `REFRESH MATERIALIZED VIEW CONCURRENTLY` on both global boards (no audit row: it runs every 5 minutes) |

**Daily sets.** Questions come from `published` questions with an answer key and 2+ options, under active sections/topics/subtopics in the track's `track_sections` (no rows = all active sections), and not in any daily set dated within 60 days before the target date or later. A question goes into at most one set per run, across tracks and levels. Each pick prefers the requested difficulty (else the nearest), then the section with the fewest picks so far in the set, then random. A short bank gives a shorter set (`shortfall`, plus a `WARNING`); an empty one gives no set. Sets are released at 00:00 of the date in UTC+14, i.e. already visible when the job runs. Five levels × 10 questions is 50 questions per track per day, so a track needs about 3,000 eligible questions to never run short over the 60-day window. Run by hand with e.g. `select private.generate_daily_sets('2026-10-05');`.

**Streaks.** A full local day with no daily attempt breaks the streak. If `streak_freezes` covers every missed day, one freeze per day is spent (logged in `streak_freeze_uses`) and `last_streak_date` moves to the last covered day; otherwise `current_streak` drops to 0 and no freeze is spent. The same `private.settle_streak` runs before every streak bump, so the cron only keeps idle players' streaks current.

**Leagues.** Weeks run Monday–Monday IST. A player's first XP of the week (any `xp_events` insert) puts them in a league of their `profiles.league_tier` (Bronze → Silver → Gold → Platinum → Diamond), in cohorts of up to 30. At rollover, ranks are by weekly XP (ties: whoever got there first); the top `league_tiers.promote_count` (5) go up and the bottom `demote_count` (5) go down, both scaled to the cohort's size (promotion rounds up, demotion down; nobody drops out of Bronze or rises out of Diamond). Players with no XP that week keep their tier. `get_my_league()` returns this week's standings (handles, XP, rank), the current zone sizes, and the last finished week's result.

## Gameplay RPCs

All four are `SECURITY DEFINER` with `search_path = ''`, callable by `authenticated` only, and the only path to grading. The API exposes them as `POST /rpc/<name>` (`backend/src/routes/rpc.js`, a whitelist of functions and argument types); the frontend calls them through `frontend/src/lib/api.ts`.

| RPC | Does |
| --- | --- |
| `get_today_set()` | Today's released set for the caller's track: questions, options, topic names and the caller's own attempt/hint state. Never correct options or explanations; a hint's text only after the caller paid for it. |
| `submit_answer(question_id, option_id, context, time_ms)` | Grades one attempt and returns `is_correct`, `correct_option_id`, `explanation`, `xp_awarded`, streak. |
| `use_hint(question_id, context?)` | Returns the hint. Only the first reveal per question + context is recorded (`hint_uses`), so it is charged once. |
| `give_up(question_id, context?)` | Spends the attempt for 0 XP and reveals the answer. |

`context` is `'daily'` or `'practice'`; `use_hint`/`give_up` infer it when omitted (daily if the question is in today's set). Rules:

- Every scored attempt also returns `progress`: `xp`, `level`, `leveled_up`, `next_level_xp`, `rating`, `streak_freezes`, `freezes_earned`, `set_complete`, `bonus_xp`, `rating_change` (`{before, after, delta}` when this answer finished the set) and `new_badges` (see [Progression](#progression)).
- **daily**: the question must be in today's released set for the caller's track. **practice**: it must be `published`.
- One scoring attempt per question per context, enforced by `attempts_user_question_context_key` (`ON CONFLICT DO NOTHING`, then `23505`). Hints and give-ups are refused after answering.
- Points (`private.score_points`): easy 10 / medium 20 / hard 30, minus 5 if a hint was used, halved (rounded down) in practice, never below 0; wrong answers and give-ups score 0. Non-zero awards insert one `xp_events` row (`idempotency_key = 'attempt:<id>'`) and add to `profiles.xp`.
- The first daily attempt (answer or give-up) of the day moves the streak: +1 if the last streak day was yesterday, otherwise reset to 1.
- Errors: `42501` not signed in / not your question, `23505` already answered, `22023` bad argument, `P0002` no set today or no answer key.

Tests: `tests/database/scheduled_jobs.test.sql` covers set generation (mix, section balance, reuse window, eligibility, idempotency), level fallback, streak freezes and league rollover. `tests/database/gameplay.test.sql` covers double scoring, foreign questions (other track, yesterday's set, drafts), the once-only hint charge, timezone-local "today", and that answers are unreadable by `anon`/`authenticated`.

## Progression

`20261001000014_progression.sql`. Tests: `tests/database/progression.test.sql`.

**XP and levels.** XP is the `xp_events` ledger; every writer goes through `private.award_xp` (idempotent on `idempotency_key`), which also bumps `profiles.xp`. Sources: correct answers (see Gameplay RPCs), **+20** for finishing a daily set (answering or giving up on every question; `daily_complete`), and **+25** when an admin resolves a player's report (`report_accepted`, once per report). A `BEFORE UPDATE OF xp` trigger on `profiles` keeps `level` derived from XP: reaching level L takes 50·L·(L−1) XP (L2 100, L3 300, L5 1,000, L10 4,500, L20 19,000). Daily-set bands follow that: Beginner 1–2, Intermediate 3–5, Advanced 6–9, Pro 10–14, Expert 15+ (`levels.min_profile_level`).

**Streak freezes earned with XP.** The same trigger grants one `streak_freezes` per 500 XP milestone, holding at most 2. Each milestone is recorded once in `streak_freeze_awards` (`granted = false` if the player was already full), so losing and regaining XP never re-grants. Spending them is unchanged (see Streaks).

**Rating (Elo-style, daily challenges only).** Practice never moves it. Each daily question is a game against an opponent rated by difficulty (easy 1000, medium 1300, hard 1600); score 1 for correct, 0.5 for correct with a hint, 0 otherwise. A set is rated once as a whole: Δ = K · (Σ score − Σ expected), K = 16 per question for a player's first 5 rated sets and 8 after, floor 100. It is rated the moment its last question is answered; a set the player started but didn't finish is rated by the hourly `aptric-ratings` job once that date has ended in UTC−12, with unanswered questions as misses (so skipping hard questions doesn't protect the rating). Each rating is a row in `rating_events`.

**Badges.** Catalog in `badges` (admin-editable, audited); awards in `user_badges`, written by triggers only:

| Badge | Slug | Awarded when |
| --- | --- | --- |
| 💯 Centurion | `solved-100` | 100 different questions answered correctly (any context) |
| 🔥 Week Warrior / 📅 Monthly Grind / ⚡ Unstoppable | `streak-7` / `streak-30` / `streak-100` | `current_streak` reaches 7 / 30 / 100 |
| 🎓 Topic Master (per topic) | `topic-master` | 25+ correct answers in one topic with ≥ 80% accuracy over all attempts there |
| 🔍 Sharp Eye | `report-accepted` | an admin resolves one of the player's reports (dismissing doesn't count) |

The migration backfills badges already earned (not XP).

**Leaderboards.** `private.leaderboard_all_time` (XP rank, and rating rank among rated players) and `private.leaderboard_weekly` (this league week's XP) are materialized views outside the Data API, refreshed concurrently every 5 minutes, without banned players. Read them with `get_leaderboard(board => 'all_time' | 'rating' | 'weekly', page_size => 50, page_offset => 0)`, which returns `{ board, refreshed_at, total, entries, me }` (`me` is the caller's own row, even off-page).

**League board.** The Compete page polls `get_my_league()` every 20 seconds while it is open. (The earlier Realtime broadcast of league XP changes was removed in `20261002000001_backend_auth.sql`.)

**Other RPCs.** `get_player_profile(handle?)`: level and XP progress, rating, streaks, league tier, solve stats per section and badges (freeze counts only for yourself; banned players are hidden). `get_daily_result(daily_set_id?)`: the share card for today's set (or any set you played): per-question outcome (`correct`/`hinted`/`wrong`/`gave_up`/`unanswered`), score, XP earned, rating change, streak and league rank; never questions or answers.

## Learner app

`20261001000015_learner_app.sql`. Tests: `tests/database/learner_app.test.sql`.

**Onboarding fields.** `profiles.exam_goal` (an exam tag slug), `daily_target` (questions per day, default 10) and `onboarded_at` are user-editable. Existing players with a handle were backfilled as onboarded.

**Placement.** `start_placement()` serves 10 servable questions (3 easy, 4 medium, 3 hard, spread across sections, never ones the player already met in a placement), resuming an unfinished test from the last day; a new test is refused (`55000`) within 7 days of the last one. `finish_placement(test_id, answers)` grades everything server-side (weights easy 1 / medium 2 / hard 3), records `assessment` attempts (no XP), and sets `profiles.placement_level`: score ≥ 0.85 → band 5, ≥ 0.70 → 4, ≥ 0.50 → 3, ≥ 0.30 → 2, else 1. `private.today_set_for` now uses `greatest(band from XP level, placement_level)`, so placement is a floor on the daily-set band and never grants XP.

**Practice.** A question is *servable* when it is published, has an answer key and 2+ options, sits under active taxonomy, and is not in a contest that hasn't ended. `get_practice_tree()` returns sections → topics → subtopics with the number of servable questions the player hasn't practised, their attempts/correct (all contexts) and mastery stars: 0 under 3 attempts; 3 at 20+ attempts and ≥ 85%; 2 at 10+ and ≥ 70%; 1 at ≥ 50%. A subtopic is *weak* at 3+ attempts and < 60%. `get_practice_questions(subtopic_ids, prefer_difficulty, mode, question_limit)` serves unpractised questions (never-seen first, preferred difficulty first); `mode => 'weak'` draws from the 5 weakest subtopics. `get_mistakes()` lists wrong answers and give-ups (latest per question) with the key and explanation, flagging ones fixed since. `get_activity(days)` returns per-day counts in the player's timezone, today's count against the daily target, and recent daily sets.

**Contests.** Admins create `contests` (a published window `starts_at`–`ends_at`) and `contest_items` directly (RLS) or in the dashboard; there is no admin UI for them yet. Items are hidden from players: `get_contest()` shows questions to entrants while live and to everyone once ended (with answers and explanations). `join_contest()` registers (upcoming or live), `submit_contest_answer()` scores once per question while live (easy 10 / medium 20 / hard 30, no XP), `get_contest_standings()` ranks by score, then total time, then last answer. `list_contests()` returns live, upcoming and last-30-days contests. `finish_contest(contest_id, violation)` (`20261007000001_exam_integrity.sql`) closes the caller's attempt: the first call sets `contest_entries.finished_at` and `violation` (`tab_hidden`, `window_blur`, `fullscreen_exit`, `page_left`), later calls change nothing, and `submit_contest_answer()` refuses once it is set. Both fields come back on every contest summary. `profiles.detect_tab_switches_practice` (default true, user-editable) is the Practice-only "detect tab switches" setting.

```sql
insert into public.contests (slug, title, starts_at, ends_at, is_published)
values ('friday-sprint', 'Friday Sprint', '2026-10-09 14:30+00', '2026-10-09 15:30+00', true) returning id;
insert into public.contest_items (contest_id, question_id, position)
select '<id>', id, (row_number() over ()) - 1
from (select id from public.questions where status = 'published' order by random() limit 10) q;
```

## Aptric Tutor (`20261003000001_tutor.sql`)

Grounding and chat log for the AI tutor in the API ([backend/README.md](../backend/README.md#aptric-tutor)). Only the API calls these functions (`EXECUTE` is revoked from `public`, `anon` and `authenticated`; granted to `service_role`), because the context carries the answer key.

| Function | Returns |
| --- | --- |
| `private.tutor_context(uid, question_id, context)` | `jsonb`: `question_id`, `context` (resolved like `use_hint`), `phase`, `verified`, `question` (stem, options with id/position/body, difficulty, section/topic/subtopic, tags), `answer_key` (`correct_option_id`, `correct_position`, `explanation`, `hint`), `attempt` (selected option, `gave_up`, `is_correct`, `used_hint`, `time_ms`), `hint_used`, `learner` |
| `private.tutor_learner(uid, subtopic_id, topic_id, question_id)` | the `learner` block: `level`, `xp`, `exam_goal`, the 3 weakest subtopics by accuracy (3+ attempts, with section/topic names and mastery stars), up to 5 unresolved recent mistakes in this topic (as in `get_mistakes`, without answers), and accuracy and average time on this subtopic |
| `private.tutor_append_message(uid, question_id, context, role, intent, content, model)` | the new `tutor_messages` id |
| `private.tutor_history(uid, question_id, context, max_count)` | the latest turns of one chat, oldest first |

- **Scope**: a question the player has already answered in that context is always open for review (`20261004000001_tutor_review.sql`: a past day's daily set, a retired question). Otherwise `private.resolve_attempt_scope`, so `daily` = in the player's set today and `practice` = published; otherwise `42501` (`P0002` for an unknown question or no set today). Banned players get `42501`.
- **`phase`**: `solving` until the player has a scoring attempt in that context (submit or give up), then `answered`. `locked` for the `assessment` (placement) context and for questions in a contest that hasn't ended; a locked context carries no question or answer key.
- **`verified`**: the question is `published`, has a `question_answers` row, and its `correct_option_id` is one of the question's options. The API never calls a model for an unverified question.
- The API must not forward `answer_key` to the browser while `phase = 'solving'`; it only goes into the model prompt.

`public.tutor_messages` (`id`, `user_id`, `question_id`, `context`, `role` `user|assistant`, `intent`, `content` 1–4000 characters, `model`, `created_at`): RLS on, players read their own rows; no insert/update/delete for `anon` or `authenticated` (writes go through `private.tutor_append_message`). Rows go away with the user or the question.

## Admin area

`frontend/src/admin` (`/admin/*`, lists and searches through the API's `/admin/*` routes), for `profiles.role = 'admin'` only. The UI's role check is cosmetic: reads go through RLS and writes through RLS or the `admin_*` functions (`20261001000013_admin.sql`), which check `private.is_admin()` themselves. Every write lands in `audit_log`.

| Page | Does | Backed by |
| --- | --- | --- |
| Review queue | `in_review` questions oldest first; edit with a live Markdown + KaTeX preview, approve (→ `published`) or reject (→ `retired`) with a note | `admin_get_question`, `admin_save_question`, `admin_set_question_status(…, from_status => 'in_review')` |
| Questions | search stem (trigram index) or id; filter by section/topic/subtopic, difficulty, status, source, job; bulk status changes; per-question page with reports and full history | `questions` via RLS, `audit_log.question_ref` |
| Users | search handle/name/email/id; change role; ban/unban with a reason; attempts | `admin_list_users`, `admin_set_user_role`, `admin_set_user_ban`, `attempts` via RLS |
| Reports | open → triaged → resolved/dismissed with a note, linked to the question | `reports` via RLS (`reports_audit` trigger) |
| Generation jobs | start jobs, drive them batch by batch with progress, resume, cancel | `POST /admin/generate-questions` (API) |
| Audit log | filter by entity, action, actor, entity id or question; field-level diffs | `audit_log` via RLS |

- `admin_save_question` saves stem, subtopic, difficulty, time, options, answer key, explanation, hint and tags in one transaction and recomputes `content_hash` in SQL (`private.content_hash`, tested against the JS reference). Options are matched by position, so edited options keep their ids and past attempts stay valid; an option a player picked can't be removed. A hash collision with another question is refused (`23505`).
- `admin_set_question_status` refuses to publish a question without an answer key or with fewer than 2 options (`23514`). With `from_status` it only moves questions still in that status and returns how many moved, so two reviewers never decide the same question twice. Out of `in_review` the audit action is `approve`/`reject`, otherwise `set_status`; `questions.reviewed_by/at/review_note` hold the last decision.
- Admins can't ban themselves or another admin (demote first), and a banned user can't be made admin.
- `audit_log.question_ref` (generated) names the question a row is about, whichever table it came from, for per-question history.

Tests: `tests/database/admin.test.sql`.
