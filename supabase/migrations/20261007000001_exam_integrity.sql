-- Exam integrity: contest attempts that end when the player leaves the page,
-- and the "detect tab switches in Practice" preference.
--
-- A contest attempt is the player's entry. finish_contest() closes it once
-- (idempotent) and records why; after that submit_contest_answer() refuses, so a
-- refresh or a reopened tab cannot resume a violated attempt. Answers given so
-- far stay and are ranked as usual.

alter table public.contest_entries
  add column finished_at timestamptz,
  add column violation   text check (violation in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'page_left')),
  add constraint contest_entries_violation_finished check (violation is null or finished_at is not null);

-- Practice only. Daily and contests have no such setting: detection is always on there.
alter table public.profiles
  add column detect_tab_switches_practice boolean not null default true;

grant update (detect_tab_switches_practice) on public.profiles to authenticated;

-- The caller's attempt state rides on every contest summary (and so on get_contest).
create or replace function private.contest_summary(c public.contests, uid uuid)
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
    'state',          private.contest_state(c),
    'question_count', (select count(*) from public.contest_items i where i.contest_id = c.id),
    'participants',   (select count(*) from public.contest_entries e where e.contest_id = c.id),
    'my_entry',       (select jsonb_build_object('score', r.score, 'correct', r.correct,
                                                 'answered', r.answered, 'time_ms', r.time_ms, 'rank', r.rank)
                       from private.contest_ranking(c.id) r where r.user_id = uid),
    'finished_at',    (select e.finished_at from public.contest_entries e where e.contest_id = c.id and e.user_id = uid),
    'violation',      (select e.violation from public.contest_entries e where e.contest_id = c.id and e.user_id = uid)
  );
$$;

-- Closes the caller's attempt. Idempotent: the first call records finished_at and
-- the reason; later calls change nothing and return the same state.
create or replace function public.finish_contest(contest_id uuid, violation text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  c     public.contests;
  entry public.contest_entries;
begin
  if violation is not null and violation not in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'page_left') then
    raise exception 'unknown violation' using errcode = 'invalid_parameter_value';
  end if;

  select * into c from public.contests x where x.id = finish_contest.contest_id and x.is_published;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;

  select * into entry from public.contest_entries e
  where e.contest_id = c.id and e.user_id = uid for update;
  if not found then
    raise exception 'contest not joined' using errcode = 'no_data_found';
  end if;

  -- After the end there is nothing left to close.
  if entry.finished_at is null and private.contest_state(c) = 'live' then
    update public.contest_entries e
    set finished_at = now(), violation = finish_contest.violation
    where e.contest_id = c.id and e.user_id = uid;
  end if;

  return private.contest_summary(c, uid);
end;
$$;

-- As before, plus: refused once the attempt is finished.
create or replace function public.submit_contest_answer(
  contest_id  uuid,
  question_id uuid,
  option_id   uuid,
  time_ms     integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  c       public.contests;
  ans_key uuid;
  diff    public.question_difficulty;
  right_  boolean;
  pts     integer;
  entry   public.contest_entries;
begin
  if time_ms is not null and (time_ms < 0 or time_ms > 86400000) then
    raise exception 'time_ms out of range' using errcode = 'invalid_parameter_value';
  end if;

  select * into c from public.contests x where x.id = submit_contest_answer.contest_id and x.is_published;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if private.contest_state(c) <> 'live' then
    raise exception 'contest is not live' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not exists (select 1 from public.contest_items i
                 where i.contest_id = c.id and i.question_id = submit_contest_answer.question_id) then
    raise exception 'question is not in this contest' using errcode = 'insufficient_privilege';
  end if;
  if option_id is not null and not exists (
    select 1 from public.question_options o
    where o.id = submit_contest_answer.option_id and o.question_id = submit_contest_answer.question_id
  ) then
    raise exception 'option does not belong to this question' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.contest_entries (contest_id, user_id) values (c.id, uid) on conflict do nothing;
  select * into entry from public.contest_entries e where e.contest_id = c.id and e.user_id = uid for update;
  if entry.finished_at is not null then
    raise exception 'attempt already submitted' using errcode = 'object_not_in_prerequisite_state';
  end if;

  select qa.correct_option_id into ans_key from public.question_answers qa
  where qa.question_id = submit_contest_answer.question_id;
  if ans_key is null then
    raise exception 'question has no answer key' using errcode = 'no_data_found';
  end if;
  select q.difficulty into diff from public.questions q where q.id = submit_contest_answer.question_id;

  right_ := option_id is not null and option_id = ans_key;
  pts    := case when right_ then case diff when 'easy' then 10 when 'medium' then 20 else 30 end else 0 end;

  insert into public.contest_answers (contest_id, user_id, question_id, selected_option_id, is_correct, points, time_ms)
  values (c.id, uid, submit_contest_answer.question_id, option_id, right_, pts, submit_contest_answer.time_ms)
  on conflict do nothing;
  if not found then
    raise exception 'question already answered' using errcode = 'unique_violation';
  end if;

  update public.contest_entries e
  set score = e.score + pts,
      correct = e.correct + right_::integer,
      answered = e.answered + 1,
      time_ms = e.time_ms + coalesce(submit_contest_answer.time_ms, 0),
      last_answer_at = now()
  where e.contest_id = c.id and e.user_id = uid;

  return jsonb_build_object('is_correct', right_, 'points', pts) || private.contest_summary(c, uid);
end;
$$;

revoke execute on function public.finish_contest(uuid, text) from public, anon;
grant execute on function public.finish_contest(uuid, text) to authenticated, service_role;
