-- Aptric Tutor on review screens (Progress → Mistakes, the session summary):
-- tutor_context now opens a question the player has already answered in the
-- given context even when it is no longer in scope (a past day's daily set,
-- a retired question). It is always phase 'answered' then. Everything else is
-- unchanged from 20261003000001_tutor.sql.

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

  -- A question the player has already answered in this context stays open
  -- for review (a past day's daily set, a since-retired question); anything
  -- else must be in scope now.
  select a.context, a.daily_set_id into scope
  from public.attempts a
  where a.user_id = uid and a.question_id = tutor_context.question_id and a.context = tutor_context.context
  order by a.created_at desc
  limit 1;
  if not found then
    select * into scope from private.resolve_attempt_scope(uid, tutor_context.question_id, tutor_context.context);
  end if;

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
