-- Scheduled jobs: daily set generation, streak settlement, league rollover.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------
select set_eq(
  $$select jobname, schedule from cron.job where jobname like 'aptric-%'$$,
  $$values ('aptric-daily-sets', '0 18 * * *'), ('aptric-streaks', '5 * * * *'),
           ('aptric-league-rollover', '35 18 * * 0'), ('aptric-ratings', '15 * * * *'),
           ('aptric-leaderboards', '*/5 * * * *'), ('aptric-purge-auth-tokens', '40 3 * * *'),
           ('aptric-friend-events-prune', '25 3 * * *')$$,
  'seven cron jobs are scheduled (UTC)');

-- ---------------------------------------------------------------------------
-- Daily set fixtures
--   tracks: tiny (section D only) -> cat (section A only) -> general (all)
--   A: 10 easy / 10 medium / 10 hard
--   B, C: 15 / 15 / 15 each
--   D: one question used 70 days ago (eligible) and a set of ineligible ones
-- ---------------------------------------------------------------------------
create temp table d as select (now() at time zone 'Asia/Kolkata')::date + 1 as gen_date;

insert into public.tracks (id, slug, name, sort_order) values
  ('61000000-0000-0000-0000-000000000001', 'tiny', 'Tiny', -2),
  ('61000000-0000-0000-0000-000000000002', 'cat',  'CAT',  -1);

insert into public.sections (id, slug, name) values
  ('71000000-0000-0000-0000-00000000000a', 'sec-a', 'A'),
  ('71000000-0000-0000-0000-00000000000b', 'sec-b', 'B'),
  ('71000000-0000-0000-0000-00000000000c', 'sec-c', 'C'),
  ('71000000-0000-0000-0000-00000000000d', 'sec-d', 'D');
-- Only the fixture sections take part.
update public.sections set is_active = false where id::text not like '71000000-%';

insert into public.track_sections (track_id, section_id) values
  ('61000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000d'),
  ('61000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-00000000000a');

insert into public.topics (id, section_id, slug, name)
  select ('72000000-0000-0000-0000-00000000000' || s)::uuid,
         ('71000000-0000-0000-0000-00000000000' || s)::uuid, 't', 'T'
  from unnest(array['a', 'b', 'c', 'd']) s;
insert into public.subtopics (id, topic_id, slug, name)
  select ('73000000-0000-0000-0000-00000000000' || s)::uuid,
         ('72000000-0000-0000-0000-00000000000' || s)::uuid, 's', 'S'
  from unnest(array['a', 'b', 'c', 'd']) s;
insert into public.subtopics (id, topic_id, slug, name, is_active) values
  ('73000000-0000-0000-0000-0000000000d2', '72000000-0000-0000-0000-00000000000d', 'off', 'Off', false);

-- Bank questions: 74000000-...-<section><difficulty index><nn>
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
select ('74000000-0000-0000-0000-0000000' || s || di || lpad(n::text, 3, '0'))::uuid,
       ('73000000-0000-0000-0000-00000000000' || s)::uuid,
       'Q ' || s || di || n, (enum_range(null::public.question_difficulty))[di], 'published',
       encode(sha256(convert_to(s || di || n, 'utf8')), 'hex')
from unnest(array['a', 'b', 'c']) s, generate_series(1, 3) di,
     generate_series(1, case when s = 'a' then 10 else 15 end) n;

-- Section D: d01 used 70 days ago (eligible), d02 used 30 days ago, d03 draft,
-- d04 no answer key, d05 one option, d06 inactive subtopic.
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
select ('74000000-0000-0000-0000-0000000d000' || n)::uuid,
       case when n = 6 then '73000000-0000-0000-0000-0000000000d2'
            else '73000000-0000-0000-0000-00000000000d' end::uuid,
       'D' || n, 'easy', case when n = 3 then 'draft' else 'published' end::public.question_status,
       encode(sha256(convert_to('d' || n, 'utf8')), 'hex')
from generate_series(1, 6) n;

insert into public.question_options (question_id, position, body)
select q.id, o.p, 'opt ' || o.p
from public.questions q cross join generate_series(0, 1) o(p)
where q.id::text like '74000000-%'
  and not (q.id = '74000000-0000-0000-0000-0000000d0005' and o.p = 1);
insert into public.question_answers (question_id, correct_option_id, explanation)
select o.question_id, o.id, 'because'
from public.question_options o
where o.question_id::text like '74000000-%' and o.position = 0
  and o.question_id <> '74000000-0000-0000-0000-0000000d0004';

insert into public.daily_sets (id, track_id, set_date, published_at) values
  ('75000000-0000-0000-0000-000000000070', private.default_track_id(), (select gen_date from d) - 70, now()),
  ('75000000-0000-0000-0000-000000000030', private.default_track_id(), (select gen_date from d) - 30, now());
insert into public.daily_set_items (daily_set_id, question_id, position) values
  ('75000000-0000-0000-0000-000000000070', '74000000-0000-0000-0000-0000000d0001', 0),
  ('75000000-0000-0000-0000-000000000030', '74000000-0000-0000-0000-0000000d0002', 0);

-- ---------------------------------------------------------------------------
-- Generation
-- ---------------------------------------------------------------------------
create temp table run1 as select private.generate_daily_sets() as r;

select is((select (r ->> 'set_date')::date from run1), (select gen_date from d),
  'defaults to tomorrow in IST');

create temp table gen as
select s.id, t.slug as track, s.level, s.published_at
from public.daily_sets s join public.tracks t on t.id = s.track_id
where s.set_date = (select gen_date from d);

create temp table gen_items as
select g.id as set_id, g.track, g.level, i.position, i.question_id, q.difficulty, top.section_id
from gen g
join public.daily_set_items i on i.daily_set_id = g.id
join public.questions q on q.id = i.question_id
join public.subtopics sub on sub.id = q.subtopic_id
join public.topics top on top.id = sub.topic_id;

select set_eq($$select track, count(*)::int from gen group by track$$,
  $$values ('general', 5), ('cat', 3), ('tiny', 1)$$,
  'one set per track and level that has questions left');

select is((select count(*)::int from gen
           where published_at <> ((select gen_date from d)::timestamp at time zone 'Etc/GMT-14')),
  0, 'released at local midnight in UTC+14');

select is((select count(*)::int from gen_items), (select count(distinct question_id)::int from gen_items),
  'no question is used twice in a run');

select set_eq(
  $$select level, difficulty::text, count(*)::int from gen_items where track = 'general' group by 1, 2$$,
  $$select l.level, d.difficulty, d.n::int
    from public.levels l
    cross join lateral (values ('easy', l.easy_count), ('medium', l.medium_count), ('hard', l.hard_count)) d(difficulty, n)
    where d.n > 0$$,
  'general sets follow each level''s easy/medium/hard mix');

select ok((
  select max(spread) <= 1 from (
    select g.id, max(coalesce(c.n, 0)) - min(coalesce(c.n, 0)) as spread
    from gen g
    cross join (values ('71000000-0000-0000-0000-00000000000b'::uuid), ('71000000-0000-0000-0000-00000000000c')) sec(id)
    left join (select set_id, section_id, count(*) as n from gen_items group by 1, 2) c
      on c.set_id = g.id and c.section_id = sec.id
    where g.track = 'general'
    group by g.id) x),
  'general sets are balanced across sections (spread <= 1)');

select is((select count(*)::int from gen_items where track = 'general' and section_id not in
             ('71000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000c')),
  0, 'general draws only what other tracks left: sections B and C');

select is((select count(*)::int from gen_items where track = 'cat'
           and section_id <> '71000000-0000-0000-0000-00000000000a'),
  0, 'cat draws only from its track_sections');
select set_eq($$select level, count(*)::int from gen_items where track = 'cat' group by level$$,
  $$values (1, 10), (2, 10), (3, 10)$$,
  'a short bank fills lower levels first with the nearest difficulty');

select set_eq($$select question_id from gen_items where track = 'tiny'$$,
  $$values ('74000000-0000-0000-0000-0000000d0001'::uuid)$$,
  'only eligible question: published, keyed, 2+ options, active subtopic, not used in 60 days');

select is((
  select count(*)::int from gen_items a join gen_items b
    on a.set_id = b.set_id and a.position < b.position and a.difficulty > b.difficulty),
  0, 'positions run easy -> hard');
select is((select count(*)::int from (
    select set_id from gen_items group by set_id having max(position) <> count(*) - 1 or min(position) <> 0) x),
  0, 'positions are 0..n-1');

select is((select r -> 'sets' from run1) @> jsonb_build_array(
  jsonb_build_object('track', 'tiny', 'level', 1, 'status', 'shortfall', 'questions', 1, 'wanted', 10),
  jsonb_build_object('track', 'tiny', 'level', 2, 'status', 'empty'),
  jsonb_build_object('track', 'general', 'level', 5, 'status', 'created', 'questions', 10)),
  true, 'summary reports created / shortfall / empty');

select is((select count(*)::int from public.audit_log
           where action = 'generate_daily_sets' and entity_type = 'cron'
             and entity_id = (select gen_date from d)::text),
  1, 'run summary is written to audit_log');

-- Re-running is a no-op.
create temp table run2 as select private.generate_daily_sets() as r;
select is((select count(*)::int from public.daily_sets where set_date = (select gen_date from d)), 9,
  're-run creates nothing');
select is((select count(*)::int from jsonb_array_elements((select r -> 'sets' from run2)) e
           where e ->> 'status' not in ('exists', 'empty')),
  0, 're-run reports existing sets');

-- The next day may not reuse anything from the 60-day window, future sets included.
select private.generate_daily_sets((select gen_date from d) + 1);
select is((
  select count(*)::int
  from public.daily_set_items i join public.daily_sets s on s.id = i.daily_set_id
  where s.set_date = (select gen_date from d) + 1
    and i.question_id in (select question_id from gen_items)),
  0, 'next day reuses no question from the window');
select is((select count(*)::int from public.daily_set_items i join public.daily_sets s on s.id = i.daily_set_id
           where s.set_date = (select gen_date from d) + 1),
  40, 'next day gets the 40 questions left in B and C');


-- ---------------------------------------------------------------------------
-- Players see their own level's set (today_set_for)
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata) values
  ('00000000-0000-0000-0000-00000000c001', 'lv1@example.com', '{"handle":"lv1","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000c002', 'lv2@example.com', '{"handle":"lv2","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000c003', 'lv3@example.com', '{"handle":"lv3","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000c004', 'lv9@example.com', '{"handle":"lv9","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-00000000c005', 'lvx@example.com', '{"handle":"lvx","timezone":"UTC"}');
update public.profiles set level = 2 where id = '00000000-0000-0000-0000-00000000c002';
-- Bands: Beginner 1–2, Intermediate 3–5, Advanced 6–9, Pro 10–14, Expert 15+.
update public.profiles set level = 6 where id in ('00000000-0000-0000-0000-00000000c003',
                                                   '00000000-0000-0000-0000-00000000c005');
update public.profiles set level = 20 where id = '00000000-0000-0000-0000-00000000c004';

insert into public.daily_sets (id, track_id, level, set_date, published_at) values
  ('76000000-0000-0000-0000-000000000001', private.default_track_id(), 1, (now() at time zone 'UTC')::date, now() - interval '1 hour'),
  ('76000000-0000-0000-0000-000000000003', private.default_track_id(), 3, (now() at time zone 'UTC')::date, now() - interval '1 hour');
insert into public.daily_set_items (daily_set_id, question_id, position) values
  ('76000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-0000000d0002', 0);
-- lvx levelled up to the level 3 band after starting today's level-1 set.
insert into public.attempts (user_id, question_id, context, daily_set_id, is_correct)
values ('00000000-0000-0000-0000-00000000c005', '74000000-0000-0000-0000-0000000d0002', 'daily',
        '76000000-0000-0000-0000-000000000001', true);

select is((select daily_set_id from private.today_set_for('00000000-0000-0000-0000-00000000c001')),
  '76000000-0000-0000-0000-000000000001'::uuid, 'level 1 plays the level 1 set');
select is((select daily_set_id from private.today_set_for('00000000-0000-0000-0000-00000000c002')),
  '76000000-0000-0000-0000-000000000001'::uuid, 'profile level 2 (beginner band) plays the level 1 set');
select is((select daily_set_id from private.today_set_for('00000000-0000-0000-0000-00000000c003')),
  '76000000-0000-0000-0000-000000000003'::uuid, 'profile level 6 plays the level 3 (advanced) set');
select is((select daily_set_id from private.today_set_for('00000000-0000-0000-0000-00000000c004')),
  '76000000-0000-0000-0000-000000000003'::uuid, 'profile level 20 (expert band) falls back to the highest set below');
select is((select daily_set_id from private.today_set_for('00000000-0000-0000-0000-00000000c005')),
  '76000000-0000-0000-0000-000000000001'::uuid, 'a set already started today stays the player''s set');

select is(private.level_for(1), 1::smallint, 'level_for(1) = beginner');
select is(private.level_for(42), 5::smallint, 'level_for above the top band = expert');
select is(private.level_for(5), 2::smallint, 'level_for(5) = intermediate');
select is(private.level_for(6), 3::smallint, 'level_for(6) = advanced');

-- ---------------------------------------------------------------------------
-- Streaks
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata)
select ('00000000-0000-0000-0000-00000000d00' || n)::uuid, 's' || n || '@example.com',
       jsonb_build_object('handle', 'streaker' || n, 'timezone', case when n = 7 then 'Pacific/Kiritimati' else 'UTC' end)
from generate_series(1, 7) n;

create temp table today_utc as select (now() at time zone 'UTC')::date as t;
-- (user, streak, last_streak_date offset, freezes)
update public.profiles p
set current_streak = v.streak, longest_streak = greatest(v.streak, 9),
    last_streak_date = (select t from today_utc) + v.off, streak_freezes = v.freezes
from (values
  (1, 5, -1, 0),   -- played yesterday: fine
  (2, 5, -2, 1),   -- missed 1, has 1 freeze: frozen
  (3, 5, -3, 1),   -- missed 2, has 1 freeze: reset, freeze kept
  (4, 5, -3, 2),   -- missed 2, has 2 freezes: frozen
  (5, 0, -9, 3),   -- no streak: untouched
  (6, 4, -2, 1)    -- settled lazily by bump_streak below
) v(n, streak, off, freezes)
where p.id = ('00000000-0000-0000-0000-00000000d00' || v.n)::uuid;
update public.profiles
set current_streak = 3, longest_streak = 9, streak_freezes = 0,
    last_streak_date = (now() at time zone 'Pacific/Kiritimati')::date - 1
where id = '00000000-0000-0000-0000-00000000d007';

-- bump_streak settles freezes before bumping: 4 -> 5, not a restart at 1.
select is((select current_streak from private.bump_streak('00000000-0000-0000-0000-00000000d006',
                                                          (select t from today_utc))),
  5, 'bump_streak spends a freeze instead of restarting the streak');
select is((select streak_freezes from public.profiles where id = '00000000-0000-0000-0000-00000000d006'),
  0, '... and the freeze is consumed');

select is(private.settle_broken_streaks(), '{"frozen": 2, "reset": 1}'::jsonb, 'cron settles broken streaks');

select results_eq(
  $$select current_streak, last_streak_date - (select t from today_utc), streak_freezes
    from public.profiles where id::text like '00000000-0000-0000-0000-00000000d00%'
      and id <> '00000000-0000-0000-0000-00000000d007'
    order by id$$,
  $$values (5, -1, 0), (5, -1, 0), (0, -3, 1), (5, -1, 0), (0, -9, 3), (5, 0, 0)$$,
  'streaks after settlement');
select is((select current_streak from public.profiles where id = '00000000-0000-0000-0000-00000000d007'), 3,
  'streaks are judged by the player''s local date (UTC+14)');

select set_eq(
  $$select user_id::text, covered_date - (select t from today_utc) from public.streak_freeze_uses$$,
  $$values ('00000000-0000-0000-0000-00000000d002', -1), ('00000000-0000-0000-0000-00000000d004', -2),
           ('00000000-0000-0000-0000-00000000d004', -1), ('00000000-0000-0000-0000-00000000d006', -1)$$,
  'one freeze use recorded per covered day');

select is(private.settle_broken_streaks(), '{"frozen": 0, "reset": 0}'::jsonb, 'settling is idempotent');

-- ---------------------------------------------------------------------------
-- Leagues
-- ---------------------------------------------------------------------------
create temp table wk as
select private.league_week_start(now()) as this_week,
       private.league_week_start(now()) - 7 as last_week,
       ((private.league_week_start(now()) - 7)::timestamp + interval '1 day 12 hours')
         at time zone 'Asia/Kolkata' as last_week_ts;

-- Last week: 14 silver players (xp 10..140, sv10 ties sv11 at 110 but got
-- there first), 1 bronze, 3 diamond.
insert into private.accounts (id, email, metadata)
select ('00000000-0000-0000-0000-0000000e' || lpad(n::text, 4, '0'))::uuid, 'lg' || n || '@example.com',
       jsonb_build_object('handle', 'lg' || n)
from generate_series(1, 18) n;
update public.profiles set league_tier = case
    when id <= '00000000-0000-0000-0000-0000000e0014' then 2
    when id = '00000000-0000-0000-0000-0000000e0015' then 1
    else 5 end
where id::text like '00000000-0000-0000-0000-0000000e%';

insert into public.xp_events (user_id, amount, reason, created_at)
select ('00000000-0000-0000-0000-0000000e' || lpad(n::text, 4, '0'))::uuid,
       case when n = 10 then 110 when n <= 14 then 10 * n else 50 end,
       'test',
       (select last_week_ts from wk) + make_interval(mins => case when n = 10 then 0 else n end)
from generate_series(1, 18) n;
-- A second event in the same week adds to the existing membership.
insert into public.xp_events (user_id, amount, reason, created_at)
values ('00000000-0000-0000-0000-0000000e0015', 5, 'test', (select last_week_ts from wk));

select is((select count(*)::int from public.leagues where week_start = (select last_week from wk)), 3,
  'one league per tier for last week');
select is((select xp from public.league_members where user_id = '00000000-0000-0000-0000-0000000e0015'), 55,
  'later XP in the same week adds up');

-- This week: 31 bronze players fill a cohort of 30, then start a second.
insert into private.accounts (id, email, metadata)
select ('00000000-0000-0000-0000-0000000f' || lpad(n::text, 4, '0'))::uuid, 'br' || n || '@example.com',
       jsonb_build_object('handle', 'br' || n)
from generate_series(1, 31) n;
insert into public.xp_events (user_id, amount, reason)
select ('00000000-0000-0000-0000-0000000f' || lpad(n::text, 4, '0'))::uuid, n, 'test'
from generate_series(1, 31) n;

select results_eq(
  $$select (select count(*)::int from public.league_members m where m.league_id = l.id)
    from public.leagues l where l.week_start = (select this_week from wk) and l.tier = 1
    order by 1 desc$$,
  $$values (30), (1)$$,
  'cohorts cap at 30');

-- get_my_league as a player
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000f0031","role":"authenticated"}';
select is((select jsonb_array_length(public.get_my_league() -> 'members')), 1, 'get_my_league lists my cohort');
select is((select public.get_my_league() -> 'members' -> 0 ->> 'handle'), 'br31', '... with public handles');
select is((select (public.get_my_league() -> 'tier' ->> 'slug')), 'bronze', '... and my tier');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000f0001","role":"authenticated"}';
select is((select (public.get_my_league() ->> 'promote_zone')::int), 5, 'full bronze cohort promotes 5');
select is((select count(*)::int from public.league_members), 1, 'players read only their own memberships');
select throws_ok(
  $$update public.profiles set league_tier = 5 where id = '00000000-0000-0000-0000-0000000f0001'$$,
  '42501', null, 'players cannot set their own league tier');
select throws_ok($$select private.rollover_leagues()$$, '42501', null, 'players cannot run the rollover');
select throws_ok($$select private.generate_daily_sets()$$, '42501', null, 'players cannot generate sets');
reset role;

set local role anon;
select throws_ok($$select public.get_my_league()$$, '42501', null, 'anon cannot call get_my_league');
reset role;

-- Rollover
select is((select private.rollover_leagues() ->> 'leagues_finalized')::int, 3,
  'rollover finalises last week''s leagues');

-- Silver, 14 players: promote ceil(5*14/30) = 3, demote floor(5*14/30) = 2.
select results_eq(
  $$select right(m.user_id::text, 2)::int, m.final_rank, m.outcome::text, p.league_tier::int
    from public.league_members m join public.profiles p on p.id = m.user_id
    where m.week_start = (select last_week from wk) and m.user_id <= '00000000-0000-0000-0000-0000000e0014'
    order by m.final_rank$$,
  $$values (14, 1, 'promoted', 3), (13, 2, 'promoted', 3), (12, 3, 'promoted', 3),
           (10, 4, 'stayed', 2),   (11, 5, 'stayed', 2),   (9, 6, 'stayed', 2),
           (8, 7, 'stayed', 2),    (7, 8, 'stayed', 2),    (6, 9, 'stayed', 2),
           (5, 10, 'stayed', 2),   (4, 11, 'stayed', 2),   (3, 12, 'stayed', 2),
           (2, 13, 'demoted', 1),  (1, 14, 'demoted', 1)$$,
  'silver: top 3 up, bottom 2 down, ties go to whoever got there first');

select is((select league_tier::int from public.profiles where id = '00000000-0000-0000-0000-0000000e0015'), 2,
  'a lone bronze player is promoted');
select is((select count(*)::int from public.profiles
           where id > '00000000-0000-0000-0000-0000000e0015' and id::text like '00000000-0000-0000-0000-0000000e%'
             and league_tier = 5),
  3, 'a small diamond cohort is neither promoted nor wiped out');
select is((select count(*)::int from public.leagues
           where week_start = (select this_week from wk) and finalized_at is not null),
  0, 'the current week is left running');

select is((select private.rollover_leagues() ->> 'leagues_finalized')::int, 0, 'rollover is idempotent');
select is((select count(*)::int from public.audit_log where action = 'rollover_leagues'), 2,
  'rollover runs are logged');

-- Promotions apply to the next league joined.
insert into public.xp_events (user_id, amount, reason)
values ('00000000-0000-0000-0000-0000000e0014', 10, 'test');
select is((select l.tier::int from public.league_members m join public.leagues l on l.id = m.league_id
           where m.user_id = '00000000-0000-0000-0000-0000000e0014' and m.week_start = (select this_week from wk)),
  3, 'promoted player joins a gold league next week');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000e0001","role":"authenticated"}';
select is((select public.get_my_league() -> 'last_result' ->> 'outcome'), 'demoted',
  'get_my_league reports last week''s result');
reset role;

-- ---------------------------------------------------------------------------
-- Config tables are readable, admin-writable
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000e0001","role":"authenticated"}';
select is((select count(*)::int from public.levels), 5, 'users read levels');
select is((select count(*)::int from public.league_tiers), 5, 'users read league tiers');
select ok((select count(*) from public.track_sections) > 0, 'users read track sections');
update public.levels set easy_count = 10 where level = 1;
select is((select easy_count::int from public.levels where level = 1), 7, 'users cannot edit levels');
select throws_ok($$insert into public.track_sections (track_id, section_id)
                   values ('61000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'users cannot edit track sections');
select is((select count(*)::int from public.streak_freeze_uses), 0, 'users see only their own freeze uses');
reset role;

set local role anon;
select throws_ok($$select * from public.levels$$, '42501', null, 'anon cannot read levels');
reset role;

-- ---------------------------------------------------------------------------
-- Existing gameplay still works with levels: a daily answer moves the streak
-- and lands in this week's league.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select is((public.submit_answer('74000000-0000-0000-0000-0000000d0002',
                                (select id from public.question_options
                                 where question_id = '74000000-0000-0000-0000-0000000d0002' and position = 0),
                                'daily') ->> 'xp_awarded')::int,
  10, 'daily answer on a level set scores');
select is((select xp from public.league_members where user_id = '00000000-0000-0000-0000-00000000c001'), 30,
  '... and, with the completion bonus for the one-question set, counts toward this week''s league');
reset role;

select * from finish();
rollback;
