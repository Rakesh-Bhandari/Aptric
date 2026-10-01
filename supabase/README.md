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

## Access model

| Who | Can |
| --- | --- |
| `anon` | nothing |
| authenticated user | read active taxonomy, published questions/options/tags (plus questions they've attempted), released daily sets; read own profile, attempts, xp_events, reports, feedback; update own `handle`, `display_name`, `avatar_url`, `bio`, `timezone`; insert reports/feedback |
| admin (`profiles.role = 'admin'`) | everything above + full CRUD on content tables, read all profiles/attempts/xp/reports/feedback/audit_log, update report/feedback status; `admin_get_question_answer`, `admin_upsert_question_answer`, `admin_set_user_role` RPCs |
| `service_role` / SECURITY DEFINER functions | everything; the only roles that can read `question_answers` or write `attempts`, `xp_events` and `profiles.role/level/xp/rating/streak*` |

Notes:

- `question_answers` has RLS on, no policies and no grants for `anon`/`authenticated`. Admins reach it only through the `admin_*` RPCs. The audit trigger records that an answer changed, never its contents.
- Column-level privileges (not RLS) protect the game columns on `profiles`, so the rule holds for admins too.
- `xp_events` and `audit_log` are append-only: updates, direct deletes and truncates raise errors even for `service_role`. Rows still go away when a user is deleted (FK cascade).
- Attempt uniqueness is `(user_id, question_id, context, daily_set_id)` with `NULLS NOT DISTINCT`, so a user gets one practice attempt per question and one attempt per question per daily set.
- `questions.content_hash` is a lowercase sha256 hex digest the writer computes over the normalised stem + options.
- Content changes (taxonomy, questions, options, answers, daily sets) are written to `audit_log` by trigger, with `actor_id = auth.uid()`.
