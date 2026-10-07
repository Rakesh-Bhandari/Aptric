-- Community slice 4: user-hosted contests (gate, quota, picker, visibility, engine guards, moderation, XP).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(172);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
--   hos: host (level 6, verified, 60 days old)     new: level 1, verified, new account (group owner)
--   unv: level 6, old, but unverified              p1..p7: players (p7 blocked by hos)
--   adm: admin                                     out: an outsider        two: a second host on the pilot plan
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, email_verified_at, metadata)
select ('00000000-0000-0000-0000-00000000d1' || lpad(n::text, 2, '0'))::uuid, h || '@example.com', case when v then now() end,
       jsonb_build_object('handle', h, 'timezone', 'UTC')
from (values (1, 'hos', true), (2, 'new', true), (3, 'unv', false), (4, 'pl1', true), (5, 'pl2', true), (6, 'pl3', true),
             (7, 'pl4', true), (8, 'pl5', true), (9, 'pl6', true), (10, 'pl7', true), (11, 'adm', true), (12, 'out', true),
             (13, 'two', true)) x(n, h, v);
update public.profiles set role = 'admin' where handle = 'adm';
update public.profiles set level = 6, created_at = now() - interval '60 days' where handle in ('hos', 'unv', 'two');
insert into public.blocks (blocker_id, blocked_id) select a.id, b.id from public.profiles a, public.profiles b where a.handle = 'hos' and b.handle = 'pl7';
insert into public.subscriptions (user_id, plan_id, status, provider)
  select id, 'pilot', 'active', 'manual' from public.profiles where handle = 'two';

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000d1', id, 'ratios', 'Ratios' from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name)
  values ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'basics', 'Basics');
-- 30 published questions: option 0 is right, option 1 is wrong. Question 1 was written by hos.
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '20000000-0000-0000-0000-0000000000d1',
       'Question ' || n, 'easy', 'published', md5(n::text) || md5(n::text)
from generate_series(1, 30) n;
update public.questions set created_by = (select id from public.profiles where handle = 'hos')
  where id = '30000000-0000-0000-0000-000000000001';
insert into public.question_options (id, question_id, position, body)
select ('40000000-0000-0000-0000-0000000000' || lpad((n * 2 + p)::text, 2, '0'))::uuid,
       ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, p, case when p = 0 then 'right ' || n else 'wrong ' || n end
from generate_series(1, 30) n, generate_series(0, 1) p;
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('40000000-0000-0000-0000-0000000000' || lpad((n * 2)::text, 2, '0'))::uuid, 'because ' || n, 'hint ' || n
from generate_series(1, 30) n;
create temp table k as
select n, ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid as qid,
       ('40000000-0000-0000-0000-0000000000' || lpad((n * 2)::text, 2, '0'))::uuid as right_id,
       ('40000000-0000-0000-0000-0000000000' || lpad((n * 2 + 1)::text, 2, '0'))::uuid as wrong_id
from generate_series(1, 30) n;
grant select on k to authenticated;

-- hos has seen question 6 before
insert into public.attempts (user_id, question_id, context, selected_option_id, is_correct, time_ms)
  select p.id, k.qid, 'practice', k.right_id, true, 1000 from public.profiles p, k where p.handle = 'hos' and k.n = 6;

-- Test helpers
create function public.t_act(h text) returns void language sql security definer set search_path = '' as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', (select id from public.profiles where handle = h), 'role', 'authenticated')::text, true)
$$;
-- Move a contest's clock (hosted contests cannot be created in the past, so tests shift them).
create function public.t_clock(cid uuid, s interval, e interval) returns void language sql security definer set search_path = '' as $$
  update public.contests set starts_at = now() + s, ends_at = now() + e where id = cid
$$;
grant execute on function public.t_act(text), public.t_clock(uuid, interval, interval) to authenticated;
create temp table h (name text primary key, id uuid, code text);
grant all on h to authenticated;
-- A league, owned by 'new' (level 1, verified), with p1 p2 p3 as members.
set local role authenticated;
select public.t_act('new');
insert into h (name, id, code) select 'lg', (public.create_group('Section B', 'batch', 'invite_code') ->> 'id')::uuid, null;
update h set code = public.get_group_invite((select id from h where name = 'lg')) ->> 'code' where name = 'lg';
select public.t_act('pl1'); do $$ begin perform public.join_group((select code from h where name = 'lg')); end $$;
select public.t_act('pl2'); do $$ begin perform public.join_group((select code from h where name = 'lg')); end $$;
select public.t_act('pl3'); do $$ begin perform public.join_group((select code from h where name = 'lg')); end $$;

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('contest_access', 'host_strikes', 'contest_reports', 'contest_rewards')),
  'RLS is on for every new table');

-- ---------------------------------------------------------------------------
-- Who can host
-- ---------------------------------------------------------------------------
select public.t_act('pl1');
select is(public.get_host_status() ->> 'ok', 'false', 'a new, low-level player cannot host');
select ok((public.get_host_status() -> 'reasons') @> '["level", "age"]'::jsonb, 'and is told why (level, age)');
select throws_ok($$select public.host_save_contest(null, 'T', null, now() + interval '3 hours', now() + interval '4 hours')$$,
  '42501', null, 'saving a contest is refused');
select throws_ok($$select public.host_pick_questions(null, null, null, null, 5)$$, '42501', null, 'so is the question picker');
select public.t_act('unv');
select ok((public.get_host_status() -> 'reasons') @> '["email"]'::jsonb, 'an unverified email is named');
select public.t_act('hos');
select is(public.get_host_status() ->> 'ok', 'true', 'level 6, verified, 60 days: allowed');
select is(public.get_host_status() -> 'quota' ->> 'limit', '2', 'two contests a month on the free plan');
select is(public.get_host_status() -> 'quota' ->> 'max_participants', '50', 'and 50 players');
select public.t_act('new');
select is(public.get_host_status() ->> 'ok', 'false', 'a league owner fails the general gate');
select is((public.get_host_status() -> 'groups' -> 0 -> 'gate')::text, 'true', 'but passes it for their own league');
select is(public.get_host_status() -> 'groups' -> 0 ->> 'name', 'Section B', 'and the league is listed');

-- ---------------------------------------------------------------------------
-- The picker
-- ---------------------------------------------------------------------------
select public.t_act('hos');
select is(jsonb_array_length(public.host_pick_questions(null, null, null, null, 30)), 29, 'the picker offers every question but the one hos wrote');
select ok(not exists (select 1 from jsonb_array_elements(public.host_pick_questions(null, null, null, null, 30)) x
                      where (x ->> 'id')::uuid = '30000000-0000-0000-0000-000000000001'), 'never the host''s own question');
select ok((select (x ->> 'seen')::boolean from jsonb_array_elements(public.host_pick_questions(null, null, null, null, 30)) x
           where (x ->> 'id')::uuid = '30000000-0000-0000-0000-000000000006'), 'a question the host has answered before is marked seen');
select throws_ok($$select public.host_pick_questions(null, null, null, null, 31)$$, '22023', null, 'at most 30 at a time');
select is(jsonb_array_length(public.host_pick_questions(null, null, null, null, 5, array['30000000-0000-0000-0000-000000000002'::uuid])), 5, 'exclusions are accepted');
select ok(not (public.host_pick_questions(null, null, null, null, 30)::text like '%correct_option%'), 'and no answer key comes with the questions');

-- ---------------------------------------------------------------------------
-- Drafting
-- ---------------------------------------------------------------------------
create temp table ids as select qid, n from k;
grant select on ids to authenticated;

select throws_ok($$select public.host_save_contest(null, 'Soon', null, now() + interval '30 minutes', now() + interval '3 hours')$$,
  '22023', null, 'a contest cannot start within an hour');
select throws_ok($$select public.host_save_contest(null, 'Long', null, now() + interval '2 hours', now() + interval '9 days')$$,
  '22023', null, 'or run for more than 7 days');
select throws_ok($$select public.host_save_contest(null, 'Short', null, now() + interval '2 hours', now() + interval '2 hours 5 minutes')$$,
  '22023', null, 'or for under 10 minutes');
select throws_ok($$select public.host_save_contest(null, '<script>x</script>', null, now() + interval '2 hours', now() + interval '3 hours')$$,
  '22023', null, 'a title is plain text');
select throws_ok($$select public.host_save_contest(null, 'Own question', null, now() + interval '2 hours', now() + interval '3 hours',
  array['30000000-0000-0000-0000-000000000001'::uuid])$$, '22023', null, 'a host cannot use a question they wrote');
select throws_ok($$select public.host_save_contest(null, 'Dup', null, now() + interval '2 hours', now() + interval '3 hours',
  array['30000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000002'::uuid])$$, '22023', null, 'or the same question twice');
select throws_ok($$select public.host_save_contest(null, 'Group', null, now() + interval '2 hours', now() + interval '3 hours', '{}', 'group')$$,
  '22023', null, 'a league contest names its league');
select throws_ok($$select public.host_save_contest(null, 'Code', null, now() + interval '2 hours', now() + interval '3 hours', '{}', 'public', null, 'abcd')$$,
  '22023', null, 'only an unlisted contest has an access code');
select throws_ok($$select public.host_save_contest(null, 'Big', null, now() + interval '2 hours', now() + interval '3 hours', '{}', 'unlisted', null, null, false, 51)$$,
  '22023', null, 'the player cap follows the plan (50)');
select throws_ok($$select public.host_save_contest(null, 'Group', null, now() + interval '2 hours', now() + interval '3 hours', '{}', 'group',
  (select id from h where name = 'lg'))$$, '42501', null, 'hos is not an admin of the league, so cannot host for it');

-- Draft A: unlisted with a code, questions 2-7, up to 3 players
insert into h (name, id) select 'a', (public.host_save_contest(null, 'Friday quiz', 'Quant only', now() + interval '2 hours', now() + interval '4 hours',
  (select array_agg(qid order by n) from ids where n between 2 and 7), 'unlisted', null, 'Secret1', false, 3, 15, false) ->> 'id')::uuid;
select is(public.host_get_contest((select id from h where name = 'a')) ->> 'status', 'draft', 'a saved contest is a draft');
select is(public.host_get_contest((select id from h where name = 'a')) ->> 'has_code', 'true', 'it has a code');
select ok(not (public.host_get_contest((select id from h where name = 'a'))::text like '%Secret1%'), 'which is never returned');
select is(public.host_get_contest((select id from h where name = 'a')) ->> 'seen_count', '1', 'the host is told how many questions they have seen');
select is(jsonb_array_length(public.host_get_contest((select id from h where name = 'a')) -> 'questions'), 6, 'six questions');
select ok(not (public.host_get_contest((select id from h where name = 'a'))::text like '%correct_option%'), 'and the host gets no answer key');
select is(public.host_get_contest((select id from h where name = 'a')) ->> 'visibility', 'unlisted', 'unlisted');

select public.t_act('pl1');
select throws_ok($$select public.get_contest((select id from h where name = 'a'))$$, 'P0002', null, 'nobody else can open a draft');
select throws_ok($$select public.host_get_contest((select id from h where name = 'a'))$$, 'P0002', null, 'or read it as the host');
select ok(public.list_contests()::text not like '%Friday quiz%', 'and it is not listed');
select public.t_act('hos');

-- Drafts do not lock the question bank
reset role;
select ok(private.servable_question('30000000-0000-0000-0000-000000000003'), 'a draft does not take its questions out of circulation');
set local role authenticated;
select public.t_act('hos');

-- Edit the draft: swap in question 8
select is(public.host_save_contest((select id from h where name = 'a'), 'Friday quiz', 'Quant only', now() + interval '2 hours', now() + interval '4 hours',
  (select array_agg(qid order by n) from ids where n between 3 and 8), 'unlisted', null, null, false, 3, 15, false) -> 'questions' -> 5 ->> 'stem',
  'Question 8', 'a draft can be edited');
select is(public.host_get_contest((select id from h where name = 'a')) ->> 'has_code', 'true', 'and keeps its code when none is sent');

-- Publish A
select throws_ok($$select public.host_publish_contest((public.host_save_contest(null, 'Empty', null, now() + interval '2 hours', now() + interval '3 hours') ->> 'id')::uuid)$$,
  '22023', null, 'five questions at least');
select lives_ok($$select public.host_publish_contest((select id from h where name = 'a'))$$, 'publishing works');
select is(public.host_get_contest((select id from h where name = 'a')) ->> 'status', 'scheduled', 'now scheduled');
select is(public.host_get_contest((select id from h where name = 'a')) ->> 'review_state', 'none', 'an unlisted contest needs no review');
select throws_ok($$select public.host_save_contest((select id from h where name = 'a'), 'Changed', null, now() + interval '2 hours', now() + interval '4 hours')$$,
  '55000', null, 'a published contest cannot be edited');
reset role;
select ok(not private.servable_question('30000000-0000-0000-0000-000000000003'), 'its questions leave circulation once scheduled');
select ok(private.servable_question('30000000-0000-0000-0000-000000000009'), 'others stay');
set local role authenticated;
select public.t_act('hos');

-- ---------------------------------------------------------------------------
-- Quota, unpublish, delete
-- ---------------------------------------------------------------------------
insert into h (name, id) select 'b', (public.host_save_contest(null, 'Second', null, now() + interval '2 hours', now() + interval '3 hours',
  (select array_agg(qid order by n) from ids where n between 9 and 13), 'public', null, null, false, 40, 30, false) ->> 'id')::uuid;
select lives_ok($$select public.host_publish_contest((select id from h where name = 'b'))$$, 'a second contest this month');
select is(public.host_get_contest((select id from h where name = 'b')) ->> 'review_state', 'pending', 'a public contest waits for a moderator');
select is(public.get_host_status() -> 'quota' ->> 'used', '2', 'two used');
insert into h (name, id) select 'c', (public.host_save_contest(null, 'Third', null, now() + interval '2 hours', now() + interval '3 hours',
  (select array_agg(qid order by n) from ids where n between 14 and 18), 'unlisted', null, null, false, 10, 15, false) ->> 'id')::uuid;
select throws_ok($$select public.host_publish_contest((select id from h where name = 'c'))$$, '54000', null, 'the free limit of 2 holds');
select lives_ok($$select public.host_unpublish_contest((select id from h where name = 'b'))$$, 'unpublishing before anyone joins gives the slot back');
select lives_ok($$select public.host_publish_contest((select id from h where name = 'c'))$$, 'and the third can go out');
select is((select count(*) from public.contests where host_id = (select id from public.profiles where handle = 'hos') and status = 'draft'), 1::bigint, 'b is a draft again');
select lives_ok($$select public.host_delete_draft((select id from h where name = 'b'))$$, 'drafts can be deleted');
select throws_ok($$select public.host_delete_draft((select id from h where name = 'c'))$$, 'P0002', null, 'a published contest cannot');

-- ---------------------------------------------------------------------------
-- Visibility: unlisted contest A (code Secret1, 3 players)
-- ---------------------------------------------------------------------------
select public.t_act('pl1');
select is(public.get_contest((select id from h where name = 'a')) ->> 'needs_code', 'true', 'anyone with the link sees that it needs a code');
select ok(public.get_contest((select id from h where name = 'a')) -> 'questions' = 'null'::jsonb, 'and no questions');
select ok(public.list_contests()::text not like '%Friday quiz%', 'an unlisted contest is never in the listing');
select is(public.join_contest((select id from h where name = 'a')) ->> 'code', 'required', 'joining without the code says so');
select is(public.join_contest((select id from h where name = 'a'), 'nope') ->> 'code', 'wrong', 'a wrong code is refused');
select is(public.join_contest((select id from h where name = 'a'), 'nope') ->> 'entered', 'false', 'without entering');
select is(public.join_contest((select id from h where name = 'a'), 'SECRET1') ->> 'entered', 'true', 'the right code is not case sensitive');
select is(public.join_contest((select id from h where name = 'a')) ->> 'entered', 'true', 'and joining again needs no code');
select public.t_act('pl2'); select public.join_contest((select id from h where name = 'a'), 'secret1');
select public.t_act('pl3'); select public.join_contest((select id from h where name = 'a'), 'secret1');
select public.t_act('pl4');
select throws_ok($$select public.join_contest((select id from h where name = 'a'), 'secret1')$$, '55000', null, 'a full contest is full (cap 3)');
select public.t_act('pl7');
select throws_ok($$select public.get_contest((select id from h where name = 'a'))$$, 'P0002', null, 'a player the host blocked finds nothing');
select throws_ok($$select public.join_contest((select id from h where name = 'a'), 'secret1')$$, 'P0002', null, 'and cannot join');
select throws_ok($$select public.get_contest_standings((select id from h where name = 'a'))$$, 'P0002', null, 'or read standings');
-- Rate limit on code guesses: 10 an hour
select public.t_act('out');
select lives_ok($$select public.join_contest((select id from h where name = 'a'), 'g' || g) from generate_series(1, 9) g$$, 'nine wrong guesses are answered');
select throws_ok($$select public.join_contest((select id from h where name = 'a'), 'g10'); select public.join_contest((select id from h where name = 'a'), 'g11')$$,
  'RL429', null, 'then the guesses are limited');

-- ---------------------------------------------------------------------------
-- Playing: the engine's rules apply unchanged
-- ---------------------------------------------------------------------------
select public.t_act('pl1');
select throws_ok($$select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 3), (select right_id from k where n = 3))$$,
  '55000', null, 'not live yet');
reset role;
select public.t_clock((select id from h where name = 'a'), interval '-10 minutes', interval '2 hours');
set local role authenticated;
select public.t_act('pl1');
select is(jsonb_array_length(public.get_contest((select id from h where name = 'a')) -> 'questions'), 6, 'live: an entrant gets the questions');
select public.t_act('pl4');
select throws_ok($$select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 3), (select right_id from k where n = 3))$$,
  'P0002', null, 'once live, answering without an entry is still refused (no side door past the code and the cap)');

select public.t_act('pl1');
select ok(not (public.get_contest((select id from h where name = 'a')) -> 'questions' -> 0 ? 'correct_option_id' and
               (public.get_contest((select id from h where name = 'a')) -> 'questions' -> 0 ->> 'correct_option_id') is not null), 'without the answer key');
select is(public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 3), (select right_id from k where n = 3), 4000) ->> 'is_correct', 'true', 'graded in SQL');
select throws_ok($$select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 3), (select wrong_id from k where n = 3), 1000)$$,
  '23505', null, 'one scoring attempt per question');
select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 4), (select right_id from k where n = 4), 4000);
select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 5), (select wrong_id from k where n = 5), 4000);
select public.t_act('pl2');
select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 3), (select right_id from k where n = 3), 9000);
select is(public.finish_contest((select id from h where name = 'a'), 'tab_hidden') ->> 'violation', 'tab_hidden', 'leaving the tab ends the attempt, as in every contest');
select throws_ok($$select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 4), (select right_id from k where n = 4), 1000)$$,
  '55000', null, 'and it cannot be resumed');
select public.t_act('out');
select throws_ok($$select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 4), (select right_id from k where n = 4), 1000)$$,
  'P0002', null, 'a stranger is refused');

-- What the host sees
select public.t_act('hos');
select is(public.get_contest((select id from h where name = 'a')) -> 'dashboard' ->> 'registrations', '3', 'the host sees registrations');
select is(public.get_contest((select id from h where name = 'a')) -> 'dashboard' ->> 'started', '2', 'and how many started');
select ok(public.get_contest((select id from h where name = 'a')) -> 'dashboard' -> 'questions' is null, 'but no per-question numbers while it runs');
select ok(public.get_contest((select id from h where name = 'a')) -> 'questions' = 'null'::jsonb, 'and no questions through the player view');
select ok(not (public.host_get_contest((select id from h where name = 'a'))::text like '%correct_option%'), 'the host view has no answer key');
select is((select count(*) from public.contest_answers), 0::bigint, 'the host cannot read answers through the table');
select is((select count(*) from public.contest_entries), 0::bigint, 'or entries');
select is((select count(*) from public.contest_items), 0::bigint, 'or the item list');
select throws_ok($$select count(*) from public.contest_access$$, '42501', null, 'or the access hash');
select throws_ok($$select public.join_contest((select id from h where name = 'a'))$$, '55000', null, 'the host cannot enter their own contest unless they play for fun');
select ok((select count(*) from public.contests where host_id is not null) >= 1, 'the host does see their own rows');
select public.t_act('pl1');
select is((select count(*) from public.contests where host_id is not null), 0::bigint, 'a player sees no hosted rows through the table');

-- ---------------------------------------------------------------------------
-- After the end: frozen, with a summary for the host
-- ---------------------------------------------------------------------------
reset role;
select public.t_clock((select id from h where name = 'a'), interval '-3 hours', interval '-1 minute');
set local role authenticated;
select public.t_act('pl3');
select throws_ok($$select public.submit_contest_answer((select id from h where name = 'a'), (select qid from ids where n = 3), (select right_id from k where n = 3), 1000)$$,
  '55000', null, 'nothing can be answered after ends_at: standings are frozen');
select is(public.get_contest_standings((select id from h where name = 'a')) ->> 'final', 'true', 'the standings say they are final');
select is(public.get_contest_standings((select id from h where name = 'a')) -> 'entries' -> 0 ->> 'handle', 'pl1', 'p1 leads on score');
select public.t_act('hos');
select is(public.get_contest((select id from h where name = 'a')) -> 'dashboard' ->> 'registrations', '3', 'the host summary has participation');
select is(jsonb_array_length(public.get_contest((select id from h where name = 'a')) -> 'dashboard' -> 'questions'), 6, 'and per-question accuracy');
select is(public.get_contest((select id from h where name = 'a')) -> 'dashboard' -> 'hardest' ->> 'accuracy', '0', 'with the hardest question named');
select ok(not (public.get_contest((select id from h where name = 'a'))::text like '%selected_option_id%'), 'but no one''s individual answers');
select is(jsonb_array_length(public.get_contest((select id from h where name = 'a')) -> 'questions'), 6, 'answers and explanations open for everyone once it ended');

-- ---------------------------------------------------------------------------
-- Leagues: a contest for members only
-- ---------------------------------------------------------------------------
select public.t_act('new');
insert into h (name, id) select 'g', (public.host_save_contest(null, 'Section B cup', null, now() + interval '2 hours', now() + interval '5 hours',
  (select array_agg(qid order by n) from ids where n between 19 and 24), 'group', (select id from h where name = 'lg'), null, false, 40, 30, true) ->> 'id')::uuid;
select lives_ok($$select public.host_publish_contest((select id from h where name = 'g'))$$, 'a league admin hosts below the general gate');
select is(public.get_contest((select id from h where name = 'g')) ->> 'host_plays', 'true', 'host plays for fun');
select public.t_act('pl1');
select is(public.get_contest((select id from h where name = 'g')) ->> 'title', 'Section B cup', 'a member can open it');
select is(jsonb_array_length(public.list_group_contests((select id from h where name = 'lg'))), 1, 'and sees it in the league');
select ok(public.list_contests()::text not like '%Section B cup%', 'it is not in the public listing');
select public.t_act('out');
select throws_ok($$select public.get_contest((select id from h where name = 'g'))$$, 'P0002', null, 'a non-member finds nothing');
select throws_ok($$select public.join_contest((select id from h where name = 'g'))$$, 'P0002', null, 'cannot join');
select throws_ok($$select public.list_group_contests((select id from h where name = 'lg'))$$, 'P0002', null, 'and cannot list the league''s contests');
select throws_ok($$select public.get_contest_standings((select id from h where name = 'g'), 50, 0, false, (select id from h where name = 'lg'))$$, 'P0002', null, 'nor filter by a league they are not in');
select public.t_act('new');
select is(public.join_contest((select id from h where name = 'g')) ->> 'entered', 'true', 'the host can enter when playing for fun');
select public.t_act('pl1'); select public.join_contest((select id from h where name = 'g'));
select public.t_act('pl2'); select public.join_contest((select id from h where name = 'g'));
reset role;
select public.t_clock((select id from h where name = 'g'), interval '-5 minutes', interval '2 hours');
set local role authenticated;
select public.t_act('new');
select ok(public.submit_contest_answer((select id from h where name = 'g'), (select qid from ids where n = 19), (select right_id from k where n = 19), 1000) ->> 'is_correct' = 'true', 'the host plays like anyone');
select public.t_act('pl1');
select public.submit_contest_answer((select id from h where name = 'g'), (select qid from ids where n = 19), (select wrong_id from k where n = 19), 1000);
select is(public.get_contest_standings((select id from h where name = 'g'), 50, 0, false, (select id from h where name = 'lg')) ->> 'total', '3', 'the league filter lists members');
select is((select x ->> 'is_host' from jsonb_array_elements(public.get_contest_standings((select id from h where name = 'g')) -> 'entries') x where x ->> 'handle' = 'new'), 'true', 'and the host is marked');

-- ---------------------------------------------------------------------------
-- Late entry window
-- ---------------------------------------------------------------------------
-- Use the pilot-plan host for the rest (a higher quota)
select public.t_act('two');
insert into h (name, id) select 'w', (public.host_save_contest(null, 'Late test', null, now() + interval '2 hours', now() + interval '3 hours',
  (select array_agg(qid order by n) from ids where n between 25 and 29), 'unlisted', null, null, false, 10, 15, false) ->> 'id')::uuid;
select lives_ok($$select public.host_publish_contest((select id from h where name = 'w'))$$, 'two (pilot plan) publishes');
reset role;
select public.t_clock((select id from h where name = 'w'), interval '-20 minutes', interval '1 hour');
set local role authenticated;
select public.t_act('pl1');
select throws_ok($$select public.join_contest((select id from h where name = 'w'))$$, '55000', null, 'entry closes 15 minutes after the start');

-- ---------------------------------------------------------------------------
-- Cancelling
-- ---------------------------------------------------------------------------
select public.t_act('two');
select throws_ok($$select public.host_save_contest(null, 'To cancel', null, now() + interval '2 hours', now() + interval '3 hours',
  (select array_agg(qid order by n) from ids where n between 25 and 29), 'unlisted', null, null, false, 10, 15, false)$$,
  '22023', null, 'questions already in another scheduled contest are refused');
select lives_ok($$select public.host_cancel_contest((select id from h where name = 'w'), 'Sorry, something came up')$$, 'the host cancels');
select is(public.get_contest((select id from h where name = 'w')) ->> 'state', 'cancelled', 'it shows as cancelled');
select public.t_act('pl2');
select throws_ok($$select public.join_contest((select id from h where name = 'w'))$$, 'P0002', null, 'and no one can join it');
reset role;
select ok(private.servable_question('30000000-0000-0000-0000-000000000025'), 'its questions are free again');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Moderation: approval, reports, strikes
-- ---------------------------------------------------------------------------
select public.t_act('two');
insert into h (name, id) select 'pub', (public.host_save_contest(null, 'Open cup', 'Public', now() + interval '2 hours', now() + interval '3 hours',
  (select array_agg(qid order by n) from ids where n between 25 and 29), 'public', null, null, false, 100, 15, false) ->> 'id')::uuid;
select lives_ok($$select public.host_publish_contest((select id from h where name = 'pub'))$$, 'a public contest is published');
select is(public.host_get_contest((select id from h where name = 'pub')) ->> 'review_state', 'pending', 'pending approval');
select public.t_act('pl1');
select ok(public.list_contests()::text not like '%Open cup%', 'not listed until approved');
select throws_ok($$select public.get_contest((select id from h where name = 'pub'))$$, 'P0002', null, 'and not reachable by link either');
select throws_ok($$select public.admin_list_hosted_contests()$$, '42501', null, 'the queue is for admins');
select throws_ok($$select public.admin_review_hosted_contest((select id from h where name = 'pub'), 'approve')$$, '42501', null, 'so is approving');
select public.t_act('adm');
select is(jsonb_array_length(public.admin_list_hosted_contests('pending') -> 'items'), 1, 'the admin sees the queue');
select is(public.admin_list_hosted_contests('pending') -> 'items' -> 0 -> 'questions' -> 0 ->> 'stem', 'Question 25', 'with the questions to review');
select throws_ok($$select public.admin_review_hosted_contest((select id from h where name = 'pub'), 'reject')$$, '22023', null, 'rejecting needs a note');
select throws_ok($$select public.admin_review_hosted_contest((select id from h where name = 'pub'), 'approve', null, true)$$, '22023', null, 'a strike goes with a rejection, not an approval');
select is(public.admin_review_hosted_contest((select id from h where name = 'pub'), 'approve') ->> 'review_state', 'approved', 'approved');
select ok(not (public.admin_list_contests()::text like '%Open cup%'), 'the official contest editor does not list hosted contests');
select public.t_act('pl1');
select ok(public.list_contests()::text like '%Open cup%', 'now it is listed');
select is(public.get_contest((select id from h where name = 'pub')) ->> 'participants', '0', 'and open');

-- Reports: 3 distinct verified reporters hide it
select public.t_act('pl1'); select public.report_contest((select id from h where name = 'pub'), 'spam');
select public.report_contest((select id from h where name = 'pub'), 'spam');
select is((select count(*) from public.contest_reports), 0::bigint, 'reports are not readable by players');
select public.t_act('pl2'); select public.report_contest((select id from h where name = 'pub'), 'offensive', 'rude');
select ok(public.list_contests()::text like '%Open cup%', 'two reports (and a repeat) do not hide it');
select public.t_act('pl3'); select public.report_contest((select id from h where name = 'pub'), 'cheating');
select ok(public.list_contests()::text not like '%Open cup%', 'the third distinct report hides it');
select throws_ok($$select public.report_contest((select id from h where name = 'pub'), 'nonsense')$$, '22023', null, 'unknown reasons are refused');
select public.t_act('two');
select throws_ok($$select public.report_contest((select id from h where name = 'pub'), 'spam')$$, 'P0002', null, 'a host cannot report their own contest');
select is(public.host_get_contest((select id from h where name = 'pub')) ->> 'hidden', 'true', 'the host sees it is hidden');
select public.t_act('adm');
select is(public.admin_list_hosted_contests('reported') -> 'items' -> 0 -> 'reports' -> 0 ->> 'count', '1', 'the admin sees the reports by reason');
select is(public.admin_review_hosted_contest((select id from h where name = 'pub'), 'unhide') ->> 'hidden', 'false', 'unhide dismisses them');
select is((select count(*) from public.contest_reports where status = 'open'), 0::bigint, 'no open reports remain');
select is(public.admin_review_hosted_contest((select id from h where name = 'pub'), 'cancel', 'Breaks the rules', true) ->> 'status', 'cancelled', 'cancelling with a strike');
select is((select count(*) from public.host_strikes), 1::bigint, 'writes a strike');
select ok((select count(*) from public.audit_log where entity_type = 'contest' and action like 'hosted_contest_%') >= 3, 'every action is in the audit log');
select public.t_act('two');
select is(public.get_host_status() ->> 'ok', 'true', 'one strike does not stop hosting');
insert into h (name, id) select 'pub2', (public.host_save_contest(null, 'Open cup 2', null, now() + interval '2 hours', now() + interval '3 hours',
  (select array_agg(qid order by n) from ids where n between 25 and 29), 'public', null, null, false, 100, 15, false) ->> 'id')::uuid;
select lives_ok($$select public.host_publish_contest((select id from h where name = 'pub2'))$$, 'publishing again');
select public.t_act('adm');
select is(public.admin_review_hosted_contest((select id from h where name = 'pub2'), 'reject', 'Not suitable', true) ->> 'review_state', 'rejected', 'rejecting with a second strike');
select public.t_act('two');
select ok((public.get_host_status() -> 'reasons') @> '["suspended"]'::jsonb, 'two strikes suspend hosting');
select throws_ok($$select public.host_save_contest(null, 'Again', null, now() + interval '2 hours', now() + interval '3 hours')$$, '42501', null, 'saving is refused');
select is(public.host_get_contest((select id from h where name = 'pub2')) ->> 'status_note', 'Not suitable', 'and the host reads the moderator''s note');

-- ---------------------------------------------------------------------------
-- XP after the end
-- ---------------------------------------------------------------------------
reset role;
-- A public approved contest, ended, five finishers (+ the host): rewards are paid once
insert into public.contests (id, slug, title, starts_at, ends_at, is_published, created_by, host_id, visibility, status, host_review_state, max_participants, published_at)
select 'c0000000-0000-0000-0000-0000000000d1', 'xp-cup-' || md5('x'), 'XP cup', now() - interval '3 hours', now() - interval '2 hours', false,
       id, id, 'public', 'scheduled', 'approved', 50, now() - interval '5 hours' from public.profiles where handle = 'two';
insert into public.contest_items (contest_id, question_id, position)
select 'c0000000-0000-0000-0000-0000000000d1', qid, n - 20 from ids where n between 20 and 24;
insert into public.contest_entries (contest_id, user_id, score, correct, answered, time_ms, last_answer_at)
select 'c0000000-0000-0000-0000-0000000000d1', p.id, case p.handle when 'pl1' then 100 when 'pl2' then 80 when 'pl3' then 60 when 'pl4' then 40 when 'pl5' then 20 else 10 end,
       3, 5, 1000, now() - interval '2 hours 10 minutes'
from public.profiles p where p.handle in ('pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'two');
select is((select is_published from public.contests where id = 'c0000000-0000-0000-0000-0000000000d1'), true, 'the engine flag follows status and approval');
select is(private.settle_hosted_contest((select c from public.contests c where id = 'c0000000-0000-0000-0000-0000000000d1')), 5, 'five players are paid');
select is((select cr.xp from public.contest_rewards cr join public.profiles p on p.id = cr.user_id where cr.contest_id = 'c0000000-0000-0000-0000-0000000000d1' and p.handle = 'pl1'), 25, 'first place: 10 + 15');
select is((select cr.xp from public.contest_rewards cr join public.profiles p on p.id = cr.user_id where cr.contest_id = 'c0000000-0000-0000-0000-0000000000d1' and p.handle = 'pl5'), 10, 'fifth place: 10');
select is((select count(*) from public.contest_rewards cr join public.profiles p on p.id = cr.user_id where cr.contest_id = 'c0000000-0000-0000-0000-0000000000d1' and p.handle = 'two'), 0::bigint, 'the host earns nothing');
select is((select sum(amount) from public.xp_events where reason = 'hosted_contest'), 80::bigint, 'and the XP is in the ledger');
select is(private.settle_hosted_contest((select c from public.contests c where id = 'c0000000-0000-0000-0000-0000000000d1')), 0, 'settling again pays nothing');
select is((select private.settle_hosted_contests() ->> 'settled'), '1', 'the job settles the other ended contest (the unlisted one, which pays nothing)');
select is((select private.settle_hosted_contests() ->> 'settled'), '0', 'and running it again does nothing');

-- Fewer than five finishers: nothing
insert into public.contests (id, slug, title, starts_at, ends_at, is_published, created_by, host_id, visibility, status, host_review_state, max_participants, published_at)
select 'c0000000-0000-0000-0000-0000000000d2', 'xp-small-' || md5('x'), 'Small cup', now() - interval '3 hours', now() - interval '2 hours', false,
       id, id, 'public', 'scheduled', 'approved', 50, now() - interval '5 hours' from public.profiles where handle = 'two';
insert into public.contest_items (contest_id, question_id, position)
select 'c0000000-0000-0000-0000-0000000000d2', qid, n - 20 from ids where n between 20 and 24;
insert into public.contest_entries (contest_id, user_id, score, correct, answered, time_ms)
select 'c0000000-0000-0000-0000-0000000000d2', p.id, 50, 3, 5, 1000 from public.profiles p where p.handle in ('pl1', 'pl2', 'pl3', 'pl4');
select is((select private.settle_hosted_contests() ->> 'settled'), '1', 'the job settles what has ended');
select is((select count(*) from public.contest_rewards where contest_id = 'c0000000-0000-0000-0000-0000000000d2'), 0::bigint, 'four finishers are not enough');

-- Unlisted contests (A, ended above) never pay, and the daily cap holds
select is((select count(*) from public.contest_rewards where contest_id = (select id from h where name = 'a')), 0::bigint, 'an unlisted contest pays no XP');
insert into public.xp_events (user_id, amount, reason, idempotency_key)
select p.id, 10, 'hosted_contest', 'cap:' || p.handle || ':' || g from public.profiles p, generate_series(1, 3) g where p.handle = 'out';
insert into public.contests (id, slug, title, starts_at, ends_at, is_published, created_by, host_id, visibility, status, host_review_state, max_participants, published_at)
select 'c0000000-0000-0000-0000-0000000000d3', 'xp-cap-' || md5('x'), 'Cap cup', now() - interval '3 hours', now() - interval '2 hours', false,
       id, id, 'public', 'scheduled', 'approved', 50, now() - interval '5 hours' from public.profiles where handle = 'hos';
insert into public.contest_items (contest_id, question_id, position)
select 'c0000000-0000-0000-0000-0000000000d3', qid, n - 20 from ids where n between 20 and 24;
insert into public.contest_entries (contest_id, user_id, score, correct, answered, time_ms)
select 'c0000000-0000-0000-0000-0000000000d3', p.id, 50 - length(p.handle), 3, 5, 1000 from public.profiles p where p.handle in ('pl1', 'pl2', 'pl3', 'pl4', 'out');
select is((select private.settle_hosted_contests() ->> 'settled'), '1', 'another contest settles');
select is((select count(*) from public.contest_rewards where contest_id = 'c0000000-0000-0000-0000-0000000000d3' and user_id = (select id from public.profiles where handle = 'out')), 0::bigint, 'a player at the daily cap earns no more');
select is((select count(*) from public.contest_rewards where contest_id = 'c0000000-0000-0000-0000-0000000000d3'), 4::bigint, 'others are paid');

-- ---------------------------------------------------------------------------
-- Official contests are unchanged
-- ---------------------------------------------------------------------------
insert into public.contests (id, slug, title, starts_at, ends_at, is_published)
values ('c0000000-0000-0000-0000-0000000000a1', 'official-d1', 'Official', now() - interval '1 hour', now() + interval '1 hour', true);
insert into public.contest_items (contest_id, question_id, position)
select 'c0000000-0000-0000-0000-0000000000a1', qid, n - 25 from ids where n between 25 and 29;
select is((select status from public.contests where id = 'c0000000-0000-0000-0000-0000000000a1'), 'scheduled', 'a published official contest is scheduled');
set local role authenticated;
select public.t_act('out');
select ok(public.list_contests()::text like '%Official%', 'official contests are listed to everyone');
select is(public.join_contest('c0000000-0000-0000-0000-0000000000a1') ->> 'entered', 'true', 'and joined as before');
select is((select count(*) from public.contests where host_id is null and is_published), 1::bigint, 'players still read official contests through the table');
select is(public.get_contest('c0000000-0000-0000-0000-0000000000a1') ->> 'hosted', 'false', 'not hosted');

select * from finish();
rollback;
