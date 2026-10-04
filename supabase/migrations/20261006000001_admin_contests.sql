-- Admin contests: list, create/edit, publish, delete, question picker and
-- results. Reuses public.contests / contest_items / contest_entries /
-- contest_answers from learner_app. Every function checks private.is_admin()
-- itself; every row change is audited by the contests_audit and
-- contest_items_audit triggers (actor = auth.uid()).
--
-- Contest state for admins is 'draft' (unpublished) or the player-facing
-- upcoming / live / ended. There is no stored duration: it is ends_at - starts_at.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.admin_contest_row(c public.contests)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',             c.id,
    'slug',           c.slug,
    'title',          c.title,
    'description',    c.description,
    'starts_at',      c.starts_at,
    'ends_at',        c.ends_at,
    'is_published',   c.is_published,
    'state',          case when c.is_published then private.contest_state(c) else 'draft' end,
    'question_count', (select count(*) from public.contest_items i where i.contest_id = c.id),
    'participants',   (select count(*) from public.contest_entries e where e.contest_id = c.id),
    'created_at',     c.created_at,
    'updated_at',     c.updated_at
  );
$$;

-- Same bar as private.servable_question, minus the "in an open contest" rule
-- (the contest being edited would always trip it).
create or replace function private.contest_question_ready(target_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    join public.subtopics sub on sub.id = q.subtopic_id and sub.is_active
    join public.topics top    on top.id = sub.topic_id and top.is_active
    join public.sections sec  on sec.id = top.section_id and sec.is_active
    join public.question_answers qa on qa.question_id = q.id
    where q.id = target_question_id
      and q.status = 'published'
      and (select count(*) from public.question_options o where o.question_id = q.id) >= 2
  );
$$;

revoke execute on function private.admin_contest_row(public.contests) from public, anon, authenticated;
revoke execute on function private.contest_question_ready(uuid)       from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Every contest, drafts included, newest start first.
create or replace function public.admin_list_contests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(private.admin_contest_row(c) order by c.starts_at desc, c.id)
    from public.contests c
  ), '[]'::jsonb);
end;
$$;

-- One contest with its questions in order (no answer keys).
create or replace function public.admin_get_contest(target_contest_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contests;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.contests x where x.id = target_contest_id;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  return private.admin_contest_row(c) || jsonb_build_object('questions', coalesce((
    select jsonb_agg(jsonb_build_object(
             'position', i.position, 'question_id', q.id, 'stem', q.stem,
             'difficulty', q.difficulty, 'status', q.status) order by i.position)
    from public.contest_items i
    join public.questions q on q.id = i.question_id
    where i.contest_id = c.id
  ), '[]'::jsonb));
end;
$$;

-- Random questions a contest could use: servable (published, keyed, active
-- taxonomy, not already in an unfinished contest), narrowed by the most
-- specific of subtopic / topic / section, and by difficulty.
create or replace function public.admin_pick_contest_questions(
  section_id     uuid default null,
  topic_id       uuid default null,
  subtopic_id    uuid default null,
  difficulty     public.question_difficulty default null,
  question_count integer default 10,
  exclude_ids    uuid[] default '{}'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if question_count is null or question_count < 1 or question_count > 100 then
    raise exception 'pick 1 to 100 questions' using errcode = 'invalid_parameter_value';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'stem', p.stem, 'difficulty', p.difficulty,
                                        'subtopic', p.subtopic))
    from (
      select q.id, q.stem, q.difficulty, st.name as subtopic
      from public.questions q
      join public.subtopics st on st.id = q.subtopic_id
      join public.topics t on t.id = st.topic_id
      where private.servable_question(q.id)
        and (admin_pick_contest_questions.difficulty is null or q.difficulty = admin_pick_contest_questions.difficulty)
        and (case
               when admin_pick_contest_questions.subtopic_id is not null then st.id = admin_pick_contest_questions.subtopic_id
               when admin_pick_contest_questions.topic_id is not null then t.id = admin_pick_contest_questions.topic_id
               when admin_pick_contest_questions.section_id is not null then t.section_id = admin_pick_contest_questions.section_id
               else true
             end)
        and not (q.id = any (coalesce(admin_pick_contest_questions.exclude_ids, '{}')))
      order by random()
      limit question_count
    ) p
  ), '[]'::jsonb);
end;
$$;

-- Standings and submissions. Unlike get_contest_standings this lists banned
-- players too (flagged) and each player's answers in question order.
create or replace function public.admin_get_contest_results(
  target_contest_id uuid,
  page_size         integer default 50,
  page_offset       integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n_limit  integer := least(greatest(coalesce(page_size, 50), 1), 100);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.contests c where c.id = target_contest_id) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.contest_entries e where e.contest_id = target_contest_id),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', r.rank, 'user_id', r.user_id, 'handle', p.handle, 'display_name', p.display_name,
               'banned', p.banned_at is not null, 'joined_at', r.joined_at, 'score', r.score,
               'correct', r.correct, 'answered', r.answered, 'time_ms', r.time_ms,
               'answers', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'position', i.position, 'question_id', a.question_id, 'is_correct', a.is_correct,
                          'points', a.points, 'time_ms', a.time_ms, 'created_at', a.created_at) order by i.position)
                 from public.contest_answers a
                 join public.contest_items i on i.contest_id = a.contest_id and i.question_id = a.question_id
                 where a.contest_id = r.contest_id and a.user_id = r.user_id
               ), '[]'::jsonb)) order by r.rank)
      from (
        select e.*, row_number() over (order by e.score desc, e.time_ms, e.last_answer_at nulls last, e.joined_at, e.user_id) as rank
        from public.contest_entries e
        where e.contest_id = target_contest_id
        order by rank
        limit n_limit offset n_offset
      ) r
      join public.profiles p on p.id = r.user_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- Creates (target_contest_id null) or edits a contest and replaces its
-- question list. Once any player has joined, the questions are locked and the
-- start time can no longer move after the contest has begun.
create or replace function public.admin_save_contest(
  target_contest_id uuid,
  title             text,
  description       text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  question_ids      uuid[] default '{}',
  is_published      boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids      uuid[] := coalesce(question_ids, '{}');
  n        integer := coalesce(array_length(ids, 1), 0);
  c        public.contests;
  current_ids uuid[];
  n_entries bigint;
  base     text;
  bad      uuid;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  title := btrim(coalesce(title, ''));
  description := nullif(btrim(coalesce(description, '')), '');
  is_published := coalesce(is_published, false);

  if char_length(title) not between 1 and 120 then
    raise exception 'the title must be 1 to 120 characters' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(description) > 2000 then
    raise exception 'the description is at most 2000 characters' using errcode = 'invalid_parameter_value';
  end if;
  if starts_at is null or ends_at is null then
    raise exception 'set a start and an end time' using errcode = 'invalid_parameter_value';
  end if;
  if ends_at <= starts_at then
    raise exception 'the contest must end after it starts' using errcode = 'invalid_parameter_value';
  end if;
  if ends_at - starts_at > interval '14 days' then
    raise exception 'a contest can run for at most 14 days' using errcode = 'invalid_parameter_value';
  end if;
  if n > 100 then
    raise exception 'a contest holds at most 100 questions' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(distinct x) from unnest(ids) x) <> n then
    raise exception 'a question can only appear once' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from public.questions q where q.id = any (ids)) <> n then
    raise exception 'some questions do not exist' using errcode = 'invalid_parameter_value';
  end if;
  if is_published then
    if n = 0 then
      raise exception 'add at least one question before publishing' using errcode = 'invalid_parameter_value';
    end if;
    select x into bad from unnest(ids) x where not private.contest_question_ready(x) limit 1;
    if bad is not null then
      raise exception 'question % is not ready (it must be published with an answer key)', bad
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if target_contest_id is null then
    base := trim(both '-' from lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')));
    base := left(coalesce(nullif(base, ''), 'contest'), 50);
    insert into public.contests (slug, title, description, starts_at, ends_at, is_published)
    values (trim(both '-' from base) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6),
            title, description, starts_at, ends_at, is_published)
    returning * into c;
    current_ids := '{}';
  else
    select * into c from public.contests x where x.id = target_contest_id for update;
    if not found then
      raise exception 'contest not found' using errcode = 'no_data_found';
    end if;
    select coalesce(array_agg(i.question_id order by i.position), '{}') into current_ids
    from public.contest_items i where i.contest_id = c.id;
    select count(*) into n_entries from public.contest_entries e where e.contest_id = c.id;
    if n_entries > 0 and ids is distinct from current_ids then
      raise exception 'the questions are locked once players have joined' using errcode = 'object_not_in_prerequisite_state';
    end if;
    if n_entries > 0 and starts_at is distinct from c.starts_at and c.starts_at <= now() then
      raise exception 'the start time is locked once players have joined a contest that has begun'
        using errcode = 'object_not_in_prerequisite_state';
    end if;
    update public.contests x set
      title = admin_save_contest.title,
      description = admin_save_contest.description,
      starts_at = admin_save_contest.starts_at,
      ends_at = admin_save_contest.ends_at,
      is_published = admin_save_contest.is_published
    where x.id = c.id;
  end if;

  if ids is distinct from current_ids then
    delete from public.contest_items i where i.contest_id = c.id;
    insert into public.contest_items (contest_id, question_id, position)
    select c.id, x.q, (x.ord - 1)::smallint from unnest(ids) with ordinality as x (q, ord);
  end if;

  return public.admin_get_contest(c.id);
end;
$$;

-- Publish or unpublish from the list. Publishing re-checks the questions.
create or replace function public.admin_set_contest_published(target_contest_id uuid, published boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c   public.contests;
  bad uuid;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if published is null then
    raise exception 'say whether to publish or unpublish' using errcode = 'invalid_parameter_value';
  end if;
  select * into c from public.contests x where x.id = target_contest_id for update;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if published then
    if not exists (select 1 from public.contest_items i where i.contest_id = c.id) then
      raise exception 'add at least one question before publishing' using errcode = 'invalid_parameter_value';
    end if;
    select i.question_id into bad from public.contest_items i
    where i.contest_id = c.id and not private.contest_question_ready(i.question_id) limit 1;
    if bad is not null then
      raise exception 'question % is not ready (it must be published with an answer key)', bad
        using errcode = 'invalid_parameter_value';
    end if;
  end if;
  update public.contests x set is_published = published where x.id = c.id and x.is_published <> published;
end;
$$;

-- Deleting removes the contest and its question list. Refused once anyone has
-- joined: their entries and answers would go with it, so unpublish instead.
create or replace function public.admin_delete_contest(target_contest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.contests c where c.id = target_contest_id for update;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.contest_entries e where e.contest_id = target_contest_id) then
    raise exception 'players have joined this contest; unpublish it instead of deleting it'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  delete from public.contests c where c.id = target_contest_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_list_contests() from public, anon;
revoke execute on function public.admin_get_contest(uuid) from public, anon;
revoke execute on function public.admin_pick_contest_questions(uuid, uuid, uuid, public.question_difficulty, integer, uuid[]) from public, anon;
revoke execute on function public.admin_get_contest_results(uuid, integer, integer) from public, anon;
revoke execute on function public.admin_save_contest(uuid, text, text, timestamptz, timestamptz, uuid[], boolean) from public, anon;
revoke execute on function public.admin_set_contest_published(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_contest(uuid) from public, anon;
grant execute on function public.admin_list_contests() to authenticated, service_role;
grant execute on function public.admin_get_contest(uuid) to authenticated, service_role;
grant execute on function public.admin_pick_contest_questions(uuid, uuid, uuid, public.question_difficulty, integer, uuid[]) to authenticated, service_role;
grant execute on function public.admin_get_contest_results(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.admin_save_contest(uuid, text, text, timestamptz, timestamptz, uuid[], boolean) to authenticated, service_role;
grant execute on function public.admin_set_contest_published(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_contest(uuid) to authenticated, service_role;
