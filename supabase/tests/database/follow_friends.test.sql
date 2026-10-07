-- Community slice 1: follow / friends, blocks, privacy, activity feed, friends filter.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(127);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
--   ann: main player   ben: public account, has a display name   cat: private account
--   dan: blocks ann    eve: not discoverable   fay: banned   gus/ivy: rate limits
--   hal: follows 1,000 players   adm: admin
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata) values
  ('00000000-0000-0000-0000-00000000a001', 'ann@example.com', '{"handle":"ann","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a002', 'ben@example.com', '{"handle":"ben","display_name":"Ben Real Name","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a003', 'cat@example.com', '{"handle":"cat","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a004', 'dan@example.com', '{"handle":"dan","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a005', 'eve@example.com', '{"handle":"eve","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a006', 'fay@example.com', '{"handle":"fay","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a007', 'gus@example.com', '{"handle":"gus","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a008', 'ivy@example.com', '{"handle":"ivy","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a009', 'hal@example.com', '{"handle":"hal","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000a00a', 'adm@example.com', '{"handle":"adm","timezone":"UTC"}');
update public.profiles set is_private = true where handle = 'cat';
update public.profiles set banned_at = now() where handle = 'fay';
update public.profiles set role = 'admin' where handle = 'adm';
update public.profile_privacy set discoverable = false where user_id = '00000000-0000-0000-0000-00000000a005';

select is((select count(*)::int from public.profile_privacy), 10, 'every profile gets a privacy row');
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in
     ('follows', 'follow_requests', 'blocks', 'profile_privacy', 'friend_events', 'user_reports')),
  'RLS is on for every new table');

-- ---------------------------------------------------------------------------
-- Follow, unfollow, requests (as ann)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

select is(public.follow_user('ben') ->> 'status', 'following', 'following a public account is immediate');
select is(public.follow_user('Ben') ->> 'status', 'following', 'following again is a no-op (handles are case-insensitive)');
select is((select count(*)::int from public.follows), 1, 'one follow row');
select is(public.follow_user('cat') ->> 'status', 'requested', 'a private account gets a request');
select is((select count(*)::int from public.follows where followee_id = '00000000-0000-0000-0000-00000000a003'), 0,
  'no follow until approved');
select throws_ok($$select public.follow_user('ann')$$, '22023', null, 'you cannot follow yourself');
select throws_ok($$select public.follow_user('nobody_here')$$, 'P0002', 'user not found', 'unknown handle');
select throws_ok($$select public.follow_user('fay')$$, 'P0002', 'user not found', 'a banned player looks like a missing one');
select throws_ok($$select public.follow_user(null)$$, 'P0002', 'user not found', 'a null handle is not found');

select is(public.get_player_profile('ben') -> 'relationship' ->> 'following', 'true', 'the profile shows I follow ben');
select is(public.get_player_profile('cat') -> 'relationship' ->> 'requested', 'true', 'the profile shows my request');

select is(public.unfollow_user('ben') ->> 'status', 'none', 'unfollow');
select is((select count(*)::int from public.follows), 0, 'the follow is gone');
select is(public.follow_user('ben') ->> 'status', 'following', 're-follow');

-- Approval (as cat)
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';

select is(jsonb_array_length(public.get_follow_requests() -> 'items'), 1, 'cat has one request');
select is(public.get_follow_requests() -> 'items' -> 0 ->> 'handle', 'ann', 'from ann');

reset role;
create temp table req on commit drop as select id from public.follow_requests where follower_id = '00000000-0000-0000-0000-00000000a001';
grant select on req to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select throws_ok($$select public.respond_follow_request((select id from req), true)$$, 'P0002', null,
  'only the account that was asked can answer');
select is((select status from public.follow_requests), null, 'ben cannot read ann''s request to cat');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select is(public.respond_follow_request((select id from req), true) ->> 'status', 'accepted', 'cat accepts');
select is(public.respond_follow_request((select id from req), false) ->> 'status', 'accepted', 'answering twice changes nothing');
select is((select count(*)::int from public.follows where follower_id = '00000000-0000-0000-0000-00000000a001'
           and followee_id = '00000000-0000-0000-0000-00000000a003'), 1, 'ann now follows cat');
select is(public.get_followers('cat') -> 'items' -> 0 ->> 'handle', 'ann', 'cat lists ann as a follower');

-- A private account's lists are for its followers
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select is(public.get_followers('cat') ->> 'restricted', 'true', 'a stranger cannot see a private account''s followers');
select is(jsonb_array_length(public.get_followers('cat') -> 'items'), 0, '... and gets no items');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is(public.get_following('cat') ->> 'restricted', 'false', 'a follower can');

-- Declined requests are silent
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select is(public.follow_user('cat') ->> 'status', 'requested', 'ben asks cat');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select is(public.respond_follow_request((select id from public.follow_requests where follower_id = '00000000-0000-0000-0000-00000000a002'), false) ->> 'status',
  'declined', 'cat declines');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select is(public.follow_user('cat') ->> 'status', 'requested', 'asking again looks the same to ben');
select is(public.get_player_profile('cat') -> 'relationship' ->> 'requested', 'true', 'and a declined request still reads as requested');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select is(jsonb_array_length(public.get_follow_requests() -> 'items'), 0, 'cat is not asked again within a week');

-- Going public accepts everyone waiting
reset role;
update public.follow_requests set status = 'pending', responded_at = null where follower_id = '00000000-0000-0000-0000-00000000a002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select is(public.set_privacy(is_private => false) ->> 'is_private', 'false', 'cat goes public');
select is((select count(*)::int from public.follows where follower_id = '00000000-0000-0000-0000-00000000a002'
           and followee_id = '00000000-0000-0000-0000-00000000a003'), 1, '... which accepts the waiting request');
select is(public.remove_follower('ben') ->> 'status', 'removed', 'cat removes ben');
select is((select count(*)::int from public.follows where follower_id = '00000000-0000-0000-0000-00000000a002'), 0, 'ben no longer follows cat');
select is(public.set_privacy(is_private => true) ->> 'is_private', 'true', 'cat goes private again');

-- ---------------------------------------------------------------------------
-- Direct table access is read-only and scoped
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select throws_ok($$insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-0000-0000-00000000a005')$$,
  '42501', null, 'follows cannot be written directly');
select throws_ok($$update public.profiles set is_private = true where id = auth.uid()$$, '42501', null,
  'is_private only changes through set_privacy');
select throws_ok($$insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-00000000a005')$$,
  '42501', null, 'blocks cannot be written directly');
select throws_ok($$insert into public.friend_events (user_id, kind, dedupe_key) values (auth.uid(), 'streak', 'x')$$,
  '42501', null, 'activity events cannot be written directly');
select is((select count(*)::int from public.follows where follower_id <> auth.uid() and followee_id <> auth.uid()), 0,
  'players only see their own follow edges');
select is((select count(*)::int from public.profile_privacy where user_id <> auth.uid()), 0, 'privacy rows are private');
select is((select count(*)::int from public.user_reports), 0, 'reports are for admins');

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
select is(jsonb_array_length(public.search_users('be') -> 'items'), 1, 'prefix search finds ben');
select is(public.search_users('@BE') -> 'items' -> 0 ->> 'handle', 'ben', 'case and a leading @ are ignored');
select is(jsonb_array_length(public.search_users('b') -> 'items'), 0, 'one character is too short');
select is(jsonb_array_length(public.search_users('ben@example.com') -> 'items'), 0, 'an email address finds nobody');
select is(jsonb_array_length(public.search_users('ev') -> 'items'), 0, 'players who opted out of search are not listed');
select is(jsonb_array_length(public.search_users('fa') -> 'items'), 0, 'banned players are not listed');
select is(jsonb_array_length(public.search_users('a_') -> 'items'), 0, 'underscore is not a wildcard');
select is(public.search_users('be') -> 'items' -> 0 ->> 'display_name', null, 'real names are hidden unless the player opted in');
select ok(not (public.search_users('be') -> 'items' -> 0) ? 'email', 'no email in search results');
select throws_ok($$select public.search_users('be', 'not a cursor!')$$, '22023', null, 'bad cursor');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select lives_ok($$select public.set_privacy(name_visibility => 'everyone')$$, 'ben shares his name');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is(public.search_users('be') -> 'items' -> 0 ->> 'display_name', 'Ben Real Name', '... and then it shows');

-- Rate limit: 30 searches a minute
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a007","role":"authenticated"}';
select lives_ok($q$do $b$ begin for i in 1..30 loop perform public.search_users('be'); end loop; end $b$$q$, '30 searches are fine');
select throws_ok($$select public.search_users('be')$$, 'RL429', null, 'the 31st search in a minute is refused');

-- Rate limit: 60 follows or unfollows an hour
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a008","role":"authenticated"}';
select lives_ok($q$do $b$ begin for i in 1..60 loop perform public.follow_user('ann'); end loop; end $b$$q$, '60 follows an hour are fine');
select throws_ok($$select public.follow_user('ann')$$, 'RL429', null, 'the 61st is refused');
select throws_ok($$select public.unfollow_user('ann')$$, 'RL429', null, 'and unfollowing counts too');

-- A banned player cannot use any of it
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a006","role":"authenticated"}';
select throws_ok($$select public.follow_user('ann')$$, '42501', null, 'banned players cannot follow');
select throws_ok($$select public.search_users('an')$$, '42501', null, 'or search');

-- ---------------------------------------------------------------------------
-- The 1,000 following cap, and paging
-- ---------------------------------------------------------------------------
reset role;
insert into private.accounts (id, email, metadata)
select ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid, 'u' || n || '@example.com',
       jsonb_build_object('handle', 'u' || lpad(n::text, 4, '0'), 'timezone', 'UTC')
from generate_series(1, 1000) n;
insert into public.follows (follower_id, followee_id, created_at)
select '00000000-0000-0000-0000-00000000a009', p.id, now() - (row_number() over (order by p.handle)) * interval '1 minute'
from public.profiles p where p.handle like 'u0%' or p.handle = 'u1000';
select is((select count(*)::int from public.follows where follower_id = '00000000-0000-0000-0000-00000000a009'), 1000, 'hal follows 1,000');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a009","role":"authenticated"}';
select throws_ok($$select public.follow_user('ann')$$, '54000', null, 'the 1,001st follow is refused');
select is(jsonb_array_length(public.get_following('hal') -> 'items'), 30, 'a page is 30');
select isnt(public.get_following('hal') ->> 'next_cursor', null, 'with a cursor for the next one');
select is((select count(distinct i ->> 'handle')::int
           from jsonb_array_elements(public.get_following('hal') -> 'items') i), 30, 'no repeats within a page');
select is((public.get_following('hal', public.get_following('hal') ->> 'next_cursor') -> 'items' -> 0 ->> 'handle') =
          (public.get_following('hal') -> 'items' -> 0 ->> 'handle'), false, 'the second page continues after the first');
select throws_ok($$select public.get_following('hal', 'garbage')$$, '22023', null, 'a bad cursor is rejected');

-- ---------------------------------------------------------------------------
-- Blocks (dan blocks ann; they followed each other)
-- ---------------------------------------------------------------------------
reset role;
insert into public.follows (follower_id, followee_id) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a004'),
  ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000a001');
update public.profiles set xp = 300 where handle = 'ann';
update public.profiles set xp = 200 where handle = 'dan';
update public.profiles set xp = 100 where handle = 'ben';
refresh materialized view private.leaderboard_all_time;
insert into public.leagues (id, tier, week_start)
  values ('1e000000-0000-0000-0000-000000000001', 1, private.league_week_start(now()));
insert into public.league_members (league_id, user_id, week_start, xp)
select '1e000000-0000-0000-0000-000000000001', p.id, private.league_week_start(now()), 10
from public.profiles p where p.handle in ('ann', 'dan', 'ben', 'cat', 'eve', 'gus')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select ok((select array_agg(e ->> 'handle') @> array['dan'] from jsonb_array_elements(public.get_leaderboard('all_time') -> 'entries') e),
  'before the block ann sees dan on the leaderboard');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}';
select is(public.block_user('ann') ->> 'blocked', 'true', 'dan blocks ann');
select is(public.block_user('ann') ->> 'blocked', 'true', 'blocking twice is fine');
select throws_ok($$select public.block_user('dan')$$, '22023', null, 'you cannot block yourself');
select is((select count(*)::int from public.blocks), 1, 'dan sees the block');
select is((select count(*)::int from public.follows
           where follower_id in ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a004')
             and followee_id in ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a004')), 0,
  'the block removed both follows');
select is(jsonb_array_length(public.get_blocks() -> 'items'), 1, 'dan lists whom he blocked');
select is(jsonb_array_length(public.search_users('an') -> 'items'), 0, 'dan cannot find ann');
select throws_ok($$select public.get_player_profile('ann')$$, 'P0002', null, 'dan cannot open ann''s profile');
select throws_ok($$select public.follow_user('ann')$$, 'P0002', 'user not found', 'dan cannot follow ann');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is((select count(*)::int from public.blocks), 0, 'ann cannot see that she is blocked');
select throws_ok($$select public.follow_user('dan')$$, 'P0002', 'user not found', 'ann cannot follow dan, and it reads like a missing user');
select throws_ok($$select public.get_player_profile('dan')$$, 'P0002', null, 'ann cannot open dan''s profile');
select throws_ok($$select public.get_followers('dan')$$, 'P0002', null, 'or his lists');
select is(jsonb_array_length(public.search_users('da') -> 'items'), 0, 'ann cannot find dan');
select ok(not (select array_agg(e ->> 'handle') @> array['dan'] from jsonb_array_elements(public.get_leaderboard('all_time') -> 'entries') e),
  'dan is off ann''s leaderboard');
select ok(exists (select 1 from jsonb_array_elements(public.get_my_league() -> 'members') m where m ->> 'handle' = 'ben'), 'ben is still in ann''s league');
select ok(not exists (select 1 from jsonb_array_elements(public.get_my_league() -> 'members') m where m ->> 'handle' = 'dan'), 'and dan is off it');
select is((select array_agg(i ->> 'handle') from jsonb_array_elements(public.get_suggested_users() -> 'items') i), array['gus'],
  'suggestions: league mates not yet followed, not blocked, not opted out of search');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}';
select ok(not (select array_agg(e ->> 'handle') @> array['ann'] from jsonb_array_elements(public.get_leaderboard('all_time') -> 'entries') e),
  'ann is off dan''s leaderboard');
select is(public.unblock_user('ann') ->> 'blocked', 'false', 'dan unblocks ann');
select is(public.follow_user('ann') ->> 'status', 'following', 'and can follow her again');

-- ---------------------------------------------------------------------------
-- Friends filter
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is((select array_agg(e ->> 'handle' order by (e ->> 'rank')::int)
           from jsonb_array_elements(public.get_leaderboard('all_time', 50, 0, true) -> 'entries') e),
          array['ann', 'ben'], 'the friends leaderboard is the players ann follows, plus her');
select is((select array_agg((e ->> 'rank')::int order by (e ->> 'rank')::int)
           from jsonb_array_elements(public.get_leaderboard('all_time', 50, 0, true) -> 'entries') e),
          array[1, 2], '... ranked among themselves');
select is((public.get_leaderboard('all_time', 50, 0, true) -> 'me' ->> 'rank')::int, 1, 'ann is first among friends');
select is((public.get_leaderboard('all_time', 50, 0, true) ->> 'total')::int, 2, 'with the right total');
select is((select (e ->> 'following')::boolean from jsonb_array_elements(public.get_leaderboard('all_time') -> 'entries') e where e ->> 'handle' = 'ben'),
  true, 'entries say whether I follow them');
select is((select (e ->> 'following')::boolean from jsonb_array_elements(public.get_leaderboard('all_time') -> 'entries') e where e ->> 'handle' = 'ann'),
  false, 'and not for myself or strangers');

reset role;
insert into public.contests (id, slug, title, starts_at, ends_at, is_published)
  values ('c0000000-0000-0000-0000-000000000001', 'friends-test', 'Friends test', now() - interval '2 days', now() - interval '1 day', true);
insert into public.contest_entries (contest_id, user_id, score, correct, answered, time_ms) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a003', 90, 9, 10, 1000),
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a002', 50, 5, 10, 1000),
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 30, 3, 10, 1000);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is((public.get_contest_standings('c0000000-0000-0000-0000-000000000001') ->> 'total')::int, 3, 'all standings');
select is((select array_agg(e ->> 'handle' order by (e ->> 'rank')::int)
           from jsonb_array_elements(public.get_contest_standings('c0000000-0000-0000-0000-000000000001', 50, 0, true) -> 'entries') e),
          array['cat', 'ben', 'ann'], 'friends standings keep who ann follows (cat and ben), plus her');

-- ---------------------------------------------------------------------------
-- Activity feed
-- ---------------------------------------------------------------------------
reset role;
insert into public.daily_sets (id, track_id, level, set_date, published_at)
  values ('d0000000-0000-0000-0000-000000000001', private.default_track_id(), 1, (now() at time zone 'UTC')::date, now() - interval '1 hour');
update public.profiles set current_streak = 7, longest_streak = 7 where handle = 'ben';
update public.profiles set league_tier = 2 where handle = 'ben';
insert into public.xp_events (user_id, amount, reason, daily_set_id, idempotency_key)
  values ('00000000-0000-0000-0000-00000000a002', 10, 'daily_complete', 'd0000000-0000-0000-0000-000000000001', 'test:daily:ben');
update public.profiles set current_streak = 5 where handle = 'ben';
update public.profiles set current_streak = 6 where handle = 'ben';

select is((select count(*)::int from public.friend_events where user_id = '00000000-0000-0000-0000-00000000a002'), 3,
  'streak, league and daily events were recorded (and 5, 6 days are not milestones)');
select throws_ok($$insert into public.friend_events (user_id, kind, dedupe_key)
                    values ('00000000-0000-0000-0000-00000000a002', 'free_text', 'x')$$,
  '23514', null, 'only known kinds exist: no free text');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is(jsonb_array_length(public.get_friend_activity() -> 'items'), 3, 'ann sees ben''s three events');
select is((select array_agg(i ->> 'kind' order by i ->> 'kind') from jsonb_array_elements(public.get_friend_activity() -> 'items') i),
  array['daily_set', 'league_up', 'streak'], 'by kind');
select is((select (i -> 'data' ->> 'total') from jsonb_array_elements(public.get_friend_activity() -> 'items') i where i ->> 'kind' = 'daily_set'),
  '0', 'the daily event carries facts only');
select is((select count(*)::int from public.friend_events), 3, 'the same rows are readable by policy');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a005","role":"authenticated"}';
select is(jsonb_array_length(public.get_friend_activity() -> 'items'), 0, 'someone who does not follow ben sees nothing');
select is((select count(*)::int from public.friend_events), 0, '... also through the table policy');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select lives_ok($$select public.set_privacy(share_activity => false)$$, 'ben opts out of the feed');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is(jsonb_array_length(public.get_friend_activity() -> 'items'), 0, 'and ann no longer sees his events');

reset role;
update public.profile_privacy set share_activity = true where user_id = '00000000-0000-0000-0000-00000000a002';
update public.friend_events set created_at = now() - interval '15 days' where kind = 'streak';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is(jsonb_array_length(public.get_friend_activity() -> 'items'), 2, 'events older than 14 days are not shown, even before cleanup');
reset role;
select is(private.prune_friend_events(), 1, 'the cleanup removes expired events');
select is(private.prune_friend_events(), 0, 'and running it again changes nothing');

-- ---------------------------------------------------------------------------
-- Privacy of the profile
-- ---------------------------------------------------------------------------
update public.profiles set exam_goal = (select slug from public.tags where kind = 'exam' limit 1) where handle = 'ben';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select is(public.get_player_profile('ben') ->> 'stats_hidden', 'false', 'a follower sees ben''s stats (default: followers)');
select is(public.get_player_profile('ben') ->> 'exam_goal', null, 'the exam target is hidden by default');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a005","role":"authenticated"}';
select is(public.get_player_profile('ben') ->> 'stats_hidden', 'true', 'a stranger does not');
select is(public.get_player_profile('ben') ->> 'attempts', null, '... and gets no accuracy numbers');
select ok((public.get_player_profile('ben') ->> 'level')::int >= 1, 'but sees the level');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select lives_ok($$select public.set_privacy(exam_visibility => 'everyone', stats_visibility => 'nobody')$$, 'ben changes his settings');
select isnt(public.get_player_profile() ->> 'attempts', null, 'he always sees his own numbers');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select isnt(public.get_player_profile('ben') ->> 'exam_goal', null, 'the exam target shows once allowed');
select is(public.get_player_profile('ben') ->> 'stats_hidden', 'true', 'nobody means nobody, even for followers');

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
select lives_ok($$select public.report_user('ben', 'spam', 'Posts links')$$, 'ann reports ben');
select lives_ok($$select public.report_user('ben', 'abuse')$$, 'a second report by the same person is absorbed');
select throws_ok($$select public.report_user('ben', 'nonsense')$$, '23514', null, 'unknown reasons are refused');
reset role;
select is((select count(*)::int from public.user_reports), 1, 'one open report');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a00a","role":"authenticated"}';
select is((select count(*)::int from public.user_reports), 1, 'admins can read it');

select * from finish();
rollback;
