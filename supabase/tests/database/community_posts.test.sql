-- Community slice 2: 48-hour posts, replies, reactions, polls, reports, moderation, cleanup.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(158);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
--   ann: poster       vic: verified email   ben: second poster   cat, eve, gus: reporters / repliers
--   dan: blocks ann   adm: admin            kid: account under 24 hours old
--   nod: no daily set sam: three removals   ivy: plan limit test
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata)
select ('00000000-0000-0000-0000-00000000b0' || lpad(n::text, 2, '0'))::uuid, h || '@example.com',
       jsonb_build_object('handle', h, 'timezone', 'UTC')
from (values (1, 'ann'), (2, 'vic'), (3, 'ben'), (4, 'cat'), (5, 'dan'), (6, 'eve'), (7, 'adm'), (8, 'kid'),
             (9, 'nod'), (10, 'sam'), (11, 'gus'), (12, 'ivy')) v(n, h);
update private.accounts set email_verified_at = now() where email = 'vic@example.com';
update public.profiles set role = 'admin' where handle = 'adm';
update public.profiles set created_at = now() - interval '3 days' where handle <> 'kid';
insert into public.xp_events (user_id, amount, reason, idempotency_key)
select id, 10, 'daily_complete', 'test:daily:' || handle from public.profiles where handle not in ('kid', 'nod');

insert into public.topics (id, section_id, slug, name)
  select '10000000-0000-0000-0000-0000000000a1', id, 'speed', 'Speed' from public.sections where slug = 'quantitative-aptitude';
insert into public.subtopics (id, topic_id, slug, name)
  values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'trains', 'Trains');
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'A train 240 m long passes a pole in 12 s. Speed?', 'easy', 'published', repeat('a', 64)),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1', 'A contest question', 'easy', 'published', repeat('b', 64)),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a1', 'A draft question', 'easy', 'draft', repeat('c', 64));
insert into public.question_options (id, question_id, position, body) values
  ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 0, '36'),
  ('40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a1', 1, 'seventy two'),
  ('40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a2', 0, '5'),
  ('40000000-0000-0000-0000-0000000000a4', '30000000-0000-0000-0000-0000000000a2', 1, '10'),
  ('40000000-0000-0000-0000-0000000000a5', '30000000-0000-0000-0000-0000000000a3', 0, 'x');
insert into public.question_answers (question_id, correct_option_id, explanation) values
  ('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a2', '240/12 = 20 m/s = 72 km/h'),
  ('30000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-0000000000a4', 'ten');
insert into public.contests (id, slug, title, starts_at, ends_at, is_published)
  values ('c0000000-0000-0000-0000-0000000000a1', 'live-now', 'Live now', now() - interval '1 hour', now() + interval '1 hour', true);
insert into public.contest_items (contest_id, question_id, position)
  values ('c0000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a2', 0);

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('posts', 'post_replies', 'post_reactions', 'poll_votes', 'post_reports',
     'moderation_snapshots', 'mutes', 'community_banned_words')),
  'RLS is on for every new table');

-- ---------------------------------------------------------------------------
-- Posting rules (as ann)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';

select throws_ok($$insert into public.posts (author_id, kind, body) values (auth.uid(), 'tip', 'x')$$, '42501', null,
  'posts cannot be written directly');
select throws_ok($$update public.posts set status = 'visible'$$, '42501', null, 'or updated directly');

create temp table made (name text primary key, id uuid);
grant all on made to authenticated;

insert into made select 'tip', (public.create_post('tip', 'Convert km/h to m/s by multiplying by 5/18.', null, '10000000-0000-0000-0000-0000000000a1') -> 'post' ->> 'id')::uuid;
select is((select p ->> 'kind' from (select public.get_post((select id from made where name = 'tip')) -> 'post' as p) x), 'tip', 'a player who finished a daily set can post');
select is((select (p ->> 'expires_at')::timestamptz - (p ->> 'created_at')::timestamptz
           from (select public.get_post((select id from made where name = 'tip')) -> 'post' as p) x),
          interval '48 hours', 'a post lives exactly 48 hours');
select is((select p ->> 'is_mine' from (select public.get_post((select id from made where name = 'tip')) -> 'post' as p) x), 'true', 'the author knows it is theirs');
select is(public.get_post((select id from made where name = 'tip')) -> 'post' -> 'topic' ->> 'name', 'Speed', 'topic is attached');

select throws_ok($$select public.create_post('tip', '')$$, '22023', null, 'empty body');
select throws_ok($$select public.create_post('tip', repeat('x', 501))$$, '22023', null, 'body over 500 characters');
select lives_ok($$select public.create_post('tip', repeat('y', 500))$$, 'exactly 500 characters is fine');
select throws_ok($$select public.create_post('tip', 'Look <script>alert(1)</script>')$$, '22023', null, 'raw HTML');
select throws_ok($$select public.create_post('tip', 'Look ![x](https://e.com/a.png)')$$, '22023', null, 'images');
select throws_ok($$select public.create_post('tip', 'Please WhatsApp me for details')$$, '22023', null, 'banned phrases, any case');
select throws_ok($$select public.create_post('tip', 'Notes at www.example.com')$$, '22023', null, 'links from players without a verified email');
select throws_ok($$select public.create_post('tip', 'Notes at example.com/notes')$$, '22023', null, 'bare domains too');
select lives_ok($$select public.create_post('tip', 'Remember the formula x.in the middle: $a<b$ is fine')$$, 'maths and "x.in" are not links');
select throws_ok($$select public.create_post('nonsense', 'hi')$$, '22023', null, 'unknown kind');
select throws_ok($$select public.create_post('study_buddy', 'Anyone prepping?')$$, '22023', null, 'a study buddy post needs an exam');
select throws_ok($$select public.create_post('tip', 'hi', null, null, 'not-an-exam')$$, '22023', null, 'unknown exam');
select throws_ok($$select public.create_post('tip', 'hi', null, gen_random_uuid())$$, '22023', null, 'unknown topic');
select throws_ok($$select public.create_post('tip', 'hi', null, null, null, false, array['a', 'b'])$$, '22023', null, 'only polls have options');
select throws_ok($$select public.create_post('poll', 'Which?', null, null, null, false, array['only one'])$$, '22023', null, 'a poll needs two options');
select throws_ok($$select public.create_post('question', 'Why?', '30000000-0000-0000-0000-0000000000a3')$$, 'P0002', null, 'draft questions cannot be linked');

-- Verified players may post links
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}';
select lives_ok($$select public.create_post('tip', 'Great notes at https://example.com/notes')$$, 'a verified email may post a link');

-- Gates
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b008","role":"authenticated"}';
select throws_ok($$select public.create_post('tip', 'hello')$$, '55000', null, 'an account under 24 hours old cannot post');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b009","role":"authenticated"}';
select throws_ok($$select public.create_post('tip', 'hello')$$, '55000', null, 'nor can a player with no completed daily set');

-- ---------------------------------------------------------------------------
-- Spoiler safety
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
select throws_ok($$select public.create_post('question', 'The answer is C, easy', '30000000-0000-0000-0000-0000000000a1')$$, 'SP422', null,
  'an answer cue needs the spoiler tick');
select throws_ok($$select public.create_post('question', 'I think it is option B', '30000000-0000-0000-0000-0000000000a1')$$, 'SP422', null,
  'so do option letters');
select throws_ok($$select public.create_post('question', 'Pretty sure it comes to Seventy Two km/h', '30000000-0000-0000-0000-0000000000a1')$$, 'SP422', null,
  'and the text of the correct option');
select lives_ok($$select public.create_post('question', 'Stuck on the units here, any hint?', '30000000-0000-0000-0000-0000000000a1')$$,
  'a plain question about it is fine');
insert into made select 'spoiler', (public.create_post('win', 'Got it: the answer is C!', '30000000-0000-0000-0000-0000000000a1', null, null, true) -> 'post' ->> 'id')::uuid;
select is(public.get_post((select id from made where name = 'spoiler')) -> 'post' ->> 'body', 'Got it: the answer is C!', 'the author sees their spoiler');
select throws_ok($$select public.create_post('question', 'Why?', '30000000-0000-0000-0000-0000000000a2')$$, '55000', null,
  'a question in a live contest cannot be linked');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(public.get_post((select id from made where name = 'spoiler')) -> 'post' ->> 'spoiler_locked', 'true', 'someone who has not attempted the question is locked out');
select is(public.get_post((select id from made where name = 'spoiler')) -> 'post' ->> 'body', null, '... and does not receive the text');
select ok(position('options' in (public.get_post((select id from made where name = 'spoiler')) -> 'post' -> 'question')::text) = 0
          and position('correct' in (public.get_post((select id from made where name = 'spoiler')) -> 'post' -> 'question')::text) = 0,
  'the linked question carries a stem only, never options or the key');
select ok(position('Got it' in public.get_feed()::text) = 0, 'the feed does not carry it either');
reset role;
insert into public.attempts (user_id, question_id, context, selected_option_id, is_correct)
  values ('00000000-0000-0000-0000-00000000b003', '30000000-0000-0000-0000-0000000000a1', 'practice', '40000000-0000-0000-0000-0000000000a1', false);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(public.get_post((select id from made where name = 'spoiler')) -> 'post' ->> 'body', 'Got it: the answer is C!', 'after attempting it the text is readable');

-- ---------------------------------------------------------------------------
-- Daily limit from the plan (ivy): 2 a day once plans.limits says so
-- ---------------------------------------------------------------------------
reset role;
update public.plans set limits = limits || '{"posts_per_day": 2}' where id = 'free';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b012","role":"authenticated"}';
select lives_ok($$select public.create_post('tip', 'one')$$, 'first post');
select lives_ok($$select public.create_post('tip', 'two')$$, 'second post');
select throws_ok($$select public.create_post('tip', 'three')$$, 'RL429', null, 'the plan limit applies without a deploy');
reset role;
update public.plans set limits = limits - 'posts_per_day' where id = 'free';

-- The default is 5 a day (vic has posted 1)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}';
select lives_ok($q$do $b$ begin for i in 1..4 loop perform public.create_post('tip', 'post ' || i); end loop; end $b$$q$, 'five posts a day by default');
select throws_ok($$select public.create_post('tip', 'one too many')$$, 'RL429', null, 'the sixth is refused');

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b008","role":"authenticated"}';
select lives_ok($$select public.create_reply((select id from made where name = 'tip'), 'Thanks, useful!')$$, 'a new account can reply');
insert into made select 'reply', (public.get_replies((select id from made where name = 'tip')) -> 'items' -> 0 ->> 'id')::uuid;
select is(public.get_replies((select id from made where name = 'tip')) -> 'items' -> 0 ->> 'expires_at',
          public.get_post((select id from made where name = 'tip')) -> 'post' ->> 'expires_at', 'a reply expires with its parent');
select is((public.get_post((select id from made where name = 'tip')) -> 'post' ->> 'reply_count')::int, 1, 'the count follows');
select throws_ok($$select public.create_reply((select id from made where name = 'tip'), repeat('z', 281))$$, '22023', null, 'replies are 280 characters at most');
select throws_ok($$select public.create_reply((select id from made where name = 'spoiler'), 'It is option B')$$, 'SP422', null, 'a reply may not give away the answer');
select throws_ok($$select public.create_reply(gen_random_uuid(), 'hi')$$, 'P0002', null, 'replying to nothing');
select throws_ok($$select public.delete_reply(gen_random_uuid())$$, 'P0002', null, 'deleting an unknown reply');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select throws_ok($$select public.delete_reply((select id from made where name = 'reply'))$$, 'P0002', null, 'someone else cannot delete it');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
select is(public.delete_reply((select id from made where name = 'reply')) ->> 'deleted', 'true', 'the post''s author can');
select is((public.get_post((select id from made where name = 'tip')) -> 'post' ->> 'reply_count')::int, 0, 'and the count follows');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b011","role":"authenticated"}';
select lives_ok($q$do $b$ begin for i in 1..30 loop perform public.create_reply((select id from made where name = 'tip'), 'reply ' || i); end loop; end $b$$q$, '30 replies a day');
select throws_ok($$select public.create_reply((select id from made where name = 'tip'), 'one more')$$, 'RL429', null, 'the 31st is refused');

-- ---------------------------------------------------------------------------
-- Reactions and polls
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(public.react_post((select id from made where name = 'tip'), 'up') ->> 'like_count', '1', 'a reaction counts');
select is(public.react_post((select id from made where name = 'tip'), 'fire') ->> 'like_count', '1', 'changing it does not count twice');
select is(public.get_post((select id from made where name = 'tip')) -> 'post' ->> 'my_reaction', 'fire', 'and shows mine');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select is(public.react_post((select id from made where name = 'tip'), 'idea') ->> 'like_count', '2', 'two players, two');
select throws_ok($$select public.react_post((select id from made where name = 'tip'), 'heart')$$, '22023', null, 'only the small fixed set');
select is(public.react_post((select id from made where name = 'tip'), null) ->> 'like_count', '1', 'taking it back');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b006","role":"authenticated"}';
insert into made select 'poll', (public.create_post('poll', 'Best way to study?', null, null, null, false, array['Mornings', 'Evenings']) -> 'post' ->> 'id')::uuid;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(public.vote_poll((select id from made where name = 'poll'), 1) -> 'options' -> 1 ->> 'votes', '1', 'a vote counts');
select is(public.vote_poll((select id from made where name = 'poll'), 0) -> 'my_vote', '1'::jsonb, 'a vote is final');
select throws_ok($$select public.vote_poll((select id from made where name = 'poll'), 5)$$, '22023', null, 'unknown option');
select throws_ok($$select public.vote_poll((select id from made where name = 'tip'), 0)$$, 'P0002', null, 'only polls take votes');

-- ---------------------------------------------------------------------------
-- Blocks and mutes
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b005","role":"authenticated"}';
select lives_ok($$select public.block_user('ann')$$, 'dan blocks ann');
select throws_ok($$select public.get_post((select id from made where name = 'tip'))$$, 'P0002', null, 'dan cannot open ann''s post');
select throws_ok($$select public.create_reply((select id from made where name = 'tip'), 'hi')$$, 'P0002', null, 'or reply to it');
select throws_ok($$select public.react_post((select id from made where name = 'tip'), 'up')$$, 'P0002', null, 'or react to it');
select ok(position('Convert km/h' in public.get_feed()::text) = 0, 'ann''s posts are not in dan''s feed');
select is((select count(*)::int from public.posts where author_id = '00000000-0000-0000-0000-00000000b001'), 0, 'nor readable from the table');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
reset role;
insert into public.posts (author_id, kind, body) values ('00000000-0000-0000-0000-00000000b005', 'tip', 'Dan''s own tip');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
select ok(position('Dan''s own tip' in public.get_feed()::text) = 0, 'and dan''s are not in ann''s');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select ok(position('Best way to study' in public.get_feed()::text) > 0, 'cat sees the poll');
select lives_ok($$select public.mute_user('eve')$$, 'cat mutes eve');
select ok(position('Best way to study' in public.get_feed()::text) = 0, 'a muted player''s posts are gone from the feed');
select is(jsonb_array_length(public.get_mutes() -> 'items'), 1, 'the mute list');
select lives_ok($$select public.unmute_user('eve')$$, 'unmute');
select ok(position('Best way to study' in public.get_feed()::text) > 0, 'and they are back');

-- ---------------------------------------------------------------------------
-- Feeds
-- ---------------------------------------------------------------------------
select is(jsonb_array_length(public.get_feed('group') -> 'items'), 0, 'the college / batch feed is empty until groups exist');
select throws_ok($$select public.get_feed('topic')$$, '22023', null, 'the topic feed needs a topic');
select throws_ok($$select public.get_feed('nope')$$, '22023', null, 'unknown feed');
select throws_ok($$select public.get_feed('everyone', 'best')$$, '22023', null, 'unknown sort');
select throws_ok($$select public.get_feed('everyone', 'new', null, 'garbage')$$, '22023', null, 'bad cursor');
select ok(position('Convert km/h' in public.get_feed('topic', 'new', '10000000-0000-0000-0000-0000000000a1')::text) > 0, 'the topic feed has the topic''s posts');
select is(jsonb_array_length(public.get_feed('following') -> 'items'), 0, 'nothing in Following until you follow someone');
select lives_ok($$select public.follow_user('eve')$$, 'cat follows eve');
select ok(position('Best way to study' in public.get_feed('following')::text) > 0, 'Following shows eve');
select ok(position('One too many' in public.get_feed('following')::text) = 0 and position('post 1' in public.get_feed('following')::text) = 0, 'but not vic');

-- Sorting and paging: ann's post is an hour old with likes, ben's is fresh with none
reset role;
delete from public.posts;
insert into public.posts (id, author_id, kind, body, created_at, like_count, reply_count) values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000b001', 'tip', 'old and loved', now() - interval '1 hour', 3, 0),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000b003', 'tip', 'fresh and quiet', now() - interval '10 minutes', 0, 0);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select is(public.get_feed('everyone', 'new') -> 'items' -> 0 ->> 'body', 'fresh and quiet', 'New puts the newest first');
select is(public.get_feed('everyone', 'hot') -> 'items' -> 0 ->> 'body', 'old and loved', 'Hot puts the loved post first');

reset role;
insert into public.posts (author_id, kind, body, created_at, like_count)
select '00000000-0000-0000-0000-00000000b003', 'tip', 'filler ' || n, now() - make_interval(mins => n), n % 7
from generate_series(1, 23) n;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
create temp table pg1 on commit drop as select public.get_feed('everyone', 'new') as j;
grant select on pg1 to authenticated;
select is(jsonb_array_length((select j from pg1) -> 'items'), 20, 'a page is 20');
select isnt((select j from pg1) ->> 'next_cursor', null, 'with a cursor');
select is(jsonb_array_length(public.get_feed('everyone', 'new', null, (select j from pg1) ->> 'next_cursor') -> 'items'), 5, 'the second page has the rest');
select is((select count(distinct i ->> 'id')::int from (
             select jsonb_array_elements((select j from pg1) -> 'items') i
             union all select jsonb_array_elements(public.get_feed('everyone', 'new', null, (select j from pg1) ->> 'next_cursor') -> 'items')) x),
          25, 'with no repeats');
create temp table hot1 on commit drop as select public.get_feed('everyone', 'hot') as j;
grant select on hot1 to authenticated;
select is((select count(distinct i ->> 'id')::int from (
             select jsonb_array_elements((select j from hot1) -> 'items') i
             union all select jsonb_array_elements(public.get_feed('everyone', 'hot', null, (select j from hot1) ->> 'next_cursor') -> 'items')) x),
          25, 'Hot pages cleanly too');

-- ---------------------------------------------------------------------------
-- Expiry: read time is the source of truth
-- ---------------------------------------------------------------------------
reset role;
delete from public.posts;
insert into public.posts (id, author_id, kind, body) values
  ('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000b003', 'tip', 'about to expire');
insert into public.post_replies (post_id, author_id, body)
  values ('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000b004', 'a reply');
insert into public.post_reactions (post_id, user_id, reaction)
  values ('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000b004', 'up');
-- Time travel: 48 hours minus a few seconds old.
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '48 hours' + interval '5 seconds' where id = '91000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
select is(jsonb_array_length(public.get_feed('everyone') -> 'items'), 1, 'five seconds before expiry the post is there');
select is((select count(*)::int from public.posts), 1, 'in the table too');
reset role;
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '48 hours' where id = '91000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
select is((select expires_at from public.posts where id = '91000000-0000-0000-0000-000000000001'), now(), 'expires_at is created_at + 48 hours');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
select is(jsonb_array_length(public.get_feed('everyone') -> 'items'), 0, 'at expires_at the post is gone from the feed, though no cleanup ran');
select throws_ok($$select public.get_post('91000000-0000-0000-0000-000000000001')$$, 'P0002', null, 'and from get_post');
select is((select count(*)::int from public.posts), 0, 'and from the table');
select is((select count(*)::int from public.post_replies), 0, 'its replies are gone too');
select throws_ok($$select public.create_reply('91000000-0000-0000-0000-000000000001', 'late')$$, 'P0002', null, 'no replying after it expired');
select throws_ok($$select public.react_post('91000000-0000-0000-0000-000000000001', 'up')$$, 'P0002', null, 'or reacting');
select is((select count(*)::int from public.post_reactions), 0, 'the reaction row is hidden');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(jsonb_array_length(public.get_feed('mine') -> 'items'), 0, 'even the author cannot see it any more');
reset role;
select throws_ok($$update public.posts set body = 'edited', created_at = now()$$, '42501', null, 'a post cannot be edited or have its clock reset');
select throws_ok($$update public.post_replies set body = 'edited'$$, '42501', null, 'nor can a reply');

-- ---------------------------------------------------------------------------
-- Cleanup: idempotent and batch-safe
-- ---------------------------------------------------------------------------
select is(private.cleanup_expired_posts(500) ->> 'posts', '1', 'cleanup deletes the expired post');
select is((select count(*)::int from public.post_replies) + (select count(*)::int from public.post_reactions), 0, 'with its replies and reactions');
select is(private.cleanup_expired_posts(500) ->> 'posts', '0', 'running it again changes nothing');
insert into public.posts (author_id, kind, body)
select '00000000-0000-0000-0000-00000000b003', 'tip', 'old ' || n from generate_series(1, 5) n;
insert into public.posts (author_id, kind, body) values ('00000000-0000-0000-0000-00000000b003', 'tip', 'still live');
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '3 days' where body like 'old %';
set local session_replication_role = origin;
select is(private.cleanup_expired_posts(2) ->> 'posts', '2', 'a batch takes only what it was given');
select is((private.cleanup_expired_posts(2) ->> 'more')::boolean, true, 'and says there is more');
select is(private.cleanup_expired_posts_all() ->> 'posts', '1', 'the cron entry point finishes the rest');
select is((select count(*)::int from public.posts), 1, 'a live post is never touched');
select is(private.cleanup_expired_posts_all() ->> 'posts', '0', 'and it is idempotent');

-- ---------------------------------------------------------------------------
-- Reports and moderation
-- ---------------------------------------------------------------------------
delete from public.posts;
insert into public.posts (id, author_id, kind, body) values
  ('92000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000b003', 'tip', 'questionable post');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select throws_ok($$select public.report_post('92000000-0000-0000-0000-000000000001', 'spam')$$, 'P0002', null, 'you cannot report your own post');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select lives_ok($$select public.report_post('92000000-0000-0000-0000-000000000001', 'spam', 'selling stuff')$$, 'first report');
select lives_ok($$select public.report_post('92000000-0000-0000-0000-000000000001', 'abuse')$$, 'the same player again is absorbed');
select is((select report_count from public.posts where id = '92000000-0000-0000-0000-000000000001'), 1, 'it counts once');
select throws_ok($$select public.report_post('92000000-0000-0000-0000-000000000001', 'bogus')$$, '23514', null, 'unknown reasons are refused');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b006","role":"authenticated"}';
select lives_ok($$select public.report_post('92000000-0000-0000-0000-000000000001', 'spam')$$, 'second reporter');
select is((select status from public.posts where id = '92000000-0000-0000-0000-000000000001'), 'visible', 'two reporters do not hide it');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b011","role":"authenticated"}';
select lives_ok($$select public.report_post('92000000-0000-0000-0000-000000000001', 'answer_leak')$$, 'third reporter');
select is(jsonb_array_length(public.get_feed('everyone') -> 'items'), 0, 'three different reporters hide it pending review');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(jsonb_array_length(public.get_feed('mine') -> 'items'), 1, 'the author still sees it (shadow)');
select is(public.get_feed('mine') -> 'items' -> 0 ->> 'status', 'hidden', 'marked hidden');
select is((select count(*)::int from public.post_reports), 0, 'reports are not readable by players');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select throws_ok($$select public.admin_list_post_reports()$$, '42501', null, 'the queue is for admins');
select throws_ok($$select public.admin_moderate_post('92000000-0000-0000-0000-000000000001', 'remove')$$, '42501', null, 'so is moderating');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
select is((public.admin_list_post_reports() ->> 'total')::int, 1, 'the admin sees one post to review');
select is((select sum((r ->> 'count')::int)::int from jsonb_array_elements(public.admin_list_post_reports() -> 'items' -> 0 -> 'reports') r), 3,
  'with the reasons, counted');
select is(public.admin_moderate_post('92000000-0000-0000-0000-000000000001', 'restore', 'looks fine') ->> 'status', 'visible', 'restoring puts it back');
select is((public.admin_list_post_reports() ->> 'total')::int, 0, 'and it leaves the pending queue');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b010","role":"authenticated"}';
select lives_ok($$select public.report_post('92000000-0000-0000-0000-000000000001', 'spam')$$, 'a later report');
select is((select status from public.posts where id = '92000000-0000-0000-0000-000000000001'), 'visible', 'does not hide a post a moderator already cleared');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
select is(public.admin_moderate_post('92000000-0000-0000-0000-000000000001', 'remove', 'spam') ->> 'status', 'removed', 'removing');
select throws_ok($$select public.admin_moderate_post('92000000-0000-0000-0000-000000000001', 'explode')$$, '22023', null, 'unknown action');
select is((select count(*)::int from public.audit_log where entity_type = 'post' and action in ('post_restore', 'post_remove')), 2, 'every moderation action is audited');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(jsonb_array_length(public.get_feed('mine') -> 'items'), 0, 'a removed post is gone for its author too');

-- The snapshot outlives the post for 30 days
reset role;
select is((select expires_at from public.posts where id = '92000000-0000-0000-0000-000000000001') > now(), true, 'the post is still live');
set local session_replication_role = replica;
update public.posts set created_at = now() - interval '3 days' where id = '92000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
select lives_ok($$select private.cleanup_expired_posts_all()$$, 'cleanup runs');
select is((select count(*)::int from public.posts), 0, 'the removed post was deleted');
select is((select count(*)::int from public.post_reports), 0, 'with its reports');
select is((select body_hash from public.moderation_snapshots where post_id = '92000000-0000-0000-0000-000000000001'),
          encode(sha256(convert_to('questionable post', 'UTF8')), 'hex'), 'the snapshot keeps a hash of the body');
select is((select reasons from public.moderation_snapshots where post_id = '92000000-0000-0000-0000-000000000001'),
          array['answer_leak', 'spam'], 'and the reasons');
select is((select author_id from public.moderation_snapshots where post_id = '92000000-0000-0000-0000-000000000001'),
          '00000000-0000-0000-0000-00000000b003'::uuid, 'and the author');
select is((select outcome from public.moderation_snapshots where post_id = '92000000-0000-0000-0000-000000000001'), 'removed', 'and what happened');
select is(private.author_strikes('00000000-0000-0000-0000-00000000b003'), 1, 'it counts as a strike');
select is((select (purge_after - created_at) from public.moderation_snapshots where post_id = '92000000-0000-0000-0000-000000000001'),
          interval '30 days', 'kept for 30 days');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select is((select count(*)::int from public.moderation_snapshots), 0, 'players cannot read snapshots');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
select is((select count(*)::int from public.moderation_snapshots), 1, 'admins can');
reset role;
update public.moderation_snapshots set purge_after = now() - interval '1 second';
select is(private.cleanup_expired_posts(500) ->> 'snapshots_purged', '1', 'after 30 days cleanup purges it');

-- Repeat offenders: three removals in 30 days and new posts wait for review
insert into public.moderation_snapshots (post_id, author_id, body_hash, outcome)
select gen_random_uuid(), '00000000-0000-0000-0000-00000000b010', repeat('0', 64), 'removed' from generate_series(1, 3);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b010","role":"authenticated"}';
select is(public.create_post('tip', 'sam''s new post') -> 'post' ->> 'status', 'hidden', 'after three removals new posts are hidden from others (shadow limit)');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select ok(position('sam''s new post' in public.get_feed()::text) = 0, 'others never see it');

-- Deleting early
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
insert into made select 'mine', (public.create_post('tip', 'a post I will delete') -> 'post' ->> 'id')::uuid;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}';
select throws_ok($$select public.delete_post((select id from made where name = 'mine'))$$, 'P0002', null, 'only the author can delete a post');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
select is(public.delete_post((select id from made where name = 'mine')) ->> 'deleted', 'true', 'the author can delete early');
select throws_ok($$select public.get_post((select id from made where name = 'mine'))$$, 'P0002', null, 'and it is gone at once');
reset role;
select is((select count(*)::int from public.moderation_snapshots where outcome = 'author_deleted'), 0, 'an unreported post leaves no trace');

select * from finish();
rollback;
