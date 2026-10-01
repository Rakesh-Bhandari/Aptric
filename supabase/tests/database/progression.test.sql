-- Progression: XP levels, streak freezes earned with XP, the daily rating,
-- completion XP, badges, leagues + Realtime, leaderboards, player profiles and
-- the daily result card.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(91);

-- ---------------------------------------------------------------------------
-- XP -> level (pure)
-- ---------------------------------------------------------------------------
select is(private.xp_level(0),     1,  '0 xp = level 1');
select is(private.xp_level(99),    1,  '99 xp = level 1');
select is(private.xp_level(100),   2,  '100 xp = level 2');
select is(private.xp_level(300),   3,  '300 xp = level 3');
select is(private.xp_level(4500),  10, '4,500 xp = level 10');
select is(private.xp_level(18999), 19, '18,999 xp = level 19');
select ok((select bool_and(private.xp_level(private.level_xp(l)) = l
                           and private.xp_level(private.level_xp(l) - 1) = l - 1)
           from generate_series(2, 300) l),
  'every level threshold is exact up to level 300');
select results_eq(
  $$select level::int, min_profile_level from public.levels order by level$$,
  $$values (1, 1), (2, 3), (3, 6), (4, 10), (5, 15)$$,
  'daily-set bands follow XP levels');

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Everyone is in UTC.
--   pat:   main player          quinn: one short of Centurion
--   rae:   half-finished sets   ban:   banned     ada: admin
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000a0001', 'pat@example.com',   '{"handle":"pat","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000a0002', 'quinn@example.com', '{"handle":"quinn","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000a0003', 'rae@example.com',   '{"handle":"rae","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000a0004', 'ban@example.com',   '{"handle":"ban","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000a0005', 'ada@example.com',   '{"handle":"ada","timezone":"UTC"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000a0005';
update public.profiles set banned_at = now() where id = '00000000-0000-0000-0000-0000000a0004';
-- pat: a 6-day streak ending yesterday.
update public.profiles
  set current_streak = 6, longest_streak = 6, last_streak_date = (now() at time zone 'UTC')::date - 1
  where id = '00000000-0000-0000-0000-0000000a0001';

create temp table today_utc on commit drop as select (now() at time zone 'UTC')::date as d;

-- Topic "mastery" (110 easy practice questions m1..m110) and topic "daily"
-- (d1 easy, d2 medium, d3 hard: today's set; d4, d5 easy: a set 3 days ago).
insert into public.topics (id, section_id, slug, name)
  select '1b000000-0000-0000-0000-000000000001', id, 'mastery', 'Mastery'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.topics (id, section_id, slug, name)
  select '1b000000-0000-0000-0000-000000000002', id, 'daily-topic', 'Daily topic'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name) values
  ('2b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'm', 'M'),
  ('2b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000002', 'd', 'D');

create temp table qs on commit drop as
select ('3b000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid as id, 'm' || n as name,
       '2b000000-0000-0000-0000-000000000001'::uuid as subtopic_id, 'easy'::public.question_difficulty as difficulty
from generate_series(1, 110) n
union all
select ('3c000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'd' || n,
       '2b000000-0000-0000-0000-000000000002'::uuid,
       (array['easy', 'medium', 'hard', 'easy', 'easy'])[n]::public.question_difficulty
from generate_series(1, 5) n;

insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
select id, subtopic_id, 'Q ' || name, difficulty, 'published', encode(sha256(name::bytea), 'hex') from qs;
-- Option at position 0 is always correct.
insert into public.question_options (question_id, position, body)
select qs.id, k, 'opt ' || k from qs, generate_series(0, 1) k;
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
select qs.id, o.id, 'SECRET-EXPLANATION', 'SECRET-HINT'
from qs join public.question_options o on o.question_id = qs.id and o.position = 0;

grant select on qs, today_utc to authenticated;
create function pg_temp.q(name text) returns uuid language sql as $$ select id from qs where qs.name = $1 $$;
create function pg_temp.opt(name text, pos int) returns uuid language sql as
  $$ select o.id from public.question_options o where o.question_id = pg_temp.q($1) and o.position = $2 $$;

insert into public.daily_sets (id, track_id, level, set_date, published_at) values
  ('5b000000-0000-0000-0000-000000000001', private.default_track_id(), 1, (select d from today_utc),     now() - interval '1 day'),
  ('5b000000-0000-0000-0000-000000000000', private.default_track_id(), 1, (select d from today_utc) - 3, now() - interval '4 days');
insert into public.daily_set_items (daily_set_id, question_id, position) values
  ('5b000000-0000-0000-0000-000000000001', pg_temp.q('d1'), 0),
  ('5b000000-0000-0000-0000-000000000001', pg_temp.q('d2'), 1),
  ('5b000000-0000-0000-0000-000000000001', pg_temp.q('d3'), 2),
  ('5b000000-0000-0000-0000-000000000000', pg_temp.q('d4'), 0),
  ('5b000000-0000-0000-0000-000000000000', pg_temp.q('d5'), 1);

-- pat: 24 of 30 mastery questions right (80%, one short of Topic Master).
insert into public.attempts (user_id, question_id, context, is_correct)
select '00000000-0000-0000-0000-0000000a0001', pg_temp.q('m' || n), 'practice', n <= 24
from generate_series(1, 30) n;
-- quinn: 99 different questions right.
insert into public.attempts (user_id, question_id, context, is_correct)
select '00000000-0000-0000-0000-0000000a0002', pg_temp.q('m' || n), 'practice', true
from generate_series(1, 99) n;
-- rae: started the set from 3 days ago (1 of 2 answered) and never finished it.
insert into public.attempts (user_id, question_id, context, daily_set_id, is_correct)
values ('00000000-0000-0000-0000-0000000a0003', pg_temp.q('d4'), 'daily', '5b000000-0000-0000-0000-000000000000', true);

select is((select count(*)::int from public.user_badges
           where user_id = '00000000-0000-0000-0000-0000000a0001'), 0,
  'pat has no badges yet (24 correct is below the Topic Master bar)');
select is((select badge from public.user_badges
           where user_id = '00000000-0000-0000-0000-0000000a0002'), 'topic-master',
  'quinn became Topic Master on the way to 99 (no Centurion yet)');

-- ---------------------------------------------------------------------------
-- XP drives level; streak freezes are earned every 500 XP, holding at most 2
-- ---------------------------------------------------------------------------
update public.profiles set xp = 650 where id = '00000000-0000-0000-0000-0000000a0005';
select is((select level from public.profiles where id = '00000000-0000-0000-0000-0000000a0005'), 4,
  'level follows xp (650 xp = level 4)');
select is((select streak_freezes from public.profiles where id = '00000000-0000-0000-0000-0000000a0005'), 1,
  'crossing 500 xp earns a freeze');
update public.profiles set xp = 1600 where id = '00000000-0000-0000-0000-0000000a0005';
select is((select streak_freezes from public.profiles where id = '00000000-0000-0000-0000-0000000a0005'), 2,
  'freezes cap at 2');
select results_eq(
  $$select xp_milestone::int, granted from public.streak_freeze_awards
    where user_id = '00000000-0000-0000-0000-0000000a0005' order by 1$$,
  $$values (500, true), (1000, true), (1500, false)$$,
  'each milestone is recorded, past the cap as not granted');
update public.profiles set streak_freezes = 0, xp = 400 where id = '00000000-0000-0000-0000-0000000a0005';
update public.profiles set xp = 1100 where id = '00000000-0000-0000-0000-0000000a0005';
select is((select streak_freezes from public.profiles where id = '00000000-0000-0000-0000-0000000a0005'), 0,
  'a milestone only ever earns once');
select is((select level from public.profiles where id = '00000000-0000-0000-0000-0000000a0005'), 5,
  '1,100 xp = level 5');

-- ---------------------------------------------------------------------------
-- pat plays: practice first (no rating), then today's daily set
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}';

create temp table r_m31 on commit drop as
  select public.submit_answer(pg_temp.q('m31'), pg_temp.opt('m31', 0), 'practice') as r;
select is((select r -> 'progress' -> 'new_badges' -> 0 ->> 'slug' from r_m31), 'topic-master',
  '25th right answer at 80%+ in a topic awards Topic Master, reported in progress');
select is((select r -> 'progress' -> 'new_badges' -> 0 ->> 'topic' from r_m31), 'Mastery',
  '... naming the topic');
select is((select rating from public.profiles where id = auth.uid()), 1200, 'practice never moves the rating');
select is((select r -> 'progress' ->> 'rating_change' from r_m31), null, '... and reports no rating change');

create temp table r_d1 on commit drop as
  select public.submit_answer(pg_temp.q('d1'), pg_temp.opt('d1', 0), 'daily') as r;
select is((select r -> 'progress' -> 'new_badges' -> 0 ->> 'slug' from r_d1), 'streak-7',
  'reaching a 7-day streak awards Week Warrior');
select is((select r -> 'progress' ->> 'set_complete' from r_d1), 'false', 'set not complete after 1 of 3');
select is((select count(*)::int from public.rating_events where user_id = auth.uid()), 0,
  'an unfinished set is not rated yet');

select lives_ok($$select public.use_hint(pg_temp.q('d2'), 'daily')$$, 'pat takes a hint on d2');
select lives_ok($$select public.submit_answer(pg_temp.q('d2'), pg_temp.opt('d2', 0), 'daily')$$, 'pat answers d2 (hinted)');

create temp table r_d3 on commit drop as select public.give_up(pg_temp.q('d3'), 'daily') as r;
select is((select r -> 'progress' ->> 'set_complete' from r_d3), 'true', 'giving up on the last question completes the set');
select is((select (r -> 'progress' ->> 'bonus_xp')::int from r_d3), 20, 'completing the set earns 20 xp');
-- Opponents easy 1000 / medium 1300 / hard 1600 vs 1200; score 1 + 0.5 + 0;
-- K 16: round(16 · (1.5 − 1.2105)) = +5.
select is(r_d3.r -> 'progress' -> 'rating_change', '{"before": 1200, "after": 1205, "delta": 5}'::jsonb,
  'the completed set is rated Elo-style') from r_d3;
select results_eq(
  $$select questions::int, answered::int, score, expected, k_factor::int, rating_before, rating_after
    from public.rating_events where user_id = auth.uid()$$,
  $$values (3, 3, 1.50::numeric, 1.211::numeric, 16, 1200, 1205)$$,
  'rating_events records the result');
select is((select rating from public.profiles where id = auth.uid()), 1205, 'profiles.rating moves');
select is((select count(*)::int from public.xp_events where user_id = auth.uid() and reason = 'daily_complete'), 1,
  'one completion bonus');
select is((select xp from public.profiles where id = auth.uid()), 50::bigint,
  'pat: 5 practice + 10 + 15 (hint) + 0 + 20 bonus');
select is((select xp from public.profiles where id = auth.uid()),
          (select sum(amount) from public.xp_events where user_id = auth.uid()),
  'profiles.xp still matches the ledger');

-- Daily result card --------------------------------------------------------
create temp table card on commit drop as select public.get_daily_result() as c;
select is((select c - 'questions' - 'league' - 'set_date' - 'daily_set_id' - 'time_ms' from card),
  '{"track": {"name": "General Aptitude", "slug": "general"}, "level": {"level": 1, "name": "Beginner"},
    "handle": "pat", "display_name": null, "player_level": 1, "total": 3, "answered": 3, "correct": 2,
    "complete": true, "xp_earned": 45, "rating": {"before": 1200, "after": 1205, "delta": 5},
    "current_streak": 7, "longest_streak": 7}'::jsonb,
  'get_daily_result summarises the day');
select is((select jsonb_path_query_array(c, '$.questions[*].outcome') from card),
  '["correct", "hinted", "gave_up"]'::jsonb, '... with each question''s outcome');
select is((select c -> 'league' ->> 'name' from card), 'Bronze', '... and league standing');
select ok((select c::text !~ '(SECRET|correct_option_id|selected_option_id|stem)' from card),
  'the result card never carries answers or question text');

reset role;

-- ---------------------------------------------------------------------------
-- Ratings for started-but-unfinished sets (cron), only once the date is over
-- everywhere
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0003","role":"authenticated"}';
select lives_ok($$select public.submit_answer(pg_temp.q('d1'), pg_temp.opt('d1', 1), 'daily')$$,
  'rae starts today''s set (wrong answer)');
reset role;

select is((select (private.rate_finished_sets() ->> 'rated')::int), 1, 'cron rates the one finished-date set');
-- 1 of 2 easy questions answered, the other counts as a miss:
-- round(16 · (1 − 2 · 0.7597)) = −8.
select results_eq(
  $$select daily_set_id, questions::int, answered::int, rating_before, rating_after
    from public.rating_events where user_id = '00000000-0000-0000-0000-0000000a0003'$$,
  $$values ('5b000000-0000-0000-0000-000000000000'::uuid, 2, 1, 1200, 1192)$$,
  'unanswered questions count as misses; today''s unfinished set is left alone');
select is((select (private.rate_finished_sets() ->> 'rated')::int), 0, 'rating is idempotent');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0003","role":"authenticated"}';
select is((select jsonb_path_query_array(c, '$.questions[*].outcome') from (select public.get_daily_result() c) x),
  '["wrong", "unanswered", "unanswered"]'::jsonb, 'an unfinished card shows unanswered questions');
select is((select (public.get_daily_result('5b000000-0000-0000-0000-000000000000') -> 'rating' ->> 'delta')::int), -8,
  'a past set''s card can be fetched by id');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
select throws_ok($$select public.get_daily_result('5b000000-0000-0000-0000-000000000000')$$,
  '42501', null, 'cannot fetch the card of a set you did not play');
reset role;

-- ---------------------------------------------------------------------------
-- quinn: Centurion and a level-up in one answer
-- ---------------------------------------------------------------------------
update public.profiles set xp = 95 where id = '00000000-0000-0000-0000-0000000a0002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
create temp table r_q on commit drop as
  select public.submit_answer(pg_temp.q('m100'), pg_temp.opt('m100', 0), 'practice') as r;
select is((select r -> 'progress' -> 'new_badges' -> 0 ->> 'slug' from r_q), 'solved-100',
  '100th different question solved awards Centurion');
select is((select (r -> 'progress' ->> 'leveled_up')::boolean from r_q), true, 'progress reports the level-up');
select is((select (r -> 'progress' ->> 'level')::int from r_q), 2, '... to level 2 at 100 xp');
select is((select (r -> 'progress' ->> 'next_level_xp')::int from r_q), 300, '... and the next threshold');
select is((select count(*)::int from public.xp_events where user_id = auth.uid() and reason = 'daily_complete'), 0,
  'practice earns no completion bonus');
reset role;

-- rae crosses 500 xp with a daily answer: the freeze shows up in progress.
update public.profiles set xp = 495 where id = '00000000-0000-0000-0000-0000000a0003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0003","role":"authenticated"}';
select is((public.submit_answer(pg_temp.q('d2'), pg_temp.opt('d2', 0), 'daily') -> 'progress' ->> 'freezes_earned')::int,
  1, 'a freeze earned by an answer is reported');
reset role;

-- ---------------------------------------------------------------------------
-- Accepted reports: badge + 25 xp, once per report
-- ---------------------------------------------------------------------------
insert into public.reports (id, reporter_id, question_id, reason)
values ('6b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000a0001', pg_temp.q('d1'), 'typo');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0005","role":"authenticated"}';
update public.reports set status = 'dismissed' where id = '6b000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.user_badges
           where user_id = '00000000-0000-0000-0000-0000000a0001' and badge = 'report-accepted'), 0,
  'a dismissed report earns nothing');
update public.reports set status = 'resolved' where id = '6b000000-0000-0000-0000-000000000001';
update public.reports set status = 'open'     where id = '6b000000-0000-0000-0000-000000000001';
update public.reports set status = 'resolved' where id = '6b000000-0000-0000-0000-000000000001';
reset role;
select is((select count(*)::int from public.user_badges
           where user_id = '00000000-0000-0000-0000-0000000a0001' and badge = 'report-accepted'), 1,
  'a resolved report awards Sharp Eye');
select is((select sum(amount)::int from public.xp_events
           where user_id = '00000000-0000-0000-0000-0000000a0001' and reason = 'report_accepted'), 25,
  '... and 25 xp, only once even if resolved again');

-- ---------------------------------------------------------------------------
-- Leagues: top 5 up, bottom 5 down; Realtime channel access
-- ---------------------------------------------------------------------------
select results_eq(
  $$select slug, promote_count::int, demote_count::int from public.league_tiers order by tier$$,
  $$values ('bronze', 5, 0), ('silver', 5, 5), ('gold', 5, 5), ('platinum', 5, 5), ('diamond', 0, 5)$$,
  'every tier promotes 5 and demotes 5 (none past the ends)');

create temp table pat_league on commit drop as
  select league_id from public.league_members
  where user_id = '00000000-0000-0000-0000-0000000a0001' and week_start = private.league_week_start(now());
grant select on pat_league to authenticated;

select ok(exists (select 1 from pg_trigger where tgname = 'league_members_broadcast' and not tgisinternal),
  'league XP changes are broadcast');
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                  and policyname = 'league channels: members receive' and cmd = 'SELECT'),
  'realtime.messages has the league channel policy');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}';
select ok(private.is_league_member('league:' || (select league_id from pat_league)),
  'a member may join their league''s channel');
select ok(not private.is_league_member('league:not-a-uuid'), 'malformed topics are refused');
select ok(not private.is_league_member('leaderboard'), 'other topics are refused');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0005","role":"authenticated"}';
select ok(not private.is_league_member('league:' || (select league_id from pat_league)),
  'a non-member may not join that league''s channel');
reset role;

-- A league XP change still succeeds even if broadcasting fails.
select lives_ok(
  $$insert into public.xp_events (user_id, amount, reason) values ('00000000-0000-0000-0000-0000000a0001', 1, 'test')$$,
  'xp is recorded alongside the broadcast');
update public.profiles set xp = xp + 1 where id = '00000000-0000-0000-0000-0000000a0001';

-- ---------------------------------------------------------------------------
-- Global leaderboards (materialized views)
-- ---------------------------------------------------------------------------
update public.profiles set xp = 99999 where id = '00000000-0000-0000-0000-0000000a0004';  -- banned
select lives_ok($$select private.refresh_leaderboards()$$, 'leaderboards refresh concurrently');
select lives_ok($$select private.refresh_leaderboards()$$, '... repeatedly');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}';
select results_eq(
  $$select e ->> 'handle', (e ->> 'rank')::int, (e ->> 'is_me')::boolean
    from jsonb_array_elements(public.get_leaderboard('all_time') -> 'entries') e$$,
  $$values ('ada', 1, false), ('rae', 2, false), ('quinn', 3, false), ('pat', 4, true)$$,
  'all-time board ranks by total xp and leaves out banned players');
select results_eq(
  $$select e ->> 'handle', (e ->> 'rank')::int, (e ->> 'rating')::int
    from jsonb_array_elements(public.get_leaderboard('rating') -> 'entries') e$$,
  $$values ('pat', 1, 1205), ('rae', 2, 1192)$$,
  'rating board lists rated players only');
select results_eq(
  $$select e ->> 'handle', (e ->> 'weekly_xp')::int
    from jsonb_array_elements(public.get_leaderboard('weekly') -> 'entries') e$$,
  $$values ('pat', 76), ('rae', 20), ('quinn', 5)$$,
  'weekly board ranks this week''s ledger xp');
select is((public.get_leaderboard('all_time') -> 'me' ->> 'rank')::int, 4, 'the caller''s own row is included');
select is((public.get_leaderboard('rating') -> 'me' ->> 'rank')::int, 1, '... per board');
select is(jsonb_array_length(public.get_leaderboard('all_time', 2, 1) -> 'entries'), 2, 'boards page');
select is(public.get_leaderboard('all_time', 2, 1) -> 'entries' -> 0 ->> 'handle', 'rae', '... from an offset');
select is((public.get_leaderboard('all_time') ->> 'total')::int, 4, 'total counts the whole board');
select ok((public.get_leaderboard('weekly') ->> 'refreshed_at') is not null, 'boards report when they were refreshed');
select throws_ok($$select public.get_leaderboard('monthly')$$, '22023', null, 'unknown boards are rejected');
select throws_ok($$select * from private.leaderboard_all_time$$, '42501', null,
  'the materialized views are not readable directly');

-- ---------------------------------------------------------------------------
-- Player profiles
-- ---------------------------------------------------------------------------
create temp table pp on commit drop as select public.get_player_profile() as p;
select is((select p ->> 'handle' from pp), 'pat', 'get_player_profile() defaults to the caller');
select is((select jsonb_path_query_array(p, '$.badges[*].slug') from pp),
  '["streak-7", "topic-master", "report-accepted"]'::jsonb, '... with badges in catalog order');
select is((select (p ->> 'streak_freezes')::int from pp), 0, '... and own freeze count');
select is((select (p ->> 'solved')::int from pp), 27, '... and distinct questions solved (25 + d1 + d2)');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
select is(public.get_player_profile('pat') ->> 'streak_freezes', null, 'other players'' freezes are hidden');
select is((public.get_player_profile('PAT') ->> 'rating')::int, 1205, 'handles are case-insensitive');
select throws_ok($$select public.get_player_profile('ban')$$, 'P0002', null, 'banned players are hidden');
select throws_ok($$select public.get_player_profile('nobody')$$, 'P0002', null, 'unknown handles are not found');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.badges), 6, 'players read the badge catalog');
select is((select count(*)::int from public.user_badges), 2, 'players read only their own badges');
select is((select count(*)::int from public.rating_events), 0, 'players read only their own ratings (quinn has none)');
select throws_ok($$insert into public.user_badges (user_id, badge) values (auth.uid(), 'streak-100')$$,
  '42501', null, 'players cannot award themselves badges');
select throws_ok($$update public.profiles set rating = 3000 where id = auth.uid()$$,
  '42501', null, 'players cannot set their rating');
select throws_ok($$select private.refresh_leaderboards()$$, '42501', null, 'players cannot refresh boards');
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.get_leaderboard()$$, '42501', null, 'anon cannot read leaderboards');
select throws_ok($$select public.get_daily_result()$$, '42501', null, 'anon cannot read result cards');
reset role;

select throws_ok($$update public.rating_events set rating_after = 9999$$, '42501', null, 'rating_events is append-only');

select * from finish();
rollback;
