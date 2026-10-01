-- Admin area: bans, the review workflow, atomic question edits, user search,
-- and audit coverage for every table the admin UI writes.
--
-- The admin UI (frontend/src/pages/Admin) reads through RLS (admins can read
-- every content/activity table) and writes either through RLS (reports) or
-- through the SECURITY DEFINER admin_* functions below, each of which checks
-- private.is_admin() itself. Every write lands in audit_log, either from a row
-- trigger (actor = auth.uid()) or from an explicit insert in the function.

-- ---------------------------------------------------------------------------
-- Bans
-- ---------------------------------------------------------------------------
-- Service-managed like role: no user UPDATE grant, so only admin_set_user_ban
-- (or service_role) can change them.
alter table public.profiles
  add column banned_at     timestamptz,
  add column banned_reason text check (char_length(banned_reason) <= 500),
  add column banned_by     uuid references public.profiles (id) on delete set null;

create index profiles_banned_idx    on public.profiles (banned_at) where banned_at is not null;
create index profiles_banned_by_idx on public.profiles (banned_by) where banned_by is not null;

create or replace function private.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and banned_at is not null
  );
$$;

revoke execute on function private.is_banned() from public, anon;
grant execute on function private.is_banned() to authenticated, service_role;

-- Every gameplay RPC starts with require_uid(), so a banned player can no
-- longer answer, hint, give up, or load sets and leagues.
create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if private.is_banned() then
    raise exception 'account suspended' using errcode = 'insufficient_privilege';
  end if;
  return uid;
end;
$$;

-- Restrictive policies are ANDed with the existing permissive ones.
create policy "reports: not banned" on public.reports
  as restrictive for insert to authenticated
  with check (not (select private.is_banned()));
create policy "feedback: not banned" on public.feedback
  as restrictive for insert to authenticated
  with check (not (select private.is_banned()));
create policy "profiles: banned users cannot edit" on public.profiles
  as restrictive for update to authenticated
  using (not (select private.is_banned()))
  with check (not (select private.is_banned()));

-- Bans or unbans a user. Banning also blocks sign-in and token refresh in
-- Supabase Auth (auth.users.banned_until) and ends their sessions, so the ban
-- takes effect within one access-token lifetime even outside the RPCs above.
create or replace function public.admin_set_user_ban(
  target_user_id uuid,
  banned         boolean,
  reason         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'you cannot ban yourself' using errcode = 'check_violation';
  end if;

  select * into p from public.profiles where id = target_user_id for update;
  if not found then
    raise exception 'profile % not found', target_user_id using errcode = 'no_data_found';
  end if;
  if banned and p.role = 'admin' then
    raise exception 'demote an admin before banning them' using errcode = 'check_violation';
  end if;
  if (p.banned_at is not null) = banned then
    return;
  end if;

  update public.profiles set
    banned_at     = case when banned then now() end,
    banned_reason = case when banned then nullif(btrim(reason), '') end,
    banned_by     = case when banned then auth.uid() end
  where id = target_user_id;

  -- A far-future timestamp rather than 'infinity': Auth parses this column
  -- into a Go time.Time.
  update auth.users
  set banned_until = case when banned then now() + interval '100 years' end
  where id = target_user_id;
  if banned then
    delete from auth.sessions where user_id = target_user_id;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    case when banned then 'ban' else 'unban' end,
    'profiles',
    target_user_id::text,
    jsonb_build_object('banned_at', p.banned_at, 'banned_reason', p.banned_reason),
    case when banned
      then jsonb_build_object('banned_at', now(), 'banned_reason', nullif(btrim(reason), ''))
      else jsonb_build_object('banned_at', null, 'banned_reason', null)
    end
  );
end;
$$;

-- Same as before, plus: a banned user cannot be made an admin.
create or replace function public.admin_set_user_role(target_user_id uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role public.user_role;
  is_banned boolean;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  select role, banned_at is not null into old_role, is_banned
  from public.profiles where id = target_user_id for update;
  if not found then
    raise exception 'profile % not found', target_user_id using errcode = 'no_data_found';
  end if;
  if old_role = new_role then
    return;
  end if;
  if new_role = 'admin' and is_banned then
    raise exception 'unban this user before making them an admin' using errcode = 'check_violation';
  end if;
  if old_role = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'cannot demote the last admin' using errcode = 'check_violation';
  end if;

  update public.profiles set role = new_role where id = target_user_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'set_role', 'profiles', target_user_id::text,
          jsonb_build_object('role', old_role), jsonb_build_object('role', new_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- User search. Profiles carry no email, so admins look users up here.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(
  search      text default null,
  only_role   public.user_role default null,
  only_banned boolean default null,
  target_user_id uuid default null,
  page_size   integer default 50,
  page_offset integer default 0
)
returns table (
  id              uuid,
  handle          text,
  display_name    text,
  email           text,
  role            public.user_role,
  level           integer,
  xp              bigint,
  current_streak  integer,
  longest_streak  integer,
  timezone        text,
  banned_at       timestamptz,
  banned_reason   text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  attempts        bigint,
  correct         bigint,
  total_count     bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pattern text;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(search), '') is not null then
    pattern := '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    with matched as (
      select p.*, u.email::text as email, u.last_sign_in_at
      from public.profiles p
      left join auth.users u on u.id = p.id
      where (target_user_id is null or p.id = target_user_id)
        and (only_role is null or p.role = only_role)
        and (only_banned is null or (p.banned_at is not null) = only_banned)
        and (pattern is null
             or p.handle ilike pattern
             or p.display_name ilike pattern
             or u.email ilike pattern
             or p.id::text = btrim(search))
    ),
    page as (
      select m.*, count(*) over () as total_count
      from matched m
      order by m.created_at desc, m.id
      limit least(greatest(page_size, 1), 200)
      offset greatest(page_offset, 0)
    )
    select pg.id, pg.handle, pg.display_name, pg.email, pg.role, pg.level, pg.xp,
           pg.current_streak, pg.longest_streak, pg.timezone, pg.banned_at, pg.banned_reason,
           pg.created_at, pg.last_sign_in_at,
           (select count(*) from public.attempts a where a.user_id = pg.id),
           (select count(*) from public.attempts a where a.user_id = pg.id and a.is_correct),
           pg.total_count
    from page pg
    order by pg.created_at desc, pg.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review workflow
-- ---------------------------------------------------------------------------
-- The last status decision on a question (approve, reject, retire, ...).
alter table public.questions
  add column reviewed_by  uuid references public.profiles (id) on delete set null,
  add column reviewed_at  timestamptz,
  add column review_note  text check (char_length(review_note) <= 2000);

create index questions_reviewed_by_idx on public.questions (reviewed_by) where reviewed_by is not null;

-- Stem search in the admin question list (ilike '%term%').
create extension if not exists pg_trgm with schema extensions;
create index questions_stem_trgm_idx on public.questions using gin (stem extensions.gin_trgm_ops);

-- content_hash as defined in supabase/README.md; must match contentHash() in
-- functions/generate-questions/dedup.ts. After normalising only [a-z0-9 ] remain, so
-- sorting with the "C" collation matches JavaScript's default sort.
create or replace function private.normalise_text(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(s), '[^a-z0-9]+', ' ', 'g'), ' ');
$$;

create or replace function private.content_hash(stem text, options text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(pg_catalog.sha256(convert_to(
    array_to_string(
      array[private.normalise_text(stem)]
        || coalesce((select array_agg(n order by n collate "C")
                     from (select private.normalise_text(o) as n from unnest(options) o) x), '{}'),
      E'\n'),
    'UTF8')), 'hex');
$$;

-- Everything the editor needs for one question in one round trip, including
-- the answer key (admins only; question_answers has no grants).
create or replace function public.admin_get_question(target_question_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  select to_jsonb(q) || jsonb_build_object(
    'subtopic', jsonb_build_object('id', st.id, 'name', st.name),
    'topic',    jsonb_build_object('id', t.id, 'name', t.name),
    'section',  jsonb_build_object('id', s.id, 'name', s.name),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'body', o.body) order by o.position)
      from public.question_options o where o.question_id = q.id), '[]'::jsonb),
    'answer', (
      select jsonb_build_object('correct_option_id', a.correct_option_id, 'explanation', a.explanation, 'hint', a.hint)
      from public.question_answers a where a.question_id = q.id),
    'tags', coalesce((
      select jsonb_agg(qt.tag order by qt.tag) from public.question_tags qt where qt.question_id = q.id), '[]'::jsonb),
    'open_reports', (
      select count(*) from public.reports r where r.question_id = q.id and r.status in ('open', 'triaged')),
    'attempts', (select count(*) from public.attempts a where a.question_id = q.id),
    'created_by_handle', (select handle from public.profiles where id = q.created_by),
    'reviewed_by_handle', (select handle from public.profiles where id = q.reviewed_by)
  )
  into result
  from public.questions q
  join public.subtopics st on st.id = q.subtopic_id
  join public.topics t on t.id = st.topic_id
  join public.sections s on s.id = t.section_id
  where q.id = target_question_id;

  if result is null then
    raise exception 'question % not found', target_question_id using errcode = 'no_data_found';
  end if;
  return result;
end;
$$;

-- Saves a question, its options, answer key and tags in one transaction and
-- recomputes content_hash. Options are matched by position: changed bodies
-- are updated in place (keeping option ids, so past attempts stay valid), new
-- positions are inserted and surplus ones deleted. Every row change is
-- audited by the content tables' triggers. Status is not touched here; use
-- admin_set_question_status.
create or replace function public.admin_save_question(
  target_question_id uuid,
  subtopic_id        uuid,
  stem               text,
  difficulty         public.question_difficulty,
  est_seconds        integer,
  options            text[],
  correct_index      integer,
  explanation        text,
  hint               text default null,
  tags               text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n        integer := coalesce(array_length(options, 1), 0);
  opts     text[];
  new_hash text;
  dup_id   uuid;
  key_id   uuid;
  clean_tags text[];
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  select array_agg(btrim(o) order by ord) into opts from unnest(options) with ordinality as x (o, ord);
  stem := btrim(coalesce(stem, ''));
  explanation := btrim(coalesce(explanation, ''));

  if stem = '' then
    raise exception 'the question text is empty' using errcode = 'invalid_parameter_value';
  end if;
  if n < 2 or n > 10 then
    raise exception 'a question needs 2 to 10 options' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from unnest(opts) o where o is null or o = '') then
    raise exception 'options cannot be empty' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(distinct o) from unnest(opts) o) <> n then
    raise exception 'options must be distinct' using errcode = 'invalid_parameter_value';
  end if;
  if correct_index is null or correct_index < 0 or correct_index >= n then
    raise exception 'pick the correct option' using errcode = 'invalid_parameter_value';
  end if;
  if explanation = '' then
    raise exception 'the explanation is empty' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.questions q where q.id = target_question_id for update;
  if not found then
    raise exception 'question % not found', target_question_id using errcode = 'no_data_found';
  end if;

  new_hash := private.content_hash(stem, opts);
  select q.id into dup_id from public.questions q
  where q.content_hash = new_hash and q.id <> target_question_id;
  if dup_id is not null then
    raise exception 'this question duplicates question %', dup_id
      using errcode = 'unique_violation', detail = dup_id::text;
  end if;

  update public.questions q set
    subtopic_id  = admin_save_question.subtopic_id,
    stem         = admin_save_question.stem,
    difficulty   = admin_save_question.difficulty,
    est_seconds  = admin_save_question.est_seconds,
    content_hash = new_hash
  where q.id = target_question_id
    and (q.subtopic_id, q.stem, q.difficulty, q.est_seconds, q.content_hash)
        is distinct from
        (admin_save_question.subtopic_id, admin_save_question.stem, admin_save_question.difficulty,
         admin_save_question.est_seconds, new_hash);

  insert into public.question_options as qo (question_id, position, body)
  select target_question_id, (x.ord - 1)::smallint, x.body
  from unnest(opts) with ordinality as x (body, ord)
  on conflict (question_id, position) do update
    set body = excluded.body
    where qo.body is distinct from excluded.body;

  select o.id into key_id from public.question_options o
  where o.question_id = target_question_id and o.position = correct_index;

  insert into public.question_answers as qa (question_id, correct_option_id, explanation, hint)
  values (target_question_id, key_id, admin_save_question.explanation, nullif(btrim(admin_save_question.hint), ''))
  on conflict (question_id) do update
    set correct_option_id = excluded.correct_option_id,
        explanation       = excluded.explanation,
        hint              = excluded.hint
    where (qa.correct_option_id, qa.explanation, qa.hint)
          is distinct from (excluded.correct_option_id, excluded.explanation, excluded.hint);

  begin
    delete from public.question_options o
    where o.question_id = target_question_id and o.position >= n;
  exception when foreign_key_violation then
    raise exception 'an option players have already chosen cannot be removed'
      using errcode = 'foreign_key_violation';
  end;

  select coalesce(array_agg(distinct lower(btrim(t))), '{}') into clean_tags
  from unnest(coalesce(tags, '{}')) t where btrim(t) <> '';

  delete from public.question_tags qt
  where qt.question_id = target_question_id and qt.tag <> all (clean_tags);
  insert into public.question_tags (question_id, tag)
  select target_question_id, t from unnest(clean_tags) t
  on conflict do nothing;

  return public.admin_get_question(target_question_id);
end;
$$;

-- Moves questions to a new status. Publishing requires an answer key and at
-- least two options. When from_status is given, only questions currently in
-- that status move, so two reviewers can't both decide the same question;
-- the return value is how many moved. Each move is audited as approve/reject
-- (out of in_review) or set_status, with the note.
create or replace function public.admin_set_question_status(
  question_ids uuid[],
  new_status   public.question_status,
  note         text default null,
  from_status  public.question_status default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  bad   uuid;
  moved integer;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(question_ids, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(question_ids, 1) > 500 then
    raise exception 'at most 500 questions at a time' using errcode = 'invalid_parameter_value';
  end if;
  note := nullif(btrim(note), '');

  if new_status = 'published' then
    select q.id into bad from public.questions q
    where q.id = any (question_ids)
      and (not exists (select 1 from public.question_answers a where a.question_id = q.id)
           or (select count(*) from public.question_options o where o.question_id = q.id) < 2)
    limit 1;
    if bad is not null then
      raise exception 'question % has no answer key or fewer than 2 options', bad
        using errcode = 'check_violation', detail = bad::text;
    end if;
  end if;

  with locked as (
    select q.id, q.status as old_status
    from public.questions q
    where q.id = any (question_ids)
      and q.status <> new_status
      and (from_status is null or q.status = from_status)
    for update
  ),
  changed as (
    update public.questions q set
      status      = new_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = note
    from locked l
    where q.id = l.id
    returning q.id, l.old_status
  ),
  logged as (
    insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
    select auth.uid(),
           case
             when c.old_status = 'in_review' and new_status = 'published' then 'approve'
             when c.old_status = 'in_review' and new_status = 'retired' then 'reject'
             else 'set_status'
           end,
           'questions', c.id::text,
           jsonb_build_object('status', c.old_status),
           jsonb_build_object('status', new_status, 'note', note)
    from changed c
    returning 1
  )
  select count(*) into moved from logged;

  return moved;
end;
$$;

revoke execute on function public.admin_set_user_ban(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_list_users(text, public.user_role, boolean, uuid, integer, integer) from public, anon;
revoke execute on function public.admin_get_question(uuid) from public, anon;
revoke execute on function public.admin_save_question(uuid, uuid, text, public.question_difficulty, integer, text[], integer, text, text, text[]) from public, anon;
revoke execute on function public.admin_set_question_status(uuid[], public.question_status, text, public.question_status) from public, anon;
grant execute on function public.admin_set_user_ban(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.admin_list_users(text, public.user_role, boolean, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.admin_get_question(uuid) to authenticated, service_role;
grant execute on function public.admin_save_question(uuid, uuid, text, public.question_difficulty, integer, text[], integer, text, text, text[]) to authenticated, service_role;
grant execute on function public.admin_set_question_status(uuid[], public.question_status, text, public.question_status) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit coverage for the remaining admin-writable tables
-- ---------------------------------------------------------------------------
create trigger question_tags_audit
  after insert or update or delete on public.question_tags
  for each row execute function private.audit_row_change();
create trigger daily_set_items_audit
  after insert or update or delete on public.daily_set_items
  for each row execute function private.audit_row_change();
-- Users file reports and feedback; admins triage them. Only the triage
-- (update/delete) is audited.
create trigger reports_audit
  after update or delete on public.reports
  for each row execute function private.audit_row_change();
create trigger feedback_audit
  after update or delete on public.feedback
  for each row execute function private.audit_row_change();

-- Generation jobs are written by the Edge Function as service_role, where
-- auth.uid() is null, so the job itself names the admin: created_by for
-- creation, cancelled_by for cancellation. Batch progress is not audited (the
-- questions it inserts are).
alter table public.question_generation_jobs
  add column cancelled_by uuid references public.profiles (id) on delete set null;

create or replace function private.audit_generation_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
    values (coalesce(new.created_by, auth.uid()), 'create', 'question_generation_jobs', new.id::text, to_jsonb(new));
  elsif new.status is distinct from old.status and new.status in ('cancelled', 'done', 'failed') then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
    values (
      case when new.status = 'cancelled' then coalesce(new.cancelled_by, auth.uid()) end,
      case when new.status = 'cancelled' then 'cancel' else 'finish' end,
      'question_generation_jobs', new.id::text,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'inserted', new.inserted, 'requested', new.requested,
                         'batches', new.batches, 'last_error', new.last_error)
    );
  end if;
  return null;
end;
$$;

revoke execute on function private.audit_generation_job() from public, anon, authenticated;

create trigger question_generation_jobs_audit
  after insert or update of status on public.question_generation_jobs
  for each row execute function private.audit_generation_job();

-- Admin UI audit filters. question_ref is the question a row is about,
-- whichever table it came from (question rows, answer keys, options, tags,
-- reports, daily set items), so a question's page can show its full history.
alter table public.audit_log
  add column question_ref text generated always as (
    case
      when entity_type in ('questions', 'question_answers') then entity_id
      else coalesce(after ->> 'question_id', before ->> 'question_id')
    end
  ) stored;

create index audit_log_question_ref_idx on public.audit_log (question_ref, created_at desc)
  where question_ref is not null;
create index audit_log_action_idx on public.audit_log (action, created_at desc);
