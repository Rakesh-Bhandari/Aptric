# Aptric v2 – Supabase

Postgres schema, RLS and generated types for Aptric v2, managed with the Supabase CLI.

```bash
npx supabase start          # local stack (Docker)
npx supabase db reset       # re-apply migrations + seed.sql
npx supabase test db        # pgTAP tests in tests/database
npx supabase gen types typescript --local --schema public > supabase/types/database.types.ts
npx supabase db push        # apply migrations to the linked remote project
```

Regenerate `types/database.types.ts` after every migration.

Auth flows and the exact dashboard settings (SMTP, providers, rate limits, email templates) are in [AUTH.md](AUTH.md).

## Access model

| Who | Can |
| --- | --- |
| `anon` | nothing |
| authenticated user | read active taxonomy and tag catalog, published questions/options/tags (plus questions they've attempted), released daily sets, levels, league tiers, track sections; read own profile, attempts, xp_events, reports, feedback, streak freeze uses, league memberships; update own `handle`, `display_name`, `avatar_url`, `bio`, `timezone`, `track_id`; insert reports/feedback; play via `get_today_set`, `submit_answer`, `use_hint`, `give_up`; standings via `get_my_league` |
| admin (`profiles.role = 'admin'`) | everything above + full CRUD on content tables, read all profiles/attempts/xp/reports/feedback/audit_log/`question_generation_jobs`, update report/feedback status; the `generate-questions` Edge Function; `admin_get_question_answer`, `admin_upsert_question_answer`, `admin_set_user_role` RPCs |
| `service_role` / SECURITY DEFINER functions | everything; the only roles that can read `question_answers` or write `attempts`, `xp_events`, `hint_uses`, league tables, `streak_freeze_uses`, `question_generation_jobs` and `profiles.role/level/xp/rating/streak*/league_tier` |

Notes:

- `question_answers` has RLS on, no policies and no grants for `anon`/`authenticated`. Admins reach it only through the `admin_*` RPCs. The audit trigger records that an answer changed, never its contents.
- Column-level privileges (not RLS) protect the game columns on `profiles`, so the rule holds for admins too.
- `xp_events` and `audit_log` are append-only: updates, direct deletes and truncates raise errors even for `service_role`. Rows still go away when a user is deleted (FK cascade).
- Attempt uniqueness is `(user_id, question_id, context, daily_set_id)` with `NULLS NOT DISTINCT`, so a user gets one practice attempt per question and one attempt per question per daily set.
- `questions.content_hash` is a lowercase sha256 hex digest the writer computes over the normalised stem + options: lower-case each, turn every run of characters other than `[a-z0-9]` into one space, trim; then hash the stem, a newline, and the options sorted and newline-joined (so reordered options still collide). `contentHash()` in `scripts/import-v1-questions.mjs` is the reference implementation (`functions/generate-questions/dedup.ts` is tested against it).
- `question_tags.tag` must name a row in `tags` (the catalog; `kind` is `exam` or `general`).
- Content changes (taxonomy, tags, questions, options, answers, daily sets) are written to `audit_log` by trigger, with `actor_id = auth.uid()`.

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

## Importing v1 questions

`scripts/import-v1-questions.mjs` (Node 18+, no dependencies) turns a v1 TiDB/MySQL export of the `questions` table into one transactional SQL script. It never connects to either database.

```bash
# mysqldump / TiDB Dumpling SQL (pass Dumpling's *-schema.sql too), CSV with a header row, or JSON/NDJSON
node supabase/scripts/import-v1-questions.mjs --report v1-report.csv apti_db1.questions*.sql > v1-import.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v1-import.sql   # direct/session connection as postgres
```

- **Every question lands as `status = 'in_review'`, `source = 'import'`.** v1 answer keys were AI-generated and may be wrong, so a reviewer checks each key before publishing. Questions with an out-of-range `correct_answer_index` are imported without an answer key, and daily sets skip them even if published.
- v1 `category` picks the section (v1 "Puzzles" → Logical Reasoning › Puzzles). The subtopic is a keyword guess; questions it can't place go to the section's inactive "Unsorted (v1 import)" topic (`20261001000011_v1_import.sql`), which users and daily sets never see. Move them, then delete those topics.
- Skipped: v1 `status = 'rejected'` (unless `--include-rejected`), unknown categories, fewer than 2 or more than 10 options, empty text/options, and exact content duplicates (the oldest copy wins). An unknown difficulty becomes `medium`. Stderr has the summary; `--report` writes a per-question CSV with the guessed subtopic and notes.
- `private.v1_question_import` maps each v1 `question_id`/`qid` to its v2 question, with `outcome` (`inserted`, or `duplicate` of an existing v2 question with the same `content_hash`), `classified_by` and `notes`. Re-running skips v1 rows already there, so the script is safe to repeat with a newer export.
- Review queue: `select q.*, m.classified_by, m.notes from public.questions q join private.v1_question_import m on m.question_id = q.id where q.status = 'in_review';`

## AI question generation (`generate-questions`)

An admin-only Edge Function (`functions/generate-questions`). A **job** is one subtopic + difficulty + count (1–50). Each call works through **one batch** of up to 5 questions (`GENERATE_BATCH_SIZE`, max 10), so no invocation gets near the Edge Function time limit; the caller repeats `run` while the job is `queued` or `running`. Every response is `{ job, batch? }`, where `job` is the `question_generation_jobs` row.

```js
const call = (body) => supabase.functions.invoke('generate-questions', { body });
let { data } = await call({ action: 'create', subtopic_id, difficulty: 'medium', count: 20 }); // runs the first batch
while (data.job.status === 'queued' || data.job.status === 'running') {
  ({ data } = await call({ action: 'run', job_id: data.job.id }));
}
// also: { action: 'status', job_id } and { action: 'cancel', job_id }
```

Errors: `401` no/invalid session, `403` not an admin, `400` bad body, `404` unknown job/subtopic, `409` a batch of that job is already running (`retry_after_seconds`), `429` rate limited (`Retry-After`).

**One batch** (`pipeline.ts`); anything that fails a step is dropped and counted on the job, never repaired:

1. Embed (Supabase's built-in `gte-small`, 384-d) up to 10 existing questions in the subtopic that have no embedding yet (imports, hand-written questions, edited stems), so they count for step 4.
2. Generate with `QUESTION_MODEL` using structured output: the JSON schema is derived from the zod schemas in `schemas.ts`, and every item is validated with zod (4 distinct options, key index, explanation, hint, `est_seconds`, `computation`) → `dropped_invalid`.
3. Exact duplicates by `content_hash`, within the batch and against the bank → `dropped_duplicate_hash`.
4. Near duplicates: cosine similarity of stem + options embeddings **> 0.92** to another question in the batch or any non-retired question → `dropped_duplicate_similar`.
5. Computed check, for Quantitative Aptitude questions whose options are all numbers (`₹1,250`, `12.5%`, `3/4`, `45 km/h`): the generator must give `computation`, an arithmetic expression (numbers, `+ - * / ^`, `sqrt`, `nCr`, `fact`, …; no variables) that `numeric.ts` evaluates without `eval`. It must equal the keyed option and no other option → `dropped_computed`. Integers, one-decimal values and fractions must match exactly; options shown with 2+ decimals, or any option when the stem says "approximately", match anything that rounds to them.
6. Independent solve with `QUESTION_VERIFY_MODEL` (by default a different vendor's model), temperature 0, options shuffled, never shown the key or explanation. It must choose the keyed option → `dropped_solver` (a failed or timed-out solve counts as a disagreement). If it gives a computation for a numeric question, that must match too → `dropped_computed`.
7. Insert through `gen_insert_question`: one transaction that, under an advisory lock, re-checks the hash and similarity (so concurrent jobs can't both insert a question) and the job's quota, then writes the question as **`status = 'in_review'`, `source = 'ai'`**, its options in a fresh random order, the answer key, and the embedding.

**Provenance.** Every generated question has `model` (the generator), `prompt_version` (`PROMPT_VERSION` in `prompts.ts`; bump it whenever a prompt, schema or check changes) and `generation_job_id`; the job also records `solver_model` and `created_by`. A check constraint requires `model` and `prompt_version` on every `source = 'ai'` question.

**Jobs.** `gen_claim_job` takes a 170 s lease (`locked_until`), so two calls never run the same job at once; a call that dies mid-batch leaves a lease that simply expires, and the next `run` resumes the job. A job finishes `done` once it has inserted `requested` questions, or after `3 × ceil(requested / batch size)` batches: `done` if it inserted anything, `failed` if not. `last_error` holds the latest batch's error (bad API key, timeouts, malformed output). Admins can read jobs; only the function (`service_role`) writes them.

**Limits per admin** (fixed windows in `private.rate_limits`): 20 requests a minute, 10 new jobs an hour, 300 requested questions per 24 h (`GENERATE_REQUESTS_PER_MINUTE`, `GENERATE_JOBS_PER_HOUR`, `GENERATE_QUESTIONS_PER_DAY`).

**Embeddings** live in `private.question_embeddings` (HNSW, cosine), outside the Data API and `audit_log`. Editing a question's stem drops its embedding; it is re-embedded the next time a job runs in that subtopic. The similarity check covers every embedded question, but only subtopics that have had a job are backfilled.

**Setup.**

```bash
npx supabase secrets set OPEN_ROUTER_API_KEY=sk-or-...
# optional: QUESTION_MODEL (default google/gemini-2.0-flash-001), QUESTION_VERIFY_MODEL (default openai/gpt-4o-mini),
# LLM_BASE_URL (any OpenAI-compatible API with json_schema response_format; default OpenRouter), SITE_URL, GENERATE_*
npx supabase functions deploy generate-questions
deno test --allow-read --config supabase/functions/generate-questions/deno.json supabase/functions/generate-questions   # unit tests
```

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

**Daily sets.** Questions come from `published` questions with an answer key and 2+ options, under active sections/topics/subtopics in the track's `track_sections` (no rows = all active sections), and not in any daily set dated within 60 days before the target date or later. A question goes into at most one set per run, across tracks and levels. Each pick prefers the requested difficulty (else the nearest), then the section with the fewest picks so far in the set, then random. A short bank gives a shorter set (`shortfall`, plus a `WARNING`); an empty one gives no set. Sets are released at 00:00 of the date in UTC+14, i.e. already visible when the job runs. Five levels × 10 questions is 50 questions per track per day, so a track needs about 3,000 eligible questions to never run short over the 60-day window. Run by hand with e.g. `select private.generate_daily_sets('2026-10-05');`.

**Streaks.** A full local day with no daily attempt breaks the streak. If `streak_freezes` covers every missed day, one freeze per day is spent (logged in `streak_freeze_uses`) and `last_streak_date` moves to the last covered day; otherwise `current_streak` drops to 0 and no freeze is spent. The same `private.settle_streak` runs before every streak bump, so the cron only keeps idle players' streaks current.

**Leagues.** Weeks run Monday–Monday IST. A player's first XP of the week (any `xp_events` insert) puts them in a league of their `profiles.league_tier`, in cohorts of up to 30. At rollover, ranks are by weekly XP (ties: whoever got there first); the top `league_tiers.promote_count` go up and the bottom `demote_count` go down, both scaled to the cohort's size (promotion rounds up, demotion down). Players with no XP that week keep their tier. `get_my_league()` returns this week's standings (handles, XP, rank), the current zone sizes, and the last finished week's result.

## Gameplay RPCs

All four are `SECURITY DEFINER` with `search_path = ''`, callable by `authenticated` only, and the only path to grading. Call them with `supabase.rpc` (see `frontend/src/lib/game.js`).

| RPC | Does |
| --- | --- |
| `get_today_set()` | Today's released set for the caller's track: questions, options, topic names and the caller's own attempt/hint state. Never correct options or explanations; a hint's text only after the caller paid for it. |
| `submit_answer(question_id, option_id, context, time_ms)` | Grades one attempt and returns `is_correct`, `correct_option_id`, `explanation`, `xp_awarded`, streak. |
| `use_hint(question_id, context?)` | Returns the hint. Only the first reveal per question + context is recorded (`hint_uses`), so it is charged once. |
| `give_up(question_id, context?)` | Spends the attempt for 0 XP and reveals the answer. |

`context` is `'daily'` or `'practice'`; `use_hint`/`give_up` infer it when omitted (daily if the question is in today's set). Rules:

- **daily**: the question must be in today's released set for the caller's track. **practice**: it must be `published`.
- One scoring attempt per question per context, enforced by `attempts_user_question_context_key` (`ON CONFLICT DO NOTHING`, then `23505`). Hints and give-ups are refused after answering.
- Points (`private.score_points`): easy 10 / medium 20 / hard 30, minus 5 if a hint was used, halved (rounded down) in practice, never below 0; wrong answers and give-ups score 0. Non-zero awards insert one `xp_events` row (`idempotency_key = 'attempt:<id>'`) and add to `profiles.xp`.
- The first daily attempt (answer or give-up) of the day moves the streak: +1 if the last streak day was yesterday, otherwise reset to 1.
- Errors: `42501` not signed in / not your question, `23505` already answered, `22023` bad argument, `P0002` no set today or no answer key.

Tests: `tests/database/scheduled_jobs.test.sql` covers set generation (mix, section balance, reuse window, eligibility, idempotency), level fallback, streak freezes and league rollover. `tests/database/gameplay.test.sql` covers double scoring, foreign questions (other track, yesterday's set, drafts), the once-only hint charge, timezone-local "today", and that answers are unreadable by `anon`/`authenticated`.
