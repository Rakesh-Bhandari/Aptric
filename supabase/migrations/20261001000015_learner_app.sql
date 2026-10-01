-- Learner app: onboarding goal + daily target, the placement test, practice
-- (taxonomy tree with mastery, question picker, weak areas), mistakes to
-- review, activity history, and contests.
--
--   profiles.exam_goal / daily_target / onboarded_at   user-editable
--   profiles.placement_level / placed_at               set by finish_placement()
--
-- New RPCs:
--   start_placement()                                  -> jsonb
--   finish_placement(test_id, answers)                 -> jsonb
--   get_practice_tree()                                -> jsonb
--   get_practice_questions(subtopic_ids, prefer_difficulty, mode, question_limit) -> jsonb
--   get_mistakes(page_size, page_offset)               -> jsonb
--   get_activity(days)                                 -> jsonb
--   list_contests()                                    -> jsonb
--   join_contest(contest_id)                           -> jsonb
--   get_contest(contest_id)                            -> jsonb
--   submit_contest_answer(contest_id, question_id, option_id, time_ms) -> jsonb
--   get_contest_standings(contest_id, page_size, page_offset) -> jsonb
--
-- Errors (SQLSTATE), as in the gameplay RPCs:
--   42501  not signed in / not yours / not open to you
--   23505  already answered
--   22023  bad argument
--   P0002  not found / not enough questions
--   55000  not available right now (placement cooldown, contest not live)

-- ---------------------------------------------------------------------------
-- Profile: exam goal, daily target, onboarding and placement.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column exam_goal       text references public.tags (slug) on update cascade on delete set null,
  add column daily_target    smallint not null default 10 check (daily_target between 1 and 100),
  add column onboarded_at    timestamptz,
  -- Daily-set band floor from the placement test (service-managed).
  add column placement_level smallint references public.levels (level) on delete set null,
  add column placed_at       timestamptz;

-- Players who were already playing skip the new onboarding steps.
update public.profiles set onboarded_at = created_at where handle is not null;

grant update (exam_goal, daily_target, onboarded_at) on public.profiles to authenticated;

-- exam_goal must be an exam tag.
create or replace function private.validate_exam_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.exam_goal is not null and not exists (
    select 1 from public.tags t where t.slug = new.exam_goal and t.kind = 'exam'
  ) then
    raise exception 'exam_goal must be an exam tag' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_exam_goal
  before insert or update of exam_goal on public.profiles
  for each row execute function private.validate_exam_goal();

-- Today's set: the placement level is a floor on the player's band, so a
-- strong newcomer starts on harder sets without being handed XP.
create or replace function private.today_set_for(target_user_id uuid)
returns table (daily_set_id uuid, set_date date, track_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select coalesce(p.track_id, private.default_track_id()) as track_id,
           (now() at time zone p.timezone)::date            as today,
           greatest(private.level_for(p.level), coalesce(p.placement_level, 1)) as level
    from public.profiles p
    where p.id = target_user_id
  )
  select s.id, me.today, me.track_id
  from me
  left join lateral (
    select s.id
    from public.daily_sets s
    cross join lateral (
      select exists (
        select 1 from public.attempts a
        where a.daily_set_id = s.id and a.user_id = target_user_id
      ) as started
    ) x
    where s.track_id = me.track_id
      and s.set_date = me.today
      and s.published_at <= now()
      and (s.level <= me.level or x.started)
    order by x.started desc, s.level desc
    limit 1
  ) s on true;
$$;

-- Contest tables come first: the helpers below refer to them. (See Contests.)
create table public.contests (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title         text not null check (char_length(title) between 1 and 120),
  description   text check (char_length(description) <= 2000),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  is_published  boolean not null default false,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index contests_window_idx on public.contests (ends_at desc, starts_at) where is_published;

create table public.contest_items (
  contest_id   uuid not null references public.contests (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete restrict,
  position     smallint not null check (position between 0 and 99),
  primary key (contest_id, position),
  unique (contest_id, question_id)
);

create index contest_items_question_idx on public.contest_items (question_id);

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Questions a player may be served outside daily sets: published, with an
-- answer key and 2+ options, under active taxonomy, and not in a contest
-- that hasn't ended (contest questions stay unseen until results are out).
create or replace function private.servable_question(target_question_id uuid)
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
  ) and not exists (
    select 1 from public.contest_items ci join public.contests c on c.id = ci.contest_id
    where ci.question_id = target_question_id and c.ends_at > now()
  );
$$;

-- A question as the player sees it before answering: never the answer key,
-- explanation or hint text.
create or replace function private.question_card(target_question_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',          q.id,
    'stem',        q.stem,
    'difficulty',  q.difficulty,
    'est_seconds', q.est_seconds,
    'section',     jsonb_build_object('id', sec.id, 'name', sec.name),
    'topic',       jsonb_build_object('id', top.id, 'name', top.name),
    'subtopic',    jsonb_build_object('id', sub.id, 'name', sub.name),
    'has_hint',    qa.hint is not null,
    'options',     (select jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'body', o.body)
                                     order by o.position)
                    from public.question_options o where o.question_id = q.id)
  )
  from public.questions q
  join public.subtopics sub on sub.id = q.subtopic_id
  join public.topics top    on top.id = sub.topic_id
  join public.sections sec  on sec.id = top.section_id
  left join public.question_answers qa on qa.question_id = q.id
  where q.id = target_question_id;
$$;

-- Mastery stars (0–3) from a player's attempts in a subtopic.
create or replace function private.mastery_stars(attempted bigint, correct bigint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when attempted < 3 then 0
    when attempted >= 20 and correct >= 0.85 * attempted then 3
    when attempted >= 10 and correct >= 0.70 * attempted then 2
    when correct >= 0.50 * attempted then 1
    else 0
  end;
$$;

-- A subtopic is weak once the player has tried it 3+ times at under 60%.
create or replace function private.weak_subtopics(target_user_id uuid, max_count integer)
returns table (subtopic_id uuid, attempted bigint, correct bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select q.subtopic_id, count(*), count(*) filter (where a.is_correct)
  from public.attempts a
  join public.questions q on q.id = a.question_id
  where a.user_id = target_user_id
  group by q.subtopic_id
  having count(*) >= 3 and count(*) filter (where a.is_correct) < 0.6 * count(*)
  order by count(*) filter (where a.is_correct)::numeric / count(*), count(*) desc
  limit max_count;
$$;

-- ---------------------------------------------------------------------------
-- Placement test: 10 questions (3 easy, 4 medium, 3 hard) spread across
-- sections. Graded all at once; the weighted score sets profiles.placement_level.
-- ---------------------------------------------------------------------------
create table public.placement_tests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  question_ids     uuid[] not null check (cardinality(question_ids) between 1 and 20),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  correct          integer check (correct >= 0),
  score            numeric(4, 3) check (score between 0 and 1),
  placed_level     smallint references public.levels (level) on delete set null
);

create index placement_tests_user_idx on public.placement_tests (user_id, started_at desc);

create or replace function private.placement_cooldown()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '7 days';
$$;

-- Weighted score (easy 1, medium 2, hard 3) -> band. Never above the highest
-- active band.
create or replace function private.placement_level_for(score numeric)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select max(l.level) from public.levels l
     where l.is_active
       and l.level <= case when score >= 0.85 then 5 when score >= 0.70 then 4
                           when score >= 0.50 then 3 when score >= 0.30 then 2 else 1 end),
    (select min(l.level) from public.levels l),
    1::smallint);
$$;

create or replace function public.start_placement()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  test    public.placement_tests;
  last_at timestamptz;
  picked  uuid[];
begin
  perform 1 from public.profiles p where p.id = uid for update;

  -- Resume an unfinished test from the last day.
  select * into test from public.placement_tests t
  where t.user_id = uid and t.completed_at is null and t.started_at > now() - interval '1 day'
  order by t.started_at desc limit 1;

  if not found then
    select max(t.completed_at) into last_at from public.placement_tests t where t.user_id = uid;
    if last_at > now() - private.placement_cooldown() then
      raise exception 'placement can be retaken from %', last_at + private.placement_cooldown()
        using errcode = 'object_not_in_prerequisite_state';
    end if;

    with candidates as (
      select q.id, q.difficulty, top.section_id,
             row_number() over (partition by q.difficulty, top.section_id order by random()) as per_section
      from public.questions q
      join public.subtopics sub on sub.id = q.subtopic_id
      join public.topics top    on top.id = sub.topic_id
      where private.servable_question(q.id)
        and not exists (select 1 from public.attempts a
                        where a.user_id = uid and a.question_id = q.id and a.context = 'assessment')
    ),
    wanted (difficulty, n) as (values ('easy'::public.question_difficulty, 3), ('medium', 4), ('hard', 3)),
    first_pass as (
      select c.id, c.difficulty
      from wanted w
      cross join lateral (
        select c.id, c.difficulty from candidates c
        where c.difficulty = w.difficulty
        order by c.per_section, random()
        limit w.n
      ) c
    ),
    fill as (
      select c.id, c.difficulty from candidates c
      where c.id not in (select f.id from first_pass f)
      order by c.per_section, random()
      limit greatest(0, 10 - (select count(*) from first_pass))
    )
    select array_agg(x.id order by x.difficulty, random()) into picked
    from (select * from first_pass union all select * from fill) x;

    if coalesce(cardinality(picked), 0) < 5 then
      raise exception 'not enough questions for a placement test' using errcode = 'no_data_found';
    end if;

    insert into public.placement_tests (user_id, question_ids) values (uid, picked)
    returning * into test;
  end if;

  return jsonb_build_object(
    'test_id',    test.id,
    'started_at', test.started_at,
    'questions',  (select jsonb_agg(private.question_card(qid) order by ord)
                   from unnest(test.question_ids) with ordinality as u(qid, ord))
  );
end;
$$;

-- answers: [{ "question_id": uuid, "option_id": uuid | null, "time_ms": int | null }].
-- Questions missing from answers (or with a null option) count as skipped.
create or replace function public.finish_placement(test_id uuid, answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := private.require_uid();
  test     public.placement_tests;
  earned   numeric := 0;
  possible numeric := 0;
  n_right  integer := 0;
  item     record;
  chosen   uuid;
  spent    integer;
  ans_key  record;
  weight   integer;
  right_   boolean;
  results  jsonb := '[]'::jsonb;
  lvl      smallint;
  score_   numeric;
begin
  if jsonb_typeof(coalesce(answers, '[]'::jsonb)) <> 'array' then
    raise exception 'answers must be an array' using errcode = 'invalid_parameter_value';
  end if;

  select * into test from public.placement_tests t where t.id = finish_placement.test_id for update;
  if not found or test.user_id <> uid then
    raise exception 'placement test not found' using errcode = 'insufficient_privilege';
  end if;
  if test.completed_at is not null then
    raise exception 'placement test already finished' using errcode = 'unique_violation';
  end if;

  for item in
    select u.qid, u.ord, q.difficulty
    from unnest(test.question_ids) with ordinality as u(qid, ord)
    join public.questions q on q.id = u.qid
    order by u.ord
  loop
    select (a ->> 'option_id')::uuid, least(greatest((a ->> 'time_ms')::integer, 0), 86400000)
      into chosen, spent
    from jsonb_array_elements(coalesce(answers, '[]'::jsonb)) a
    where (a ->> 'question_id')::uuid = item.qid
    limit 1;
    if not found then
      chosen := null;
      spent := null;
    end if;
    if chosen is not null and not exists (
      select 1 from public.question_options o where o.id = chosen and o.question_id = item.qid
    ) then
      raise exception 'option does not belong to this question' using errcode = 'invalid_parameter_value';
    end if;

    select qa.correct_option_id, qa.explanation into ans_key
    from public.question_answers qa where qa.question_id = item.qid;

    weight   := case item.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end;
    right_   := chosen is not null and chosen = ans_key.correct_option_id;
    possible := possible + weight;
    if right_ then
      earned  := earned + weight;
      n_right := n_right + 1;
    end if;

    insert into public.attempts (user_id, question_id, context, selected_option_id, is_correct, time_ms)
    values (uid, item.qid, 'assessment', chosen, right_, spent)
    on conflict on constraint attempts_user_question_context_key do nothing;

    results := results || jsonb_build_object(
      'question_id',        item.qid,
      'difficulty',         item.difficulty,
      'selected_option_id', chosen,
      'correct_option_id',  ans_key.correct_option_id,
      'is_correct',         right_,
      'explanation',        ans_key.explanation);
  end loop;

  score_ := case when possible > 0 then round(earned / possible, 3) else 0 end;
  lvl    := private.placement_level_for(score_);

  update public.placement_tests t
  set completed_at = now(), correct = n_right, score = score_, placed_level = lvl
  where t.id = test.id;

  update public.profiles p
  set placement_level = lvl, placed_at = now(), onboarded_at = coalesce(p.onboarded_at, now())
  where p.id = uid;

  return jsonb_build_object(
    'test_id', test.id,
    'correct', n_right,
    'total',   cardinality(test.question_ids),
    'score',   score_,
    'level',   (select jsonb_build_object('level', l.level, 'slug', l.slug, 'name', l.name)
                from public.levels l where l.level = lvl),
    'results', results
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Practice
-- ---------------------------------------------------------------------------

-- Sections > topics > subtopics with the number of practice-ready questions
-- and the caller's attempts, accuracy and mastery stars per subtopic.
create or replace function public.get_practice_tree()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  return coalesce((
    with stats as (
      select q.subtopic_id, count(*) as attempted, count(*) filter (where a.is_correct) as correct
      from public.attempts a join public.questions q on q.id = a.question_id
      where a.user_id = uid
      group by q.subtopic_id
    ),
    ready as (
      select q.subtopic_id, count(*) as n
      from public.questions q
      where q.status = 'published'
        and not exists (select 1 from public.attempts a
                        where a.user_id = uid and a.question_id = q.id and a.context = 'practice')
        and private.servable_question(q.id)
      group by q.subtopic_id
    ),
    subs as (
      select sub.topic_id, jsonb_agg(jsonb_build_object(
               'id',        sub.id,
               'slug',      sub.slug,
               'name',      sub.name,
               'available', coalesce(r.n, 0),
               'attempted', coalesce(s.attempted, 0),
               'correct',   coalesce(s.correct, 0),
               'stars',     private.mastery_stars(coalesce(s.attempted, 0), coalesce(s.correct, 0)),
               'weak',      coalesce(s.attempted >= 3 and s.correct < 0.6 * s.attempted, false)
             ) order by sub.sort_order, sub.name) as items,
             sum(coalesce(s.attempted, 0)) as attempted,
             sum(coalesce(s.correct, 0))   as correct,
             sum(coalesce(r.n, 0))         as available
      from public.subtopics sub
      left join stats s on s.subtopic_id = sub.id
      left join ready r on r.subtopic_id = sub.id
      where sub.is_active
      group by sub.topic_id
    ),
    tops as (
      select top.section_id, jsonb_agg(jsonb_build_object(
               'id',        top.id,
               'slug',      top.slug,
               'name',      top.name,
               'available', subs.available,
               'attempted', subs.attempted,
               'correct',   subs.correct,
               'stars',     private.mastery_stars(subs.attempted::bigint, subs.correct::bigint),
               'subtopics', subs.items
             ) order by top.sort_order, top.name) as items,
             sum(subs.attempted) as attempted, sum(subs.correct) as correct, sum(subs.available) as available
      from public.topics top
      join subs on subs.topic_id = top.id
      where top.is_active
      group by top.section_id
    )
    select jsonb_agg(jsonb_build_object(
             'id',          sec.id,
             'slug',        sec.slug,
             'name',        sec.name,
             'description', sec.description,
             'available',   tops.available,
             'attempted',   tops.attempted,
             'correct',     tops.correct,
             'stars',       private.mastery_stars(tops.attempted::bigint, tops.correct::bigint),
             'topics',      tops.items
           ) order by sec.sort_order, sec.name)
    from public.sections sec
    join tops on tops.section_id = sec.id
    where sec.is_active
  ), '[]'::jsonb);
end;
$$;

-- A batch of practice questions the caller hasn't practised yet.
--   mode 'normal': from subtopic_ids (null = any subtopic).
--   mode 'weak':   from the caller's weakest subtopics (see weak_subtopics);
--                  falls back to any subtopic if none qualify yet.
-- prefer_difficulty puts that difficulty first without excluding the others.
-- Questions the caller has never seen in any context come first.
create or replace function public.get_practice_questions(
  subtopic_ids      uuid[] default null,
  prefer_difficulty public.question_difficulty default null,
  mode              text default 'normal',
  question_limit    integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid    uuid := private.require_uid();
  n      integer := least(greatest(coalesce(question_limit, 10), 1), 30);
  scope  uuid[] := subtopic_ids;
begin
  if coalesce(mode, 'normal') not in ('normal', 'weak') then
    raise exception 'mode must be normal or weak' using errcode = 'invalid_parameter_value';
  end if;

  if mode = 'weak' then
    select array_agg(w.subtopic_id) into scope from private.weak_subtopics(uid, 5) w;
  end if;

  return jsonb_build_object(
    'mode',      coalesce(mode, 'normal'),
    'subtopics', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
                           from public.subtopics s where s.id = any (scope)), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(private.question_card(x.id) order by x.ord)
      from (
        select q.id, row_number() over (
                 order by (prefer_difficulty is not null and q.difficulty = prefer_difficulty) desc,
                          exists (select 1 from public.attempts a2
                                  where a2.user_id = uid and a2.question_id = q.id),
                          random()) as ord
        from public.questions q
        where (scope is null or q.subtopic_id = any (scope))
          and q.status = 'published'
          and not exists (select 1 from public.attempts a
                          where a.user_id = uid and a.question_id = q.id and a.context = 'practice')
          and private.servable_question(q.id)
        order by ord
        limit n
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Wrong answers and give-ups, newest first, one row per question, with the
-- answer and explanation (the player already spent their attempt). A mistake
-- is `resolved` once the player has since answered that question correctly.
create or replace function public.get_mistakes(page_size integer default 20, page_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid      uuid := private.require_uid();
  n_limit  integer := least(greatest(coalesce(page_size, 20), 1), 50);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  return (
    with latest_wrong as (
      select distinct on (a.question_id) a.*
      from public.attempts a
      where a.user_id = uid and not a.is_correct
      order by a.question_id, a.created_at desc
    ),
    rows_ as (
      select w.*,
             exists (select 1 from public.attempts c
                     where c.user_id = uid and c.question_id = w.question_id and c.is_correct
                       and c.created_at > w.created_at) as resolved,
             not exists (select 1 from public.attempts p
                         where p.user_id = uid and p.question_id = w.question_id and p.context = 'practice')
               and private.servable_question(w.question_id) as can_retry
      from latest_wrong w
    )
    select jsonb_build_object(
      'total',      (select count(*) from rows_ r where not r.resolved),
      'resolved',   (select count(*) from rows_ r where r.resolved),
      'entries',    coalesce((
        select jsonb_agg(private.question_card(r.question_id) || jsonb_build_object(
                 'attempt_id',         r.id,
                 'context',            r.context,
                 'answered_at',        r.created_at,
                 'selected_option_id', r.selected_option_id,
                 'gave_up',            r.selected_option_id is null,
                 'correct_option_id',  qa.correct_option_id,
                 'explanation',        qa.explanation,
                 'hint',               qa.hint,
                 'resolved',           r.resolved,
                 'can_retry',          r.can_retry)
               order by r.resolved, r.created_at desc)
        from (select * from rows_ order by resolved, created_at desc limit n_limit offset n_offset) r
        left join public.question_answers qa on qa.question_id = r.question_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Daily activity in the caller's timezone for the last `days` days (oldest
-- first, gaps included), plus today's totals against the daily target.
create or replace function public.get_activity(days integer default 84)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  n     integer := least(greatest(coalesce(days, 84), 1), 366);
  me    record;
begin
  select p.timezone, p.daily_target, (now() at time zone p.timezone)::date as today into me
  from public.profiles p where p.id = uid;

  return (
    with per_day as (
      select (a.created_at at time zone me.timezone)::date as d,
             count(*) as attempted,
             count(*) filter (where a.is_correct) as correct,
             coalesce(sum(a.xp_awarded), 0) as xp,
             coalesce(sum(a.time_ms), 0) as time_ms
      from public.attempts a
      where a.user_id = uid
        and a.created_at >= (me.today - n + 1)::timestamp at time zone me.timezone
      group by 1
    ),
    days_ as (
      select g::date as d from generate_series(me.today - n + 1, me.today, interval '1 day') g
    )
    select jsonb_build_object(
      'today',        me.today,
      'daily_target', me.daily_target,
      'today_count',  coalesce((select pd.attempted from per_day pd where pd.d = me.today), 0),
      'days',         jsonb_agg(jsonb_build_object(
                        'date',      days_.d,
                        'attempted', coalesce(pd.attempted, 0),
                        'correct',   coalesce(pd.correct, 0),
                        'xp',        coalesce(pd.xp, 0),
                        'time_ms',   coalesce(pd.time_ms, 0)) order by days_.d),
      'recent_sets',  coalesce((
        select jsonb_agg(x order by x ->> 'set_date' desc)
        from (
          select jsonb_build_object(
                   'daily_set_id', s.id, 'set_date', s.set_date,
                   'total',   (select count(*) from public.daily_set_items i where i.daily_set_id = s.id),
                   'answered', count(a.id),
                   'correct', count(a.id) filter (where a.is_correct),
                   'xp',      coalesce(sum(a.xp_awarded), 0)) as x
          from public.daily_sets s
          join public.attempts a on a.daily_set_id = s.id and a.user_id = uid and a.context = 'daily'
          group by s.id, s.set_date
          order by s.set_date desc
          limit 14
        ) y
      ), '[]'::jsonb)
    )
    from days_ left join per_day pd on pd.d = days_.d
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Contests: a fixed question list open between starts_at and ends_at. No XP;
-- ranked by score (easy 10 / medium 20 / hard 30), then total time, then
-- whoever finished first. Answers and explanations open once it ends.
-- Admins create contests and items directly (RLS) or in the dashboard.
-- ---------------------------------------------------------------------------
create table public.contest_entries (
  contest_id      uuid not null references public.contests (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  score           integer not null default 0 check (score >= 0),
  correct         integer not null default 0 check (correct >= 0),
  answered        integer not null default 0 check (answered >= 0),
  time_ms         bigint  not null default 0 check (time_ms >= 0),
  last_answer_at  timestamptz,
  primary key (contest_id, user_id)
);

create index contest_entries_rank_idx on public.contest_entries (contest_id, score desc, time_ms, last_answer_at);
create index contest_entries_user_idx on public.contest_entries (user_id);

create table public.contest_answers (
  contest_id          uuid not null,
  user_id             uuid not null,
  question_id         uuid not null references public.questions (id) on delete restrict,
  selected_option_id  uuid,
  is_correct          boolean not null,
  points              integer not null default 0 check (points >= 0),
  time_ms             integer check (time_ms between 0 and 86400000),
  created_at          timestamptz not null default now(),
  primary key (contest_id, user_id, question_id),
  foreign key (contest_id, user_id) references public.contest_entries (contest_id, user_id) on delete cascade,
  foreign key (selected_option_id, question_id) references public.question_options (id, question_id)
);

create trigger contests_set_updated_at
  before update on public.contests
  for each row execute function private.set_updated_at();
create trigger contests_audit
  after insert or update or delete on public.contests
  for each row execute function private.audit_row_change();
create trigger contest_items_audit
  after insert or update or delete on public.contest_items
  for each row execute function private.audit_row_change();

create or replace function private.contest_state(c public.contests)
returns text
language sql
stable
set search_path = ''
as $$
  select case when now() < c.starts_at then 'upcoming' when now() < c.ends_at then 'live' else 'ended' end;
$$;

-- Ranked entries of one contest.
create or replace function private.contest_ranking(target_contest_id uuid)
returns table (rank bigint, user_id uuid, score integer, correct integer, answered integer, time_ms bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by e.score desc, e.time_ms, e.last_answer_at nulls last, e.joined_at, e.user_id),
         e.user_id, e.score, e.correct, e.answered, e.time_ms
  from public.contest_entries e
  join public.profiles p on p.id = e.user_id and p.banned_at is null
  where e.contest_id = target_contest_id;
$$;

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
                       from private.contest_ranking(c.id) r where r.user_id = uid)
  );
$$;

-- Live, upcoming and the last 30 days' published contests.
create or replace function public.list_contests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(private.contest_summary(c, uid)
                     order by case private.contest_state(c) when 'live' then 0 when 'upcoming' then 1 else 2 end,
                              case when private.contest_state(c) = 'ended' then null else c.starts_at end,
                              c.ends_at desc)
    from public.contests c
    where c.is_published and c.ends_at > now() - interval '30 days'
  ), '[]'::jsonb);
end;
$$;

-- Registers for an upcoming or live contest. Idempotent.
create or replace function public.join_contest(contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.contests;
begin
  select * into c from public.contests x where x.id = join_contest.contest_id and x.is_published;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if private.contest_state(c) = 'ended' then
    raise exception 'contest has ended' using errcode = 'object_not_in_prerequisite_state';
  end if;
  insert into public.contest_entries (contest_id, user_id) values (c.id, uid)
  on conflict do nothing;
  return private.contest_summary(c, uid);
end;
$$;

-- Contest page. Questions appear once it is live for entrants (with the
-- caller's answers and whether each was right), and for everyone once it has
-- ended, with answers and explanations.
create or replace function public.get_contest(contest_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid    uuid := private.require_uid();
  c      public.contests;
  state  text;
  joined boolean;
begin
  select * into c from public.contests x
  where x.id = get_contest.contest_id and (x.is_published or private.is_admin());
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  state  := private.contest_state(c);
  joined := exists (select 1 from public.contest_entries e where e.contest_id = c.id and e.user_id = uid);

  return private.contest_summary(c, uid) || jsonb_build_object(
    'joined',    joined,
    'questions', case when state = 'ended' or (state = 'live' and joined) then coalesce((
      select jsonb_agg(private.question_card(i.question_id) || jsonb_build_object(
               'position', i.position,
               'answer',   case when ans.question_id is not null then jsonb_build_object(
                             'selected_option_id', ans.selected_option_id,
                             'is_correct',         ans.is_correct,
                             'points',             ans.points) end,
               'correct_option_id', case when state = 'ended' then qa.correct_option_id end,
               'explanation',       case when state = 'ended' then qa.explanation end)
             order by i.position)
      from public.contest_items i
      left join public.contest_answers ans
        on ans.contest_id = c.id and ans.user_id = uid and ans.question_id = i.question_id
      left join public.question_answers qa on qa.question_id = i.question_id
      where i.contest_id = c.id
    ), '[]'::jsonb) end
  );
end;
$$;

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

create or replace function public.get_contest_standings(
  contest_id  uuid,
  page_size   integer default 50,
  page_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid      uuid := private.require_uid();
  n_limit  integer := least(greatest(coalesce(page_size, 50), 1), 100);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not exists (select 1 from public.contests c
                 where c.id = get_contest_standings.contest_id and (c.is_published or private.is_admin())) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'total',   (select count(*) from private.contest_ranking(get_contest_standings.contest_id)),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', r.rank, 'user_id', r.user_id, 'handle', p.handle, 'display_name', p.display_name,
               'avatar_url', p.avatar_url, 'score', r.score, 'correct', r.correct, 'answered', r.answered,
               'time_ms', r.time_ms, 'is_me', r.user_id = uid) order by r.rank)
      from (select * from private.contest_ranking(get_contest_standings.contest_id)
            order by rank limit n_limit offset n_offset) r
      join public.profiles p on p.id = r.user_id
    ), '[]'::jsonb),
    'me',      (select jsonb_build_object('rank', r.rank, 'score', r.score, 'correct', r.correct,
                                          'answered', r.answered, 'time_ms', r.time_ms)
                from private.contest_ranking(get_contest_standings.contest_id) r where r.user_id = uid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.placement_tests  enable row level security;
alter table public.contests         enable row level security;
alter table public.contest_items    enable row level security;
alter table public.contest_entries  enable row level security;
alter table public.contest_answers  enable row level security;

revoke all on public.placement_tests, public.contests, public.contest_items,
              public.contest_entries, public.contest_answers from anon, authenticated;

grant select on public.placement_tests, public.contest_entries, public.contest_answers to authenticated;
grant select, insert, update, delete on public.contests, public.contest_items to authenticated;

create policy "placement_tests: read own or admin" on public.placement_tests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "contests: read published" on public.contests
  for select to authenticated
  using (is_published or (select private.is_admin()));
create policy "contests: admin insert" on public.contests
  for insert to authenticated with check ((select private.is_admin()));
create policy "contests: admin update" on public.contests
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "contests: admin delete" on public.contests
  for delete to authenticated using ((select private.is_admin()));

-- Items stay hidden from players: get_contest() reveals them when allowed.
create policy "contest_items: admin read" on public.contest_items
  for select to authenticated using ((select private.is_admin()));
create policy "contest_items: admin insert" on public.contest_items
  for insert to authenticated with check ((select private.is_admin()));
create policy "contest_items: admin update" on public.contest_items
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "contest_items: admin delete" on public.contest_items
  for delete to authenticated using ((select private.is_admin()));

create policy "contest_entries: read own or admin" on public.contest_entries
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "contest_answers: read own or admin" on public.contest_answers
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

revoke execute on function private.validate_exam_goal()                         from public, anon, authenticated;
revoke execute on function private.servable_question(uuid)                      from public, anon;
revoke execute on function private.question_card(uuid)                          from public, anon;
revoke execute on function private.mastery_stars(bigint, bigint)                from public, anon;
revoke execute on function private.weak_subtopics(uuid, integer)                from public, anon;
revoke execute on function private.placement_cooldown()                         from public, anon;
revoke execute on function private.placement_level_for(numeric)                 from public, anon;
revoke execute on function private.contest_state(public.contests)               from public, anon;
revoke execute on function private.contest_ranking(uuid)                        from public, anon;
revoke execute on function private.contest_summary(public.contests, uuid)       from public, anon;

revoke execute on function public.start_placement()                                      from public, anon;
revoke execute on function public.finish_placement(uuid, jsonb)                          from public, anon;
revoke execute on function public.get_practice_tree()                                    from public, anon;
revoke execute on function public.get_practice_questions(uuid[], public.question_difficulty, text, integer) from public, anon;
revoke execute on function public.get_mistakes(integer, integer)                         from public, anon;
revoke execute on function public.get_activity(integer)                                  from public, anon;
revoke execute on function public.list_contests()                                        from public, anon;
revoke execute on function public.join_contest(uuid)                                     from public, anon;
revoke execute on function public.get_contest(uuid)                                      from public, anon;
revoke execute on function public.submit_contest_answer(uuid, uuid, uuid, integer)       from public, anon;
revoke execute on function public.get_contest_standings(uuid, integer, integer)          from public, anon;

grant execute on function public.start_placement()                                      to authenticated, service_role;
grant execute on function public.finish_placement(uuid, jsonb)                          to authenticated, service_role;
grant execute on function public.get_practice_tree()                                    to authenticated, service_role;
grant execute on function public.get_practice_questions(uuid[], public.question_difficulty, text, integer) to authenticated, service_role;
grant execute on function public.get_mistakes(integer, integer)                         to authenticated, service_role;
grant execute on function public.get_activity(integer)                                  to authenticated, service_role;
grant execute on function public.list_contests()                                        to authenticated, service_role;
grant execute on function public.join_contest(uuid)                                     to authenticated, service_role;
grant execute on function public.get_contest(uuid)                                      to authenticated, service_role;
grant execute on function public.submit_contest_answer(uuid, uuid, uuid, integer)       to authenticated, service_role;
grant execute on function public.get_contest_standings(uuid, integer, integer)          to authenticated, service_role;
