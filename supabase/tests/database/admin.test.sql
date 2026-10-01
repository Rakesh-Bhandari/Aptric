-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'ada@example.com',  '{"handle":"ada_admin"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'alan@example.com', '{"handle":"alan_admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@example.com',  '{"handle":"bob_player"}');
update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000a1', id, 'admin-test', 'Admin test'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'one', 'One'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', 'two', 'Two');

-- q1: in review with a key; q2: in review without a key; q3: published, for reports.
insert into public.questions (id, subtopic_id, stem, difficulty, status, source, content_hash) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'What is 10% of 80?', 'easy', 'in_review', 'import', repeat('1', 64)),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1', 'Keyless',            'easy', 'in_review', 'import', repeat('2', 64)),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a1', 'Published one',      'easy', 'published', 'manual', repeat('3', 64));
insert into public.question_options (id, question_id, position, body) values
  ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 0, '8'),
  ('40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a1', 1, '10'),
  ('40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a1', 2, '6'),
  ('40000000-0000-0000-0000-0000000000a4', '30000000-0000-0000-0000-0000000000a2', 0, 'x'),
  ('40000000-0000-0000-0000-0000000000a5', '30000000-0000-0000-0000-0000000000a2', 1, 'y'),
  ('40000000-0000-0000-0000-0000000000a6', '30000000-0000-0000-0000-0000000000a3', 0, 'p'),
  ('40000000-0000-0000-0000-0000000000a7', '30000000-0000-0000-0000-0000000000a3', 1, 'q');
insert into public.question_answers (question_id, correct_option_id, explanation) values
  ('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', '80 * 0.1 = 8'),
  ('30000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-0000000000a6', 'p');
insert into public.reports (id, reporter_id, question_id, reason, details) values
  ('60000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000a3', 'typo', 'spelling');

-- ---------------------------------------------------------------------------
-- content_hash matches the TypeScript reference (functions/generate-questions/dedup.ts)
-- ---------------------------------------------------------------------------
select is(private.content_hash('  What is 25% of ₹1,200?  ', array['₹300', '₹250', '₹350', '₹400']),
  'a7a4d9ffbb29d2f03197d6a46449a2219063d2f2f1d9fa85434802927c17234a', 'content_hash matches JS: currency');
select is(private.content_hash('Ünïcode — and *markdown*', array['α', 'β', 'γ', 'δ']),
  '8d2ba8f4228418ab74e182f420e3ca7745f6af18fcc857070fe232870805dab5', 'content_hash matches JS: unicode');
select is(private.content_hash('What is 10% of 80?', array['8', '10', '6']),
  'b8ed17ab31df336d76bf72740472f582aca3c9a52201ef135c8f5dd6f763abbf', 'content_hash matches JS: sorted options');

-- ---------------------------------------------------------------------------
-- Non-admins get nothing
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok($$select public.admin_get_question('30000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'user cannot load a question for editing');
select throws_ok($$select public.admin_save_question('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
  'x', 'easy', 60, array['a', 'b'], 0, 'e')$$, '42501', null, 'user cannot save a question');
select throws_ok($$select public.admin_set_question_status(array['30000000-0000-0000-0000-0000000000a1']::uuid[], 'published')$$,
  '42501', null, 'user cannot publish');
select throws_ok($$select * from public.admin_list_users()$$, '42501', null, 'user cannot list users');
select throws_ok($$select public.admin_set_user_ban('00000000-0000-0000-0000-0000000000a1', true)$$,
  '42501', null, 'user cannot ban');
select is((select count(*) from public.audit_log), 0::bigint, 'user cannot read the audit log');

-- ---------------------------------------------------------------------------
-- Admin: users
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select email from public.admin_list_users(search => 'BOB@')), 'bob@example.com',
  'admin_list_users searches email case-insensitively');
select is((select total_count from public.admin_list_users(only_role => 'admin', page_size => 1)), 2::bigint,
  'admin_list_users filters by role and reports the total beyond the page');
select is((select count(*) from public.admin_list_users(search => '%')), 0::bigint,
  'admin_list_users treats % as a literal');

-- ---------------------------------------------------------------------------
-- Admin: review and edit
-- ---------------------------------------------------------------------------
select is(jsonb_array_length(public.admin_get_question('30000000-0000-0000-0000-0000000000a1') -> 'options'), 3,
  'admin_get_question returns the options');
select is(public.admin_get_question('30000000-0000-0000-0000-0000000000a1') #>> '{answer,correct_option_id}',
  '40000000-0000-0000-0000-0000000000a1', 'admin_get_question returns the answer key');

select lives_ok($$select public.admin_save_question(
  '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
  '  What is $10\%$ of 90?  ', 'medium', 45, array['9', '10', '6', '12'], 0, 'Ten percent of 90 is 9.', ' ', array['TCS-NQT', 'amcat'])$$,
  'admin_save_question saves an edit');
select is((select stem from public.questions where id = '30000000-0000-0000-0000-0000000000a1'), 'What is $10\%$ of 90?',
  'stem is trimmed and saved');
select is((select subtopic_id from public.questions where id = '30000000-0000-0000-0000-0000000000a1'),
  '20000000-0000-0000-0000-0000000000a2'::uuid, 'subtopic is moved');
select is((select content_hash from public.questions where id = '30000000-0000-0000-0000-0000000000a1'),
  private.content_hash('What is $10\%$ of 90?', array['9', '10', '6', '12']), 'content_hash is recomputed');
select is((select id from public.question_options where question_id = '30000000-0000-0000-0000-0000000000a1' and position = 0),
  '40000000-0000-0000-0000-0000000000a1'::uuid, 'edited options keep their ids');
select is((select count(*) from public.question_options where question_id = '30000000-0000-0000-0000-0000000000a1'), 4::bigint,
  'a new option is added');
select is((select array_agg(tag order by tag) from public.question_tags where question_id = '30000000-0000-0000-0000-0000000000a1'),
  array['amcat', 'tcs-nqt'], 'tags are normalised and saved');
select is((select array_agg(distinct entity_type order by entity_type) from public.audit_log
           where actor_id = '00000000-0000-0000-0000-0000000000a1'
             and (entity_id = '30000000-0000-0000-0000-0000000000a1'
                  or after ->> 'question_id' = '30000000-0000-0000-0000-0000000000a1')),
  array['question_answers', 'question_options', 'question_tags', 'questions'],
  'every table the edit changed is audited with the admin as actor');

select lives_ok($$select public.admin_save_question(
  '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
  'What is $10\%$ of 90?', 'medium', 45, array['9', '10'], 1, 'Changed my mind.', null, '{}')$$,
  'admin_save_question can drop options');
select is((select o.position from public.question_options o
           where o.id = (public.admin_get_question('30000000-0000-0000-0000-0000000000a1') #>> '{answer,correct_option_id}')::uuid),
  1::smallint, 'answer key follows correct_index');
select is((select count(*) from public.question_tags where question_id = '30000000-0000-0000-0000-0000000000a1'), 0::bigint,
  'tags can be cleared');

select throws_ok($$select public.admin_save_question(
  '30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1',
  'what is 10% of 90', 'easy', 60, array['10', '9'], 0, 'dup')$$,
  '23505', null, 'an edit that duplicates another question is refused');
select throws_ok($$select public.admin_save_question(
  '30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1',
  'ok', 'easy', 60, array['a', ' '], 0, 'e')$$,
  '22023', null, 'blank options are refused');
select throws_ok($$select public.admin_save_question(
  '30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1',
  'ok', 'easy', 60, array['a', 'a'], 0, 'e')$$,
  '22023', null, 'repeated options are refused');

select throws_ok($$select public.admin_set_question_status(array['30000000-0000-0000-0000-0000000000a2']::uuid[], 'published')$$,
  '23514', null, 'a question without an answer key cannot be published');

select is(public.admin_set_question_status(array['30000000-0000-0000-0000-0000000000a1']::uuid[], 'published', 'looks right', 'in_review'),
  1, 'approve moves an in_review question');
select is(public.admin_set_question_status(array['30000000-0000-0000-0000-0000000000a1']::uuid[], 'retired', null, 'in_review'),
  0, 'a second reviewer cannot re-decide it');
select is((select status::text || '/' || reviewed_by::text || '/' || review_note from public.questions
           where id = '30000000-0000-0000-0000-0000000000a1'),
  'published/00000000-0000-0000-0000-0000000000a1/looks right', 'status, reviewer and note are recorded');
select is((select after ->> 'note' from public.audit_log
           where action = 'approve' and entity_id = '30000000-0000-0000-0000-0000000000a1'
             and actor_id = '00000000-0000-0000-0000-0000000000a1'),
  'looks right', 'approval is audited with its note');

select is(public.admin_set_question_status(array['30000000-0000-0000-0000-0000000000a2']::uuid[], 'retired', 'no key', 'in_review'),
  1, 'reject retires an in_review question');
select is((select count(*) from public.audit_log where action = 'reject' and entity_id = '30000000-0000-0000-0000-0000000000a2'),
  1::bigint, 'rejection is audited');

-- ---------------------------------------------------------------------------
-- Admin: reports are audited
-- ---------------------------------------------------------------------------
update public.reports set status = 'resolved', resolution_note = 'fixed'
where id = '60000000-0000-0000-0000-0000000000a1';
select is((select after ->> 'status' from public.audit_log
           where entity_type = 'reports' and entity_id = '60000000-0000-0000-0000-0000000000a1'
             and actor_id = '00000000-0000-0000-0000-0000000000a1'),
  'resolved', 'resolving a report is audited');

select is((select array_agg(distinct entity_type order by entity_type) from public.audit_log
           where question_ref = '30000000-0000-0000-0000-0000000000a3'),
  array['question_answers', 'question_options', 'questions', 'reports'],
  'question_ref ties option, answer and report rows to their question');

-- ---------------------------------------------------------------------------
-- Admin: bans and roles
-- ---------------------------------------------------------------------------
select throws_ok($$select public.admin_set_user_ban('00000000-0000-0000-0000-0000000000a1', true)$$,
  '23514', null, 'admins cannot ban themselves');
select throws_ok($$select public.admin_set_user_ban('00000000-0000-0000-0000-0000000000a2', true)$$,
  '23514', null, 'admins must be demoted before a ban');

select lives_ok($$select public.admin_set_user_ban('00000000-0000-0000-0000-0000000000b1', true, 'spam')$$, 'admin bans a user');
select throws_ok($$select public.admin_set_user_role('00000000-0000-0000-0000-0000000000b1', 'admin')$$,
  '23514', null, 'a banned user cannot be made an admin');
select is((select after ->> 'banned_reason' from public.audit_log where action = 'ban'
           and entity_id = '00000000-0000-0000-0000-0000000000b1'), 'spam', 'the ban is audited');

reset role;
select ok((select banned_until > now() + interval '50 years' from auth.users where id = '00000000-0000-0000-0000-0000000000b1'),
  'the ban blocks sign-in in Supabase Auth');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.submit_answer('30000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-0000000000a6', 'practice')$$,
  '42501', 'account suspended', 'a banned user cannot play');
select throws_ok($$insert into public.reports (question_id, reason) values ('30000000-0000-0000-0000-0000000000a3', 'other')$$,
  '42501', null, 'a banned user cannot file reports');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.admin_set_user_ban('00000000-0000-0000-0000-0000000000b1', false)$$, 'admin unbans a user');

reset role;
select is((select banned_until from auth.users where id = '00000000-0000-0000-0000-0000000000b1'), null,
  'unbanning clears the Auth ban');

-- ---------------------------------------------------------------------------
-- Generation jobs (written by service_role) name their admin in the audit log
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.question_generation_jobs (id, created_by, subtopic_id, difficulty, requested, max_batches, model, solver_model, prompt_version)
values ('70000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
        'easy', 5, 3, 'm', 's', 'p');
update public.question_generation_jobs set status = 'cancelled', cancelled_by = '00000000-0000-0000-0000-0000000000a2'
where id = '70000000-0000-0000-0000-0000000000a1';
select is((select array_agg(action || ':' || actor_id::text order by id) from public.audit_log
           where entity_type = 'question_generation_jobs'),
  array['create:00000000-0000-0000-0000-0000000000a1', 'cancel:00000000-0000-0000-0000-0000000000a2'],
  'job creation and cancellation are audited with the admin who did them');

select * from finish();
rollback;
