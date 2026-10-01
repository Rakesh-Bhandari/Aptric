-- AI question generation, used by the generate-questions Edge Function.
--
--   * question_generation_jobs: one row per admin request (subtopic + difficulty
--     + count). The function works through a job one small batch per call, so no
--     single invocation runs into the Edge Function time limit.
--   * questions.model / prompt_version / generation_job_id: provenance of every
--     AI-written question.
--   * private.question_embeddings: gte-small (384-d) embeddings of stem+options,
--     for near-duplicate detection (cosine similarity > threshold = duplicate).
--   * private.rate_limits: fixed-window counters for the function's per-admin
--     rate limit.
--
-- Everything here is written only by service_role through the gen_* functions
-- below (EXECUTE granted to service_role only). Admins can read jobs.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create type public.generation_job_status as enum ('queued', 'running', 'done', 'failed', 'cancelled');

create table public.question_generation_jobs (
  id                         uuid primary key default gen_random_uuid(),
  created_by                 uuid references public.profiles (id) on delete set null,
  subtopic_id                uuid not null references public.subtopics (id) on delete cascade,
  difficulty                 public.question_difficulty not null,
  requested                  integer not null check (requested between 1 and 100),
  -- Questions this job has inserted (recounted from questions after each batch).
  inserted                   integer not null default 0 check (inserted >= 0),
  -- Why candidates were dropped. Cumulative over all batches.
  dropped_invalid            integer not null default 0 check (dropped_invalid >= 0),   -- failed schema validation
  dropped_solver             integer not null default 0 check (dropped_solver >= 0),    -- independent solve disagreed
  dropped_computed           integer not null default 0 check (dropped_computed >= 0),  -- numeric computed check failed
  dropped_duplicate_hash     integer not null default 0 check (dropped_duplicate_hash >= 0),
  dropped_duplicate_similar  integer not null default 0 check (dropped_duplicate_similar >= 0),
  batches                    integer not null default 0 check (batches >= 0),
  -- A job stops after this many batches even if it is short, so a subtopic
  -- whose output keeps failing verification still finishes.
  max_batches                integer not null check (max_batches between 1 and 100),
  status                     public.generation_job_status not null default 'queued',
  model                      text not null check (char_length(model) between 1 and 200),
  solver_model               text not null check (char_length(solver_model) between 1 and 200),
  prompt_version             text not null check (char_length(prompt_version) between 1 and 80),
  last_error                 text check (char_length(last_error) <= 2000),
  -- Lease held by the invocation currently running a batch.
  locked_until               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  finished_at                timestamptz
);

create index question_generation_jobs_created_by_idx on public.question_generation_jobs (created_by, created_at desc);
create index question_generation_jobs_subtopic_idx   on public.question_generation_jobs (subtopic_id);
create index question_generation_jobs_open_idx       on public.question_generation_jobs (created_at)
  where status in ('queued', 'running');

create trigger question_generation_jobs_set_updated_at
  before update on public.question_generation_jobs
  for each row execute function private.set_updated_at();

alter table public.question_generation_jobs enable row level security;
revoke all on public.question_generation_jobs from anon, authenticated;
grant select on public.question_generation_jobs to authenticated;

create policy "question_generation_jobs: admin read" on public.question_generation_jobs
  for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Provenance on questions
-- ---------------------------------------------------------------------------
alter table public.questions
  add column model             text check (char_length(model) between 1 and 200),
  add column prompt_version    text check (char_length(prompt_version) between 1 and 80),
  add column generation_job_id uuid references public.question_generation_jobs (id) on delete set null;

-- AI-written questions must say which model and prompt wrote them. NOT VALID:
-- enforced for new and updated rows without vetting rows that predate it.
alter table public.questions
  add constraint questions_ai_provenance_check
  check (source <> 'ai' or (model is not null and prompt_version is not null)) not valid;

create index questions_generation_job_idx on public.questions (generation_job_id)
  where generation_job_id is not null;

-- ---------------------------------------------------------------------------
-- Embeddings (private: not exposed through the Data API, not in audit_log)
-- ---------------------------------------------------------------------------
create table private.question_embeddings (
  question_id  uuid primary key references public.questions (id) on delete cascade,
  embedding    extensions.vector(384) not null,
  model        text not null,
  created_at   timestamptz not null default now()
);

create index question_embeddings_hnsw_idx on private.question_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table private.question_embeddings enable row level security;
revoke all on private.question_embeddings from public, anon, authenticated;

-- An edited stem makes the stored embedding stale; drop it so the next
-- generation run in that subtopic re-embeds the question.
create or replace function private.questions_drop_stale_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.question_embeddings where question_id = new.id;
  return null;
end;
$$;

create trigger questions_drop_stale_embedding
  after update of stem, content_hash on public.questions
  for each row
  when (old.stem is distinct from new.stem or old.content_hash is distinct from new.content_hash)
  execute function private.questions_drop_stale_embedding();

-- ---------------------------------------------------------------------------
-- Rate limits: fixed windows keyed by (bucket, subject)
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  bucket        text not null,
  subject       uuid not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, subject, window_start)
);

alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- Counts one hit and reports whether it fits in the window's budget. A refused
-- hit is still counted, so hammering a limited endpoint stays limited.
create or replace function public.gen_rate_limit(
  p_subject uuid,
  p_bucket text,
  p_window_seconds integer,
  p_max integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  w_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  if p_window_seconds < 1 or p_max < 1 then
    raise exception 'bad rate limit' using errcode = 'invalid_parameter_value';
  end if;

  insert into private.rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, w_start, 1)
  on conflict (bucket, subject, window_start) do update set hits = r.hits + 1
  returning r.hits into n;

  -- Housekeeping: old windows for this subject.
  delete from private.rate_limits
  where bucket = p_bucket and subject = p_subject
    and window_start < now() - make_interval(secs => greatest(p_window_seconds * 2, 86400));

  allowed := n <= p_max;
  retry_after_seconds := case when allowed then 0
    else ceil(extract(epoch from (w_start + make_interval(secs => p_window_seconds) - now())))::integer end;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job lifecycle
-- ---------------------------------------------------------------------------

-- Takes the job's lease if it is open and nobody holds it. NULL = not claimable
-- (finished, cancelled, or another invocation is running a batch).
create or replace function public.gen_claim_job(p_job_id uuid, p_lease_seconds integer)
returns public.question_generation_jobs
language sql
security definer
set search_path = ''
as $$
  update public.question_generation_jobs
  set status = 'running',
      locked_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_job_id
    and status in ('queued', 'running')
    and (locked_until is null or locked_until < now())
  returning *;
$$;

-- Records one batch's drop counts, recounts inserted questions, settles the
-- status and releases the lease. A cancelled job stays cancelled.
create or replace function public.gen_finish_batch(p_job_id uuid, p_stats jsonb, p_error text default null)
returns public.question_generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.question_generation_jobs;
  n integer;
begin
  select count(*) into n from public.questions where generation_job_id = p_job_id;

  update public.question_generation_jobs set
    inserted                  = n,
    dropped_invalid           = dropped_invalid           + coalesce((p_stats ->> 'invalid')::integer, 0),
    dropped_solver            = dropped_solver            + coalesce((p_stats ->> 'solver')::integer, 0),
    dropped_computed          = dropped_computed          + coalesce((p_stats ->> 'computed')::integer, 0),
    dropped_duplicate_hash    = dropped_duplicate_hash    + coalesce((p_stats ->> 'duplicate_hash')::integer, 0),
    dropped_duplicate_similar = dropped_duplicate_similar + coalesce((p_stats ->> 'duplicate_similar')::integer, 0),
    batches                   = batches + 1,
    last_error                = left(p_error, 2000),
    locked_until              = null
  where id = p_job_id
  returning * into j;

  if j.id is null then
    raise exception 'generation job % not found', p_job_id using errcode = 'no_data_found';
  end if;

  if j.status = 'running' and (j.inserted >= j.requested or j.batches >= j.max_batches) then
    update public.question_generation_jobs
    set status = case when inserted > 0 then 'done' else 'failed' end::public.generation_job_status,
        finished_at = now()
    where id = p_job_id
    returning * into j;
  end if;

  return j;
end;
$$;

-- ---------------------------------------------------------------------------
-- Embeddings and dedup
-- ---------------------------------------------------------------------------

-- Questions in a subtopic that have no embedding yet (imports, manual
-- questions, edited stems), with their options in position order.
create or replace function public.gen_questions_missing_embeddings(p_subtopic_id uuid, p_limit integer)
returns table (question_id uuid, stem text, options text[])
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.stem,
         coalesce((select array_agg(o.body order by o.position)
                   from public.question_options o where o.question_id = q.id), '{}')
  from public.questions q
  where q.subtopic_id = p_subtopic_id
    and q.status <> 'retired'
    and not exists (select 1 from private.question_embeddings e where e.question_id = q.id)
  order by q.created_at desc
  limit p_limit;
$$;

-- p_rows: [{"question_id": uuid, "embedding": "[0.1, ...]"}]
create or replace function public.gen_store_embeddings(p_rows jsonb, p_model text)
returns integer
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into private.question_embeddings (question_id, embedding, model)
    select (r ->> 'question_id')::uuid, (r ->> 'embedding')::extensions.vector(384), p_model
    from jsonb_array_elements(p_rows) r
    where exists (select 1 from public.questions q where q.id = (r ->> 'question_id')::uuid)
    on conflict (question_id) do update set embedding = excluded.embedding, model = excluded.model, created_at = now()
    returning 1
  )
  select count(*)::integer from ins;
$$;

-- Most similar existing (non-retired) question by cosine similarity.
create or replace function public.gen_nearest_question(p_embedding extensions.vector(384))
returns table (question_id uuid, similarity double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select e.question_id, 1 - (e.embedding operator(extensions.<=>) p_embedding)
  from private.question_embeddings e
  join public.questions q on q.id = e.question_id
  where q.status <> 'retired'
  order by e.embedding operator(extensions.<=>) p_embedding
  limit 1;
$$;

-- Inserts one verified question for a running job as in_review, with its
-- options, answer key and embedding, in one transaction. Dedup is re-checked
-- here under a lock (content_hash, then embedding similarity > threshold), so
-- two concurrent batches cannot both insert the same question.
-- Returns {"outcome": "inserted"|"duplicate_hash"|"duplicate_similar"|"job_full"|"job_closed",
--          "question_id"?, "similar_to"?, "similarity"?}.
create or replace function public.gen_insert_question(
  p_job_id uuid,
  p_stem text,
  p_options text[],
  p_correct_index integer,
  p_explanation text,
  p_hint text,
  p_est_seconds integer,
  p_content_hash text,
  p_embedding extensions.vector(384),
  p_embedding_model text,
  p_similarity_threshold double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j        public.question_generation_jobs;
  n        integer;
  dup_id   uuid;
  sim      double precision;
  q_id     uuid;
  key_id   uuid;
begin
  if p_correct_index is null or p_correct_index < 0 or p_correct_index >= coalesce(array_length(p_options, 1), 0) then
    raise exception 'correct index out of range' using errcode = 'invalid_parameter_value';
  end if;

  -- Serialises generator inserts so the dedup checks below see each other.
  perform pg_advisory_xact_lock(hashtext('aptric:generate-questions:insert'));

  select * into j from public.question_generation_jobs where id = p_job_id for update;
  if j.id is null or j.status <> 'running' then
    return jsonb_build_object('outcome', 'job_closed');
  end if;

  select count(*) into n from public.questions where generation_job_id = p_job_id;
  if n >= j.requested then
    return jsonb_build_object('outcome', 'job_full');
  end if;

  select q.id into dup_id from public.questions q where q.content_hash = p_content_hash;
  if dup_id is not null then
    return jsonb_build_object('outcome', 'duplicate_hash', 'similar_to', dup_id);
  end if;

  select m.question_id, m.similarity into dup_id, sim from public.gen_nearest_question(p_embedding) m;
  if dup_id is not null and sim > p_similarity_threshold then
    return jsonb_build_object('outcome', 'duplicate_similar', 'similar_to', dup_id, 'similarity', sim);
  end if;

  begin
    insert into public.questions (
      subtopic_id, stem, difficulty, est_seconds, status, source, content_hash,
      created_by, model, prompt_version, generation_job_id
    ) values (
      j.subtopic_id, p_stem, j.difficulty, p_est_seconds, 'in_review', 'ai', p_content_hash,
      j.created_by, j.model, j.prompt_version, j.id
    )
    returning id into q_id;
  exception when unique_violation then
    -- A writer outside this function (manual insert, import) got there first.
    return jsonb_build_object('outcome', 'duplicate_hash');
  end;

  insert into public.question_options (question_id, position, body)
  select q_id, (o.ord - 1)::smallint, o.body
  from unnest(p_options) with ordinality as o (body, ord);

  select id into key_id from public.question_options
  where question_id = q_id and position = p_correct_index;

  insert into public.question_answers (question_id, correct_option_id, explanation, hint)
  values (q_id, key_id, p_explanation, nullif(p_hint, ''));

  insert into private.question_embeddings (question_id, embedding, model)
  values (q_id, p_embedding, p_embedding_model);

  return jsonb_build_object('outcome', 'inserted', 'question_id', q_id);
end;
$$;

-- Only the Edge Function (service_role) may call these.
revoke execute on function public.gen_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.gen_claim_job(uuid, integer) from public, anon, authenticated;
revoke execute on function public.gen_finish_batch(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.gen_questions_missing_embeddings(uuid, integer) from public, anon, authenticated;
revoke execute on function public.gen_store_embeddings(jsonb, text) from public, anon, authenticated;
revoke execute on function public.gen_nearest_question(extensions.vector) from public, anon, authenticated;
revoke execute on function public.gen_insert_question(uuid, text, text[], integer, text, text, integer, text, extensions.vector, text, double precision) from public, anon, authenticated;

grant execute on function public.gen_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.gen_claim_job(uuid, integer) to service_role;
grant execute on function public.gen_finish_batch(uuid, jsonb, text) to service_role;
grant execute on function public.gen_questions_missing_embeddings(uuid, integer) to service_role;
grant execute on function public.gen_store_embeddings(jsonb, text) to service_role;
grant execute on function public.gen_nearest_question(extensions.vector) to service_role;
grant execute on function public.gen_insert_question(uuid, text, text[], integer, text, text, integer, text, extensions.vector, text, double precision) to service_role;

revoke execute on all functions in schema private from public, anon;
