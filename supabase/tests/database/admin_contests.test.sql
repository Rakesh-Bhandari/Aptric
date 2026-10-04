-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata) values
  ('00000000-0000-0000-0000-0000000000a1', 'ada@example.com', '{"handle":"ada_admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@example.com', '{"handle":"bob_player"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000c1', id, 'contest-test', 'Contest test'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'one', 'One');

-- q1, q2: published with keys; q3: draft.
insert into public.questions (id, subtopic_id, stem, difficulty, status, source, content_hash) values
  ('30000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 'Contest q1', 'easy', 'published', 'manual', repeat('a', 64)),
  ('30000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-0000000000c1', 'Contest q2', 'hard', 'published', 'manual', repeat('b', 64)),
  ('30000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-0000000000c1', 'Contest q3', 'easy', 'draft',     'manual', repeat('c', 64));
insert into public.question_options (id, question_id, position, body) values
  ('40000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c1', 0, 'a'),
  ('40000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-0000000000c1', 1, 'b'),
  ('40000000-0000-0000-0000-0000000000c3', '30000000-0000-0000-0000-0000000000c2', 0, 'a'),
  ('40000000-0000-0000-0000-0000000000c4', '30000000-0000-0000-0000-0000000000c2', 1, 'b'),
  ('40000000-0000-0000-0000-0000000000c5', '30000000-0000-0000-0000-0000000000c3', 0, 'a'),
  ('40000000-0000-0000-0000-0000000000c6', '30000000-0000-0000-0000-0000000000c3', 1, 'b');
insert into public.question_answers (question_id, correct_option_id, explanation) values
  ('30000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', 'e'),
  ('30000000-0000-0000-0000-0000000000c2', '40000000-0000-0000-0000-0000000000c3', 'e');

-- ---------------------------------------------------------------------------
-- Players get nothing
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok($$select public.admin_list_contests()$$, '42501', null, 'player cannot list contests');
select throws_ok($$select public.admin_save_contest(null, 'x', null, now(), now() + interval '1 hour')$$,
  '42501', null, 'player cannot create a contest');
select throws_ok($$select public.admin_pick_contest_questions()$$, '42501', null, 'player cannot pick questions');
select throws_ok($$select public.admin_get_contest_results(gen_random_uuid())$$, '42501', null, 'player cannot read results');
select throws_ok($$select public.admin_delete_contest(gen_random_uuid())$$, '42501', null, 'player cannot delete');

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok($$select public.admin_save_contest(null, '  ', null, now(), now() + interval '1 hour')$$,
  '22023', null, 'a title is required');
select throws_ok($$select public.admin_save_contest(null, 'x', null, now(), now())$$,
  '22023', null, 'the contest must end after it starts');
select throws_ok($$select public.admin_save_contest(null, 'x', null, now(), now() + interval '15 days')$$,
  '22023', null, 'a contest runs at most 14 days');
select throws_ok($$select public.admin_save_contest(null, 'x', null, now(), now() + interval '1 hour',
  array['30000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c1']::uuid[])$$,
  '22023', null, 'a question cannot repeat');
select throws_ok($$select public.admin_save_contest(null, 'x', null, now(), now() + interval '1 hour', '{}', true)$$,
  '22023', null, 'cannot publish without questions');
select throws_ok($$select public.admin_save_contest(null, 'x', null, now(), now() + interval '1 hour',
  array['30000000-0000-0000-0000-0000000000c3']::uuid[], true)$$,
  '22023', null, 'cannot publish a draft question');

-- ---------------------------------------------------------------------------
-- Create, publish, pick
-- ---------------------------------------------------------------------------
select is(public.admin_save_contest(null, 'Weekly Quant #1', 'desc', now() + interval '1 day', now() + interval '2 days',
  array['30000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c2']::uuid[]) ->> 'state', 'draft',
  'new contests are drafts');
select is((public.admin_list_contests() -> 0 ->> 'question_count')::int, 2, 'the list counts questions');
select matches((public.admin_list_contests() -> 0 ->> 'slug'), '^weekly-quant-1-[0-9a-f]{6}$', 'slug comes from the title');
select lives_ok($$select public.admin_set_contest_published((select id from public.contests limit 1), true)$$, 'publish');
select is(public.admin_get_contest((select id from public.contests limit 1)) ->> 'state', 'upcoming', 'published and in the future is upcoming');
select is(jsonb_array_length(public.admin_pick_contest_questions(difficulty => 'hard')), 0,
  'the picker skips questions already in an unfinished contest');

-- ---------------------------------------------------------------------------
-- Participants lock questions and block delete
-- ---------------------------------------------------------------------------
reset role;
insert into public.contest_entries (contest_id, user_id) select id, '00000000-0000-0000-0000-0000000000b1' from public.contests;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok($$select public.admin_save_contest((select id from public.contests limit 1), 'Weekly', null,
  now() + interval '1 day', now() + interval '2 days', array['30000000-0000-0000-0000-0000000000c1']::uuid[], true)$$,
  '55000', null, 'questions are locked once someone has joined');
select lives_ok($$select public.admin_save_contest((select id from public.contests limit 1), 'Renamed', null,
  now() + interval '1 day', now() + interval '2 days',
  array['30000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c2']::uuid[], true)$$,
  'the title can still change');
select throws_ok($$select public.admin_delete_contest((select id from public.contests limit 1))$$,
  '55000', null, 'a contest with players cannot be deleted');
select is((public.admin_get_contest_results((select id from public.contests limit 1)) ->> 'total')::int, 1, 'results count entrants');

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
select ok((select count(*) from public.audit_log
           where entity_type = 'contests' and actor_id = '00000000-0000-0000-0000-0000000000a1') >= 3,
  'contest writes are audited with the admin as actor');

select * from finish();
rollback;
