-- Learner app: onboarding fields, placement test, practice tree / picker,
-- mistakes, activity, contests.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.com', '{"handle":"alice","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@example.com',   '{"handle":"bob","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'dee@example.com',   '{"timezone":"UTC"}');
update public.profiles set onboarded_at = null where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000a1', id, 'la-quant', 'LA Quant'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000a2', id, 'la-logic', 'LA Logic'
  from public.sections where slug = 'logical-reasoning';
insert into public.subtopics (id, topic_id, slug, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'la-one', 'LA One'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2', 'la-two', 'LA Two');

-- 36 published questions: n 1–12 easy, 13–24 medium, 25–36 hard; odd n in
-- subtopic one, even n in subtopic two. Option 0 (...<n>0) is correct.
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
  select ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
         case when n % 2 = 1 then '20000000-0000-0000-0000-0000000000a1'::uuid
              else '20000000-0000-0000-0000-0000000000a2'::uuid end,
         'Q' || n,
         case when n <= 12 then 'easy' when n <= 24 then 'medium' else 'hard' end::public.question_difficulty,
         'published', lpad(to_hex(n), 64, '0')
  from generate_series(1, 36) n;
insert into public.question_options (id, question_id, position, body)
  select ('40000000-0000-0000-0000-' || lpad(n::text, 11, '0') || k)::uuid,
         ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, k, 'opt ' || k
  from generate_series(1, 36) n, generate_series(0, 1) k;
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
  select ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
         ('40000000-0000-0000-0000-' || lpad(n::text, 11, '0') || '0')::uuid,
         'EXPLAIN-' || n, 'HINT-' || n
  from generate_series(1, 36) n;

-- Today's general sets at band 1 and band 5.
insert into public.daily_sets (id, track_id, set_date, level, published_at) values
  ('50000000-0000-0000-0000-0000000000a1', private.default_track_id(), (now() at time zone 'UTC')::date, 1, now() - interval '1 day'),
  ('50000000-0000-0000-0000-0000000000a5', private.default_track_id(), (now() at time zone 'UTC')::date, 5, now() - interval '1 day');
insert into public.daily_set_items (daily_set_id, question_id, position) values
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 0),
  ('50000000-0000-0000-0000-0000000000a5', '30000000-0000-0000-0000-000000000036', 0);

-- Contests: live (q35, q33), upcoming (q31), ended (q29), unpublished.
insert into public.contests (id, slug, title, starts_at, ends_at, is_published) values
  ('70000000-0000-0000-0000-000000000001', 'live-cup',  'Live cup',  now() - interval '1 hour', now() + interval '1 hour', true),
  ('70000000-0000-0000-0000-000000000002', 'next-cup',  'Next cup',  now() + interval '1 day',  now() + interval '2 days', true),
  ('70000000-0000-0000-0000-000000000003', 'past-cup',  'Past cup',  now() - interval '2 days', now() - interval '1 day', true),
  ('70000000-0000-0000-0000-000000000004', 'draft-cup', 'Draft cup', now() - interval '1 hour', now() + interval '1 hour', false);
insert into public.contest_items (contest_id, question_id, position) values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000035', 0),
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000033', 1),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000031', 0),
  ('70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000029', 0);

-- ---------------------------------------------------------------------------
-- Profile fields
-- ---------------------------------------------------------------------------
select is((select onboarded_at from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') is not null,
          false, 'new profiles start without onboarded_at');
select is((select daily_target from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
          10::smallint, 'daily target defaults to 10');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok($$update public.profiles set exam_goal = 'tcs-nqt', daily_target = 20
                  where id = '00000000-0000-0000-0000-0000000000a1'$$, 'player sets exam goal and daily target');
select throws_ok($$update public.profiles set exam_goal = 'nope' where id = '00000000-0000-0000-0000-0000000000a1'$$,
                 '23514', null, 'unknown exam goal is refused');
select throws_ok($$update public.profiles set daily_target = 0 where id = '00000000-0000-0000-0000-0000000000a1'$$,
                 '23514', null, 'daily target must be positive');
select throws_ok($$update public.profiles set placement_level = 5 where id = '00000000-0000-0000-0000-0000000000a1'$$,
                 '42501', null, 'players cannot set their own placement level');

reset role;
insert into public.tags (slug, name, kind) values ('la-general', 'General tag', 'general');
set local role authenticated;
select throws_ok($$update public.profiles set exam_goal = 'la-general' where id = '00000000-0000-0000-0000-0000000000a1'$$,
                 '23514', null, 'exam goal must be an exam tag');

-- ---------------------------------------------------------------------------
-- Placement
-- ---------------------------------------------------------------------------
select is((public.get_today_set() ->> 'daily_set_id'), '50000000-0000-0000-0000-0000000000a1',
          'before placement a new player gets the band-1 set');

create temp table pt on commit drop as select public.start_placement() as j;
grant select on pt to authenticated;

select is(jsonb_array_length((select j -> 'questions' from pt)), 10, 'placement has 10 questions');
select is((select count(*) from pt, jsonb_array_elements(j -> 'questions') q where q ->> 'difficulty' = 'easy'), 3::bigint, '3 easy');
select is((select count(*) from pt, jsonb_array_elements(j -> 'questions') q where q ->> 'difficulty' = 'medium'), 4::bigint, '4 medium');
select is((select count(*) from pt, jsonb_array_elements(j -> 'questions') q where q ->> 'difficulty' = 'hard'), 3::bigint, '3 hard');
select is((select count(distinct q -> 'section' ->> 'id') from pt, jsonb_array_elements(j -> 'questions') q), 2::bigint,
          'placement draws from both sections');
select ok((select j::text from pt) !~ 'EXPLAIN-|HINT-|correct_option', 'placement questions carry no answers or hints');
select ok((select bool_and(q ->> 'id' not in ('30000000-0000-0000-0000-000000000035', '30000000-0000-0000-0000-000000000033',
                                              '30000000-0000-0000-0000-000000000031'))
           from pt, jsonb_array_elements(j -> 'questions') q), 'placement skips questions in open contests');
select is((public.start_placement() ->> 'test_id'), (select j ->> 'test_id' from pt), 'starting again resumes the same test');

select throws_ok(format($$select public.finish_placement(%L, '[{"question_id":"%s","option_id":"40000000-0000-0000-0000-000000000350"}]')$$,
                        (select j ->> 'test_id' from pt), (select j -> 'questions' -> 0 ->> 'id' from pt)),
                 '22023', null, 'an option of another question is refused');

-- All correct except a skipped one.
create temp table pr on commit drop as
  select public.finish_placement((select (j ->> 'test_id')::uuid from pt), (
    select jsonb_agg(jsonb_build_object(
             'question_id', q ->> 'id',
             'option_id', case when ord = 1 then null else q -> 'options' -> 0 ->> 'id' end,
             'time_ms', 5000))
    from pt, jsonb_array_elements(j -> 'questions') with ordinality as x(q, ord))) as r;
grant select on pr to authenticated;

select is((select (r ->> 'correct')::int from pr), 9, 'nine right, one skipped');
select is((select (r ->> 'score')::numeric from pr), 0.950, 'weighted score: an easy skip costs 1 of 20');
select is((select (r -> 'level' ->> 'level')::int from pr), 5, 'score 0.95 places in band 5');
select is((select count(*) from pr, jsonb_array_elements(r -> 'results') x where x ? 'explanation'), 10::bigint,
          'results include explanations');
select is((select placement_level from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 5::smallint,
          'placement level is saved');
select isnt((select onboarded_at from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), null,
            'finishing placement completes onboarding');
select is((select count(*) from public.attempts where user_id = '00000000-0000-0000-0000-0000000000a1' and context = 'assessment'),
          10::bigint, 'placement answers are assessment attempts');
select is((select coalesce(sum(xp_awarded), 0) from public.attempts where user_id = '00000000-0000-0000-0000-0000000000a1'),
          0::bigint, 'placement earns no XP');
select throws_ok(format($$select public.finish_placement(%L, '[]')$$, (select j ->> 'test_id' from pt)),
                 '23505', null, 'a test is graded once');
select throws_ok($$select public.start_placement()$$, '55000', null, 'retake waits for the cooldown');
select is((public.get_today_set() ->> 'daily_set_id'), '50000000-0000-0000-0000-0000000000a5',
          'after placement the player gets the band-5 set');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(format($$select public.finish_placement(%L, '[]')$$, (select j ->> 'test_id' from pt)),
                 '42501', null, 'someone else''s test is refused');
select is((select count(*) from public.placement_tests), 0::bigint, 'players cannot read others'' placement tests');

-- ---------------------------------------------------------------------------
-- Practice
-- ---------------------------------------------------------------------------
-- bob: 4 practice attempts in subtopic one (1 right), 3 in subtopic two (3 right).
do $$
begin
  perform public.submit_answer('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000030', 'practice');
  perform public.submit_answer('30000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000051', 'practice');
  perform public.submit_answer('30000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000071', 'practice');
  perform public.give_up('30000000-0000-0000-0000-000000000009', 'practice');
  perform public.submit_answer('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000020', 'practice');
  perform public.submit_answer('30000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000040', 'practice');
  perform public.submit_answer('30000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000060', 'practice');
end $$;

create temp table tree on commit drop as select public.get_practice_tree() as t;
grant select on tree to authenticated;
create temp view subs as
  select s from tree, jsonb_array_elements(t) sec, jsonb_array_elements(sec -> 'topics') top,
                jsonb_array_elements(top -> 'subtopics') s;
grant select on subs to authenticated;

select is((select (s ->> 'attempted')::int from subs where s ->> 'id' = '20000000-0000-0000-0000-0000000000a1'), 4,
          'tree counts attempts per subtopic');
select is((select (s ->> 'available')::int from subs where s ->> 'id' = '20000000-0000-0000-0000-0000000000a1'), 11,
          'available = servable questions not yet practised (18 - 4 - 3 in open contests)');
select is((select (s ->> 'weak')::boolean from subs where s ->> 'id' = '20000000-0000-0000-0000-0000000000a1'), true,
          '1 of 4 is a weak area');
select is((select (s ->> 'stars')::int from subs where s ->> 'id' = '20000000-0000-0000-0000-0000000000a2'), 1,
          '3 of 3 earns one star');
select is((select (s ->> 'stars')::int from subs where s ->> 'id' = '20000000-0000-0000-0000-0000000000a1'), 0,
          '1 of 4 earns no stars');
reset role;
select is(private.mastery_stars(10, 7), 2, '7/10 = two stars');
select is(private.mastery_stars(20, 17), 3, '17/20 = three stars');
select is(private.mastery_stars(19, 19), 2, 'three stars need 20 attempts');
select is(private.mastery_stars(2, 2), 0, 'fewer than 3 attempts = no stars');
set local role authenticated;

create temp table pq on commit drop as
  select public.get_practice_questions(array['20000000-0000-0000-0000-0000000000a1'::uuid], 'hard', 'normal', 30) as j;
grant select on pq to authenticated;
select is(jsonb_array_length((select j -> 'questions' from pq)), 11, 'practice picker: 18 in subtopic - 4 practised - 3 in open contests');
select is((select j -> 'questions' -> 0 ->> 'difficulty' from pq), 'hard', 'preferred difficulty comes first');
select ok((select bool_and(q -> 'subtopic' ->> 'id' = '20000000-0000-0000-0000-0000000000a1')
           from pq, jsonb_array_elements(j -> 'questions') q), 'picker stays in the requested subtopic');
select ok((select j::text from pq) !~ 'EXPLAIN-|HINT-|correct_option', 'picked questions carry no answers');
select is((public.get_practice_questions(null, null, 'weak', 5) -> 'subtopics' -> 0 ->> 'id'),
          '20000000-0000-0000-0000-0000000000a1', 'weak mode targets the weak subtopic');
select ok((select bool_and(q -> 'subtopic' ->> 'id' = '20000000-0000-0000-0000-0000000000a1')
           from jsonb_array_elements(public.get_practice_questions(null, null, 'weak', 30) -> 'questions') q),
          'weak mode only serves weak subtopics');
select throws_ok($$select public.get_practice_questions(null, null, 'bogus')$$, '22023', null, 'unknown mode is refused');

-- ---------------------------------------------------------------------------
-- Mistakes and activity
-- ---------------------------------------------------------------------------
create temp table mk on commit drop as select public.get_mistakes(20, 0) as j;
grant select on mk to authenticated;
select is((select (j ->> 'total')::int from mk), 3, 'three open mistakes');
select is((select count(*) from mk, jsonb_array_elements(j -> 'entries') e where (e ->> 'gave_up')::boolean), 1::bigint,
          'give-ups count as mistakes');
select is((select e ->> 'explanation' from mk, jsonb_array_elements(j -> 'entries') e
           where e ->> 'id' = '30000000-0000-0000-0000-000000000005'), 'EXPLAIN-5', 'mistakes include the explanation');
select is((select (e ->> 'can_retry')::boolean from mk, jsonb_array_elements(j -> 'entries') e
           where e ->> 'id' = '30000000-0000-0000-0000-000000000005'), false, 'practised mistakes cannot be re-scored');

select is((public.get_activity(7) ->> 'today_count')::int, 7, 'activity counts today''s answers');
select is(jsonb_array_length(public.get_activity(7) -> 'days'), 7, 'activity has one row per day');
select is((public.get_activity(7) ->> 'daily_target')::int, 10, 'activity reports the daily target');

-- ---------------------------------------------------------------------------
-- Contests
-- ---------------------------------------------------------------------------
select is((select count(*) from public.contest_items), 0::bigint, 'contest items are hidden from players');
select is(jsonb_array_length(public.list_contests()), 3, 'unpublished contests are not listed');
select is((public.list_contests() -> 0 ->> 'state'), 'live', 'live contests come first');
select is((public.get_contest('70000000-0000-0000-0000-000000000001') -> 'questions'), 'null'::jsonb,
          'live questions stay hidden until you join');
select is((public.join_contest('70000000-0000-0000-0000-000000000002') ->> 'state'), 'upcoming', 'you can register early');
select is((public.get_contest('70000000-0000-0000-0000-000000000002') -> 'questions'), 'null'::jsonb,
          'upcoming contests show no questions');
select throws_ok($$select public.submit_contest_answer('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000310')$$,
                 '55000', null, 'answers only while live');

do $$ begin perform public.join_contest('70000000-0000-0000-0000-000000000001'); end $$;
select is(jsonb_array_length(public.get_contest('70000000-0000-0000-0000-000000000001') -> 'questions'), 2,
          'joined players see live questions');
select ok((public.get_contest('70000000-0000-0000-0000-000000000001'))::text !~ 'EXPLAIN-|"correct_option_id": "',
          'live contests reveal no answers');
select is((public.submit_contest_answer('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000035',
                                        '40000000-0000-0000-0000-000000000350', 12000) ->> 'points')::int, 30, 'hard = 30 points');
select throws_ok($$select public.submit_contest_answer('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000351')$$,
                 '23505', null, 'one answer per question');
select throws_ok($$select public.submit_contest_answer('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000010')$$,
                 '42501', null, 'questions outside the contest are refused');
select throws_ok($$select public.join_contest('70000000-0000-0000-0000-000000000004')$$, 'P0002', null,
                 'unpublished contests cannot be joined');

-- alice answers both, faster but wrong (and joins by answering); bob leads on points.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$
begin
  perform public.submit_contest_answer('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000033',
                                       '40000000-0000-0000-0000-000000000331', 3000);
  perform public.submit_contest_answer('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000035',
                                       '40000000-0000-0000-0000-000000000351', 3000);
end $$;
select is((public.get_contest_standings('70000000-0000-0000-0000-000000000001') -> 'entries' -> 0 ->> 'handle'), 'bob',
          'standings rank by score');
select is((public.get_contest_standings('70000000-0000-0000-0000-000000000001') -> 'me' ->> 'rank')::int, 2,
          'standings include your own rank');

select is((public.get_contest('70000000-0000-0000-0000-000000000003') -> 'questions' -> 0 ->> 'explanation'), 'EXPLAIN-29',
          'ended contests show explanations to everyone');
select throws_ok($$select public.join_contest('70000000-0000-0000-0000-000000000003')$$, '55000', null,
                 'ended contests cannot be joined');

-- ---------------------------------------------------------------------------
-- Anon
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.get_practice_tree()$$, '42501', null, 'anon cannot read the practice tree');

reset role;
select * from finish();
rollback;
