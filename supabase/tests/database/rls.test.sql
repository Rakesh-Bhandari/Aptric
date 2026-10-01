-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.com', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"handle":"Bob!!", "timezone":"Asia/Kolkata"}'),
  ('00000000-0000-0000-0000-00000000000c', 'bob@other.com',     '{"handle":"bob", "timezone":"Not/AZone"}');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')),
  'RLS is enabled on every public table'
);

select is((select handle from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'bob',
  'signup trigger creates profile with sanitised handle');
select is((select timezone from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'Asia/Kolkata',
  'signup trigger keeps a valid timezone');
select is((select handle from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), null,
  'colliding metadata handle is left null for onboarding');
select is((select handle from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), null,
  'no metadata handle leaves handle null for onboarding');
select is((select timezone from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 'UTC',
  'invalid timezone falls back to UTC');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'Ada Admin',
  'display_name comes from full_name');

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-000000000001', id, 'percentages', 'Percentages'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'basics', 'Basics');
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'What is 10% of 50?', 'easy', 'published', repeat('a', 64)),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Draft question',     'easy', 'draft',     repeat('b', 64));
insert into public.question_options (id, question_id, position, body) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 0, '5'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1, '10'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 0, 'x');
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
  values ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50 * 0.1 = 5', 'Move the decimal');

select isnt((select published_at from public.questions where id = '30000000-0000-0000-0000-000000000001'), null,
  'published_at is stamped on publish');

select throws_ok(
  $$insert into public.question_answers (question_id, correct_option_id, explanation)
    values ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'x')$$,
  '23503', null, 'correct option must belong to the same question');

insert into public.daily_sets (id, set_date, published_at) values
  ('50000000-0000-0000-0000-000000000001', '2026-10-01', now() - interval '1 hour'),
  ('50000000-0000-0000-0000-000000000002', '2099-01-01', now() + interval '1 year');
insert into public.daily_set_items (daily_set_id, question_id, position) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 0),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 0);

insert into public.attempts (user_id, question_id, context, selected_option_id, is_correct)
  values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 'practice', '40000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into public.attempts (user_id, question_id, context, is_correct)
    values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 'practice', false)$$,
  '23505', null, 'one attempt per user + question + context');
select lives_ok(
  $$insert into public.attempts (user_id, question_id, context, daily_set_id, is_correct)
    values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 'daily', '50000000-0000-0000-0000-000000000001', true)$$,
  'same question in a different context is allowed');
select throws_ok(
  $$insert into public.attempts (user_id, question_id, context, is_correct)
    values ('00000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-000000000001', 'daily', true)$$,
  '23514', null, 'daily attempts require a daily_set_id');

insert into public.xp_events (user_id, amount, reason, idempotency_key)
  values ('00000000-0000-0000-0000-00000000000b', 10, 'attempt_correct', 'k1');
select throws_ok($$update public.xp_events set amount = 1000$$, '42501', null, 'xp_events cannot be updated, even by postgres');
select throws_ok($$delete from public.xp_events$$,             '42501', null, 'xp_events cannot be deleted directly');

-- ---------------------------------------------------------------------------
-- Regular user: bob
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select results_eq($$select id from public.questions order by id$$,
  $$values ('30000000-0000-0000-0000-000000000001'::uuid)$$, 'user sees only published questions');
select is((select count(*)::int from public.question_options), 2, 'user sees only options of visible questions');
select throws_ok($$select * from public.question_answers$$, '42501', null, 'user cannot read question_answers');
select throws_ok($$select * from public.admin_get_question_answer('30000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'user cannot call admin_get_question_answer');
select is((select count(*)::int from public.daily_sets), 1, 'user sees only released daily sets');
select is((select count(*)::int from public.daily_set_items), 1, 'user sees only items of released daily sets');
select is((select count(*)::int from public.profiles), 1, 'user sees only own profile');
select is((select count(*)::int from public.attempts), 2, 'user sees own attempts');
select is((select count(*)::int from public.xp_events), 1, 'user sees own xp events');
select is((select count(*)::int from public.audit_log), 0, 'user cannot see audit log');

select lives_ok($$update public.profiles set display_name = 'Bobby', bio = 'hi' where id = auth.uid()$$,
  'user can update cosmetic profile fields');
select throws_ok($$update public.profiles set handle = 'Not A Handle!' where id = auth.uid()$$, '23514', null,
  'user cannot set an invalid handle');
select throws_ok($$update public.profiles set xp = 999999 where id = auth.uid()$$, '42501', null, 'user cannot write xp');
select throws_ok($$update public.profiles set role = 'admin' where id = auth.uid()$$, '42501', null, 'user cannot change role');
select throws_ok($$update public.profiles set current_streak = 99 where id = auth.uid()$$, '42501', null, 'user cannot write streaks');
select throws_ok($$insert into public.attempts (user_id, question_id, context, is_correct)
  values (auth.uid(), '30000000-0000-0000-0000-000000000001', 'assessment', true)$$, '42501', null, 'user cannot insert attempts');
select throws_ok($$insert into public.questions (subtopic_id, stem, difficulty, content_hash)
  values ('20000000-0000-0000-0000-000000000001', 'x', 'easy', repeat('c', 64))$$, '42501', null, 'user cannot create questions');

select lives_ok($$insert into public.reports (question_id, reason) values ('30000000-0000-0000-0000-000000000001', 'typo')$$,
  'user can report a visible question');
select throws_ok($$insert into public.reports (question_id, reason) values ('30000000-0000-0000-0000-000000000002', 'typo')$$,
  '42501', null, 'user cannot report a hidden question');
select throws_ok($$insert into public.reports (question_id, reason, status) values ('30000000-0000-0000-0000-000000000001', 'other', 'resolved')$$,
  '42501', null, 'user cannot set report status');
select lives_ok($$insert into public.feedback (message, rating) values ('nice', 5)$$, 'user can leave feedback');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*)::int from public.questions), 2, 'admin sees drafts');
select lives_ok($$update public.questions set status = 'in_review' where id = '30000000-0000-0000-0000-000000000002'$$,
  'admin can edit questions');
select is((select correct_option_id from public.admin_get_question_answer('30000000-0000-0000-0000-000000000001')),
  '40000000-0000-0000-0000-000000000001'::uuid, 'admin reads answers via definer function');
select throws_ok($$update public.profiles set xp = 1 where id = auth.uid()$$, '42501', null, 'admin cannot write xp either');
select lives_ok($$select public.admin_set_user_role('00000000-0000-0000-0000-00000000000b', 'admin')$$,
  'admin can promote users');

reset role;
select ok(
  (select bool_and(before is null and after is null) from public.audit_log where entity_type = 'question_answers'),
  'audit log never stores answer contents');
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000b'$$,
  'deleting a user cascades through attempts and the append-only xp ledger');

select * from finish();
rollback;
