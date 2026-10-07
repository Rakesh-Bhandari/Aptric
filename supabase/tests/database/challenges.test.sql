-- Community slice 3a: 1v1 challenges (accept flow, frozen questions, server clock, results, rewards, integrity).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(138);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
--   ann challenges ben (mutual follows)   cat: a stranger   dan: blocked by ann   gus/ivy: pair limit   hal: reward cap
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata)
select ('00000000-0000-0000-0000-00000000c0' || lpad(n::text, 2, '0'))::uuid, h || '@example.com',
       jsonb_build_object('handle', h, 'timezone', 'UTC')
from (values (1, 'ann'), (2, 'ben'), (3, 'cat'), (4, 'dan'), (5, 'gus'), (6, 'ivy'), (7, 'hal'), (8, 'adm')) v(n, h);
update public.profiles set role = 'admin' where handle = 'adm';
insert into public.follows (follower_id, followee_id)
select a.id, b.id from public.profiles a, public.profiles b
where (a.handle, b.handle) in (('ann', 'ben'), ('ben', 'ann'), ('gus', 'ivy'), ('ivy', 'gus'), ('ann', 'dan'), ('dan', 'ann'), ('hal', 'ben'), ('ben', 'hal'));
insert into public.blocks (blocker_id, blocked_id) select a.id, b.id from public.profiles a, public.profiles b where a.handle = 'ann' and b.handle = 'dan';
delete from public.follows f using public.profiles a, public.profiles b
  where f.follower_id = a.id and f.followee_id = b.id and ((a.handle = 'ann' and b.handle = 'dan') or (a.handle = 'dan' and b.handle = 'ann'));

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000c1', id, 'ratios', 'Ratios' from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name)
  values ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'basics', 'Basics');
-- 14 published questions: option 0 is right, option 1 is wrong.
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '20000000-0000-0000-0000-0000000000c1',
       'Question ' || n, 'easy', 'published', md5(n::text) || md5(n::text)
from generate_series(1, 14) n;
insert into public.question_options (id, question_id, position, body)
select ('40000000-0000-0000-0000-0000000000' || lpad((n * 2 + p)::text, 2, '0'))::uuid,
       ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, p, case when p = 0 then 'right ' || n else 'wrong ' || n end
from generate_series(1, 14) n, generate_series(0, 1) p;
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('40000000-0000-0000-0000-0000000000' || lpad((n * 2)::text, 2, '0'))::uuid, 'because ' || n, 'hint ' || n
from generate_series(1, 14) n;
create temp table k as
select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid as qid,
       ('40000000-0000-0000-0000-0000000000' || lpad((n * 2)::text, 2, '0'))::uuid as right_id,
       ('40000000-0000-0000-0000-0000000000' || lpad((n * 2 + 1)::text, 2, '0'))::uuid as wrong_id
from generate_series(1, 14) n;
grant select on k to authenticated;

-- Ann's finished daily set: questions 1-5, four right and one wrong, 10 s each
insert into public.daily_sets (id, track_id, level, set_date, published_at)
  values ('d0000000-0000-0000-0000-0000000000c1', private.default_track_id(), 1, (now() at time zone 'UTC')::date, now() - interval '1 hour'),
         ('d0000000-0000-0000-0000-0000000000c2', private.default_track_id(), 1, (now() at time zone 'UTC')::date - 1, now() - interval '25 hours');
insert into public.daily_set_items (daily_set_id, question_id, position)
select 'd0000000-0000-0000-0000-0000000000c1', qid, row_number() over (order by qid) - 1 from k where qid in (select qid from k order by qid limit 5);
insert into public.daily_set_items (daily_set_id, question_id, position)
select 'd0000000-0000-0000-0000-0000000000c2', qid, row_number() over (order by qid) - 1 from k order by qid limit 5 offset 5;
insert into public.attempts (user_id, question_id, context, daily_set_id, selected_option_id, is_correct, time_ms)
select a.id, k.qid, 'daily', 'd0000000-0000-0000-0000-0000000000c1',
       case when row_number() over (order by k.qid) <= 4 then k.right_id else k.wrong_id end,
       row_number() over (order by k.qid) <= 4, 10000
from public.profiles a, (select * from k order by qid limit 5) k where a.handle = 'ann';

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('challenges', 'challenge_runs', 'challenge_answers', 'challenge_hints', 'integrity_events')),
  'RLS is on for every new table');

-- ---------------------------------------------------------------------------
-- Creating (as ann)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';

create temp table made (name text primary key, id uuid);
grant all on made to authenticated;

select throws_ok($$select public.create_challenge('nonsense')$$, '22023', null, 'unknown set kind');
select throws_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'ann')$$, '22023', null, 'you cannot challenge yourself');
select throws_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'cat')$$, '42501', null, 'only friends can be challenged by name');
select throws_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'dan')$$, 'P0002', 'user not found', 'a blocked player cannot be challenged (and looks missing)');
select throws_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c2', 'ben')$$, '55000', null, 'a daily set you did not finish cannot be used');
select throws_ok($$select public.create_challenge('daily', gen_random_uuid(), 'ben')$$, 'P0002', null, 'unknown set');
select throws_ok($$select public.create_challenge('custom_set', null, 'ben', array[(select qid from k limit 1)])$$, '22023', null, 'a custom set needs 5 to 20 questions');
select throws_ok($$select public.create_challenge('practice_topic', gen_random_uuid(), 'ben')$$, 'P0002', null, 'a topic without questions');

insert into made select 'daily', (public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'ben') ->> 'id')::uuid;
select is(public.get_challenge((select id from made where name = 'daily')) -> 'target' ->> 'score', '4', 'the target is the finished daily score');
select is(public.get_challenge((select id from made where name = 'daily')) -> 'target' ->> 'time_ms', '50000', 'and time');
select is(public.get_challenge((select id from made where name = 'daily')) ->> 'status', 'pending', 'it waits for the opponent');
select is(public.get_challenge((select id from made where name = 'daily')) ->> 'draft', 'false', 'a daily challenge is sent at once');
select is(public.get_challenge((select id from made where name = 'daily')) ->> 'role', 'challenger', 'ann is the challenger');
select isnt(public.get_challenge((select id from made where name = 'daily')) ->> 'share_token', null, 'ann can see the share token');
select throws_ok($$select question_ids from public.challenges$$, '42501', null, 'the frozen question list is not a readable column');
select throws_ok($$select share_token from public.challenges$$, '42501', null, 'nor is the token');

-- ---------------------------------------------------------------------------
-- What the opponent sees before accepting
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select is(jsonb_array_length(public.list_challenges('incoming') -> 'items'), 1, 'ben has an incoming challenge');
select is(public.list_challenges('incoming') -> 'items' -> 0 -> 'target' ->> 'score', '4', 'with the target');
select is(public.get_challenge((select id from made where name = 'daily')) ->> 'can_accept', 'true', 'he can accept');
select is(public.get_challenge((select id from made where name = 'daily')) ->> 'share_token', null, 'he does not get the token');
select is(public.get_challenge((select id from made where name = 'daily')) -> 'review', 'null'::jsonb, 'no questions, no key');
select ok(position('options' in public.get_challenge((select id from made where name = 'daily'))::text) = 0, 'no question content at all');
select throws_ok($$select public.get_challenge_run((select id from made where name = 'daily'))$$, 'P0002', null, 'the questions are served only after accepting');
select throws_ok($$select public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from k limit 1), (select right_id from k limit 1))$$, 'P0002', null, 'and nothing can be answered before');
select is((select count(*)::int from public.challenge_runs), 0, 'no run exists yet');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
select throws_ok($$select public.get_challenge((select id from made where name = 'daily'))$$, 'P0002', null, 'a stranger cannot open it by id');
select throws_ok($$select public.accept_challenge((select id from made where name = 'daily'))$$, 'P0002', null, 'or accept it');
select throws_ok($$select public.get_challenge(null, (select 'zzzzzzzzzzzzzzzz'))$$, 'P0002', null, 'a wrong token finds nothing');

-- ---------------------------------------------------------------------------
-- Accepting starts the clock and hands over the questions
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
create temp table run1 as select public.accept_challenge((select id from made where name = 'daily')) as j;
grant select on run1 to authenticated;
select is(jsonb_array_length((select j from run1) -> 'questions'), 5, 'accepting returns the five questions');
select ok(not exists (select 1 from jsonb_array_elements((select j from run1) -> 'questions') q where q ? 'correct_option_id' and q -> 'correct_option_id' <> 'null'::jsonb),
  'without the answer key');
select ok(not exists (select 1 from jsonb_array_elements((select j from run1) -> 'questions') q where q ? 'explanation' and q -> 'explanation' <> 'null'::jsonb),
  'or explanations');
select is((select j from run1) -> 'challenge' ->> 'status', 'accepted', 'the challenge is accepted');
select is((select (r ->> 'deadline_at')::timestamptz > now() from (select (select j from run1) -> 'run' as r) x), true, 'with a server deadline');
select is((select array_agg(q ->> 'id' order by (q ->> 'position')::int) from jsonb_array_elements((select j from run1) -> 'questions') q),
          (select array_agg(i.question_id::text order by i.position) from public.daily_set_items i where i.daily_set_id = 'd0000000-0000-0000-0000-0000000000c1')::text[],
          'the same questions, in the same order, as ann played');
select is(public.accept_challenge((select id from made where name = 'daily')) -> 'challenge' ->> 'status', 'accepted', 'accepting again just reopens the run');
select is((select count(*)::int from public.challenge_runs where user_id = '00000000-0000-0000-0000-00000000c002'), 1, 'still one run');
select is(public.get_challenge_run((select id from made where name = 'daily')) -> 'run' ->> 'started_at', (select j from run1) -> 'run' ->> 'started_at',
  'and the clock did not restart');

-- ---------------------------------------------------------------------------
-- Playing: graded in SQL, one attempt per question, the server's time
-- ---------------------------------------------------------------------------
create temp table order_ as select i.question_id as qid, i.position from public.daily_set_items i where i.daily_set_id = 'd0000000-0000-0000-0000-0000000000c1';
grant select on order_ to authenticated;
select throws_ok($$select public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from k where qid not in (select qid from order_) limit 1), (select right_id from k limit 1))$$,
  '42501', null, 'a question outside the challenge is refused');
select throws_ok($$select public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 0), (select right_id from k where qid not in (select qid from order_ where position = 0) limit 1))$$,
  '22023', null, 'an option of another question is refused');
select is(public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 0), (select right_id from k where qid = (select qid from order_ where position = 0))) ->> 'is_correct', 'true', 'a right answer is graded right');
select throws_ok($$select public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 0), (select right_id from k where qid = (select qid from order_ where position = 0)))$$,
  '23505', null, 'one scoring attempt per question');
select is(public.challenge_hint((select id from made where name = 'daily'), (select qid from order_ where position = 1)) ->> 'hint' like 'hint %', true, 'a hint is available before answering');
select throws_ok($$select public.challenge_hint((select id from made where name = 'daily'), (select qid from order_ where position = 0))$$, '55000', null, 'but not after answering');
select is(public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 1), (select wrong_id from k where qid = (select qid from order_ where position = 1))) ->> 'is_correct', 'false', 'a wrong answer is graded wrong');
select is((select used_hint from public.challenge_answers where question_id = (select qid from order_ where position = 1)), true, 'and remembers the hint');
select is((select count(*)::int from public.challenge_answers), 2, 'ben sees his own answers');
select ok(not (public.get_challenge_run((select id from made where name = 'daily')) -> 'questions' -> 0 ? 'explanation' and public.get_challenge_run((select id from made where name = 'daily')) -> 'questions' -> 0 -> 'explanation' <> 'null'::jsonb),
  'the explanation stays hidden while he is still playing');
select lives_ok($$select public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 2), (select right_id from k where qid = (select qid from order_ where position = 2)))$$, 'third answer');
select lives_ok($$select public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 3), (select right_id from k where qid = (select qid from order_ where position = 3)))$$, 'fourth answer');
select is(public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 4), (select wrong_id from k where qid = (select qid from order_ where position = 4))) ->> 'finished', 'true', 'the last answer closes the run');
select is(public.get_challenge((select id from made where name = 'daily')) ->> 'status', 'completed', 'and completes the challenge');
select is(public.get_challenge((select id from made where name = 'daily')) -> 'result' ->> 'winner', 'challenger', 'ann (4) beat ben (3)');
select is(public.get_challenge((select id from made where name = 'daily')) -> 'result' -> 'opponent' ->> 'score', '3', 'with ben''s score');
select is(public.get_challenge((select id from made where name = 'daily')) -> 'result' -> 'opponent' ->> 'hints', '1', 'and his hint');
select is(jsonb_array_length(public.get_challenge((select id from made where name = 'daily')) -> 'review'), 5, 'now he can review the questions');
select is(public.get_challenge((select id from made where name = 'daily')) -> 'review' -> 0 ->> 'explanation', 'because ' || (select (regexp_match(stem, '\d+'))[1] from public.questions where id = (select qid from order_ where position = 0)),
  'with the key and explanation');
select throws_ok($$select public.submit_challenge_answer((select id from made where name = 'daily'), (select qid from order_ where position = 0), (select wrong_id from k limit 1))$$, '55000', null, 'a finished run takes no more answers');
select throws_ok($$select public.accept_challenge((select id from made where name = 'daily'))$$, '55000', null, 'a finished challenge cannot be accepted again');

-- Rewards
reset role;
select is((select count(*)::int from public.xp_events where reason = 'challenge_play'), 2, 'both players got participation XP');
select is((select count(*)::int from public.xp_events where reason = 'challenge_win' and user_id = '00000000-0000-0000-0000-00000000c001'), 1, 'the winner got the bonus');
select is((select sum(amount)::int from public.xp_events where reason in ('challenge_play', 'challenge_win') and user_id = '00000000-0000-0000-0000-00000000c001'), 15, 'which is 5 + 10');
select is((select sum(amount)::int from public.xp_events where reason in ('challenge_play', 'challenge_win') and user_id = '00000000-0000-0000-0000-00000000c002'), 5, 'and the loser only 5');
select is((select count(*)::int from public.friend_events where kind = 'challenge_won' and user_id = '00000000-0000-0000-0000-00000000c001'), 1, 'the win is in the friends feed');
select is((select rating from public.profiles where handle = 'ann'), 1200, 'no rating change');

-- ---------------------------------------------------------------------------
-- Result rules
-- ---------------------------------------------------------------------------
insert into public.challenges (id, challenger_id, opponent_id, set_kind, question_ids, share_token, challenger_score, challenger_time_ms, challenger_hints,
                               opponent_score, opponent_time_ms, opponent_hints)
select ('e0000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002', 'custom_set',
       (select array_agg(qid) from (select qid from k limit 5) z), 'tokentokentoken' || n, a, ta, ha, b, tb, hb
from (values (1, 8, 100000, 0, 7, 50000, 0), (2, 7, 100000, 0, 7, 120000, 0), (3, 7, 100000, 2, 7, 100000, 1), (4, 7, 100000, 1, 7, 100000, 1), (5, 6, 1, 0, 7, 999999, 5))
     v(n, a, ta, ha, b, tb, hb);
select is((select winner from private.challenge_outcome((select c from public.challenges c where id = 'e0000000-0000-0000-0000-000000000001'))),
          '00000000-0000-0000-0000-00000000c001'::uuid, 'more correct wins, whatever the time');
select is((select winner from private.challenge_outcome((select c from public.challenges c where id = 'e0000000-0000-0000-0000-000000000002'))),
          '00000000-0000-0000-0000-00000000c001'::uuid, 'equal score: less time wins');
select is((select winner from private.challenge_outcome((select c from public.challenges c where id = 'e0000000-0000-0000-0000-000000000003'))),
          '00000000-0000-0000-0000-00000000c002'::uuid, 'equal score and time: fewer hints wins');
select is((select draw from private.challenge_outcome((select c from public.challenges c where id = 'e0000000-0000-0000-0000-000000000004'))), true, 'all equal is a draw');
select is((select winner from private.challenge_outcome((select c from public.challenges c where id = 'e0000000-0000-0000-0000-000000000005'))),
          '00000000-0000-0000-0000-00000000c002'::uuid, 'a bigger score beats a faster, smaller one');
delete from public.challenges where id::text like 'e0000000-%';

-- ---------------------------------------------------------------------------
-- A draft: the challenger plays first, then it is sent
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
insert into made select 'topic', (public.create_challenge('practice_topic', '10000000-0000-0000-0000-0000000000c1', 'ben') ->> 'id')::uuid;
select is(public.get_challenge((select id from made where name = 'topic')) ->> 'draft', 'true', 'a topic challenge starts as a draft');
select is(public.get_challenge((select id from made where name = 'topic')) -> 'target', 'null'::jsonb, 'with no target yet');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select is(jsonb_array_length(public.list_challenges('incoming') -> 'items'), 0, 'the opponent does not see a draft');
select throws_ok($$select public.get_challenge((select id from made where name = 'topic'))$$, 'P0002', null, 'or open it');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select is(jsonb_array_length(public.start_challenge_run((select id from made where name = 'topic')) -> 'questions'), 10, 'ann plays ten questions');
select throws_ok($$select public.accept_challenge((select id from made where name = 'topic'))$$, 'P0002', null, 'nobody can accept before it is sent');
create temp table draft_q (qid uuid, i bigint);
reset role;
insert into draft_q select t.q, t.i from public.challenges c, unnest(c.question_ids) with ordinality t(q, i) where c.id = (select id from made where name = 'topic');
grant select on draft_q to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select lives_ok($q$do $b$ declare r record; begin
  for r in select d.qid, d.i, k.right_id from draft_q d join k on k.qid = d.qid order by d.i loop
    perform public.submit_challenge_answer((select id from made where name = 'topic'), r.qid, r.right_id);
  end loop; end $b$$q$, 'ann answers all ten');
select is(public.get_challenge((select id from made where name = 'topic')) -> 'target' ->> 'score', '10', 'her score is locked in');
select is(public.get_challenge((select id from made where name = 'topic')) ->> 'draft', 'false', 'and it is sent');
select isnt(public.get_challenge((select id from made where name = 'topic')) ->> 'accept_by', null, 'with an accept-by time');
select is((select (c ->> 'accept_by')::timestamptz - (c ->> 'sent_at')::timestamptz from (select public.get_challenge((select id from made where name = 'topic')) as c) x),
          interval '48 hours', 'two days from sending');
select throws_ok($$select public.start_challenge_run((select id from made where name = 'topic'))$$, '55000', null, 'she cannot play it twice');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select is(jsonb_array_length(public.list_challenges('incoming') -> 'items'), 1, 'now ben sees it');

-- Decline, cancel
select is(public.decline_challenge((select id from made where name = 'topic')) ->> 'status', 'declined', 'ben declines');
select throws_ok($$select public.accept_challenge((select id from made where name = 'topic'))$$, '55000', null, 'a declined challenge cannot be accepted');
select is(jsonb_array_length(public.list_challenges('completed') -> 'items'), 2, 'both finished ones are in Completed');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
select throws_ok($$select public.decline_challenge((select id from made where name = 'topic'))$$, 'P0002', null, 'a stranger cannot decline it');

-- ---------------------------------------------------------------------------
-- The share link (no named opponent)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
reset role;
insert into public.attempts (user_id, question_id, context, daily_set_id, selected_option_id, is_correct, time_ms)
select a.id, k.qid, 'daily', 'd0000000-0000-0000-0000-0000000000c2', k.right_id, true, 5000
from public.profiles a, (select * from k order by qid limit 5 offset 5) k where a.handle = 'ann';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
insert into made select 'link', (public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c2') ->> 'id')::uuid;
create temp table tok as select public.get_challenge((select id from made where name = 'link')) ->> 'share_token' as t;
grant select on tok to authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
select is(public.get_challenge(null, (select t from tok)) -> 'target' ->> 'score', '5', 'anyone with the link sees the target');
select is(public.get_challenge(null, (select t from tok)) ->> 'role', 'viewer', 'as a viewer');
select ok(position('options' in public.get_challenge(null, (select t from tok))::text) = 0, 'and nothing else');
select is(public.accept_challenge(null, (select t from tok)) -> 'challenge' ->> 'role', 'opponent', 'cat accepts through the link');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select throws_ok($$select public.accept_challenge(null, (select t from tok))$$, 'P0002', null, 'a second person cannot take the same link challenge');
select throws_ok($$select public.get_challenge(null, (select t from tok))$$, 'P0002', null, 'or even open it');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c004","role":"authenticated"}';
select throws_ok($$select public.accept_challenge(null, (select t from tok))$$, 'P0002', null, 'a blocked player cannot use ann''s link');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select throws_ok($$select public.cancel_challenge((select id from made where name = 'link'))$$, '55000', null, 'the challenger cannot cancel after it was accepted');
select throws_ok($$select public.accept_challenge(null, (select t from tok))$$, 'P0002', null, 'and cannot accept her own');

-- One run at a time: cat leaves the first unfinished and cannot start another
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
-- (ann -> cat is not a friend challenge; use the link flow with a second challenge)
reset role;
insert into public.attempts (user_id, question_id, context, daily_set_id, selected_option_id, is_correct, time_ms)
select a.id, k.qid, 'daily', 'd0000000-0000-0000-0000-0000000000c2', k.right_id, true, 5000
from public.profiles a, (select * from k order by qid limit 5 offset 5) k where a.handle = 'ben' on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
insert into made select 'link2', (public.create_challenge('custom_set', null, null, (select array_agg(qid) from (select qid from k limit 5) z)) ->> 'id')::uuid;
select is(jsonb_array_length(public.start_challenge_run((select id from made where name = 'link2')) -> 'questions'), 5, 'a custom set of five');

-- ---------------------------------------------------------------------------
-- Expiry and the clock
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
reset role;
-- cat's run on the link challenge runs out of time with three answers in
insert into public.challenge_answers (challenge_id, user_id, question_id, selected_option_id, is_correct, time_ms)
select (select id from made where name = 'link'), '00000000-0000-0000-0000-00000000c003', k.qid, k.right_id, true, 1000
from (select * from k order by qid limit 3 offset 5) k;
update public.challenge_runs set started_at = now() - interval '2 hours', deadline_at = now() - interval '1 hour'
  where challenge_id = (select id from made where name = 'link') and user_id = '00000000-0000-0000-0000-00000000c003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
select is(public.get_challenge((select id from made where name = 'link')) ->> 'status', 'completed', 'a run that is out of time is closed with what was answered');
select is(public.get_challenge((select id from made where name = 'link')) -> 'result' -> 'opponent' ->> 'score', '3', 'three right answers count');
select is((select violation from public.challenge_runs where user_id = '00000000-0000-0000-0000-00000000c003'), 'time_up', 'marked as out of time');
select throws_ok($$select public.submit_challenge_answer((select id from made where name = 'link'), (select qid from k offset 9 limit 1), (select right_id from k offset 9 limit 1))$$, '55000', null, 'no answers after the deadline');

-- An unanswered challenge expires after 48 hours
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
insert into made select 'stale', (public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1') ->> 'id')::uuid;
reset role;
update public.challenges set accept_by = now() - interval '1 second' where id = (select id from made where name = 'stale');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
select throws_ok($$select public.accept_challenge((select id from made where name = 'stale'))$$, 'P0002', null, 'a named challenge is only for its opponent');
select throws_ok($$select public.accept_challenge(null, (select share_token from (select 'x'::text as share_token) z))$$, 'P0002', null, 'a bad token');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select is(public.get_challenge((select id from made where name = 'stale')) ->> 'status', 'expired', 'past accept_by it is expired');
reset role;
create temp table tok2 as select share_token as t from public.challenges where id = (select id from made where name = 'stale');
grant select on tok2 to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select throws_ok($$select public.accept_challenge(null, (select t from tok2))$$, '55000', null, 'and cannot be accepted after expiry');

-- ben accepts a fresh one but never finishes: complete_by closes it
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
insert into made select 'idle', (public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'ben') ->> 'id')::uuid;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select lives_ok($$select public.accept_challenge((select id from made where name = 'idle'))$$, 'ben accepts');
select is((select (c ->> 'complete_by')::timestamptz - (c ->> 'accepted_at')::timestamptz from (select public.get_challenge((select id from made where name = 'idle')) as c) x),
          interval '24 hours', 'he has 24 hours (complete_by)');
select throws_ok($$select public.accept_challenge((select id from made where name = 'link2'))$$, 'P0002', null, 'nothing else to accept');
select is(public.finish_challenge_run((select id from made where name = 'idle'), 'tab_hidden') ->> 'status', 'completed', 'leaving the page ends the attempt');
select is((select violation from public.challenge_runs where challenge_id = (select id from made where name = 'idle') and user_id = '00000000-0000-0000-0000-00000000c002'), 'tab_hidden', 'and says why');
select is(public.get_challenge((select id from made where name = 'idle')) -> 'result' -> 'opponent' ->> 'score', '0', 'with nothing answered');
select throws_ok($$select public.finish_challenge_run((select id from made where name = 'idle'), 'sleeping')$$, '22023', null, 'unknown violations are refused');

-- ---------------------------------------------------------------------------
-- Same pair: 3 a day
-- ---------------------------------------------------------------------------
reset role;
insert into public.attempts (user_id, question_id, context, daily_set_id, selected_option_id, is_correct, time_ms)
select a.id, k.qid, 'daily', 'd0000000-0000-0000-0000-0000000000c1', k.right_id, true, 5000
from public.profiles a, (select * from k order by qid limit 5) k where a.handle = 'gus';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated"}';
select lives_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'ivy')$$, 'first');
select lives_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'ivy')$$, 'second');
select lives_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'ivy')$$, 'third');
select throws_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'ivy')$$, '54000', null, 'the fourth in a day is refused');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c006","role":"authenticated"}';
reset role;
insert into public.attempts (user_id, question_id, context, daily_set_id, selected_option_id, is_correct, time_ms)
select a.id, k.qid, 'daily', 'd0000000-0000-0000-0000-0000000000c1', k.right_id, true, 5000
from public.profiles a, (select * from k order by qid limit 5) k where a.handle = 'ivy';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c006","role":"authenticated"}';
select throws_ok($$select public.create_challenge('daily', 'd0000000-0000-0000-0000-0000000000c1', 'gus')$$, '54000', null, 'in either direction');

-- ---------------------------------------------------------------------------
-- Rematch
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select throws_ok($$select public.request_rematch((select id from made where name = 'topic'))$$, 'P0002', null, 'only a completed challenge can have a rematch');
select throws_ok($$select public.request_rematch((select id from made where name = 'daily'))$$, '54000', null, 'ben and ann already used their three today');
reset role;
update public.challenges set created_at = now() - interval '2 days' where challenger_id = '00000000-0000-0000-0000-00000000c001' and opponent_id = '00000000-0000-0000-0000-00000000c002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
insert into made select 'rematch', (public.request_rematch((select id from made where name = 'daily')) ->> 'id')::uuid;
select is(public.get_challenge((select id from made where name = 'rematch')) ->> 'role', 'challenger', 'the one who asks plays first');
select is(public.get_challenge((select id from made where name = 'rematch')) ->> 'draft', 'true', 'as a draft');
select is(public.get_challenge((select id from made where name = 'rematch')) -> 'opponent' ->> 'handle', 'ann', 'against the same person');
select is((select rematch_of from public.challenges where id = (select id from made where name = 'rematch')), (select id from made where name = 'daily'), 'linked to the original');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
select throws_ok($$select public.request_rematch((select id from made where name = 'daily'))$$, 'P0002', null, 'a stranger cannot ask for a rematch');

-- ---------------------------------------------------------------------------
-- Rewards: at most 5 rewarded challenges a day; flagged results earn nothing
-- ---------------------------------------------------------------------------
reset role;
insert into public.challenges (id, challenger_id, opponent_id, set_kind, question_ids, share_token, status, challenger_score, challenger_time_ms,
                               opponent_score, opponent_time_ms, winner_id, accepted_at, completed_at, sent_at, challenger_locked_at)
select ('f0000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-00000000c007', '00000000-0000-0000-0000-00000000c002', 'custom_set',
       (select array_agg(qid) from (select qid from k limit 5) z), 'rewardtoken0000' || n, 'completed', 5, 1000 * n, 3, 9000,
       '00000000-0000-0000-0000-00000000c007', now(), now(), now(), now()
from generate_series(1, 7) n;
select lives_ok($$select private.reward_challenge(c) from public.challenges c where c.id::text like 'f0000000-%' order by c.id$$, 'seven challenges are rewarded in a row');
select is((select count(*)::int from public.xp_events where user_id = '00000000-0000-0000-0000-00000000c007' and reason = 'challenge_play'), 5, 'but hal is paid for five');
select is((select count(*)::int from public.xp_events where user_id = '00000000-0000-0000-0000-00000000c007' and reason = 'challenge_win'), 5, 'and five bonuses');
select lives_ok($$select private.reward_challenge(c) from public.challenges c where c.id::text like 'f0000000-%' order by c.id$$, 'doing it again changes nothing');
select is((select count(*)::int from public.xp_events where user_id = '00000000-0000-0000-0000-00000000c007' and reason like 'challenge_%'), 10, 'it is idempotent');

-- Integrity: identical results and a third challenge between the same pair in a day are flagged and unpaid
insert into public.challenges (id, challenger_id, opponent_id, set_kind, question_ids, share_token, status, challenger_score, challenger_time_ms, challenger_hints,
                               opponent_score, opponent_time_ms, opponent_hints, winner_id, is_draw, accepted_at, completed_at, sent_at, challenger_locked_at)
values ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000c005', '00000000-0000-0000-0000-00000000c006', 'custom_set',
        (select array_agg(qid) from (select qid from k limit 5) z), 'identicaltoken01', 'completed', 4, 30000, 0, 4, 30100, 0, '00000000-0000-0000-0000-00000000c005', false, now(), now(), now(), now());
select lives_ok($$select private.check_challenge_integrity(c) from public.challenges c where c.id = 'f1000000-0000-0000-0000-000000000001'$$, 'integrity check runs');
select is((select kind from public.integrity_events where ref_id = 'f1000000-0000-0000-0000-000000000001'), 'challenge_identical_result', 'identical scores with near-identical times are flagged');
select lives_ok($$select private.reward_challenge(c) from public.challenges c where c.id = 'f1000000-0000-0000-0000-000000000001'$$, 'reward runs');
select is((select count(*)::int from public.xp_events where reason like 'challenge_%' and user_id in ('00000000-0000-0000-0000-00000000c005', '00000000-0000-0000-0000-00000000c006')), 0, 'a flagged result earns no XP');

-- RLS
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
select is((select count(*)::int from public.integrity_events), 0, 'players cannot read integrity events');
select is((select count(*)::int from public.challenge_answers where user_id <> auth.uid()), 0, 'or other players'' answers');
select throws_ok($$insert into public.challenges (challenger_id, set_kind, question_ids, share_token) values (auth.uid(), 'custom_set', array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()], 'abcdefghjkmnpqrs')$$, '42501', null, 'challenges cannot be written directly');
select throws_ok($$update public.challenges set status = 'completed'$$, '42501', null, 'or edited');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c008","role":"authenticated"}';
select cmp_ok((select count(*)::int from public.integrity_events), '>=', 1, 'admins can');

select * from finish();
rollback;
