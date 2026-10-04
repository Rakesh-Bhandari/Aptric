-- Contest attempts that end on a violation, and the practice detection preference.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into private.accounts (id, email, metadata) values
  ('00000000-0000-0000-0000-0000000000a1', 'amy@example.com', '{"handle":"amy_x"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'ben@example.com', '{"handle":"ben_x"}');

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000e1', id, 'integrity-test', 'Integrity test'
  from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'one', 'One');
insert into public.questions (id, subtopic_id, stem, difficulty, status, source, content_hash) values
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'q1', 'easy', 'published', 'manual', repeat('d', 64)),
  ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e1', 'q2', 'easy', 'published', 'manual', repeat('e', 64));
insert into public.question_options (id, question_id, position, body) values
  ('40000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1', 0, 'a'),
  ('40000000-0000-0000-0000-0000000000e2', '30000000-0000-0000-0000-0000000000e1', 1, 'b'),
  ('40000000-0000-0000-0000-0000000000e3', '30000000-0000-0000-0000-0000000000e2', 0, 'a'),
  ('40000000-0000-0000-0000-0000000000e4', '30000000-0000-0000-0000-0000000000e2', 1, 'b');
insert into public.question_answers (question_id, correct_option_id, explanation) values
  ('30000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e1', 'e'),
  ('30000000-0000-0000-0000-0000000000e2', '40000000-0000-0000-0000-0000000000e3', 'e');
insert into public.contests (id, slug, title, starts_at, ends_at, is_published) values
  ('70000000-0000-0000-0000-0000000000e1', 'integrity-cup', 'Integrity cup', now() - interval '1 hour', now() + interval '1 hour', true);
insert into public.contest_items (contest_id, question_id, position) values
  ('70000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1', 0),
  ('70000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e2', 1);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok($$select public.finish_contest('70000000-0000-0000-0000-0000000000e1', 'tab_hidden')$$,
  'P0002', null, 'you must have joined to finish');
do $$ begin perform public.join_contest('70000000-0000-0000-0000-0000000000e1'); end $$;
select throws_ok($$select public.finish_contest('70000000-0000-0000-0000-0000000000e1', 'coffee_break')$$,
  '22023', null, 'unknown violation reasons are refused');
select is((public.get_contest('70000000-0000-0000-0000-0000000000e1') ->> 'finished_at'), null, 'a fresh attempt is open');
do $$ begin
  perform public.submit_contest_answer('70000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1',
                                       '40000000-0000-0000-0000-0000000000e1', 1000);
end $$;

select is((public.finish_contest('70000000-0000-0000-0000-0000000000e1', 'tab_hidden') ->> 'violation'), 'tab_hidden',
  'the violation is recorded');
select isnt((public.get_contest('70000000-0000-0000-0000-0000000000e1') ->> 'finished_at'), null, 'the attempt is finished');
select is((public.finish_contest('70000000-0000-0000-0000-0000000000e1', 'window_blur') ->> 'violation'), 'tab_hidden',
  'finishing again is idempotent: the first reason stands');
select is((public.finish_contest('70000000-0000-0000-0000-0000000000e1') ->> 'violation'), 'tab_hidden',
  'a plain finish does not clear it');
select throws_ok($$select public.submit_contest_answer('70000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e2',
  '40000000-0000-0000-0000-0000000000e3', 1000)$$, '55000', null, 'a finished attempt cannot be resumed');
select is((public.get_contest('70000000-0000-0000-0000-0000000000e1') -> 'my_entry' ->> 'score')::int, 10,
  'answers given before the violation still count');

-- Another player is unaffected.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$ begin perform public.join_contest('70000000-0000-0000-0000-0000000000e1'); end $$;
select is((public.get_contest('70000000-0000-0000-0000-0000000000e1') ->> 'violation'), null, 'other players keep their own attempt');

-- Practice preference.
select is((select detect_tab_switches_practice from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  true, 'practice detection defaults to on');
update public.profiles set detect_tab_switches_practice = false where id = '00000000-0000-0000-0000-0000000000b1';
select is((select detect_tab_switches_practice from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  false, 'a player can turn it off');
select throws_ok($$update public.profiles set xp = 99 where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'other columns stay locked');

select * from finish();
rollback;
