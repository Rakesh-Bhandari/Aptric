-- Undoes import-v1-users.mjs: removes the imported users, their legacy XP and
-- the imported feedback. See "Rollback" in supabase/MIGRATION.md.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/rollback-v1-users.sql
--
-- Run as postgres. Meant for before (or right after) the cutover: deleting an
-- auth user created by the import also deletes everything they did in v2
-- since (attempts, XP, league rows, badges). Accounts that already existed in
-- v2 are kept and lose only their legacy XP event; their streak, streak
-- freezes and badges earned from it, filled-in profile fields and any v1 ban
-- are left as they are.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';

delete from public.feedback where id in (select feedback_id from private.v1_feedback_import);
delete from private.v1_feedback_import;

-- Accounts that already existed in v2: take the legacy XP back off and drop
-- the ledger rows, so a later re-import can credit it again. xp_events is
-- append-only; its delete guard is lifted for this statement only.
update public.profiles p
set xp = greatest(p.xp - e.amount, 0)
from private.v1_user_import m
join public.xp_events e on e.idempotency_key = 'legacy_import:v1:' || m.v1_user_id
where m.outcome = 'existing' and p.id = m.user_id;

alter table public.xp_events disable trigger xp_events_no_delete;
delete from public.xp_events e
using private.v1_user_import m
where m.outcome = 'existing' and e.idempotency_key = 'legacy_import:v1:' || m.v1_user_id;
alter table public.xp_events enable trigger xp_events_no_delete;

-- Cascades to profiles, xp_events, attempts, badges, league rows, ...
delete from auth.users where id in (select user_id from private.v1_user_import where outcome = 'created');

select outcome, count(*) as removed from private.v1_user_import group by outcome;
delete from private.v1_user_import;

commit;

select private.refresh_leaderboards();
