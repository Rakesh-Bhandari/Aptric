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
| authenticated user | read active taxonomy, published questions/options/tags (plus questions they've attempted), released daily sets; read own profile, attempts, xp_events, reports, feedback; update own `handle`, `display_name`, `avatar_url`, `bio`, `timezone`, `track_id`; insert reports/feedback; play via `get_today_set`, `submit_answer`, `use_hint`, `give_up` |
| admin (`profiles.role = 'admin'`) | everything above + full CRUD on content tables, read all profiles/attempts/xp/reports/feedback/audit_log, update report/feedback status; `admin_get_question_answer`, `admin_upsert_question_answer`, `admin_set_user_role` RPCs |
| `service_role` / SECURITY DEFINER functions | everything; the only roles that can read `question_answers` or write `attempts`, `xp_events`, `hint_uses` and `profiles.role/level/xp/rating/streak*` |

Notes:

- `question_answers` has RLS on, no policies and no grants for `anon`/`authenticated`. Admins reach it only through the `admin_*` RPCs. The audit trigger records that an answer changed, never its contents.
- Column-level privileges (not RLS) protect the game columns on `profiles`, so the rule holds for admins too.
- `xp_events` and `audit_log` are append-only: updates, direct deletes and truncates raise errors even for `service_role`. Rows still go away when a user is deleted (FK cascade).
- Attempt uniqueness is `(user_id, question_id, context, daily_set_id)` with `NULLS NOT DISTINCT`, so a user gets one practice attempt per question and one attempt per question per daily set.
- `questions.content_hash` is a lowercase sha256 hex digest the writer computes over the normalised stem + options.
- Content changes (taxonomy, questions, options, answers, daily sets) are written to `audit_log` by trigger, with `actor_id = auth.uid()`.

## Tracks and daily sets

Each user follows one track (`profiles.track_id`; `NULL` means the track with `is_default`). There is one daily set per track per date (`daily_sets (track_id, set_date)` is unique). "Today" is the calendar date in the user's `profiles.timezone`, so a set for date D must have `published_at` no later than D 00:00 in the earliest timezone (UTC+14, i.e. D-1 10:00 UTC) to be visible to everyone at their midnight.

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

Tests: `tests/database/gameplay.test.sql` covers double scoring, foreign questions (other track, yesterday's set, drafts), the once-only hint charge, timezone-local "today", and that answers are unreadable by `anon`/`authenticated`.
