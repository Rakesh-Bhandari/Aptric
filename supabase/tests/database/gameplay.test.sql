-- Gameplay RPCs: get_today_set, submit_answer, use_hint, give_up.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into public.tracks (id, slug, name) values
  ('60000000-0000-0000-0000-000000000001', 'cat', 'CAT'),
  ('60000000-0000-0000-0000-000000000002', 'tz-test', 'Timezone test');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.com', '{"handle":"alice","timezone":"Asia/Kolkata"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'carol@example.com', '{"handle":"carol","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'kiri@example.com',  '{"handle":"kiri","timezone":"Pacific/Kiritimati"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'pago@example.com',  '{"handle":"pago","timezone":"Pacific/Pago_Pago"}');

-- alice: default track, streak of 3 ending yesterday (her local yesterday).
update public.profiles
  set current_streak = 3, longest_streak = 3,
      last_streak_date = (now() at time zone 'Asia/Kolkata')::date - 1
  where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set track_id = '60000000-0000-0000-0000-000000000001'
  where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set track_id = '60000000-0000-0000-0000-000000000002'
  where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000a1', id, 'ratios', 'Ratios'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name)
  values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'basics', 'Basics');

-- q1 easy / q2 hard / q6 medium (no hint): today's general set
-- q3 medium: yesterday's general set only
-- q4: draft
-- q5: today's CAT set
-- q7 / q8: tz-test sets for Kiritimati's / Pago Pago's local dates
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'Q1', 'easy',   'published', repeat('1', 64)),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1', 'Q2', 'hard',   'published', repeat('2', 64)),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a1', 'Q3', 'medium', 'published', repeat('3', 64)),
  ('30000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-0000000000a1', 'Q4', 'easy',   'draft',     repeat('4', 64)),
  ('30000000-0000-0000-0000-0000000000a5', '20000000-0000-0000-0000-0000000000a1', 'Q5', 'easy',   'published', repeat('5', 64)),
  ('30000000-0000-0000-0000-0000000000a6', '20000000-0000-0000-0000-0000000000a1', 'Q6', 'medium', 'published', repeat('6', 64)),
  ('30000000-0000-0000-0000-0000000000a7', '20000000-0000-0000-0000-0000000000a1', 'Q7', 'easy',   'published', repeat('7', 64)),
  ('30000000-0000-0000-0000-0000000000a8', '20000000-0000-0000-0000-0000000000a1', 'Q8', 'easy',   'published', repeat('8', 64));

-- Option ...<q><n>: option n of question q. Option 1 is always correct.
insert into public.question_options (id, question_id, position, body)
  select ('40000000-0000-0000-0000-0000000000' || q || n)::uuid,
         ('30000000-0000-0000-0000-0000000000a' || q)::uuid, n::smallint - 1, 'opt ' || n
  from generate_series(1, 8) q, generate_series(1, 2) n;
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
  select ('30000000-0000-0000-0000-0000000000a' || q)::uuid,
         ('40000000-0000-0000-0000-0000000000' || q || '1')::uuid,
         'SECRET-EXPLANATION-' || q,
         case when q <> 6 then 'SECRET-HINT-' || q end
  from generate_series(1, 8) q;

insert into public.daily_sets (id, track_id, set_date, published_at) values
  ('50000000-0000-0000-0000-0000000000a1', private.default_track_id(),
     (now() at time zone 'Asia/Kolkata')::date, now() - interval '1 day'),
  ('50000000-0000-0000-0000-0000000000a2', private.default_track_id(),
     (now() at time zone 'Asia/Kolkata')::date - 1, now() - interval '2 days'),
  ('50000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-000000000001',
     (now() at time zone 'UTC')::date, now() - interval '1 day'),
  -- +14h and -11h are 25h apart, so these two dates always differ.
  ('50000000-0000-0000-0000-0000000000a4', '60000000-0000-0000-0000-000000000002',
     (now() at time zone 'Pacific/Kiritimati')::date, now() - interval '1 day'),
  ('50000000-0000-0000-0000-0000000000a5', '60000000-0000-0000-0000-000000000002',
     (now() at time zone 'Pacific/Pago_Pago')::date, now() - interval '1 day');
insert into public.daily_set_items (daily_set_id, question_id, position) values
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 0),
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a2', 1),
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a6', 2),
  ('50000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a3', 0),
  ('50000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a5', 0),
  ('50000000-0000-0000-0000-0000000000a4', '30000000-0000-0000-0000-0000000000a7', 0),
  ('50000000-0000-0000-0000-0000000000a5', '30000000-0000-0000-0000-0000000000a8', 0);

-- ---------------------------------------------------------------------------
-- Scoring rules (pure function)
-- ---------------------------------------------------------------------------
select is(private.score_points('easy',   'daily',    false, true), 10, 'easy daily = 10');
select is(private.score_points('medium', 'daily',    false, true), 20, 'medium daily = 20');
select is(private.score_points('hard',   'daily',    true,  true), 25, 'hint costs 5');
select is(private.score_points('hard',   'practice', false, true), 15, 'practice is half');
select is(private.score_points('easy',   'practice', true,  true),  2, 'practice with hint = (10 - 5) / 2');
select is(private.score_points('hard',   'daily',    false, false), 0, 'wrong answers score 0');
select ok(
  (select bool_and(private.score_points(d, c, h, true) >= 0)
   from unnest(enum_range(null::public.question_difficulty)) d,
        unnest(array['daily', 'practice']::public.attempt_context[]) c,
        unnest(array[true, false]) h),
  'points are never negative');

-- ---------------------------------------------------------------------------
-- Answers are unreadable via the REST API (anon / authenticated roles)
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.question_answers', 'select'),
  'anon has no SELECT on question_answers');
select ok(not has_table_privilege('authenticated', 'public.question_answers', 'select'),
  'authenticated has no SELECT on question_answers');
select is((select count(*)::int from pg_views
           where schemaname = 'public' and definition ilike '%question_answers%'), 0,
  'no public view exposes question_answers');
select ok(not has_function_privilege('anon', 'public.get_today_set()', 'execute'),
  'anon cannot call get_today_set');
select ok(not has_function_privilege('anon', 'public.submit_answer(uuid, uuid, public.attempt_context, integer)', 'execute'),
  'anon cannot call submit_answer');
select ok(not has_function_privilege('authenticated',
  'private.record_attempt(uuid, uuid, public.attempt_context, uuid, uuid, integer)', 'execute'),
  'internal scoring helper is not callable by users');
select ok(not has_table_privilege('authenticated', 'public.hint_uses', 'insert'),
  'users cannot write hint_uses directly');

-- ---------------------------------------------------------------------------
-- alice (default track, Asia/Kolkata)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok($$select * from public.question_answers$$, '42501', null,
  'user cannot select question_answers');

select is((public.get_today_set() ->> 'daily_set_id')::uuid, '50000000-0000-0000-0000-0000000000a1'::uuid,
  'get_today_set picks today''s set for the caller''s track');
select is(jsonb_array_length(public.get_today_set() -> 'questions'), 3, 'today''s set has 3 questions');
select is(jsonb_array_length(public.get_today_set() -> 'questions' -> 0 -> 'options'), 2, 'questions include options');
select ok(public.get_today_set()::text !~ '(SECRET|correct_option_id|explanation)',
  'get_today_set never includes answers, explanations or unpaid hints');

-- Hints ---------------------------------------------------------------------
select is(public.use_hint('30000000-0000-0000-0000-0000000000a1', 'daily'),
  '{"context":"daily","hint":"SECRET-HINT-1","charged":true}'::jsonb, 'first hint is charged');
select is(public.use_hint('30000000-0000-0000-0000-0000000000a1', 'daily') ->> 'charged', 'false',
  'second hint on the same question is free');
select is(public.use_hint('30000000-0000-0000-0000-0000000000a1') ->> 'charged', 'false',
  'context is inferred as daily for a question in today''s set');
select is((select count(*)::int from public.hint_uses), 1, 'hint recorded once');
select is(public.get_today_set() -> 'questions' -> 0 ->> 'hint', 'SECRET-HINT-1',
  'paid hint shows up in get_today_set');
select is(public.use_hint('30000000-0000-0000-0000-0000000000a6', 'daily'),
  '{"context":"daily","hint":null,"charged":false}'::jsonb, 'question without a hint costs nothing');

-- Daily answers -------------------------------------------------------------
create temp table r1 on commit drop as
  select public.submit_answer('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000011', 'daily', 4200) as r;
select is((select r ->> 'is_correct' from r1), 'true', 'correct answer is graded correct');
select is((select (r ->> 'xp_awarded')::int from r1), 5, 'hint penalty charged exactly once (10 - 5)');
select is((select r ->> 'explanation' from r1), 'SECRET-EXPLANATION-1', 'submit returns the explanation');
select is((select (r ->> 'current_streak')::int from r1), 4, 'first daily answer extends yesterday''s streak');

select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000011', 'daily')$$,
  '23505', null, 'cannot submit the same daily question twice');
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000012', 'daily')$$,
  '23505', null, 'cannot re-answer with a different option');
select throws_ok($$select public.give_up('30000000-0000-0000-0000-0000000000a1', 'daily')$$,
  '23505', null, 'cannot give up after answering');
select throws_ok($$select public.use_hint('30000000-0000-0000-0000-0000000000a1', 'daily')$$,
  '23505', null, 'cannot take a hint after answering');
select is((select count(*)::int from public.attempts where question_id = '30000000-0000-0000-0000-0000000000a1'), 1,
  'still exactly one attempt');
select is((select count(*)::int from public.xp_events), 1, 'still exactly one xp event');

select is(public.submit_answer('30000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-000000000022', 'daily')
            - 'attempt_id' - 'current_streak' - 'longest_streak',
  '{"context":"daily","is_correct":false,"used_hint":false,"xp_awarded":0,
    "correct_option_id":"40000000-0000-0000-0000-000000000021","explanation":"SECRET-EXPLANATION-2"}'::jsonb,
  'wrong answer scores 0 and reveals the right option');
select is((select current_streak from public.profiles where id = auth.uid()), 4,
  'streak only moves on the first daily answer of the day');
select is((public.give_up('30000000-0000-0000-0000-0000000000a6', 'daily') ->> 'xp_awarded')::int, 0,
  'give up scores 0');
select is((select count(*)::int from public.xp_events), 1, 'zero-point attempts write no xp event');

select is(public.get_today_set() -> 'questions' -> 0 -> 'attempt',
  '{"selected_option_id":"40000000-0000-0000-0000-000000000011","is_correct":true,"gave_up":false,"used_hint":true,"xp_awarded":5}'::jsonb,
  'get_today_set reports the caller''s own progress');
select ok(public.get_today_set()::text !~ '(EXPLANATION|correct_option_id)',
  'get_today_set still hides answers after answering');

-- Foreign questions ---------------------------------------------------------
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a5', '40000000-0000-0000-0000-000000000051', 'daily')$$,
  '42501', null, 'cannot score another track''s daily question');
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-000000000031', 'daily')$$,
  '42501', null, 'cannot score yesterday''s daily question as daily');
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a4', '40000000-0000-0000-0000-000000000041', 'practice')$$,
  '42501', null, 'cannot score an unpublished question in practice');
select throws_ok($$select public.use_hint('30000000-0000-0000-0000-0000000000a4', 'practice')$$,
  '42501', null, 'cannot take a hint on an unpublished question');
select throws_ok($$select public.give_up('30000000-0000-0000-0000-0000000000a5', 'daily')$$,
  '42501', null, 'cannot give up on another track''s daily question');
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-000000000011', 'practice')$$,
  '22023', null, 'option must belong to the question');
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-000000000031', 'assessment')$$,
  '22023', null, 'assessment context is not accepted');
select is((select count(*)::int from public.attempts), 3, 'rejected calls recorded nothing');

-- Practice ------------------------------------------------------------------
select is((public.submit_answer('30000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-000000000021', 'practice') ->> 'xp_awarded')::int,
  15, 'practice is scored separately from daily, at half points');
select is((public.use_hint('30000000-0000-0000-0000-0000000000a3') ->> 'context'), 'practice',
  'context is inferred as practice outside today''s set');
select is((public.submit_answer('30000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-000000000031', 'practice') ->> 'xp_awarded')::int,
  7, 'practice with hint = (20 - 5) / 2');
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-000000000021', 'practice')$$,
  '23505', null, 'cannot double-score in practice');

select is((select xp from public.profiles where id = auth.uid()),
          (select sum(amount) from public.xp_events where user_id = auth.uid()),
  'profiles.xp matches the ledger');
select is((select xp from public.profiles where id = auth.uid()), 27::bigint, 'alice has 5 + 15 + 7 xp');

-- ---------------------------------------------------------------------------
-- carol (CAT track)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select is(public.get_today_set() -> 'questions' -> 0 ->> 'id', '30000000-0000-0000-0000-0000000000a5',
  'carol gets her own track''s set');
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000011', 'daily')$$,
  '42501', null, 'carol cannot score the general track''s daily question');
select is((public.submit_answer('30000000-0000-0000-0000-0000000000a5', '40000000-0000-0000-0000-000000000051', 'daily') ->> 'current_streak')::int,
  1, 'first-ever daily answer starts a streak at 1');

-- ---------------------------------------------------------------------------
-- "Today" follows the caller's timezone
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select is(public.get_today_set() -> 'questions' -> 0 ->> 'id', '30000000-0000-0000-0000-0000000000a7',
  'UTC+14 user gets the set for their local date');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select is(public.get_today_set() -> 'questions' -> 0 ->> 'id', '30000000-0000-0000-0000-0000000000a8',
  'UTC-11 user gets the set for their local date');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.get_today_set()$$, '42501', null, 'anon cannot read the daily set');

reset role;
select * from finish();
rollback;
