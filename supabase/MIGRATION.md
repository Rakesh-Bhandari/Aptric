# Aptric v1 → v2 user migration and cutover

Moves v1 users (TiDB/MySQL) into Supabase Auth and v2, then switches production traffic. Questions are migrated separately (see [Importing v1 questions](README.md#importing-v1-questions)); this runbook covers users, their score, streak and attempt history, and feedback.

| Piece | File |
| --- | --- |
| Bookkeeping tables (`private.v1_user_import`, `private.v1_feedback_import`) | `migrations/20261001000016_v1_user_import.sql` |
| Export from TiDB (read-only, NDJSON) | `scripts/export-v1-users.sql` |
| Plan + SQL generator (dry run, import, verify) | `scripts/import-v1-users.mjs` (tests: `node --test supabase/scripts/*.test.mjs`) |
| Data rollback | `scripts/rollback-v1-users.sql` |

## What moves where

| v1 (TiDB) | v2 (Supabase) | How |
| --- | --- | --- |
| `users.email`, `password_hash` | `auth.users` + an `email` row in `auth.identities` | bcrypt hash copied into `encrypted_password` as is. Supabase Auth checks bcrypt natively, so users sign in with their old password. Email is lowercased and marked confirmed. |
| `users.google_id` | nothing yet; kept in `private.v1_user_import.v1_google_id` | On their first "Continue with Google", Supabase finds the confirmed account with the same email and links the Google identity to it automatically. Same user id, same XP. |
| `users.user_id` | `private.v1_user_import (v1_user_id → user_id)` | The new auth id is a UUIDv5 of the v1 id, so it is the same on every run. If someone already signed up to v2 with that email, their account is kept and mapped instead (`outcome = 'existing'`). |
| `users.handle` | `profiles.handle` | `alice-1a2b3c4d` → `alice_1a2b3c4d`. Handles longer than 24 characters become `<slug, 18 chars>_<5 hex>`. If the result is taken or unusable, the handle is left `NULL` and the player picks one on `/onboarding`. |
| `user_name`, `profile_pic` (https only), `bio`, `role`, `is_banned`, `created_at` | `profiles.display_name`, `avatar_url`, `bio`, `role`, `banned_at` (+ `auth.users.banned_until`), `created_at` | Trimmed to v2 limits. Imported profiles get `timezone = 'Asia/Kolkata'`, the timezone v1 used for its days. |
| `users.score` | `profiles.xp` via one `xp_events` row, `reason = 'legacy_import'` | Score becomes starting XP. `level` follows from XP (L2 at 100, L5 at 1,000, …), and the XP trigger grants streak freezes for each 500 XP (2 at most). |
| `user_attempts` | the same `legacy_import` event's `metadata.attempts` | One event per user: `{total, correct, wrong, hint_used, gave_up, points, first_date, last_date, questions_solved, questions_attempted}`. v1 attempts are **not** turned into `attempts` rows: v1 questions were re-imported for review under new ids and v1 had no daily-set ids. So mastery stars, `solved-100` and Topic Master start from zero. Users with a score of 0 get no event, because `xp_events.amount` can't be 0. |
| `users.day_streak` | `profiles.current_streak`, `longest_streak`, `last_streak_date` | **Recomputed** from history with v1's own rule (backend migration 004): a streak day is a day the user finished a question from that day's daily set. The current streak is the run ending on the last such day if that day is today or yesterday (IST), else 0. The longest streak is the longest run ever. `streak-7/30/100` badges are awarded from the longest streak. |
| `user_feedback` | `feedback` (`page = 'v1-import'`, `status = 'read'`, `category = 'general'`) | Ratings are rounded to whole stars (4.5 → 5; 0 → no rating). A missing comment becomes `(rating only)`. |
| `feedback_reports`, `activity_logs`, `user_daily_log`, OTP/verification tokens, `token_version`, `level`, `premium_level`, `answered_qids` | not migrated | They're obsolete in v2 or rebuilt there. `user_daily_log` is used only to recompute streaks. |

**Skipped users** (listed in the `--report` CSV):

- `unverified`: never confirmed their email and have no Google sign-in. v1 refused their logins, and importing them as confirmed would let whoever typed that address claim the real owner's Google sign-in later. They can just sign up again.
- `duplicate_email`: the same email in a different case. The oldest account wins.
- `invalid_email`.

A `password_hash` that isn't bcrypt is dropped. That user gets a passwordless account and signs in by magic link, password reset or Google.

**Accounts that already exist in v2** (beta testers) keep their password, handle, role, timezone and any v2 streak. v1 fills only their empty profile fields, adds the legacy XP event, and adds the v1 streak only if they have never played a v2 daily set. A v1 ban is applied to them too.

**Leagues:** the league trigger is switched off while the legacy events are inserted (in the same transaction), so starting XP never counts toward this week's league. Everyone starts the first v2 week at 0 in Bronze. The report checks that `league_members` didn't change.

## Running it

All commands run from the repo root. `DATABASE_URL` is the **direct or session-pooler** connection string for user `postgres` (Dashboard → Connect). The script writes `auth.users` and toggles a trigger, so neither the transaction pooler nor `service_role` will do.

```bash
# 0. Once: the bookkeeping migration (part of the normal migration set)
npx supabase db push

# 1. Export (read-only on TiDB). The output holds emails + password hashes: keep it outside the repo.
mysql --host <tidb-host> --port 4000 --user <user> -p --ssl-mode=VERIFY_IDENTITY \
      --ssl-ca backend/src/certs/isrgrootx1.pem --batch --raw --skip-column-names apti_db1 \
  < supabase/scripts/export-v1-users.sql > ~/aptric-cutover/v1-users.ndjson

# 2. Plan: summary on stderr, per-user CSV, and a dry-run script
node supabase/scripts/import-v1-users.mjs --dry-run --report ~/aptric-cutover/v1-users-report.csv \
  --out ~/aptric-cutover/v1-users-dry.sql ~/aptric-cutover/v1-users.ndjson

# 3. Dry run against the target database: every step and the report run, then ROLLBACK
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ~/aptric-cutover/v1-users-dry.sql

# 4. Import (same export, ends in COMMIT, then refreshes the leaderboards)
node supabase/scripts/import-v1-users.mjs --out ~/aptric-cutover/v1-users.sql ~/aptric-cutover/v1-users.ndjson
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ~/aptric-cutover/v1-users.sql | tee ~/aptric-cutover/import-report.txt

# 5. Re-check any time later (read-only)
node supabase/scripts/import-v1-users.mjs --verify --out ~/aptric-cutover/v1-users-verify.sql ~/aptric-cutover/v1-users.ndjson
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ~/aptric-cutover/v1-users-verify.sql
```

`--today YYYY-MM-DD` pins the date streaks are measured against (default: today in IST). Generate the import script on the day you run it.

The import is **re-runnable**. Users and feedback already in the `private.v1_*_import` tables are skipped, so running it again with a newer export only adds what's missing.

### Verification report

Printed by the dry run, the import and `--verify`. Any row marked `MISMATCH` raises an exception, which rolls back the whole import. Sections:

| Section | Checks |
| --- | --- |
| `export` | v1 users, feedback and score sum: the NDJSON vs the `totals` row counted in TiDB (catches a truncated export); skipped users by reason |
| `users` | mapping rows, `auth.users`, email identities, `profiles` = users to import; created vs existing; bcrypt hash present in `encrypted_password` for every password user; admins; bans; Google users waiting to link; profiles without a handle |
| `xp` | one `legacy_import` event per user with score > 0; XP sum = v1 score sum; `profiles.xp` = ledger sum for every imported user |
| `streaks` | longest streak ≥ v1's; live streaks match the plan (exact only at import time) |
| `feedback` | imported rows = exported rows, and how many are linked to a user |
| `tables` (import / dry run only) | before, after and change for `auth.users`, `auth.identities`, `profiles`, `xp_events`, `user_badges`, `feedback`, `league_members` (count and XP sum, must not change) and the two mapping tables, against the change expected from what was left to import |

Tested locally against `supabase start` (Postgres + GoTrue). After the import, `$2b$` hashes from v1 sign in through `/auth/v1/token`, wrong passwords and banned users are refused, and an existing v2 account keeps its own password. Import → rollback → re-import ends in the same state as a single import. Google linking can't be exercised locally, so use the smoke test below on staging.

## Cutover checklist

The steps marked ⏸ fall inside the maintenance window. Before cutover day, rehearse the whole thing on a staging Supabase project or branch with a production export (steps T-3 to T+0), and time it.

### T-7 to T-1: prepare

- [ ] Production Supabase project created; `npx supabase db push` applied every migration, including `20261001000016`.
- [ ] Every setting in [AUTH.md](AUTH.md) is applied to production: Site URL `https://aptric.app`, Redirect URLs, Email provider with **Confirm email on**, password rules, rate limits.
- [ ] **Email templates:** custom SMTP is verified (SPF/DKIM/DMARC on `auth.aptric.app`, link tracking off), and the four templates from `supabase/templates/` are pasted in with their subjects (AUTH.md §5). Send yourself a real confirmation, magic link and reset email from production and click each one. Recovery and magic links matter most on day one: users whose hash was dropped, and anyone who forgot their password, will use them.
- [ ] **Google OAuth** (Google Cloud Console → Credentials). Reuse the **v1 OAuth client** (`VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_SECRET` in the v1 backend's Vercel env), so returning users see the consent screen they've already approved:
  - Authorized redirect URIs: **add** `https://<ref>.supabase.co/auth/v1/callback` (or your custom auth domain). **Keep** the v1 one (`VITE_GOOGLE_REDIRECT_URI`, `https://<v1-backend>/auth/google/callback`) until the rollback window closes.
  - Authorized JavaScript origins: `https://aptric.app`.
  - Supabase → Sign In / Providers → Google: same client ID/secret, enabled. Leave "Allow manual linking" off; automatic linking by verified email is what relinks v1 Google users.
- [ ] Vercel, frontend project: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set for **Production** and **Preview** (Project Settings → Environment Variables). `VITE_API_BASE_URL` is no longer read by v2 and can go. The v2 build has been deployed to a preview URL and smoke-tested against production Supabase with a test account.
- [ ] DNS: lower the TTL of the `aptric.app` records to 300 s at least 24 h before the window, if the domain isn't on Vercel nameservers.
- [ ] Question bank imported and enough questions approved for daily sets (README › Daily sets). `private.generate_daily_sets()` has produced tomorrow's sets.
- [ ] Users told about the maintenance window, and that Google users should keep using "Continue with Google".
- [ ] Rehearsal done: dry run on staging is clean, the report and timings are saved, and both smoke-test accounts work (see T+0).

### T-0: cutover

1. ⏸ **Freeze v1.** In the v1 backend's Vercel project, add a Firewall custom rule that denies paths starting with `/api` and `/auth` (instant to undo), and remove the three v1 crons (`streak-check`, `question-bank`, `generation-jobs`) by deploying a `vercel.json` without them. Otherwise `streak-check` would rewrite streaks after the export.
2. ⏸ **Back up TiDB** (TiDB Cloud backup or Dumpling full dump). This is the rollback point.
3. ⏸ **Export** (Running it, step 1). Check that the stderr summary from step 2 matches expectations.
4. ⏸ **Dry run** on production (steps 2–3). Every check `ok`. Read the `--report` CSV for surprises: skipped counts, handles, dropped hashes.
5. ⏸ **Import** (step 4). Keep `import-report.txt`.
6. ⏸ **Switch traffic.** Vercel → frontend project → promote the v2 production deployment (same project), or, if v2 is a separate Vercel project, move the `aptric.app` / `www` domains to it (Domains → Remove on v1, Add on v2). DNS records stay the same (`A 76.76.21.21` / `CNAME cname.vercel-dns.com`).
7. **Smoke test on https://aptric.app** with real v1 accounts, kept as test accounts:
   - [ ] v1 password user signs in with the old password; XP = old score, level and streak look right.
   - [ ] v1 Google-only user clicks "Continue with Google" and lands on the **same** account (same XP and handle). Check that `select provider from auth.identities where user_id = '<id>'` now lists `email` and `google`.
   - [ ] Password reset and magic-link emails arrive and their links work.
   - [ ] A new sign-up gets a confirmation email and goes through onboarding.
   - [ ] Play one daily question; the leaderboard shows imported players (refreshed at the end of the import).
8. Lift the maintenance notice.

### T+1 to T+3: watch

- [ ] Supabase → Logs → Auth: watch the rate of `invalid_credentials`, and check rate limits aren't being hit by the reset wave (raise the email limit for a few days if needed).
- [ ] Google relinking progress: `select count(*) from private.v1_user_import m join auth.identities i on i.user_id = m.user_id and i.provider = 'google' where m.v1_auth in ('google', 'password+google');`
- [ ] Re-run `--verify` on day 1. Only the streak row may drift once people play, and it doesn't fail.
- [ ] Support answer ready for users who sign up again instead of signing in. Their v1 data sits on the imported account with the same email, so tell them to use "Forgot password" or Google with that email.

### After the rollback window (T+7)

- [ ] Remove the v1 Google redirect URI; delete the v1 backend Vercel project and its env secrets (DB password, Google secret, SMTP).
- [ ] Keep the TiDB backup for 30 days, then delete the TiDB cluster.
- [ ] Delete `~/aptric-cutover/` (NDJSON, generated SQL and CSV all contain emails and password hashes).

## Rollback plan

Before step 6 (traffic is still frozen on v1), the decision is free. After it, every hour on v2 adds activity that a rollback throws away. Decide within **24 h** of the switch; past that, fix forward.

| When | What went wrong | Do |
| --- | --- | --- |
| Dry run / import fails | a check is `MISMATCH`, or an error | Nothing to undo: the transaction rolled back. Fix it, re-export if needed, run again. If the window runs out, lift the v1 firewall rule, restore the crons and reschedule. |
| After import, before the switch | data is wrong | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/rollback-v1-users.sql`. This deletes the auth users the import created (cascading to profiles, XP, badges) and the imported feedback, and takes the legacy XP back off pre-existing accounts. Then fix and import again, or unfreeze v1. |
| After the switch, within the window | v2 broken for users (auth, gameplay) | 1. Move traffic back: promote the last v1 frontend deployment, or move the domains back to the v1 project. 2. Delete the v1 backend's firewall rule and redeploy its `vercel.json` with the crons. 3. v1 resumes exactly where it was frozen, because nothing writes to TiDB after the freeze. v1 Google sign-in still works because its redirect URI was kept. 4. Tell users that anything done on v2 since the switch is not in v1, and that a password changed on v2 doesn't apply to v1. 5. Leave the v2 data as it is (or run the rollback script) and re-import from a fresh export at the next attempt. The import skips users already mapped, so run `rollback-v1-users.sql` first if you want v1's newer scores and streaks to win. |
| After the window | anything | Fix forward on v2. Restore TiDB from the backup only to read old data. |

What the rollback script leaves on accounts that existed in v2 before the import: streak values, badges and streak freezes earned from legacy XP, profile fields it filled in, and a v1 ban. These are listed in the script header; fix them by hand if it matters.
