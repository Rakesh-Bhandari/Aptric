-- Progression: XP levels, the daily-challenge rating, streak freezes earned
-- with XP, badges, league tuning and Realtime, global leaderboards, and the
-- shareable daily result.
--
--   XP          every xp_events row (answers, daily completion, accepted
--               reports); profiles.level is derived from profiles.xp.
--   rating      Elo-style, moved only by daily challenge results (rating_events).
--   freezes     one per 500 XP earned, holding at most 2.
--   badges      badges (catalog) + user_badges, awarded by triggers.
--   leagues     top 5 promote, bottom 5 demote; standings broadcast on the
--               private Realtime channel 'league:<league_id>'.
--   boards      private.leaderboard_all_time / _weekly materialized views,
--               refreshed every 5 minutes by pg_cron, read via get_leaderboard().
--
-- New RPCs: get_leaderboard(board, page_size, page_offset),
--           get_player_profile(handle), get_daily_result(daily_set_id).
-- submit_answer / give_up now also return a `progress` object.

-- ---------------------------------------------------------------------------
-- XP -> level. Reaching level L takes 50·L·(L−1) XP in total:
--   L2 100 · L3 300 · L5 1,000 · L10 4,500 · L15 10,500 · L20 19,000.
-- ---------------------------------------------------------------------------
create or replace function private.level_xp(target_level integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 50::bigint * greatest(target_level, 1) * (greatest(target_level, 1) - 1);
$$;

create or replace function private.xp_level(total_xp bigint)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  lvl integer := greatest(1, floor((1 + sqrt(1 + greatest(total_xp, 0) / 12.5)) / 2)::integer);
begin
  -- Correct any floating-point error at exact thresholds.
  while private.level_xp(lvl + 1) <= total_xp loop
    lvl := lvl + 1;
  end loop;
  while lvl > 1 and private.level_xp(lvl) > total_xp loop
    lvl := lvl - 1;
  end loop;
  return lvl;
end;
$$;

-- Daily-set bands now follow XP levels: Beginner 1–2, Intermediate 3–5,
-- Advanced 6–9, Pro 10–14, Expert 15+. Top band first so the unique
-- min_profile_level never collides mid-update.
update public.levels set min_profile_level = 15 where level = 5;
update public.levels set min_profile_level = 10 where level = 4;
update public.levels set min_profile_level = 6  where level = 3;
update public.levels set min_profile_level = 3  where level = 2;

-- ---------------------------------------------------------------------------
-- Streak freezes earned with XP: every 500 XP milestone grants one freeze,
-- up to 2 held. A milestone reached while already holding the maximum is
-- recorded with granted = false. Each milestone counts once, ever.
-- ---------------------------------------------------------------------------
create or replace function private.freeze_xp_step()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 500;
$$;

create or replace function private.max_streak_freezes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 2;
$$;

create table public.streak_freeze_awards (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  xp_milestone  bigint not null check (xp_milestone > 0),
  granted       boolean not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, xp_milestone)
);

-- profiles.xp changes -> level and earned freezes. Every XP writer goes through
-- an UPDATE of profiles.xp, so this is the one place both are maintained.
create or replace function private.profiles_progression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  step      constant bigint := private.freeze_xp_step();
  milestone bigint;
  can_hold  boolean;
begin
  if new.xp is not distinct from old.xp then
    return new;
  end if;

  new.level := private.xp_level(new.xp);

  if new.xp > old.xp then
    for milestone in
      select g * step from generate_series(old.xp / step + 1, new.xp / step) g
    loop
      can_hold := new.streak_freezes < private.max_streak_freezes();
      insert into public.streak_freeze_awards (user_id, xp_milestone, granted)
      values (new.id, milestone, can_hold)
      on conflict do nothing;
      if found and can_hold then
        new.streak_freezes := new.streak_freezes + 1;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger profiles_progression
  before update of xp on public.profiles
  for each row execute function private.profiles_progression();

-- Existing players get the level their XP earns.
update public.profiles p set level = private.xp_level(p.xp) where p.level <> private.xp_level(p.xp);

-- ---------------------------------------------------------------------------
-- XP helper: one ledger row + profiles.xp, idempotent on idempotency_key.
-- Returns whether XP was awarded (false on a repeat key).
-- ---------------------------------------------------------------------------
create or replace function private.award_xp(
  target_user_id  uuid,
  amount          integer,
  reason          text,
  idempotency_key text,
  metadata        jsonb default '{}'::jsonb,
  attempt_id      uuid default null,
  daily_set_id    uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id bigint;
begin
  if amount = 0 then
    return false;
  end if;
  insert into public.xp_events as e (user_id, amount, reason, attempt_id, daily_set_id, idempotency_key, metadata)
  values (target_user_id, award_xp.amount, award_xp.reason, award_xp.attempt_id, award_xp.daily_set_id,
          award_xp.idempotency_key, coalesce(award_xp.metadata, '{}'::jsonb))
  on conflict on constraint xp_events_idempotency_key_key do nothing
  returning e.id into event_id;
  if event_id is null then
    return false;
  end if;
  update public.profiles p set xp = p.xp + award_xp.amount where p.id = target_user_id;
  return true;
end;
$$;

-- XP for finishing (answering or giving up on every question of) a daily set.
create or replace function private.daily_complete_xp()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20;
$$;

-- XP for a report an admin resolves (i.e. accepts).
create or replace function private.report_accepted_xp()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 25;
$$;

-- ---------------------------------------------------------------------------
-- Rating: Elo-style, from daily challenge results only.
--
-- Each daily question is a game against an opponent rated by difficulty
-- (easy 1000, medium 1300, hard 1600). Score per question: 1 correct,
-- 0.5 correct with a hint, 0 wrong / gave up / left unanswered. A set is
-- rated once, as a whole: delta = K · (Σ score − Σ expected), with K = 16 per
-- question for a player's first 5 rated sets and 8 after, and the rating never
-- below 100. A set is rated when its last question is answered, or, if the
-- player started it but never finished, once that date has ended everywhere
-- (hourly cron); unanswered questions then count as misses.
-- ---------------------------------------------------------------------------
create table public.rating_events (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  daily_set_id   uuid not null references public.daily_sets (id) on delete restrict,
  set_date       date not null,
  questions      smallint not null check (questions > 0),
  answered       smallint not null check (answered between 1 and questions),
  score          numeric(6, 2) not null check (score >= 0),
  expected       numeric(6, 3) not null check (expected >= 0),
  k_factor       smallint not null check (k_factor > 0),
  rating_before  integer not null,
  rating_after   integer not null check (rating_after >= 0),
  created_at     timestamptz not null default now(),
  constraint rating_events_user_set_key unique (user_id, daily_set_id)
);

create index rating_events_user_created_idx on public.rating_events (user_id, created_at desc);
create index rating_events_daily_set_idx    on public.rating_events (daily_set_id);

create trigger rating_events_no_update
  before update on public.rating_events
  for each row execute function private.forbid_mutation();
create trigger rating_events_no_delete
  before delete on public.rating_events
  for each row execute function private.forbid_mutation();
create trigger rating_events_no_truncate
  before truncate on public.rating_events
  for each statement execute function private.forbid_mutation();

create or replace function private.question_rating(difficulty public.question_difficulty)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case difficulty when 'easy' then 1000 when 'medium' then 1300 when 'hard' then 1600 end;
$$;

-- Rates target_user_id's result in one daily set. Idempotent: returns the
-- existing event if already rated, NULL if the player never started the set.
create or replace function private.rate_daily_set(target_user_id uuid, target_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev       public.rating_events;
  r_before integer;
  res      record;
  k        integer;
  r_after  integer;
begin
  -- Serialise with this player's other scoring.
  select p.rating into r_before from public.profiles p where p.id = target_user_id for update;
  if not found then
    return null;
  end if;

  select * into ev from public.rating_events e
  where e.user_id = target_user_id and e.daily_set_id = target_set_id;
  if found then
    return to_jsonb(ev);
  end if;

  select count(*)::int                                               as questions,
         count(a.id)::int                                            as answered,
         coalesce(sum(case when a.is_correct then case when a.used_hint then 0.5 else 1 end else 0 end), 0) as score,
         coalesce(sum(1 / (1 + power(10::numeric,
                    (private.question_rating(q.difficulty) - r_before) / 400.0))), 0)                       as expected
  into res
  from public.daily_set_items i
  join public.questions q on q.id = i.question_id
  left join public.attempts a
    on a.daily_set_id = i.daily_set_id and a.question_id = i.question_id
   and a.user_id = target_user_id and a.context = 'daily'
  where i.daily_set_id = target_set_id;

  if res.answered = 0 then
    return null;
  end if;

  k := case when (select count(*) from public.rating_events e where e.user_id = target_user_id) < 5
            then 16 else 8 end;
  r_after := greatest(100, r_before + round(k * (res.score - res.expected))::integer);

  insert into public.rating_events
    (user_id, daily_set_id, set_date, questions, answered, score, expected, k_factor, rating_before, rating_after)
  values
    (target_user_id, target_set_id, (select s.set_date from public.daily_sets s where s.id = target_set_id),
     res.questions, res.answered, res.score, round(res.expected, 3), k, r_before, r_after)
  returning * into ev;

  update public.profiles p set rating = r_after where p.id = target_user_id;
  return to_jsonb(ev);
end;
$$;

-- Cron: rates every started-but-unfinished daily set whose date is over in
-- every timezone (UTC−12 is the last place a date ends). Looks back 14 days.
create or replace function private.rate_finished_sets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- POSIX sign convention: Etc/GMT+12 is UTC−12.
  last_open_date date := (now() at time zone 'Etc/GMT+12')::date;
  r       record;
  n_rated integer := 0;
  summary jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('aptric:rate_finished_sets'));

  for r in
    select distinct a.user_id, a.daily_set_id, s.set_date
    from public.attempts a
    join public.daily_sets s on s.id = a.daily_set_id
    where a.context = 'daily'
      and s.set_date < last_open_date
      and s.set_date >= last_open_date - 14
      and not exists (select 1 from public.rating_events e
                      where e.user_id = a.user_id and e.daily_set_id = a.daily_set_id)
    order by s.set_date, a.user_id
  loop
    if private.rate_daily_set(r.user_id, r.daily_set_id) is not null then
      n_rated := n_rated + 1;
    end if;
  end loop;

  summary := jsonb_build_object('rated', n_rated, 'before', last_open_date);
  if n_rated > 0 then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
    values (null, 'rate_finished_sets', 'cron', null, summary);
  end if;
  return summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
create table public.badges (
  slug         text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 40),
  description  text not null check (char_length(description) between 1 and 200),
  icon         text not null check (char_length(icon) between 1 and 16),
  -- Per-topic badges are earned once per topic (user_badges.topic_id set).
  per_topic    boolean not null default false,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.badges (slug, name, description, icon, per_topic, sort_order) values
  ('solved-100',      'Centurion',     'Solve 100 different questions correctly.',                         '💯', false, 10),
  ('streak-7',        'Week Warrior',  'Reach a 7-day daily streak.',                                      '🔥', false, 20),
  ('streak-30',       'Monthly Grind', 'Reach a 30-day daily streak.',                                     '📅', false, 30),
  ('streak-100',      'Unstoppable',   'Reach a 100-day daily streak.',                                    '⚡', false, 40),
  ('topic-master',    'Topic Master',  'Answer 25+ questions correctly in one topic with 80%+ accuracy.',  '🎓', true,  50),
  ('report-accepted', 'Sharp Eye',     'Report a problem with a question that an admin accepts.',         '🔍', false, 60);

create trigger badges_set_updated_at
  before update on public.badges
  for each row execute function private.set_updated_at();
create trigger badges_audit
  after insert or update or delete on public.badges
  for each row execute function private.audit_row_change();

create table public.user_badges (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  badge       text not null references public.badges (slug) on delete cascade on update cascade,
  topic_id    uuid references public.topics (id) on delete cascade,
  awarded_at  timestamptz not null default now(),
  constraint user_badges_user_badge_topic_key unique nulls not distinct (user_id, badge, topic_id)
);

create index user_badges_badge_idx on public.user_badges (badge);
create index user_badges_topic_idx on public.user_badges (topic_id) where topic_id is not null;

-- Thresholds.
create or replace function private.topic_master_min_correct()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 25;
$$;

create or replace function private.award_badge(target_user_id uuid, badge_slug text, target_topic_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_badges (user_id, badge, topic_id)
  values (target_user_id, badge_slug, target_topic_id)
  on conflict on constraint user_badges_user_badge_topic_key do nothing;
  return found;
end;
$$;

-- Correct answers: Centurion (100 distinct questions) and Topic Master.
create or replace function private.badges_after_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic   uuid;
  stats   record;
begin
  if not new.is_correct then
    return null;
  end if;

  if not exists (select 1 from public.user_badges b
                 where b.user_id = new.user_id and b.badge = 'solved-100')
     and (select count(distinct a.question_id) from public.attempts a
          where a.user_id = new.user_id and a.is_correct) >= 100 then
    perform private.award_badge(new.user_id, 'solved-100');
  end if;

  select s.topic_id into topic
  from public.questions q join public.subtopics s on s.id = q.subtopic_id
  where q.id = new.question_id;

  if not exists (select 1 from public.user_badges b
                 where b.user_id = new.user_id and b.badge = 'topic-master' and b.topic_id = topic) then
    select count(*) filter (where a.is_correct) as correct, count(*) as total into stats
    from public.attempts a
    join public.questions q on q.id = a.question_id
    join public.subtopics s on s.id = q.subtopic_id
    where a.user_id = new.user_id and s.topic_id = topic;
    if stats.correct >= private.topic_master_min_correct() and stats.correct >= 0.8 * stats.total then
      perform private.award_badge(new.user_id, 'topic-master', topic);
    end if;
  end if;
  return null;
end;
$$;

create trigger attempts_badges
  after insert on public.attempts
  for each row execute function private.badges_after_attempt();

-- Streak milestones.
create or replace function private.badges_after_streak()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_streak > old.current_streak then
    if new.current_streak >= 7   then perform private.award_badge(new.id, 'streak-7');   end if;
    if new.current_streak >= 30  then perform private.award_badge(new.id, 'streak-30');  end if;
    if new.current_streak >= 100 then perform private.award_badge(new.id, 'streak-100'); end if;
  end if;
  return null;
end;
$$;

create trigger profiles_streak_badges
  after update of current_streak on public.profiles
  for each row execute function private.badges_after_streak();

-- An admin resolving a report accepts it: badge + XP for the reporter, once
-- per report even if it is reopened and resolved again.
create or replace function private.report_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' and new.reporter_id is not null then
    perform private.award_badge(new.reporter_id, 'report-accepted');
    perform private.award_xp(new.reporter_id, private.report_accepted_xp(), 'report_accepted',
                             'report_accepted:' || new.id,
                             jsonb_build_object('report_id', new.id, 'question_id', new.question_id));
  end if;
  return null;
end;
$$;

create trigger reports_accepted
  after update of status on public.reports
  for each row execute function private.report_accepted();

-- Backfill badges already earned (no XP backfill).
insert into public.user_badges (user_id, badge)
select p.id, b.slug
from public.profiles p
join (values ('streak-7', 7), ('streak-30', 30), ('streak-100', 100)) b (slug, n) on p.longest_streak >= b.n
on conflict do nothing;

insert into public.user_badges (user_id, badge)
select a.user_id, 'solved-100' from public.attempts a where a.is_correct
group by a.user_id having count(distinct a.question_id) >= 100
on conflict do nothing;

insert into public.user_badges (user_id, badge, topic_id)
select a.user_id, 'topic-master', s.topic_id
from public.attempts a
join public.questions q on q.id = a.question_id
join public.subtopics s on s.id = q.subtopic_id
group by a.user_id, s.topic_id
having count(*) filter (where a.is_correct) >= 25
   and count(*) filter (where a.is_correct) >= 0.8 * count(*)
on conflict do nothing;

insert into public.user_badges (user_id, badge)
select distinct r.reporter_id, 'report-accepted' from public.reports r
where r.status = 'resolved' and r.reporter_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Scoring, now with daily completion XP, rating, and a progress summary
-- (level-ups, freezes earned, new badges, the set's rating) in the response.
-- Otherwise unchanged from 20261001000008_gameplay_rpcs.sql.
-- ---------------------------------------------------------------------------
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
  answer        record;
  difficulty    public.question_difficulty;
  hinted        boolean;
  correct       boolean;
  points        integer;
  attempt_id    uuid;
  streak        record;
  set_date      date;
  prev          record;
  prev_badges   bigint[];
  prev_milestone bigint;
  now_profile   record;
  set_complete  boolean := false;
  bonus_xp      integer := 0;
  rating        jsonb;
begin
  if time_ms is not null and (time_ms < 0 or time_ms > 86400000) then
    raise exception 'time_ms out of range' using errcode = 'invalid_parameter_value';
  end if;

  -- Serialise this user's scoring so streak, xp and rating updates don't race.
  select p.level, p.xp into prev from public.profiles p where p.id = target_user_id for update;
  select coalesce(array_agg(b.id), '{}') into prev_badges from public.user_badges b where b.user_id = target_user_id;
  select coalesce(max(f.xp_milestone), 0) into prev_milestone
  from public.streak_freeze_awards f where f.user_id = target_user_id;

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

  perform private.award_xp(target_user_id, points,
    case attempt_context when 'daily' then 'daily_correct' else 'practice_correct' end,
    'attempt:' || attempt_id,
    jsonb_build_object('question_id', target_question_id, 'difficulty', difficulty, 'used_hint', hinted),
    attempt_id, attempt_set_id);

  if attempt_context = 'daily' then
    select s.set_date into set_date from public.daily_sets s where s.id = attempt_set_id;
    select * into streak from private.bump_streak(target_user_id, set_date);

    set_complete := not exists (
      select 1 from public.daily_set_items i
      where i.daily_set_id = attempt_set_id
        and not exists (select 1 from public.attempts a
                        where a.user_id = target_user_id and a.daily_set_id = i.daily_set_id
                          and a.question_id = i.question_id and a.context = 'daily')
    );
    if set_complete then
      if private.award_xp(target_user_id, private.daily_complete_xp(), 'daily_complete',
                          'daily_complete:' || attempt_set_id || ':' || target_user_id,
                          jsonb_build_object('set_date', set_date), null, attempt_set_id) then
        bonus_xp := private.daily_complete_xp();
      end if;
      rating := private.rate_daily_set(target_user_id, attempt_set_id);
    end if;
  else
    select p.current_streak, p.longest_streak into streak from public.profiles p where p.id = target_user_id;
  end if;

  select p.level, p.xp, p.rating, p.streak_freezes into now_profile
  from public.profiles p where p.id = target_user_id;

  return jsonb_build_object(
    'attempt_id',        attempt_id,
    'context',           attempt_context,
    'is_correct',        correct,
    'correct_option_id', answer.correct_option_id,
    'explanation',       answer.explanation,
    'xp_awarded',        points,
    'used_hint',         hinted,
    'current_streak',    streak.current_streak,
    'longest_streak',    streak.longest_streak,
    'progress',          jsonb_build_object(
      'xp',              now_profile.xp,
      'level',           now_profile.level,
      'leveled_up',      now_profile.level > prev.level,
      'next_level_xp',   private.level_xp(now_profile.level + 1),
      'rating',          now_profile.rating,
      'streak_freezes',  now_profile.streak_freezes,
      'freezes_earned',  (select count(*) from public.streak_freeze_awards f
                          where f.user_id = target_user_id and f.granted and f.xp_milestone > prev_milestone),
      'set_complete',    set_complete,
      'bonus_xp',        bonus_xp,
      'rating_change',   case when rating is not null then jsonb_build_object(
                           'before', (rating ->> 'rating_before')::int,
                           'after',  (rating ->> 'rating_after')::int,
                           'delta',  (rating ->> 'rating_after')::int - (rating ->> 'rating_before')::int) end,
      'new_badges',      coalesce((
        select jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name, 'icon', b.icon,
                                            'description', b.description, 'topic', t.name)
                         order by b.sort_order)
        from public.user_badges ub
        join public.badges b on b.slug = ub.badge
        left join public.topics t on t.id = ub.topic_id
        where ub.user_id = target_user_id and not (ub.id = any (prev_badges))
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Leagues: top 5 promote, bottom 5 demote (scaled to cohort size as before).
-- ---------------------------------------------------------------------------
update public.league_tiers
set promote_count = case when tier = (select max(tier) from public.league_tiers) then 0 else 5 end,
    demote_count  = case when tier = (select min(tier) from public.league_tiers) then 0 else 5 end;

-- Realtime: every league XP change is broadcast on the private channel
-- 'league:<league_id>' as event 'member_xp'. Only that league's members may
-- subscribe (policy on realtime.messages below). Broadcasting never blocks
-- scoring: a failure is logged as a warning.
create or replace function private.league_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('league_id', new.league_id, 'user_id', new.user_id, 'xp', new.xp,
                         'last_xp_at', new.last_xp_at, 'joined', tg_op = 'INSERT'),
      'member_xp',
      'league:' || new.league_id,
      true);
  exception when others then
    raise warning 'league broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger league_members_broadcast
  after insert or update of xp on public.league_members
  for each row execute function private.league_broadcast();

create or replace function private.is_league_member(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if topic is null or topic !~ '^league:[0-9a-f-]{36}$' then
    return false;
  end if;
  target := substr(topic, 8)::uuid;
  return exists (select 1 from public.league_members m
                 where m.league_id = target and m.user_id = (select auth.uid()));
end;
$$;

create policy "league channels: members receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select private.is_league_member((select realtime.topic())))
  );

-- ---------------------------------------------------------------------------
-- Global leaderboards: materialized views outside the Data API, refreshed
-- every 5 minutes (REFRESH ... CONCURRENTLY, so readers never block) and read
-- through get_leaderboard(). Banned players are left out.
--   all-time: total XP (and, among rated players, rating)
--   weekly:   XP in the current league week (Monday–Monday IST)
-- ---------------------------------------------------------------------------
create materialized view private.leaderboard_all_time as
select p.id as user_id, p.handle, p.display_name, p.avatar_url,
       p.level, p.xp, p.rating, p.current_streak, p.league_tier,
       coalesce(r.rated_sets, 0) as rated_sets,
       rank() over (order by p.xp desc)::integer as xp_rank,
       case when r.rated_sets > 0
            then rank() over (partition by r.rated_sets > 0 order by p.rating desc)::integer end as rating_rank,
       now() as refreshed_at
from public.profiles p
left join (select e.user_id, count(*)::integer as rated_sets
           from public.rating_events e group by e.user_id) r on r.user_id = p.id
where p.banned_at is null and (p.xp > 0 or r.rated_sets > 0)
with data;

create unique index leaderboard_all_time_user_idx   on private.leaderboard_all_time (user_id);
create index leaderboard_all_time_xp_rank_idx       on private.leaderboard_all_time (xp_rank);
create index leaderboard_all_time_rating_rank_idx   on private.leaderboard_all_time (rating_rank) where rating_rank is not null;

create materialized view private.leaderboard_weekly as
select m.user_id, p.handle, p.display_name, p.avatar_url,
       p.level, m.xp as weekly_xp, p.rating, p.current_streak, l.tier as league_tier, m.week_start,
       rank() over (order by m.xp desc)::integer as rank,
       now() as refreshed_at
from public.league_members m
join public.leagues l  on l.id = m.league_id
join public.profiles p on p.id = m.user_id
where m.week_start = private.league_week_start(now())
  and m.xp > 0
  and p.banned_at is null
with data;

create unique index leaderboard_weekly_user_idx on private.leaderboard_weekly (user_id);
create index leaderboard_weekly_rank_idx        on private.leaderboard_weekly (rank);

create or replace function private.refresh_leaderboards()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently private.leaderboard_all_time;
  refresh materialized view concurrently private.leaderboard_weekly;
end;
$$;

-- board: 'all_time' (by XP), 'rating', or 'weekly'. Returns a page of entries
-- plus the caller's own row ('me', NULL when not on the board).
create or replace function public.get_leaderboard(
  board        text default 'all_time',
  page_size    integer default 50,
  page_offset  integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  n_limit  integer := least(greatest(coalesce(page_size, 50), 1), 100);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if board = 'weekly' then
    return jsonb_build_object(
      'board',        board,
      'week_start',   private.league_week_start(now()),
      'refreshed_at', (select max(w.refreshed_at) from private.leaderboard_weekly w),
      'total',        (select count(*) from private.leaderboard_weekly w),
      'entries',      coalesce((
        select jsonb_agg((to_jsonb(x) - 'refreshed_at') || jsonb_build_object('is_me', x.user_id = uid)
                         order by x.rank, x.handle)
        from (select * from private.leaderboard_weekly w
              order by w.rank, w.handle limit n_limit offset n_offset) x), '[]'::jsonb),
      'me',           (select (to_jsonb(w) - 'refreshed_at') from private.leaderboard_weekly w where w.user_id = uid)
    );
  elsif board in ('all_time', 'rating') then
    return jsonb_build_object(
      'board',        board,
      'refreshed_at', (select max(a.refreshed_at) from private.leaderboard_all_time a),
      'total',        (select count(*) from private.leaderboard_all_time a
                       where board = 'all_time' or a.rating_rank is not null),
      'entries',      coalesce((
        select jsonb_agg((to_jsonb(x) - 'refreshed_at' - 'r')
                         || jsonb_build_object('rank', x.r, 'is_me', x.user_id = uid)
                         order by x.r, x.handle)
        from (select a.*, case when board = 'rating' then a.rating_rank else a.xp_rank end as r
              from private.leaderboard_all_time a
              where board = 'all_time' or a.rating_rank is not null
              order by r, a.handle limit n_limit offset n_offset) x), '[]'::jsonb),
      'me',           (select (to_jsonb(a) - 'refreshed_at')
                         || jsonb_build_object('rank', case when board = 'rating' then a.rating_rank else a.xp_rank end)
                       from private.leaderboard_all_time a
                       where a.user_id = uid and (board = 'all_time' or a.rating_rank is not null))
    );
  else
    raise exception 'board must be all_time, rating or weekly' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Player profile (own or another player's, by handle): level progress,
-- rating, streaks, league tier, solve stats per section, and badges.
-- Freeze counts are only shown to the player themselves.
-- ---------------------------------------------------------------------------
create or replace function public.get_player_profile(target_handle text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  p    public.profiles;
  me   boolean;
begin
  if target_handle is null then
    select * into p from public.profiles x where x.id = uid;
  else
    select * into p from public.profiles x where x.handle = lower(target_handle);
  end if;
  if not found or (p.banned_at is not null and p.id <> uid and not private.is_admin()) then
    raise exception 'player not found' using errcode = 'no_data_found';
  end if;
  me := p.id = uid;

  return jsonb_build_object(
    'user_id',          p.id,
    'handle',           p.handle,
    'display_name',     p.display_name,
    'avatar_url',       p.avatar_url,
    'bio',              p.bio,
    'joined_at',        p.created_at,
    'is_me',            me,
    'level',            p.level,
    'xp',               p.xp,
    'level_xp',         private.level_xp(p.level),
    'next_level_xp',    private.level_xp(p.level + 1),
    'rating',           p.rating,
    'rated_sets',       (select count(*) from public.rating_events e where e.user_id = p.id),
    'current_streak',   p.current_streak,
    'longest_streak',   p.longest_streak,
    'streak_freezes',   case when me then p.streak_freezes end,
    'max_streak_freezes', case when me then private.max_streak_freezes() end,
    'next_freeze_xp',   case when me then (p.xp / private.freeze_xp_step() + 1) * private.freeze_xp_step() end,
    'league_tier',      (select jsonb_build_object('tier', t.tier, 'slug', t.slug, 'name', t.name)
                         from public.league_tiers t where t.tier = p.league_tier),
    'solved',           (select count(distinct a.question_id) from public.attempts a
                         where a.user_id = p.id and a.is_correct),
    'attempts',         (select count(*) from public.attempts a where a.user_id = p.id),
    'correct',          (select count(*) from public.attempts a where a.user_id = p.id and a.is_correct),
    'sections',         coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'attempted', x.attempted, 'correct', x.correct)
                       order by x.sort_order, x.name)
      from (
        select sec.name, sec.sort_order, count(*) as attempted, count(*) filter (where a.is_correct) as correct
        from public.attempts a
        join public.questions q   on q.id = a.question_id
        join public.subtopics sub on sub.id = q.subtopic_id
        join public.topics top    on top.id = sub.topic_id
        join public.sections sec  on sec.id = top.section_id
        where a.user_id = p.id
        group by sec.id, sec.name, sec.sort_order
      ) x), '[]'::jsonb),
    'badges',           coalesce((
      select jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name, 'icon', b.icon,
                                          'description', b.description, 'topic', t.name,
                                          'awarded_at', ub.awarded_at)
                       order by b.sort_order, ub.awarded_at)
      from public.user_badges ub
      join public.badges b on b.slug = ub.badge
      left join public.topics t on t.id = ub.topic_id
      where ub.user_id = p.id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily result for the share card: per-question outcomes (never answers),
-- score, XP earned, rating change, streak and league standing. Defaults to
-- today's set; any past set the caller played can be passed explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_result(target_set_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  set_id  uuid := target_set_id;
  s       record;
  me      record;
  rating  public.rating_events;
  league  record;
begin
  if set_id is null then
    select t.daily_set_id into set_id from private.today_set_for(uid) t;
    if set_id is null then
      raise exception 'no daily set released for your track today' using errcode = 'no_data_found';
    end if;
  elsif not exists (select 1 from public.attempts a
                    where a.user_id = uid and a.daily_set_id = set_id and a.context = 'daily') then
    raise exception 'you have not played that daily set' using errcode = 'insufficient_privilege';
  end if;

  select ds.id, ds.set_date, ds.level, tr.slug as track_slug, tr.name as track_name, lv.name as level_name
  into s
  from public.daily_sets ds
  join public.tracks tr on tr.id = ds.track_id
  left join public.levels lv on lv.level = ds.level
  where ds.id = set_id;

  select p.handle, p.display_name, p.current_streak, p.longest_streak, p.level into me
  from public.profiles p where p.id = uid;

  select * into rating from public.rating_events e where e.user_id = uid and e.daily_set_id = set_id;

  select t.name as tier_name, t.slug as tier_slug, x.rnk, x.n into league
  from (
    select m.league_id, m.user_id,
           row_number() over (partition by m.league_id
                              order by m.xp desc, m.last_xp_at, m.joined_at, m.user_id) as rnk,
           count(*) over (partition by m.league_id) as n
    from public.league_members m
    where m.league_id = (select m2.league_id from public.league_members m2
                         where m2.user_id = uid and m2.week_start = private.league_week_start(now()))
  ) x
  join public.leagues l on l.id = x.league_id
  join public.league_tiers t on t.tier = l.tier
  where x.user_id = uid;

  return (
    with items as (
      select i.position, q.difficulty, a.id as attempt_id, a.is_correct, a.used_hint, a.time_ms, a.xp_awarded,
             a.selected_option_id
      from public.daily_set_items i
      join public.questions q on q.id = i.question_id
      left join public.attempts a
        on a.user_id = uid and a.daily_set_id = i.daily_set_id and a.question_id = i.question_id and a.context = 'daily'
      where i.daily_set_id = set_id
    )
    select jsonb_build_object(
      'daily_set_id',   s.id,
      'set_date',       s.set_date,
      'track',          jsonb_build_object('slug', s.track_slug, 'name', s.track_name),
      'level',          jsonb_build_object('level', s.level, 'name', s.level_name),
      'handle',         me.handle,
      'display_name',   me.display_name,
      'player_level',   me.level,
      'total',          count(*),
      'answered',       count(q.attempt_id),
      'correct',        count(*) filter (where q.is_correct),
      'complete',       count(q.attempt_id) = count(*),
      'time_ms',        sum(q.time_ms),
      'xp_earned',      (select coalesce(sum(e.amount), 0) from public.xp_events e
                         where e.user_id = uid and e.daily_set_id = set_id),
      'questions',      jsonb_agg(jsonb_build_object(
                          'position',   q.position,
                          'difficulty', q.difficulty,
                          'outcome',    case
                                          when q.attempt_id is null then 'unanswered'
                                          when q.is_correct and q.used_hint then 'hinted'
                                          when q.is_correct then 'correct'
                                          when q.selected_option_id is null then 'gave_up'
                                          else 'wrong' end,
                          'time_ms',    q.time_ms,
                          'xp',         coalesce(q.xp_awarded, 0)) order by q.position),
      'rating',         case when rating.id is not null then jsonb_build_object(
                          'before', rating.rating_before, 'after', rating.rating_after,
                          'delta',  rating.rating_after - rating.rating_before) end,
      'current_streak', me.current_streak,
      'longest_streak', me.longest_streak,
      'league',         case when league.tier_name is not null then jsonb_build_object(
                          'tier', league.tier_slug, 'name', league.tier_name,
                          'rank', league.rnk, 'members', league.n) end
    )
    from items q
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.streak_freeze_awards enable row level security;
alter table public.rating_events        enable row level security;
alter table public.badges               enable row level security;
alter table public.user_badges          enable row level security;

revoke all on public.streak_freeze_awards, public.rating_events, public.badges, public.user_badges
  from anon, authenticated;

grant select on public.streak_freeze_awards, public.rating_events, public.user_badges to authenticated;
grant select, insert, update, delete on public.badges to authenticated;

create policy "streak_freeze_awards: read own or admin" on public.streak_freeze_awards
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "rating_events: read own or admin" on public.rating_events
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Other players' badges come from get_player_profile().
create policy "user_badges: read own or admin" on public.user_badges
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "badges: read" on public.badges
  for select to authenticated using (true);
create policy "badges: admin insert" on public.badges
  for insert to authenticated with check ((select private.is_admin()));
create policy "badges: admin update" on public.badges
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "badges: admin delete" on public.badges
  for delete to authenticated using ((select private.is_admin()));

-- Materialized views: no Data API access at all.
revoke all on private.leaderboard_all_time, private.leaderboard_weekly from public, anon, authenticated, service_role;

-- Only this migration's functions: earlier migrations' grants stay as they were.
revoke execute on function private.level_xp(integer)                      from public, anon;
revoke execute on function private.xp_level(bigint)                       from public, anon;
revoke execute on function private.freeze_xp_step()                       from public, anon;
revoke execute on function private.max_streak_freezes()                   from public, anon;
revoke execute on function private.daily_complete_xp()                    from public, anon;
revoke execute on function private.report_accepted_xp()                   from public, anon;
revoke execute on function private.question_rating(public.question_difficulty) from public, anon;
revoke execute on function private.topic_master_min_correct()             from public, anon;
revoke execute on function private.is_league_member(text)                 from public, anon;
-- Internal helpers and jobs: cron owner (postgres) and definer functions only.
revoke execute on function private.record_attempt(uuid, uuid, public.attempt_context, uuid, uuid, integer)
  from public, anon;
revoke execute on function private.award_xp(uuid, integer, text, text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function private.rate_daily_set(uuid, uuid)                           from public, anon, authenticated, service_role;
revoke execute on function private.rate_finished_sets()                                 from public, anon, authenticated, service_role;
revoke execute on function private.refresh_leaderboards()                               from public, anon, authenticated, service_role;
revoke execute on function private.award_badge(uuid, text, uuid)                        from public, anon, authenticated, service_role;
revoke execute on function private.profiles_progression()                               from public, anon, authenticated, service_role;
revoke execute on function private.badges_after_attempt()                               from public, anon, authenticated, service_role;
revoke execute on function private.badges_after_streak()                                from public, anon, authenticated, service_role;
revoke execute on function private.report_accepted()                                    from public, anon, authenticated, service_role;
revoke execute on function private.league_broadcast()                                   from public, anon, authenticated, service_role;
-- The Realtime policy runs as the subscriber.
grant execute on function private.is_league_member(text) to authenticated;

revoke execute on function public.get_leaderboard(text, integer, integer) from public, anon;
revoke execute on function public.get_player_profile(text)                from public, anon;
revoke execute on function public.get_daily_result(uuid)                  from public, anon;
grant  execute on function public.get_leaderboard(text, integer, integer) to authenticated, service_role;
grant  execute on function public.get_player_profile(text)                to authenticated, service_role;
grant  execute on function public.get_daily_result(uuid)                  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schedules (UTC). cron.schedule() with an existing name replaces that job.
-- ---------------------------------------------------------------------------
select cron.schedule('aptric-ratings',      '15 * * * *',  $$select private.rate_finished_sets()$$);
select cron.schedule('aptric-leaderboards', '*/5 * * * *', $$select private.refresh_leaderboards()$$);
