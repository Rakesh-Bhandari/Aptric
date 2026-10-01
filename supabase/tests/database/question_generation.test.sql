-- AI question generation: jobs, dedup on insert, embeddings, rate limits.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into private.accounts (id, email, metadata) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com', '{"handle":"genadmin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'user@example.com',  '{"handle":"genuser"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

-- Unit vector on axis i, or cos(t)·e_i + sin(t)·e_j (cosine similarity to e_i = cos(t)).
create function pg_temp.vec(i integer, j integer default null, c double precision default 1)
returns extensions.vector
language sql
as $$
  select ('[' || string_agg(
    case when k = i then c::text
         when k = j then sqrt(1 - c * c)::text
         else '0' end, ',' order by k) || ']')::extensions.vector
  from generate_series(1, 384) k;
$$;

create temp table ctx as
select s.id as subtopic_id
from public.subtopics s
join public.topics t on t.id = s.topic_id
join public.sections sec on sec.id = t.section_id
where sec.slug = 'quantitative-aptitude' and s.slug = 'percentages';
grant select on ctx to authenticated, service_role;

insert into public.question_generation_jobs
  (id, created_by, subtopic_id, difficulty, requested, max_batches, model, solver_model, prompt_version)
select '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', subtopic_id,
       'medium', 2, 3, 'gen/model', 'solve/model', 'test-v1'
from ctx;

-- Hashes are opaque to the database; any 64 hex chars will do.
create function pg_temp.h(n integer) returns text language sql as $$ select lpad(to_hex(n), 64, '0') $$;

create function pg_temp.ins(stem text, hash text, emb extensions.vector, job uuid default '70000000-0000-0000-0000-000000000001')
returns jsonb
language sql
as $$
  select public.gen_insert_question(job, stem, array['10%', '20%', '25%', '30%'], 2,
    'Because 50 of 200 is a quarter.', 'Think fractions.', 90, hash, emb, 'gte-small', 0.92);
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.gen_insert_question(uuid, text, text[], integer, text, text, integer, text, extensions.vector, text, double precision)', 'execute'),
  'authenticated cannot call gen_insert_question');
select ok(not has_function_privilege('authenticated', 'public.gen_claim_job(uuid, integer)', 'execute'),
  'authenticated cannot call gen_claim_job');
select ok(not has_function_privilege('anon', 'public.gen_rate_limit(uuid, text, integer, integer)', 'execute'),
  'anon cannot call gen_rate_limit');
select ok(has_function_privilege('service_role', 'public.gen_insert_question(uuid, text, text[], integer, text, text, integer, text, extensions.vector, text, double precision)', 'execute'),
  'service_role can call gen_insert_question');
select ok(not has_table_privilege('authenticated', 'private.question_embeddings', 'select'),
  'authenticated cannot read embeddings');
select ok(not has_table_privilege('authenticated', 'public.question_generation_jobs', 'insert'),
  'authenticated cannot insert jobs');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*)::integer from public.question_generation_jobs), 1, 'admin reads jobs');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*)::integer from public.question_generation_jobs), 0, 'non-admin sees no jobs');
reset role;

-- ---------------------------------------------------------------------------
-- Lease
-- ---------------------------------------------------------------------------
select is((public.gen_insert_question('70000000-0000-0000-0000-000000000001', 'x', array['a','b'], 0, 'e', null, 60,
           pg_temp.h(99), pg_temp.vec(99), 'gte-small', 0.92)) ->> 'outcome', 'job_closed',
  'a queued (unclaimed) job takes no inserts');
select is((public.gen_claim_job('70000000-0000-0000-0000-000000000001', 120)).status, 'running'::public.generation_job_status,
  'claim takes the lease');
select ok((public.gen_claim_job('70000000-0000-0000-0000-000000000001', 120)).id is null,
  'a leased job cannot be claimed again');

-- ---------------------------------------------------------------------------
-- Insert and dedup
-- ---------------------------------------------------------------------------
create temp table r1 as select pg_temp.ins('What percent of 200 is 50?', pg_temp.h(1), pg_temp.vec(1)) as r;
select is((select r ->> 'outcome' from r1), 'inserted', 'first question is inserted');

select results_eq(
  $$ select status::text, source::text, model, prompt_version, difficulty::text, generation_job_id::text, created_by::text, est_seconds
     from public.questions where id = (select (r ->> 'question_id')::uuid from r1) $$,
  $$ values ('in_review', 'ai', 'gen/model', 'test-v1', 'medium', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 90) $$,
  'question is in_review with model, prompt version and job provenance');
select results_eq(
  $$ select array_agg(body order by position) from public.question_options where question_id = (select (r ->> 'question_id')::uuid from r1) $$,
  $$ values (array['10%', '20%', '25%', '30%']) $$,
  'options keep their order');
select is(
  (select o.body from public.question_answers a join public.question_options o on o.id = a.correct_option_id
   where a.question_id = (select (r ->> 'question_id')::uuid from r1)),
  '25%', 'answer key points at the given index');
select is((select model from private.question_embeddings where question_id = (select (r ->> 'question_id')::uuid from r1)),
  'gte-small', 'embedding is stored');

select is(pg_temp.ins('What percent of 200 is 50 ?', pg_temp.h(1), pg_temp.vec(2)) ->> 'outcome', 'duplicate_hash',
  'same content_hash is a duplicate');
select is(pg_temp.ins('Reworded: 50 is what percent of 200?', pg_temp.h(2), pg_temp.vec(1, 2, 0.95)) ->> 'outcome', 'duplicate_similar',
  'cosine similarity 0.95 > 0.92 is a duplicate');
select is(pg_temp.ins('Different question', pg_temp.h(3), pg_temp.vec(1, 2, 0.90)) ->> 'outcome', 'inserted',
  'cosine similarity 0.90 is not a duplicate');
select is(pg_temp.ins('Third question', pg_temp.h(4), pg_temp.vec(3)) ->> 'outcome', 'job_full',
  'a job never inserts more than it requested');

select throws_ok(
  $$ select public.gen_insert_question('70000000-0000-0000-0000-000000000001', 'x', array['a','b'], 2, 'e', null, 60,
       lpad('f', 64, 'f'), pg_temp.vec(5), 'gte-small', 0.92) $$,
  '22023', 'correct index out of range', 'correct index must point at an option');

-- Retired questions don't block new ones.
update public.questions set status = 'retired' where id = (select (r ->> 'question_id')::uuid from r1);
select is((select count(*)::integer from public.gen_nearest_question(pg_temp.vec(1)) where similarity > 0.99), 0,
  'retired questions are ignored by the similarity search');

-- ---------------------------------------------------------------------------
-- Finishing batches
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select status::text, inserted, batches, dropped_solver, dropped_duplicate_similar, locked_until is null, finished_at is not null
     from public.gen_finish_batch('70000000-0000-0000-0000-000000000001', '{"solver": 2, "duplicate_similar": 1}', null) $$,
  $$ values ('done', 2, 1, 2, 1, true, true) $$,
  'finishing a batch records drops, recounts inserts, and closes a full job');
select ok((public.gen_claim_job('70000000-0000-0000-0000-000000000001', 120)).id is null, 'a done job cannot be claimed');

insert into public.question_generation_jobs
  (id, created_by, subtopic_id, difficulty, requested, max_batches, model, solver_model, prompt_version)
select '70000000-0000-0000-0000-000000000002', null, subtopic_id, 'hard', 5, 2, 'gen/model', 'solve/model', 'test-v1' from ctx;
select public.gen_claim_job('70000000-0000-0000-0000-000000000002', 120);
select is((public.gen_finish_batch('70000000-0000-0000-0000-000000000002', '{"invalid": 3}', 'generator timed out')).status,
  'running'::public.generation_job_status, 'a short job keeps running while it has batches left');
select ok((public.gen_claim_job('70000000-0000-0000-0000-000000000002', 120)).id is not null, 'a released lease can be claimed again');
select results_eq(
  $$ select status::text, batches, dropped_invalid, last_error
     from public.gen_finish_batch('70000000-0000-0000-0000-000000000002', '{"invalid": 1}', 'still failing') $$,
  $$ values ('failed', 2, 4, 'still failing') $$,
  'a job that used up its batches with nothing inserted fails');

insert into public.question_generation_jobs
  (id, created_by, subtopic_id, difficulty, requested, max_batches, model, solver_model, prompt_version)
select '70000000-0000-0000-0000-000000000003', null, subtopic_id, 'easy', 5, 2, 'gen/model', 'solve/model', 'test-v1' from ctx;
select public.gen_claim_job('70000000-0000-0000-0000-000000000003', 120);
update public.question_generation_jobs set status = 'cancelled' where id = '70000000-0000-0000-0000-000000000003';
select is(pg_temp.ins('After cancel', pg_temp.h(10), pg_temp.vec(10), '70000000-0000-0000-0000-000000000003') ->> 'outcome', 'job_closed',
  'a cancelled job takes no inserts');
select is((public.gen_finish_batch('70000000-0000-0000-0000-000000000003', '{}', null)).status,
  'cancelled'::public.generation_job_status, 'finishing a batch leaves a cancelled job cancelled');

-- ---------------------------------------------------------------------------
-- Embedding maintenance
-- ---------------------------------------------------------------------------
update public.questions set stem = 'What percent of 300 is 75?'
where stem = 'Different question';
select is((select count(*)::integer from public.gen_questions_missing_embeddings((select subtopic_id from ctx), 10)
           where stem = 'What percent of 300 is 75?'), 1,
  'editing a stem drops its embedding so it is re-embedded');
select is(public.gen_store_embeddings(
  jsonb_build_array(jsonb_build_object(
    'question_id', (select id from public.questions where stem = 'What percent of 300 is 75?'),
    'embedding', pg_temp.vec(7)::text))
  || jsonb_build_array(jsonb_build_object('question_id', gen_random_uuid(), 'embedding', pg_temp.vec(8)::text)),
  'gte-small'), 1, 'storing embeddings skips unknown questions');
select is((select count(*)::integer from public.gen_questions_missing_embeddings((select subtopic_id from ctx), 10)
           where stem = 'What percent of 300 is 75?'), 0, 'stored embedding is no longer missing');
select lives_ok($$ select '[1e-7,2,3]'::extensions.vector(3) $$, 'vector text accepts exponents');

-- ---------------------------------------------------------------------------
-- Provenance and rate limits
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.questions (subtopic_id, stem, difficulty, source, content_hash)
     select subtopic_id, 'no provenance', 'easy', 'ai', lpad('e', 64, 'e') from ctx $$,
  '23514', null, 'AI questions must carry model and prompt_version');

select is((select array_agg(allowed order by n) from (
  select n, (public.gen_rate_limit('00000000-0000-0000-0000-0000000000a1', 'test', 3600, 2)).allowed
  from generate_series(1, 3) n) s), array[true, true, false], 'rate limit allows 2 then refuses');
select ok((public.gen_rate_limit('00000000-0000-0000-0000-0000000000a1', 'test', 3600, 2)).retry_after_seconds > 0,
  'a refused hit says when to retry');
select ok((public.gen_rate_limit('00000000-0000-0000-0000-0000000000b1', 'test', 3600, 2)).allowed,
  'limits are per subject');

select * from finish();
rollback;
