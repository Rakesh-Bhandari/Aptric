-- Gameplay RPCs: the only way users read the daily set, answer, take hints
-- or give up. Everything that touches answer keys, attempts, the XP ledger or
-- streaks happens in SECURITY DEFINER functions here; the client never sees an
-- answer before it has spent its one scoring attempt.
--
--   get_today_set()                                     -> jsonb
--   submit_answer(question_id, option_id, context, time_ms) -> jsonb
--   use_hint(question_id, context)                      -> jsonb
--   give_up(question_id, context)                       -> jsonb
--
-- Errors (SQLSTATE):
--   42501  not signed in, or the question is not yours to answer in that context
--   23505  already answered (one scoring attempt per question per context)
--   22023  bad argument (unknown context, option of another question, time_ms)
--   P0002  no daily set released for your track today / question has no answer key

-- ---------------------------------------------------------------------------
-- Hint ledger. One row per user + question + context, so a hint is charged at
-- most once. The penalty itself is applied when the attempt is scored.
-- ---------------------------------------------------------------------------
create table public.hint_uses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  question_id   uuid not null references public.questions (id) on delete cascade,
  context       public.attempt_context not null,
  daily_set_id  uuid references public.daily_sets (id) on delete cascade,
  created_at    timestamptz not null default now(),
  check ((context = 'daily') = (daily_set_id is not null)),
  constraint hint_uses_user_question_context_key
    unique nulls not distinct (user_id, question_id, context, daily_set_id)
);

create index hint_uses_question_idx  on public.hint_uses (question_id);
create index hint_uses_daily_set_idx on public.hint_uses (daily_set_id) where daily_set_id is not null;

alter table public.hint_uses enable row level security;
revoke all on public.hint_uses from anon, authenticated;
grant select on public.hint_uses to authenticated;

create policy "hint_uses: read own or admin" on public.hint_uses
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Scoring. Correct answers earn a difficulty-based base, minus the hint
-- penalty (once), halved in practice, never below zero. Wrong answers and
-- give-ups earn nothing.
-- ---------------------------------------------------------------------------
create or replace function private.score_points(
  difficulty public.question_difficulty,
  context    public.attempt_context,
  used_hint  boolean,
  is_correct boolean
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when not is_correct then 0
    else greatest(0,
      (case difficulty when 'easy' then 10 when 'medium' then 20 when 'hard' then 30 end
       - case when used_hint then 5 else 0 end)
      / case when context = 'practice' then 2 else 1 end)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Caller context helpers
-- ---------------------------------------------------------------------------

-- Signed-in caller or 42501.
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
  return uid;
end;
$$;

-- Today's released daily set for the user's track, where "today" is the
-- calendar date in the user's own timezone. NULL when none is released.
create or replace function private.today_set_for(target_user_id uuid)
returns table (daily_set_id uuid, set_date date, track_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select coalesce(p.track_id, private.default_track_id()) as track_id,
           (now() at time zone p.timezone)::date            as today
    from public.profiles p
    where p.id = target_user_id
  )
  select s.id, me.today, me.track_id
  from me
  left join public.daily_sets s
    on s.track_id = me.track_id
   and s.set_date = me.today
   and s.published_at <= now();
$$;

-- Validates that the caller may score target_question_id in the given context
-- and returns the daily_set_id that scopes the attempt (NULL for practice).
--   daily:    the question is in today's released set for the caller's track.
--   practice: the question is published.
-- A NULL context means "daily if it's in today's set, otherwise practice".
create or replace function private.resolve_attempt_scope(
  target_user_id     uuid,
  target_question_id uuid,
  inout context      public.attempt_context,
  out daily_set_id   uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today record;
  in_set boolean;
begin
  if context = 'assessment' then
    raise exception 'context must be daily or practice' using errcode = 'invalid_parameter_value';
  end if;

  select * into today from private.today_set_for(target_user_id);
  in_set := today.daily_set_id is not null and exists (
    select 1 from public.daily_set_items i
    where i.daily_set_id = today.daily_set_id and i.question_id = target_question_id
  );

  if context is null then
    context := case when in_set then 'daily' else 'practice' end;
  end if;

  if context = 'daily' then
    if today.daily_set_id is null then
      raise exception 'no daily set released for your track today' using errcode = 'no_data_found';
    end if;
    if not in_set then
      raise exception 'question is not in your daily set' using errcode = 'insufficient_privilege';
    end if;
    daily_set_id := today.daily_set_id;
  else
    if not exists (
      select 1 from public.questions q
      where q.id = target_question_id and q.status = 'published'
    ) then
      raise exception 'question is not available for practice' using errcode = 'insufficient_privilege';
    end if;
    daily_set_id := null;
  end if;
end;
$$;

-- Streak bookkeeping for the first daily attempt of a (local) day. Yesterday
-- extends the streak, anything older restarts it at 1. Returns the profile's
-- streak after the update.
create or replace function private.bump_streak(target_user_id uuid, on_date date)
returns table (current_streak integer, longest_streak integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set current_streak = case when p.last_streak_date = on_date - 1 then p.current_streak + 1 else 1 end,
      longest_streak = greatest(p.longest_streak,
                         case when p.last_streak_date = on_date - 1 then p.current_streak + 1 else 1 end),
      last_streak_date = on_date
  where p.id = target_user_id
    and (p.last_streak_date is null or p.last_streak_date < on_date);

  return query
    select p.current_streak, p.longest_streak from public.profiles p where p.id = target_user_id;
end;
$$;

-- Records the one scoring attempt and its side effects. Shared by
-- submit_answer and give_up. Caller must already have validated scope.
create or replace function private.record_attempt(
  target_user_id     uuid,
  target_question_id uuid,
  attempt_context    public.attempt_context,
  attempt_set_id     uuid,
  selected_option_id uuid,
  time_ms            integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer     record;
  difficulty public.question_difficulty;
  hinted     boolean;
  correct    boolean;
  points     integer;
  attempt_id uuid;
  streak     record;
  set_date   date;
begin
  if time_ms is not null and (time_ms < 0 or time_ms > 86400000) then
    raise exception 'time_ms out of range' using errcode = 'invalid_parameter_value';
  end if;

  -- Serialise this user's scoring so streak and xp updates don't race.
  perform 1 from public.profiles p where p.id = target_user_id for update;

  select a.correct_option_id, a.explanation into answer
  from public.question_answers a where a.question_id = target_question_id;
  if not found then
    raise exception 'question has no answer key' using errcode = 'no_data_found';
  end if;

  select q.difficulty into difficulty from public.questions q where q.id = target_question_id;

  hinted := exists (
    select 1 from public.hint_uses h
    where h.user_id = target_user_id and h.question_id = target_question_id
      and h.context = attempt_context and h.daily_set_id is not distinct from attempt_set_id
  );
  correct := selected_option_id is not null and selected_option_id = answer.correct_option_id;
  points  := private.score_points(difficulty, attempt_context, hinted, correct);

  -- The unique constraint is what enforces "one scoring attempt".
  insert into public.attempts as t
    (user_id, question_id, context, daily_set_id, selected_option_id, is_correct, time_ms, used_hint, xp_awarded)
  values
    (target_user_id, target_question_id, attempt_context, attempt_set_id, selected_option_id, correct,
     record_attempt.time_ms, hinted, points)
  on conflict on constraint attempts_user_question_context_key do nothing
  returning t.id into attempt_id;

  if attempt_id is null then
    raise exception 'question already answered' using errcode = 'unique_violation';
  end if;

  if points > 0 then
    insert into public.xp_events (user_id, amount, reason, attempt_id, daily_set_id, idempotency_key, metadata)
    values (target_user_id, points,
            case attempt_context when 'daily' then 'daily_correct' else 'practice_correct' end,
            attempt_id, attempt_set_id, 'attempt:' || attempt_id,
            jsonb_build_object('question_id', target_question_id, 'difficulty', difficulty, 'used_hint', hinted));
    update public.profiles p set xp = p.xp + points where p.id = target_user_id;
  end if;

  if attempt_context = 'daily' then
    select s.set_date into set_date from public.daily_sets s where s.id = attempt_set_id;
    select * into streak from private.bump_streak(target_user_id, set_date);
  else
    select p.current_streak, p.longest_streak into streak from public.profiles p where p.id = target_user_id;
  end if;

  return jsonb_build_object(
    'attempt_id',        attempt_id,
    'context',           attempt_context,
    'is_correct',        correct,
    'correct_option_id', answer.correct_option_id,
    'explanation',       answer.explanation,
    'xp_awarded',        points,
    'used_hint',         hinted,
    'current_streak',    streak.current_streak,
    'longest_streak',    streak.longest_streak
  );
end;
$$;

revoke execute on all functions in schema private from public, anon;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- Today's set for the caller's track: questions and options, plus the
-- caller's own progress on each. Never includes correct options or
-- explanations; a hint's text appears only once the caller has paid for it.
create or replace function public.get_today_set()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  today record;
  track record;
begin
  select * into today from private.today_set_for(uid);
  select t.id, t.slug, t.name into track from public.tracks t where t.id = today.track_id;

  return jsonb_build_object(
    'set_date',     today.set_date,
    'track',        case when track.id is not null
                      then jsonb_build_object('id', track.id, 'slug', track.slug, 'name', track.name) end,
    'daily_set_id', today.daily_set_id,
    'title',        (select s.title from public.daily_sets s where s.id = today.daily_set_id),
    'questions',    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id',          q.id,
          'position',    i.position,
          'stem',        q.stem,
          'difficulty',  q.difficulty,
          'est_seconds', q.est_seconds,
          'section',     sec.name,
          'topic',       top.name,
          'subtopic',    sub.name,
          'has_hint',    qa.hint is not null,
          'hint',        case when h.id is not null then qa.hint end,
          'hint_used',   h.id is not null,
          'options',     (select jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'body', o.body)
                                           order by o.position)
                          from public.question_options o where o.question_id = q.id),
          'attempt',     case when a.id is not null then jsonb_build_object(
                           'selected_option_id', a.selected_option_id,
                           'is_correct',         a.is_correct,
                           'gave_up',            a.selected_option_id is null,
                           'used_hint',          a.used_hint,
                           'xp_awarded',         a.xp_awarded) end
        ) order by i.position)
      from public.daily_set_items i
      join public.questions q   on q.id = i.question_id
      join public.subtopics sub on sub.id = q.subtopic_id
      join public.topics top    on top.id = sub.topic_id
      join public.sections sec  on sec.id = top.section_id
      left join public.question_answers qa on qa.question_id = q.id
      left join public.attempts a
        on a.user_id = uid and a.question_id = q.id and a.context = 'daily' and a.daily_set_id = i.daily_set_id
      left join public.hint_uses h
        on h.user_id = uid and h.question_id = q.id and h.context = 'daily' and h.daily_set_id = i.daily_set_id
      where i.daily_set_id = today.daily_set_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_answer(
  question_id uuid,
  option_id   uuid,
  context     public.attempt_context,
  time_ms     integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  scope record;
begin
  if submit_answer.context is null then
    raise exception 'context is required' using errcode = 'invalid_parameter_value';
  end if;
  select * into scope from private.resolve_attempt_scope(uid, submit_answer.question_id, submit_answer.context);

  if not exists (
    select 1 from public.question_options o
    where o.id = submit_answer.option_id and o.question_id = submit_answer.question_id
  ) then
    raise exception 'option does not belong to this question' using errcode = 'invalid_parameter_value';
  end if;

  return private.record_attempt(uid, submit_answer.question_id, scope.context, scope.daily_set_id,
                                submit_answer.option_id, submit_answer.time_ms);
end;
$$;

-- Gives up: spends the scoring attempt for 0 XP and reveals the answer. In the
-- daily context it still counts as showing up for the streak.
create or replace function public.give_up(
  question_id uuid,
  context     public.attempt_context default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  scope record;
begin
  select * into scope from private.resolve_attempt_scope(uid, give_up.question_id, give_up.context);
  return private.record_attempt(uid, give_up.question_id, scope.context, scope.daily_set_id, null, null);
end;
$$;

-- Reveals the hint. The first reveal per question + context is recorded and
-- costs the penalty when the attempt is scored; repeat calls are free. Not
-- available once the question has been answered. Questions without a hint
-- cost nothing.
create or replace function public.use_hint(
  question_id uuid,
  context     public.attempt_context default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := private.require_uid();
  scope     record;
  hint_text text;
  charged   boolean := false;
begin
  select * into scope from private.resolve_attempt_scope(uid, use_hint.question_id, use_hint.context);

  if exists (
    select 1 from public.attempts a
    where a.user_id = uid and a.question_id = use_hint.question_id
      and a.context = scope.context and a.daily_set_id is not distinct from scope.daily_set_id
  ) then
    raise exception 'question already answered' using errcode = 'unique_violation';
  end if;

  select a.hint into hint_text from public.question_answers a where a.question_id = use_hint.question_id;

  if hint_text is not null then
    insert into public.hint_uses (user_id, question_id, context, daily_set_id)
    values (uid, use_hint.question_id, scope.context, scope.daily_set_id)
    on conflict on constraint hint_uses_user_question_context_key do nothing;
    charged := found;
  end if;

  return jsonb_build_object(
    'context',  scope.context,
    'hint',     hint_text,
    'charged',  charged
  );
end;
$$;

revoke execute on function public.get_today_set()                                          from public, anon;
revoke execute on function public.submit_answer(uuid, uuid, public.attempt_context, integer) from public, anon;
revoke execute on function public.give_up(uuid, public.attempt_context)                     from public, anon;
revoke execute on function public.use_hint(uuid, public.attempt_context)                    from public, anon;
grant  execute on function public.get_today_set()                                          to authenticated, service_role;
grant  execute on function public.submit_answer(uuid, uuid, public.attempt_context, integer) to authenticated, service_role;
grant  execute on function public.give_up(uuid, public.attempt_context)                     to authenticated, service_role;
grant  execute on function public.use_hint(uuid, public.attempt_context)                    to authenticated, service_role;
