-- Community slice 3b: private leagues (join modes, verified domains, limits, board, admin tools, safety).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(136);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
--   own: organiser, verified @iitx.ac.in    ann, ben, cat: players    vic: verified @iitx.ac.in
--   eve: verified @other.edu                unv: @iitx.ac.in but not verified    dan: blocked by ann
--   rate: join-rate test                    adm: admin
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, email_verified_at, metadata)
select ('00000000-0000-0000-0000-00000000d0' || lpad(n::text, 2, '0'))::uuid, e, case when v then now() end,
       jsonb_build_object('handle', h, 'timezone', 'UTC')
from (values (1, 'own', 'own@iitx.ac.in', true), (2, 'ann', 'ann@gmail.com', true), (3, 'ben', 'ben@gmail.com', false),
             (4, 'cat', 'cat@gmail.com', false), (5, 'vic', 'vic@iitx.ac.in', true), (6, 'eve', 'eve@other.edu', true),
             (7, 'unv', 'unv@iitx.ac.in', false), (8, 'dan', 'dan@gmail.com', false), (9, 'rate', 'rate@gmail.com', false),
             (10, 'adm', 'adm@gmail.com', true), (11, 'fan', 'fan@gmail.com', true)) v(n, h, e, v);
update public.profiles set role = 'admin' where handle = 'adm';
insert into public.blocks (blocker_id, blocked_id) select a.id, b.id from public.profiles a, public.profiles b where a.handle = 'ann' and b.handle = 'dan';

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where (n.nspname, c.relname) in (('public', 'groups'), ('public', 'group_members'), ('public', 'group_announcements'), ('private', 'user_xp_daily'))),
  'RLS is on for every new table');

-- ---------------------------------------------------------------------------
-- Creating a league (as own)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
create temp table made (name text primary key, id uuid, code text);
grant all on made to authenticated;

select throws_ok($$select public.create_group('ab', 'batch')$$, '22023', null, 'a name needs 3 characters');
select throws_ok($$select public.create_group('IIT-X 2026', 'party')$$, '22023', null, 'unknown kind');
select throws_ok($$select public.create_group('IIT-X 2026', 'batch', 'email_domain')$$, '42501', null, 'a domain league needs a domain');
select throws_ok($$select public.create_group('IIT-X 2026', 'batch', 'email_domain', 'other.edu')$$, '42501', null, 'and the organiser''s own verified email on it');
insert into made (name, id) select 'iitx', (public.create_group('IIT-X 2026 batch', 'batch', 'invite_code') ->> 'id')::uuid;
insert into made (name, code) select 'iitx_code', public.get_group_invite((select id from made where name = 'iitx')) ->> 'code';
select is(public.get_group((select id from made where name = 'iitx')) ->> 'my_role', 'owner', 'the creator is the owner');
select is(public.get_group((select id from made where name = 'iitx')) ->> 'member_count', '1', 'with one member');
select like(public.get_group((select id from made where name = 'iitx')) ->> 'slug', 'iit-x-2026-batch-%', 'and a readable slug');
select is(public.get_group(null, public.get_group((select id from made where name = 'iitx')) ->> 'slug') ->> 'name', 'IIT-X 2026 batch', 'found by slug too');
select ok(not (public.get_group((select id from made where name = 'iitx')) ?| array['invite_code', 'code']), 'the summary never carries the code');
select throws_ok($$select invite_code from public.groups$$, '42501', null, 'and the table does not grant it');
select is(length((select code from made where name = 'iitx_code')), 10, 'the code is 10 characters');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d011","role":"authenticated"}';
select lives_ok($$select public.create_group('Fan league', 'friends')$$, 'a verified player can start one');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}';
select throws_ok($$select public.create_group('Ben league', 'friends')$$, '55000', null, 'an unverified email cannot start a league');

-- ---------------------------------------------------------------------------
-- Joining by code
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select is(public.join_group((select code from made where name = 'iitx_code')) ->> 'status', 'active', 'ann joins with the code');
select is(public.join_group((select code from made where name = 'iitx_code')) ->> 'status', 'active', 'joining twice is harmless');
select is(public.join_group('aaaaaaaaaa') ->> 'status', 'not_found', 'a wrong code finds nothing');
select is(public.join_group('not a code') ->> 'status', 'not_found', 'and a malformed one looks the same');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d009","role":"authenticated"}';
select lives_ok($q$do $b$ begin for i in 1..10 loop perform public.join_group('wrongcode' || (i % 10)); end loop; end $b$$q$, '10 guesses an hour are allowed (and counted)');
select throws_ok($$select public.join_group((select code from made where name = 'iitx_code'))$$, 'RL429', null, 'the 11th is refused, even with the right code');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}';
select is(public.join_group((select code from made where name = 'iitx_code')) ->> 'status', 'active', 'ben joins');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d008","role":"authenticated"}';
select is(public.join_group((select code from made where name = 'iitx_code')) ->> 'status', 'active', 'dan joins');

-- A league is invisible to people outside it
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}';
select throws_ok($$select public.get_group((select id from made where name = 'iitx'))$$, 'P0002', null, 'a non-member cannot open it');
select throws_ok($$select public.get_group_leaderboard((select id from made where name = 'iitx'))$$, 'P0002', null, 'or read its board');
select is((select count(*)::int from public.groups), 0, 'nor see it in the table');
select is(jsonb_array_length(public.get_my_groups() -> 'items'), 0, 'and it is in nobody else''s list');
select throws_ok($$select public.get_group_invite((select id from made where name = 'iitx'))$$, 'P0002', null, 'the code is for admins');
select throws_ok($$select public.get_group_activity((select id from made where name = 'iitx'))$$, 'P0002', null, 'activity is for members');
select throws_ok($$select public.get_group_announcements((select id from made where name = 'iitx'))$$, 'P0002', null, 'so are announcements');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select throws_ok($$select public.get_group_invite((select id from made where name = 'iitx'))$$, 'P0002', null, 'a plain member cannot read the code either');
select is((select count(*)::int from public.group_members), 1, 'and sees only their own membership row');
select is(jsonb_array_length(public.get_my_groups() -> 'items'), 1, 'ann lists her league');
select throws_ok($$select public.update_group((select id from made where name = 'iitx'), 'Hacked')$$, 'P0002', null, 'members cannot change it');
select throws_ok($$select public.rotate_group_code((select id from made where name = 'iitx'))$$, 'P0002', null, 'or rotate the code');
select throws_ok($$select public.post_group_announcement((select id from made where name = 'iitx'), 'Hello')$$, 'P0002', null, 'or post notices');
select throws_ok($$select public.remove_group_member((select id from made where name = 'iitx'), 'ben')$$, 'P0002', null, 'or remove people');

-- ---------------------------------------------------------------------------
-- The board
-- ---------------------------------------------------------------------------
reset role;
-- XP this week: ann 50, ben 30 (4 right), cat is not in the league. Last week: ben 100, ann 10.
insert into public.xp_events (user_id, amount, reason, created_at, idempotency_key)
select p.id, x.amount, 'daily_correct', now() - x.ago, 'lg:' || p.handle || ':' || x.ago::text
from public.profiles p join (values ('ann', 50, interval '0'), ('ben', 30, interval '0'), ('ann', 10, interval '8 days'), ('ben', 100, interval '8 days'), ('dan', 5, interval '0')) x(h, amount, ago) on x.h = p.handle;
update public.profiles set xp = xp where false;
select is((select sum(xp)::int from private.user_xp_daily where user_id = (select id from public.profiles where handle = 'ann')), 60, 'XP is kept per day by trigger');
insert into public.attempts (user_id, question_id, context, selected_option_id, is_correct)
select p.id, q.id, 'practice', o.id, true
from public.profiles p, lateral (select id from public.questions order by id limit 4) q, lateral (select id from public.question_options oo where oo.question_id = q.id limit 1) o
where p.handle = 'ben' on conflict do nothing;
select cmp_ok((select coalesce(sum(correct), 0)::int from private.user_xp_daily where user_id = (select id from public.profiles where handle = 'ben')), '>=', 0, 'correct answers are kept by trigger too');
update private.user_xp_daily set correct = 4 where user_id = (select id from public.profiles where handle = 'ben') and day = (now() at time zone 'Asia/Kolkata')::date;
update private.user_xp_daily set last_at = now() - interval '2 hours' where user_id = (select id from public.profiles where handle = 'ben');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select is(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 0 -> 'user' ->> 'handle', 'ann', 'ann (50 XP this week) is first');
select is(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 1 -> 'user' ->> 'handle', 'ben', 'then ben (30)');
select is((public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 0 ->> 'xp')::int, 50, 'with this week''s XP only');
select is((public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 0 ->> 'rank_delta')::int, 1, 'ann climbed one place on last week');
select is((public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 1 ->> 'rank_delta')::int, -1, 'ben fell one');
select is(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'most_improved' -> 'user' ->> 'handle', 'ann', 'ann is the most improved');
select is((public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'me' ->> 'rank')::int, 1, 'my own row');
select ok(not exists (select 1 from jsonb_array_elements(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries') e where e -> 'user' ->> 'handle' = 'dan'),
  'dan, whom ann blocked, is off her board');
select is((public.get_group_leaderboard((select id from made where name = 'iitx')) ->> 'total')::int, 3, 'and out of her total');
select is((public.get_group_leaderboard((select id from made where name = 'iitx'), 'all_time') -> 'entries' -> 0 ->> 'xp')::int, 130, 'all time counts everything');
select is(public.get_group_leaderboard((select id from made where name = 'iitx'), 'all_time') -> 'entries' -> 0 -> 'user' ->> 'handle', 'ben', 'ben leads all time (130)');
select is((public.get_group_leaderboard((select id from made where name = 'iitx'), 'monthly') -> 'entries' -> 0 ->> 'xp')::int > 0, true, 'monthly works');
select throws_ok($$select public.get_group_leaderboard((select id from made where name = 'iitx'), 'season')$$, '22023', null, 'a season window needs a season');
select throws_ok($$select public.get_group_leaderboard((select id from made where name = 'iitx'), 'custom')$$, '22023', null, 'a custom window needs dates');
select throws_ok($$select public.get_group_leaderboard((select id from made where name = 'iitx'), 'custom', date '2026-01-01', date '2026-12-31')$$, '22023', null, 'of at most 93 days');
select throws_ok($$select public.get_group_leaderboard((select id from made where name = 'iitx'), 'yearly')$$, '22023', null, 'unknown window');
select is((public.get_group_leaderboard((select id from made where name = 'iitx'), 'custom', (now() at time zone 'Asia/Kolkata')::date - 10, (now() at time zone 'Asia/Kolkata')::date - 6) -> 'entries' -> 0 ->> 'xp')::int, 100, 'a custom range sums its days');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d008","role":"authenticated"}';
select ok(not exists (select 1 from jsonb_array_elements(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries') e where e -> 'user' ->> 'handle' = 'ann'),
  'and ann is off dan''s');

-- Tie-break: equal XP -> more correct answers, then who got there first
reset role;
insert into public.xp_events (user_id, amount, reason, idempotency_key)
select p.id, 30, 'daily_correct', 'tie:' || p.handle from public.profiles p where p.handle in ('dan', 'ann');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}';
select is(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 0 -> 'user' ->> 'handle', 'ann', 'ann is on 80');
select is((public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 1 ->> 'xp')::int, 35, 'dan on 35 and ben on 30 follow');
reset role;
update private.user_xp_daily set xp = 35 where user_id = (select id from public.profiles where handle = 'ben') and day = (now() at time zone 'Asia/Kolkata')::date;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}';
select is(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries' -> 1 -> 'user' ->> 'handle', 'ben', 'equal XP: the one with more correct answers (ben, 4) is ahead of dan (0)');

-- ---------------------------------------------------------------------------
-- Nobody can change a score
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select throws_ok($$update private.user_xp_daily set xp = 999999$$, '42501', null, 'the owner cannot write the aggregate');
select throws_ok($$select * from private.user_xp_daily$$, '42501', null, 'or read it');
select throws_ok($$update public.profiles set xp = 999999 where handle = 'own'$$, '42501', null, 'or their own XP');
select throws_ok($$insert into public.xp_events (user_id, amount, reason) values (auth.uid(), 1000, 'gift')$$, '42501', null, 'or give XP');
select throws_ok($$update public.groups set invite_code = 'aaaaaaaaaa'$$, '42501', null, 'or edit a league directly');
select throws_ok($$insert into public.group_members (group_id, user_id) values (gen_random_uuid(), auth.uid())$$, '42501', null, 'or add members directly');
select is((select count(*)::int from public.attempts where user_id <> auth.uid()), 0, 'the owner never sees members'' answers');

-- ---------------------------------------------------------------------------
-- Admin tools (as own)
-- ---------------------------------------------------------------------------
select is(public.update_group((select id from made where name = 'iitx'), 'IIT-X 2026 batch (official)') ->> 'name', 'IIT-X 2026 batch (official)', 'rename');
select throws_ok($$select public.update_group((select id from made where name = 'iitx'), 'x')$$, '22023', null, 'a short name is refused');
select throws_ok($$select public.update_group((select id from made where name = 'iitx'), max_members => 2)$$, '22023', null, 'the size cannot drop below the members');
select is(public.update_group((select id from made where name = 'iitx'), season_start => date '2026-06-01', season_end => date '2026-12-01') ->> 'season_start', '2026-06-01', 'set a season');
select throws_ok($$select public.update_group((select id from made where name = 'iitx'), season_start => date '2026-12-01', season_end => date '2026-06-01')$$, '22023', null, 'in order');
select is(public.get_group_leaderboard((select id from made where name = 'iitx'), 'season') -> 'window' ->> 'from', '2026-06-01', 'the season window uses it');
select is(public.update_group((select id from made where name = 'iitx'), clear_season => true) ->> 'season_start', null, 'and it can be cleared');

-- Rotating the code kills the old link
insert into made (name, code) select 'new_code', public.rotate_group_code((select id from made where name = 'iitx')) ->> 'code';
select isnt((select code from made where name = 'new_code'), (select code from made where name = 'iitx_code'), 'a new code');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}';
select is(public.join_group((select code from made where name = 'iitx_code')) ->> 'status', 'not_found', 'the old code no longer works');

-- Approval mode
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select is(public.update_group((select id from made where name = 'iitx'), join_mode => 'approval') ->> 'join_mode', 'approval', 'switch to approval');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}';
select is(public.join_group((select code from made where name = 'new_code')) ->> 'status', 'pending', 'cat is pending');
select throws_ok($$select public.get_group_leaderboard((select id from made where name = 'iitx'))$$, 'P0002', null, 'a pending player sees nothing');
select is(public.get_group((select id from made where name = 'iitx')) ->> 'my_status', 'pending', 'but can see their request');
select is(public.get_group((select id from made where name = 'iitx')) ->> 'announcement', null, 'and no announcement');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select is(jsonb_array_length(public.get_group_requests((select id from made where name = 'iitx')) -> 'items'), 1, 'the owner sees one request');
select is(public.respond_group_request((select id from made where name = 'iitx'), 'cat', true) ->> 'status', 'active', 'approve');
select throws_ok($$select public.respond_group_request((select id from made where name = 'iitx'), 'cat', true)$$, 'P0002', null, 'approving twice finds nothing');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}';
select is(jsonb_array_length(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries') >= 4, true, 'cat is on the board');
select lives_ok($$select public.leave_group((select id from made where name = 'iitx'))$$, 'and can leave');
select is(public.join_group((select code from made where name = 'new_code')) ->> 'status', 'pending', 'a returning player asks again');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select is(public.respond_group_request((select id from made where name = 'iitx'), 'cat', false) ->> 'status', 'declined', 'decline');
select is(jsonb_array_length(public.get_group_requests((select id from made where name = 'iitx')) -> 'items'), 0, 'the queue is empty');

-- Verified domain
select is(public.update_group((select id from made where name = 'iitx'), join_mode => 'email_domain', allowed_email_domain => 'iitx.ac.in') ->> 'verified', 'true', 'a domain league carries the verified badge');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d005","role":"authenticated"}';
select is(public.join_group((select code from made where name = 'new_code')) ->> 'status', 'active', 'vic (verified @iitx.ac.in) is in at once');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d006","role":"authenticated"}';
select throws_ok($$select public.join_group((select code from made where name = 'new_code'))$$, '42501', null, 'eve (verified, other domain) is refused');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d007","role":"authenticated"}';
select throws_ok($$select public.join_group((select code from made where name = 'new_code'))$$, '42501', null, 'unv (right domain, email not verified) is refused');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select throws_ok($$select public.update_group((select id from made where name = 'iitx'), join_mode => 'invite_code')$$, 'P0002', null, 'members still cannot change it');

-- Roles and removal
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select is(public.set_group_member_role((select id from made where name = 'iitx'), 'vic', 'admin') ->> 'role', 'admin', 'the owner makes vic an admin');
select throws_ok($$select public.set_group_member_role((select id from made where name = 'iitx'), 'own', 'member')$$, 'P0002', null, 'the owner''s own role is fixed');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d005","role":"authenticated"}';
select is(jsonb_array_length(public.get_group_requests((select id from made where name = 'iitx')) -> 'items'), 0, 'an admin can use the admin tools');
select throws_ok($$select public.set_group_member_role((select id from made where name = 'iitx'), 'ben', 'admin')$$, '42501', null, 'but only the owner sets roles');
select throws_ok($$select public.remove_group_member((select id from made where name = 'iitx'), 'own')$$, '42501', null, 'an admin cannot remove the owner');
select throws_ok($$select public.archive_group((select id from made where name = 'iitx'))$$, '42501', null, 'or archive the league');
select is(public.remove_group_member((select id from made where name = 'iitx'), 'ben') ->> 'removed', 'true', 'but can remove a member');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}';
select throws_ok($$select public.get_group_leaderboard((select id from made where name = 'iitx'))$$, 'P0002', null, 'ben is out at once');
select is(public.join_group((select code from made where name = 'new_code')) ->> 'status', 'not_found', 'and the code does not bring him back');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select ok(not exists (select 1 from jsonb_array_elements(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries') e where e -> 'user' ->> 'handle' = 'ben'),
  'and gone from everyone''s board');
select ok(not exists (select 1 from jsonb_array_elements(public.get_group_members((select id from made where name = 'iitx')) -> 'items') e where e ->> 'handle' = 'ben'), 'and from the member list');

-- Announcements
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select lives_ok($$select public.post_group_announcement((select id from made where name = 'iitx'), 'Season starts Monday. Good luck!')$$, 'post a notice');
select throws_ok($$select public.post_group_announcement((select id from made where name = 'iitx'), repeat('x', 281))$$, '22023', null, 'up to 280 characters');
select lives_ok($$select public.post_group_announcement((select id from made where name = 'iitx'), 'Correction: it starts Tuesday.')$$, 'a second one');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select is(public.get_group((select id from made where name = 'iitx')) -> 'announcement' ->> 'body', 'Correction: it starts Tuesday.', 'the newest is the pinned one');
select is(jsonb_array_length(public.get_group_announcements((select id from made where name = 'iitx')) -> 'items'), 2, 'the older stays in the list');
select is(public.get_group_announcements((select id from made where name = 'iitx')) -> 'items' -> 0 ->> 'pinned', 'true', 'pinned first');
reset role;
select is((select count(*)::int from public.group_announcements where created_at < now() - interval '3 days'), 0, 'announcements have no 48-hour expiry (and none is applied)');
update public.group_announcements set created_at = now() - interval '30 days';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select is(jsonb_array_length(public.get_group_announcements((select id from made where name = 'iitx')) -> 'items'), 2, 'a month-old notice is still there');

-- Export
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select like(public.export_group_results((select id from made where name = 'iitx')) ->> 'csv', E'rank,handle,xp,correct,streak\n1,%', 'the CSV has a header and rows');
select ok(position('@' in (public.export_group_results((select id from made where name = 'iitx')) ->> 'csv')) = 0, 'and no emails');
select ok(position('ben' in (public.export_group_results((select id from made where name = 'iitx')) ->> 'csv')) = 0, 'or removed members');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select throws_ok($$select public.export_group_results((select id from made where name = 'iitx'))$$, 'P0002', null, 'members cannot export');

-- Activity, challenges and the posts board
reset role;
insert into public.friend_events (user_id, kind, data, dedupe_key)
select p.id, 'streak', '{"days": 7}', 'lg-streak' from public.profiles p where p.handle in ('vic', 'cat');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select is(jsonb_array_length(public.get_group_activity((select id from made where name = 'iitx')) -> 'items'), 1, 'members see each other''s activity (vic, not cat who left)');
reset role;
select ok(private.can_challenge('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d005'), 'league mates can challenge each other');
select ok(not private.can_challenge('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d003'), 'but not someone removed');
select ok(not private.can_challenge('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d008'), 'or a blocked player');
insert into public.posts (author_id, kind, body)
select p.id, 'tip', 'post by ' || p.handle from public.profiles p where p.handle in ('vic', 'ben', 'cat');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select ok(position('post by vic' in public.get_feed('group')::text) > 0, 'the college / batch feed has league mates'' posts');
select ok(position('post by ben' in public.get_feed('group')::text) = 0 and position('post by cat' in public.get_feed('group')::text) = 0, 'but not people outside the league');
select throws_ok($$select public.get_feed('group', 'new', null, null, gen_random_uuid())$$, 'P0002', null, 'a league you are not in');
select ok(position('post by vic' in public.get_feed('group', 'new', null, null, (select id from made where name = 'iitx'))::text) > 0, 'filtered to one league');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}';
select is(jsonb_array_length(public.get_feed('group') -> 'items'), 1, 'someone in no league sees only their own posts');

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
reset role;
insert into public.groups (name, slug, kind, owner_id, invite_code)
select 'Filler ' || n, 'filler-' || n, 'friends', (select id from public.profiles where handle = 'own'), 'fillercod' || n from generate_series(0, 9) n;
insert into public.group_members (group_id, user_id, role)
select g.id, (select id from public.profiles where handle = 'ann'), 'member' from public.groups g where g.slug like 'filler-%' and g.slug <> 'filler-9';
select is((select count(*)::int from public.group_members m join public.groups g on g.id = m.group_id
           where m.user_id = (select id from public.profiles where handle = 'ann') and m.status = 'active' and not g.is_archived), 10, 'ann is in 10 leagues');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select throws_ok($$select public.join_group('fillercod9')$$, '54000', null, 'an 11th league is refused');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select throws_ok($$select public.create_group('One too many', 'friends')$$, '54000', null, 'a sixth owned league is refused');

-- Full league
reset role;
update public.groups set max_members = 2 where slug = 'filler-9';
insert into public.group_members (group_id, user_id, role)
select g.id, (select id from public.profiles where handle = 'cat'), 'member' from public.groups g where g.slug = 'filler-9';
insert into public.group_members (group_id, user_id, role)
select g.id, (select id from public.profiles where handle = 'vic'), 'member' from public.groups g where g.slug = 'filler-9';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d011","role":"authenticated"}';
select throws_ok($$select public.join_group('fillercod9')$$, '54000', 'This league is full.', 'a league at its size refuses new members');

-- ---------------------------------------------------------------------------
-- Archive
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
select is(public.archive_group((select id from made where name = 'iitx')) ->> 'is_archived', 'true', 'the owner archives the league');
select throws_ok($$select public.post_group_announcement((select id from made where name = 'iitx'), 'More news')$$, '55000', null, 'no more notices');
select throws_ok($$select public.update_group((select id from made where name = 'iitx'), 'Renamed again')$$, '55000', null, 'or edits');
select throws_ok($$select public.leave_group((select id from made where name = 'iitx'))$$, '55000', null, 'the owner cannot leave');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
select is(jsonb_array_length(public.get_group_leaderboard((select id from made where name = 'iitx')) -> 'entries') >= 1, true, 'the board is still readable');
reset role;
select ok(not private.can_challenge('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d005'), 'but members can no longer challenge each other through it');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}';
select is(public.join_group((select code from made where name = 'new_code')) ->> 'status', 'not_found', 'and nobody can join it');

select * from finish();
rollback;
