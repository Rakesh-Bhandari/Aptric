-- Aptric Tutor: grounding context for the AI tutor and its chat log.
--
--   private.tutor_context(uid, question_id, context)      -> jsonb  (API only)
--   private.tutor_append_message(uid, question_id, context, role, intent, content, model) -> uuid (API only)
--   private.tutor_history(uid, question_id, context, max_count) -> jsonb (API only)
--   public.tutor_messages                                  users read their own rows
--
-- The API loads tutor_context before every model call: the model only tutors
-- questions that are verified here, and the answer key it gets never leaves
-- the API while the player is still solving (phase = 'solving').
--
-- Errors (SQLSTATE), as in the gameplay RPCs:
--   42501  not signed in / suspended / not your question in that context
--   P0002  no such question / no daily set today
--   22023  bad argument

-- ---------------------------------------------------------------------------
-- Chat log. One row per turn. Written only by the API through
-- private.tutor_append_message; players read their own rows.
-- ---------------------------------------------------------------------------
create table public.tutor_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete cascade,
  context      public.attempt_context not null,
  role         text not null check (role in ('user', 'assistant')),
  intent       text check (intent in ('hint', 'steps', 'next_step', 'understand', 'concept', 'explain', 'training', 'free')),
  content      text not null check (char_length(content) between 1 and 4000),
  model        text check (char_length(model) <= 200),
  created_at   timestamptz not null default now()
);

create index tutor_messages_thread_idx on public.tutor_messages (user_id, question_id, context, created_at desc);
create index tutor_messages_question_idx on public.tutor_messages (question_id);

alter table public.tutor_messages enable row level security;
revoke all on public.tutor_messages from anon, authenticated;
grant select on public.tutor_messages to authenticated;

create policy "tutor_messages: read own" on public.tutor_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grounding context
-- ---------------------------------------------------------------------------

-- Everything the tutor needs about one question for one player, verified
-- against the database. `answer_key` is always included for the API; the API
-- must not forward it to the browser while phase = 'solving'.
--
--   phase    'solving'  no scoring attempt yet in this context
--            'answered' the player has submitted or given up
--            'locked'   assessment (placement) context, or the question is in
--                       a contest that hasn't ended; nothing else is returned
--   verified published, with an answer key whose option belongs to it
--
-- Scope follows private.resolve_attempt_scope: daily = in the player's set
-- for today, practice = published.
create or replace function private.tutor_context(
  uid         uuid,
  question_id uuid,
  context     public.attempt_context default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scope   record;
  q       record;
  ans     record;
  att     record;
  hinted  boolean;
  correct_position smallint;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.banned_at is not null) then
    raise exception 'account suspended' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.questions x where x.id = tutor_context.question_id) then
    raise exception 'question not found' using errcode = 'no_data_found';
  end if;

  -- Placement answers aren't revealed until the test is graded, and contest
  -- questions stay unseen until the contest ends.
  if tutor_context.context = 'assessment' or exists (
    select 1 from public.contest_items ci join public.contests c on c.id = ci.contest_id
    where ci.question_id = tutor_context.question_id and c.ends_at > now()
  ) then
    return jsonb_build_object('question_id', tutor_context.question_id, 'context', tutor_context.context,
                              'phase', 'locked', 'verified', false);
  end if;

  select * into scope from private.resolve_attempt_scope(uid, tutor_context.question_id, tutor_context.context);

  select x.id, x.stem, x.difficulty, x.est_seconds, x.status,
         sub.id as subtopic_id, sub.name as subtopic, top.id as topic_id, top.name as topic, sec.name as section
  into q
  from public.questions x
  join public.subtopics sub on sub.id = x.subtopic_id
  join public.topics top    on top.id = sub.topic_id
  join public.sections sec  on sec.id = top.section_id
  where x.id = tutor_context.question_id;

  select a.correct_option_id, a.explanation, a.hint into ans
  from public.question_answers a where a.question_id = q.id;

  select o.position into correct_position
  from public.question_options o
  where o.id = ans.correct_option_id and o.question_id = q.id;

  select a.selected_option_id, a.is_correct, a.used_hint, a.time_ms, a.created_at into att
  from public.attempts a
  where a.user_id = uid and a.question_id = q.id
    and a.context = scope.context and a.daily_set_id is not distinct from scope.daily_set_id;

  hinted := exists (
    select 1 from public.hint_uses h
    where h.user_id = uid and h.question_id = q.id
      and h.context = scope.context and h.daily_set_id is not distinct from scope.daily_set_id
  );

  return jsonb_build_object(
    'question_id', q.id,
    'context',     scope.context,
    'phase',       case when att.created_at is not null then 'answered' else 'solving' end,
    'verified',    q.status = 'published' and ans.correct_option_id is not null and correct_position is not null,
    'question',    jsonb_build_object(
      'stem',        q.stem,
      'difficulty',  q.difficulty,
      'est_seconds', q.est_seconds,
      'section',     q.section,
      'topic',       q.topic,
      'subtopic',    q.subtopic,
      'subtopic_id', q.subtopic_id,
      'tags',        coalesce((select jsonb_agg(t.tag order by t.tag) from public.question_tags t
                               where t.question_id = q.id), '[]'::jsonb),
      'options',     coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'body', o.body)
                                                order by o.position)
                               from public.question_options o where o.question_id = q.id), '[]'::jsonb)
    ),
    'answer_key',  case when ans.correct_option_id is not null then jsonb_build_object(
      'correct_option_id', ans.correct_option_id,
      'correct_position',  correct_position,
      'explanation',       ans.explanation,
      'hint',              ans.hint) end,
    'attempt',     case when att.created_at is not null then jsonb_build_object(
      'selected_option_id', att.selected_option_id,
      'gave_up',            att.selected_option_id is null,
      'is_correct',         att.is_correct,
      'used_hint',          att.used_hint,
      'time_ms',            att.time_ms) end,
    'hint_used',   hinted,
    'learner',     private.tutor_learner(uid, q.subtopic_id, q.topic_id, q.id)
  );
end;
$$;

-- Compact learner profile for personal training: level and goal, the three
-- weakest subtopics by accuracy (3+ attempts), recent mistakes in this topic
-- (the same rows get_mistakes lists, without answers), and accuracy and
-- average time on this subtopic.
create or replace function private.tutor_learner(
  uid                 uuid,
  target_subtopic_id  uuid,
  target_topic_id     uuid,
  exclude_question_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'level',     p.level,
    'xp',        p.xp,
    'exam_goal', p.exam_goal,
    'weak_subtopics', coalesce((
      select jsonb_agg(x.w order by x.accuracy, x.attempted desc)
      from (
        select jsonb_build_object(
                 'section',   sec.name,
                 'topic',     top.name,
                 'subtopic',  sub.name,
                 'attempted', s.attempted,
                 'correct',   s.correct,
                 'accuracy',  round(s.correct::numeric / s.attempted, 2),
                 'stars',     private.mastery_stars(s.attempted, s.correct)) as w,
               s.correct::numeric / s.attempted as accuracy, s.attempted
        from (
          select q.subtopic_id, count(*) as attempted, count(*) filter (where a.is_correct) as correct
          from public.attempts a join public.questions q on q.id = a.question_id
          where a.user_id = uid
          group by q.subtopic_id
          having count(*) >= 3
        ) s
        join public.subtopics sub on sub.id = s.subtopic_id
        join public.topics top    on top.id = sub.topic_id
        join public.sections sec  on sec.id = top.section_id
        order by s.correct::numeric / s.attempted, s.attempted desc
        limit 3
      ) x
    ), '[]'::jsonb),
    'recent_mistakes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subtopic',    m.subtopic,
               'stem',        left(m.stem, 200),
               'gave_up',     m.gave_up,
               'answered_at', m.created_at) order by m.created_at desc)
      from (select * from (
        select distinct on (a.question_id)
               a.question_id, a.created_at, a.selected_option_id is null as gave_up, q.stem, sub.name as subtopic
        from public.attempts a
        join public.questions q   on q.id = a.question_id
        join public.subtopics sub on sub.id = q.subtopic_id
        where a.user_id = uid and not a.is_correct and sub.topic_id = target_topic_id
          and a.question_id <> exclude_question_id
          -- Resolved mistakes (answered correctly since) no longer count.
          and not exists (select 1 from public.attempts c
                          where c.user_id = uid and c.question_id = a.question_id and c.is_correct
                            and c.created_at > a.created_at)
        order by a.question_id, a.created_at desc
      ) d order by d.created_at desc limit 5) m
    ), '[]'::jsonb),
    'subtopic_stats', (
      select jsonb_build_object(
               'attempted',   count(*),
               'correct',     count(*) filter (where a.is_correct),
               'accuracy',    case when count(*) > 0
                                then round(count(*) filter (where a.is_correct)::numeric / count(*), 2) end,
               'avg_time_ms', round(avg(a.time_ms)))
      from public.attempts a join public.questions q on q.id = a.question_id
      where a.user_id = uid and q.subtopic_id = target_subtopic_id
    )
  )
  from public.profiles p
  where p.id = uid;
$$;

-- ---------------------------------------------------------------------------
-- Chat log access for the API
-- ---------------------------------------------------------------------------

-- Appends one turn. The caller (the API) has already loaded tutor_context for
-- this question, so scope is not re-checked here.
create or replace function private.tutor_append_message(
  uid         uuid,
  question_id uuid,
  context     public.attempt_context,
  role        text,
  intent      text,
  content     text,
  model       text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.tutor_messages (user_id, question_id, context, role, intent, content, model)
  values (uid, question_id, context, role, intent, left(content, 4000), model)
  returning id;
$$;

-- The latest `max_count` turns of one thread, oldest first.
create or replace function private.tutor_history(
  uid         uuid,
  question_id uuid,
  context     public.attempt_context,
  max_count   integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'role', m.role, 'intent', m.intent, 'content', m.content, 'created_at', m.created_at)
         order by m.created_at, m.role desc), '[]'::jsonb)
  from (
    select * from public.tutor_messages t
    where t.user_id = uid and t.question_id = tutor_history.question_id and t.context = tutor_history.context
    order by t.created_at desc, t.role
    limit least(greatest(coalesce(max_count, 50), 1), 200)
  ) m;
$$;

-- Only the API (service_role, and the gateway's owner) may call these: the
-- context carries the answer key.
revoke execute on function private.tutor_context(uuid, uuid, public.attempt_context) from public, anon, authenticated;
revoke execute on function private.tutor_learner(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.tutor_append_message(uuid, uuid, public.attempt_context, text, text, text, text) from public, anon, authenticated;
revoke execute on function private.tutor_history(uuid, uuid, public.attempt_context, integer) from public, anon, authenticated;
grant execute on function private.tutor_context(uuid, uuid, public.attempt_context) to service_role;
grant execute on function private.tutor_learner(uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.tutor_append_message(uuid, uuid, public.attempt_context, text, text, text, text) to service_role;
grant execute on function private.tutor_history(uuid, uuid, public.attempt_context, integer) to service_role;
