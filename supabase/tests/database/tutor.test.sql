-- Aptric Tutor: tutor_context scope and phases, verification, the learner
-- profile, and the tutor_messages chat log (RLS, API-only writes).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.com', '{"handle":"alice","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@example.com',   '{"handle":"bob","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'cat@example.com',   '{"handle":"cat","timezone":"UTC"}');
update public.profiles set banned_at = now() where id = '00000000-0000-0000-0000-0000000000c1';

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000f1', id, 'tt-quant', 'TT Quant'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name) values
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'tt-one', 'TT One'),
  ('20000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f1', 'tt-two', 'TT Two');

-- q1 daily · q2 practice · q3 draft in the daily set · q4 no answer key ·
-- q5 live contest · q6 ended contest · q7 draft · q8–q10 subtopic two (mistakes).
-- Option 1 (...<n>1) is correct; every question has 4 options.
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
  select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         case when n >= 8 then '20000000-0000-0000-0000-0000000000f2'::uuid
              else '20000000-0000-0000-0000-0000000000f1'::uuid end,
         'TQ' || n, 'medium',
         case when n in (3, 7) then 'draft' else 'published' end::public.question_status,
         lpad(to_hex(1000 + n), 64, '0')
  from generate_series(1, 10) n;
insert into public.question_options (id, question_id, position, body)
  select ('40000000-0000-0000-0000-0000000000' || lpad(n::text, 1, '0') || k)::uuid,
         ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, k, 'opt ' || k
  from generate_series(1, 9) n, generate_series(0, 3) k;
insert into public.question_options (id, question_id, position, body)
  select ('40000000-0000-0000-0000-00000000010' || k)::uuid, '30000000-0000-0000-0000-000000000010', k, 'opt ' || k
  from generate_series(0, 3) k;
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
  select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         ('40000000-0000-0000-0000-0000000000' || n || '1')::uuid, 'EXPLAIN-' || n, 'HINT-' || n
  from generate_series(1, 9) n where n <> 4;
insert into public.question_answers (question_id, correct_option_id, explanation, hint) values
  ('30000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000101', 'EXPLAIN-10', null);
insert into public.question_tags (question_id, tag) values ('30000000-0000-0000-0000-000000000002', 'tcs-nqt');

insert into public.daily_sets (id, track_id, set_date, level, published_at) values
  ('50000000-0000-0000-0000-0000000000f1', private.default_track_id(), (now() at time zone 'UTC')::date, 1, now() - interval '1 day');
insert into public.daily_set_items (daily_set_id, question_id, position) values
  ('50000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-000000000001', 0),
  ('50000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-000000000003', 1);

insert into public.contests (id, slug, title, starts_at, ends_at, is_published) values
  ('70000000-0000-0000-0000-0000000000f1', 'tt-live', 'Live', now() - interval '1 hour', now() + interval '1 hour', true),
  ('70000000-0000-0000-0000-0000000000f2', 'tt-past', 'Past', now() - interval '2 days', now() - interval '1 day', true);
insert into public.contest_items (contest_id, question_id, position) values
  ('70000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-000000000005', 0),
  ('70000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000006', 0);

-- Alice's history: three wrong answers in subtopic two (one is a give-up).
insert into public.attempts (user_id, question_id, context, selected_option_id, is_correct, time_ms) values
  ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000008', 'practice', '40000000-0000-0000-0000-000000000080', false, 40000),
  ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000009', 'practice', '40000000-0000-0000-0000-000000000090', false, 50000),
  ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000010', 'practice', null, false, null);

create temporary table ctx (name text primary key, v jsonb);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
select throws_ok($$select private.tutor_context(null, '30000000-0000-0000-0000-000000000002', 'practice')$$,
                 '42501', null, 'no user, no tutor');
select throws_ok($$select private.tutor_context('00000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000000002', 'practice')$$,
                 '42501', null, 'suspended players get no tutor');
select throws_ok($$select private.tutor_context('00000000-0000-0000-0000-0000000000a1', '3fffffff-0000-0000-0000-000000000000', 'practice')$$,
                 'P0002', null, 'unknown question');
select throws_ok($$select private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000007', 'practice')$$,
                 '42501', null, 'drafts are not open for practice');
select throws_ok($$select private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'daily')$$,
                 '42501', null, 'daily context only for questions in today''s set');

-- ---------------------------------------------------------------------------
-- Locked: placement (assessment) and contests that haven't ended
-- ---------------------------------------------------------------------------
insert into ctx select 'assess', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'assessment');
insert into ctx select 'contest', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000005', 'practice');
insert into ctx select 'ended', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000006', 'practice');

select is((select v ->> 'phase' from ctx where name = 'assess'), 'locked', 'assessment context is locked');
select is((select v ->> 'phase' from ctx where name = 'contest'), 'locked', 'live contest question is locked');
select is((select v ? 'answer_key' or v ? 'question' from ctx where name = 'contest'), false,
          'a locked context carries no question or answer key');
select is((select v ->> 'phase' from ctx where name = 'ended'), 'solving', 'ended contest questions open up');

-- ---------------------------------------------------------------------------
-- Solving → answered (practice), with the hint ledger
-- ---------------------------------------------------------------------------
insert into ctx select 'p1', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'practice');
select is((select v ->> 'phase' from ctx where name = 'p1'), 'solving', 'no attempt yet: solving');
select is((select (v ->> 'verified')::boolean from ctx where name = 'p1'), true, 'published question with a key is verified');
select is((select v ->> 'context' from ctx where name = 'p1'), 'practice', 'context echoed');
select is((select v #>> '{answer_key,correct_option_id}' from ctx where name = 'p1'),
          '40000000-0000-0000-0000-000000000021', 'answer key for the API');
select is((select (v #>> '{answer_key,correct_position}')::int from ctx where name = 'p1'), 1, 'correct position');
select is((select v #>> '{answer_key,hint}' from ctx where name = 'p1'), 'HINT-2', 'stored hint included');
select is((select jsonb_array_length(v #> '{question,options}') from ctx where name = 'p1'), 4, 'options included');
select is((select v #>> '{question,subtopic}' from ctx where name = 'p1'), 'TT One', 'taxonomy included');
select is((select v #> '{question,tags}' from ctx where name = 'p1'), '["tcs-nqt"]'::jsonb, 'tags included');
select is((select (v ->> 'hint_used')::boolean from ctx where name = 'p1'), false, 'no hint yet');
select is((select v -> 'attempt' from ctx where name = 'p1'), 'null'::jsonb, 'no attempt yet');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((public.use_hint('30000000-0000-0000-0000-000000000002', 'practice') ->> 'charged')::boolean, true,
          'use_hint charges the first hint');
reset role;

insert into ctx select 'p2', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'practice');
select is((select (v ->> 'hint_used')::boolean from ctx where name = 'p2'), true, 'hint_used once charged');
select is((select v ->> 'phase' from ctx where name = 'p2'), 'solving', 'a hint does not end solving');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((public.submit_answer('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000020', 'practice', 9000) ->> 'xp_awarded')::int,
          0, 'wrong answer scores nothing');
reset role;

insert into ctx select 'p3', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'practice');
select is((select v ->> 'phase' from ctx where name = 'p3'), 'answered', 'after submitting: answered');
select is((select v -> 'attempt' from ctx where name = 'p3'),
          '{"gave_up": false, "time_ms": 9000, "used_hint": true, "is_correct": false, "selected_option_id": "40000000-0000-0000-0000-000000000020"}'::jsonb,
          'the attempt is included');
select is((select v ->> 'phase' from private.tutor_context('00000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000002', 'practice') v),
          'solving', 'phase is per player');

-- ---------------------------------------------------------------------------
-- Daily: inferred context, give-up, unverified drafts
-- ---------------------------------------------------------------------------
select is((select private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', null) ->> 'context'),
          'daily', 'context inferred as daily for today''s set');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.give_up('30000000-0000-0000-0000-000000000001', 'daily')$$, 'give up in the daily set');
reset role;
insert into ctx select 'd1', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 'daily');
select is((select v ->> 'phase' from ctx where name = 'd1'), 'answered', 'give up answers the question');
select is((select (v #>> '{attempt,gave_up}')::boolean from ctx where name = 'd1'), true, 'gave_up recorded');

select is((select (private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000003', 'daily') ->> 'verified')::boolean),
          false, 'a draft is not verified');
insert into ctx select 'nokey', private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000004', 'practice');
select is((select (v ->> 'verified')::boolean from ctx where name = 'nokey'), false, 'no answer key: not verified');
select is((select v -> 'answer_key' from ctx where name = 'nokey'), 'null'::jsonb, 'no answer key to send');

-- ---------------------------------------------------------------------------
-- Learner profile
-- ---------------------------------------------------------------------------
select is((select v #>> '{learner,weak_subtopics,0,subtopic}' from ctx where name = 'p1'), 'TT Two', 'weakest subtopic named');
select is((select (v #>> '{learner,weak_subtopics,0,accuracy}')::numeric from ctx where name = 'p1'), 0::numeric, 'with its accuracy');
select is((select jsonb_array_length(v #> '{learner,recent_mistakes}') from ctx where name = 'p1'), 3, 'recent mistakes in this topic');
select is((select (v #>> '{learner,subtopic_stats,attempted}')::int from ctx where name = 'p3'), 1,
          'subtopic stats count the player''s attempts');

-- ---------------------------------------------------------------------------
-- tutor_messages: API-only writes, players read their own
-- ---------------------------------------------------------------------------
select ok(private.tutor_append_message('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002',
          'practice', 'user', 'hint', 'Give me a hint', null) is not null, 'API appends a user turn');
select private.tutor_append_message('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002',
       'practice', 'assistant', 'hint', 'Think about ratios.', 'model-x');
select private.tutor_append_message('00000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000002',
       'practice', 'user', 'free', 'Bob asks', null);
select is((select jsonb_agg(m ->> 'role') from jsonb_array_elements(
             private.tutor_history('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'practice')) m),
          '["user", "assistant"]'::jsonb, 'history is the player''s thread, oldest first');
select throws_ok($$insert into public.tutor_messages (user_id, question_id, context, role, content)
                   values ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'practice', 'user', '')$$,
                 '23514', null, 'empty content is refused');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from public.tutor_messages), 2, 'players read only their own messages');
select throws_ok($$insert into public.tutor_messages (user_id, question_id, context, role, content)
                   values ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'practice', 'user', 'x')$$,
                 '42501', null, 'players cannot write messages directly');
select throws_ok($$select private.tutor_context('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'practice')$$,
                 '42501', null, 'players cannot load the tutor context (answer key)');
reset role;

set local role anon;
select throws_ok($$select count(*) from public.tutor_messages$$, '42501', null, 'anon cannot read messages');
reset role;

select * from finish();
rollback;
