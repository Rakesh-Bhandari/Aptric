-- Bookkeeping for the one-off v1 (TiDB/MySQL) user import.
-- The import itself is supabase/scripts/import-v1-users.mjs; the runbook is
-- supabase/MIGRATION.md.

-- Which v1 user became which auth user. Makes the import re-runnable: v1 users
-- already listed here are skipped, so a newer export only adds the rest.
create table private.v1_user_import (
  v1_user_id        text primary key,
  -- NULL once the auth user is deleted; the v1 row stays imported.
  user_id           uuid unique references auth.users (id) on delete set null,
  email             text not null,
  -- 'created': the import made the auth user. 'existing': someone had already
  -- signed up to v2 with that email, so their account was kept and only the
  -- legacy XP, streak and empty profile fields were added to it.
  outcome           text not null check (outcome in ('created', 'existing')),
  -- How the v1 user signed in: 'password', 'google', 'password+google' or 'none'.
  -- Google users have no Google identity yet: Supabase links it by email on
  -- their first Google sign-in.
  v1_auth           text not null check (v1_auth in ('password', 'google', 'password+google', 'none')),
  v1_google_id      text,
  v1_score          integer not null check (v1_score >= 0),
  -- The 'legacy_import' xp_events amount (= v1 score); 0 means no event.
  starting_xp       integer not null check (starting_xp >= 0),
  v1_day_streak     integer,
  current_streak    integer not null,
  longest_streak    integer not null,
  last_streak_date  date,
  notes             text,
  imported_at       timestamptz not null default now()
);

create index v1_user_import_email_idx on private.v1_user_import (lower(email));

create table private.v1_feedback_import (
  v1_feedback_id  integer primary key,
  feedback_id     uuid references public.feedback (id) on delete set null,
  v1_user_id      text,
  imported_at     timestamptz not null default now()
);

create index v1_feedback_import_feedback_idx on private.v1_feedback_import (feedback_id);

revoke all on private.v1_user_import, private.v1_feedback_import from public, anon, authenticated;
