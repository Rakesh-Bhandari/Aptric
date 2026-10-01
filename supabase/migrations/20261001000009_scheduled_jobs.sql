-- Scheduled jobs (pg_cron): daily set generation, streak settlement and the
-- weekly league rollover. Everything here is plain SQL over the question bank
-- and game tables; no job calls out to an AI model or any other service.
--
--   job                     schedule (UTC)   IST                function
--   aptric-daily-sets       0 18 * * *       23:30 daily        private.generate_daily_sets()
--   aptric-streaks          5 * * * *        hourly             private.settle_broken_streaks()
--   aptric-league-rollover  35 18 * * 0      Mon 00:05          private.rollover_leagues()
--
-- Every job function is idempotent, so a missed or repeated run is harmless:
-- re-run one by hand with e.g. `select private.generate_daily_sets();`.
-- Run history is in cron.job_run_details; each run also writes a summary row to
-- audit_log (actor_id NULL, entity_type 'cron').

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Levels: difficulty bands for daily sets. A profile at profiles.level L plays
-- the band with the highest min_profile_level <= L. Each band's daily set has
-- easy_count + medium_count + hard_count questions.
-- ---------------------------------------------------------------------------
create table public.levels (
  level              smallint primary key check (level between 1 and 50),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name               text not null check (char_length(name) between 1 and 40),
  min_profile_level  integer not null unique check (min_profile_level >= 1),
  easy_count         smallint not null check (easy_count >= 0),
  medium_count       smallint not null check (medium_count >= 0),
  hard_count         smallint not null check (hard_count >= 0),
  -- Inactive bands get no generated sets; their players fall back to a lower band's set.
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (easy_count + medium_count + hard_count between 1 and 50)
);

insert into public.levels (level, slug, name, min_profile_level, easy_count, medium_count, hard_count) values
  (1, 'beginner',     'Beginner',     1, 7, 3, 0),
  (2, 'intermediate', 'Intermediate', 2, 4, 5, 1),
  (3, 'advanced',     'Advanced',     3, 2, 5, 3),
  (4, 'pro',          'Pro',          4, 1, 4, 5),
  (5, 'expert',       'Expert',       5, 0, 3, 7);

create trigger levels_set_updated_at
  before update on public.levels
  for each row execute function private.set_updated_at();
create trigger levels_audit
  after insert or update or delete on public.levels
  for each row execute function private.audit_row_change();

-- The band a profile level plays. Falls back to the lowest band.
create or replace function private.level_for(profile_level integer)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.level from public.levels l
     where l.min_profile_level <= profile_level
     order by l.min_profile_level desc limit 1),
    (select min(l.level) from public.levels l),
    1::smallint);
$$;

-- ---------------------------------------------------------------------------
-- daily_sets: one set per track per level per date. Existing sets are level 1.
-- ---------------------------------------------------------------------------
alter table public.daily_sets
  add column level smallint not null default 1 references public.levels (level) on delete restrict,
  drop constraint daily_sets_track_date_key,
  add constraint daily_sets_track_date_level_key unique (track_id, set_date, level);

create index daily_sets_level_idx on public.daily_sets (level);

-- Today's released set for the user's track and level. Prefers a set the user
-- already has a daily attempt in (so levelling up mid-day doesn't swap the
-- set), then the user's own band, then the nearest lower band that has a set.
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
           private.level_for(p.level)                       as level
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

-- ---------------------------------------------------------------------------
-- track_sections: which sections a track's daily sets draw from. A track
-- with no rows here draws from every active section.
-- ---------------------------------------------------------------------------
create table public.track_sections (
  track_id    uuid not null references public.tracks (id) on delete cascade,
  section_id  uuid not null references public.sections (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (track_id, section_id)
);

create index track_sections_section_idx on public.track_sections (section_id);

create trigger track_sections_audit
  after insert or update or delete on public.track_sections
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Daily set generation.
--
-- For each active track and active level with no set yet for target_date
-- (default: tomorrow in IST), picks easy/medium/hard questions per the level's
-- mix from published questions that
--   * have an answer key and at least two options,
--   * sit under an active section/topic/subtopic in the track's sections,
--   * are not in any daily set dated within 60 days before target_date (or
--     later), including sets created earlier in this same run.
-- Each pick takes the requested difficulty if any is left (else the nearest
-- one), then the section with the fewest picks so far in this set, then a
-- random question. A short bank yields a shorter set (logged as a shortfall);
-- an empty one yields no set.
--
-- Sets are released at 00:00 of target_date in UTC+14, the earliest timezone,
-- so every player sees the set from their own local midnight.
-- ---------------------------------------------------------------------------
create or replace function private.generate_daily_sets(target_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reuse_window_days constant integer := 60;
  gen_date   date := coalesce(target_date, (now() at time zone 'Asia/Kolkata')::date + 1);
  -- POSIX sign convention: Etc/GMT-14 is UTC+14.
  release_at timestamptz := gen_date::timestamp at time zone 'Etc/GMT-14';
  trk        record;
  lvl        record;
  want       public.question_difficulty;
  qid        uuid;
  sid        uuid;
  picked     uuid[];
  picked_sec uuid[];
  new_set_id uuid;
  wanted     integer;
  status     text;
  results    jsonb := '[]'::jsonb;
  summary    jsonb;
begin
  -- One generator at a time.
  perform pg_advisory_xact_lock(hashtext('aptric:generate_daily_sets'));

  create temp table if not exists daily_set_pool (
    question_id  uuid primary key,
    section_id   uuid not null,
    difficulty   public.question_difficulty not null
  ) on commit drop;

  for trk in
    select t.id, t.slug from public.tracks t where t.is_active order by t.sort_order, t.slug
  loop
    -- Built per track, after earlier tracks' sets were inserted, so a question
    -- lands in at most one set per run.
    truncate pg_temp.daily_set_pool;
    insert into pg_temp.daily_set_pool (question_id, section_id, difficulty)
    select q.id, sec.id, q.difficulty
    from public.questions q
    join public.subtopics sub on sub.id = q.subtopic_id and sub.is_active
    join public.topics top    on top.id = sub.topic_id  and top.is_active
    join public.sections sec  on sec.id = top.section_id and sec.is_active
    where q.status = 'published'
      and exists (select 1 from public.question_answers a where a.question_id = q.id)
      and (select count(*) from public.question_options o where o.question_id = q.id) >= 2
      and (
        not exists (select 1 from public.track_sections ts where ts.track_id = trk.id)
        or exists (select 1 from public.track_sections ts
                   where ts.track_id = trk.id and ts.section_id = sec.id)
      )
      and not exists (
        select 1
        from public.daily_set_items i
        join public.daily_sets s on s.id = i.daily_set_id
        where i.question_id = q.id
          and s.set_date >= gen_date - reuse_window_days
      );

    for lvl in
      select l.level, l.slug, l.easy_count, l.medium_count, l.hard_count
      from public.levels l where l.is_active order by l.level
    loop
      wanted := lvl.easy_count + lvl.medium_count + lvl.hard_count;

      if exists (
        select 1 from public.daily_sets s
        where s.track_id = trk.id and s.set_date = gen_date and s.level = lvl.level
      ) then
        results := results || jsonb_build_object(
          'track', trk.slug, 'level', lvl.level, 'status', 'exists');
        continue;
      end if;

      picked := '{}';
      picked_sec := '{}';
      foreach want in array
        array_fill('easy'::public.question_difficulty,   array[lvl.easy_count::integer])
        || array_fill('medium'::public.question_difficulty, array[lvl.medium_count::integer])
        || array_fill('hard'::public.question_difficulty,   array[lvl.hard_count::integer])
      loop
        select p.question_id, p.section_id into qid, sid
        from pg_temp.daily_set_pool p
        order by
          abs(array_position(enum_range(null::public.question_difficulty), p.difficulty)
              - array_position(enum_range(null::public.question_difficulty), want)),
          (select count(*) from unnest(picked_sec) x where x = p.section_id),
          random()
        limit 1;
        exit when qid is null;

        picked := picked || qid;
        picked_sec := picked_sec || sid;
        delete from pg_temp.daily_set_pool where question_id = qid;
      end loop;

      new_set_id := null;
      if cardinality(picked) > 0 then
        insert into public.daily_sets (track_id, level, set_date, published_at)
        values (trk.id, lvl.level, gen_date, release_at)
        on conflict on constraint daily_sets_track_date_level_key do nothing
        returning id into new_set_id;
      end if;

      if new_set_id is not null then
        -- Easy first, then medium, then hard.
        insert into public.daily_set_items (daily_set_id, question_id, position)
        select new_set_id, q.id, (row_number() over (order by q.difficulty, x.ord) - 1)::smallint
        from unnest(picked) with ordinality as x (id, ord)
        join public.questions q on q.id = x.id;
      end if;

      status := case
        when cardinality(picked) = 0 then 'empty'
        when new_set_id is null      then 'exists'  -- created concurrently (e.g. by an admin)
        when cardinality(picked) < wanted then 'shortfall'
        else 'created'
      end;
      if status in ('empty', 'shortfall') then
        raise warning 'daily set % / level % / %: % of % questions available',
          trk.slug, lvl.level, gen_date, cardinality(picked), wanted;
      end if;

      results := results || jsonb_build_object(
        'track', trk.slug, 'level', lvl.level, 'status', status,
        'daily_set_id', new_set_id, 'questions', cardinality(picked), 'wanted', wanted);
    end loop;
  end loop;

  summary := jsonb_build_object('set_date', gen_date, 'released_at', release_at, 'sets', results);
  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (null, 'generate_daily_sets', 'cron', gen_date::text, summary);
  return summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- Streaks and streak freezes.
--
-- A streak is broken once a full local day passes with no daily attempt. If
-- the player has enough streak_freezes to cover every missed day, one freeze
-- is consumed per missed day and the streak carries on (last_streak_date moves
-- to the last covered day); otherwise current_streak drops to 0 and no freeze
-- is spent. Settlement runs lazily before every streak bump and hourly from
-- cron, so the result doesn't depend on which comes first.
-- ---------------------------------------------------------------------------
create table public.streak_freeze_uses (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  covered_date  date not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, covered_date)
);

-- Settles target_user_id's streak as of local date on_date (the player's
-- "today", which is not itself counted as missed). Returns 'frozen', 'reset'
-- or 'ok'.
create or replace function private.settle_streak(target_user_id uuid, on_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     record;
  missed integer;
begin
  select p.current_streak, p.last_streak_date, p.streak_freezes into me
  from public.profiles p where p.id = target_user_id
  for update;

  if not found or me.current_streak = 0 or me.last_streak_date is null then
    return 'ok';
  end if;

  missed := (on_date - 1) - me.last_streak_date;
  if missed <= 0 then
    return 'ok';
  end if;

  if me.streak_freezes >= missed then
    insert into public.streak_freeze_uses (user_id, covered_date)
    select target_user_id, me.last_streak_date + g
    from generate_series(1, missed) g
    on conflict do nothing;
    update public.profiles p
    set streak_freezes = p.streak_freezes - missed,
        last_streak_date = on_date - 1
    where p.id = target_user_id;
    return 'frozen';
  end if;

  update public.profiles p set current_streak = 0 where p.id = target_user_id;
  return 'reset';
end;
$$;

-- Same as before, but settles freezes first so a missed day covered by a
-- freeze extends the streak instead of restarting it.
create or replace function private.bump_streak(target_user_id uuid, on_date date)
returns table (current_streak integer, longest_streak integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.settle_streak(target_user_id, on_date);

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

create index profiles_live_streak_idx on public.profiles (last_streak_date) where current_streak > 0;

-- Cron: settles every live streak whose player missed their local yesterday.
-- Hourly, so each player is settled shortly after their own local midnight.
create or replace function private.settle_broken_streaks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         record;
  n_frozen  integer := 0;
  n_reset   integer := 0;
  summary jsonb;
begin
  for r in
    select p.id, (now() at time zone p.timezone)::date as today
    from public.profiles p
    where p.current_streak > 0
      -- Index-friendly pre-filter: no local date anywhere is later than UTC+14's.
      and p.last_streak_date < (now() at time zone 'Etc/GMT-14')::date - 1
      and p.last_streak_date < (now() at time zone p.timezone)::date - 1
    order by p.id
  loop
    case private.settle_streak(r.id, r.today)
      when 'frozen' then n_frozen := n_frozen + 1;
      when 'reset'  then n_reset  := n_reset + 1;
      else null;
    end case;
  end loop;

  summary := jsonb_build_object('frozen', n_frozen, 'reset', n_reset);
  if n_frozen + n_reset > 0 then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
    values (null, 'settle_broken_streaks', 'cron', null, summary);
  end if;
  return summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leagues. Weeks run Monday 00:00 to Monday 00:00 IST. A player joins a
-- league of their tier (profiles.league_tier) with their first XP of the week,
-- in a cohort of up to 30. At rollover each finished league is ranked by
-- weekly XP (ties: whoever got there first): the top promote_count move up a
-- tier, the bottom demote_count move down. Those counts are for a full cohort
-- and scale with its size (promotion rounds up, demotion down), so a lone
-- Bronze player still goes up and a 3-player Diamond cohort isn't wiped out.
-- Players who earn no XP in a week are in no league and keep their tier.
-- ---------------------------------------------------------------------------
create table public.league_tiers (
  tier           smallint primary key check (tier between 1 and 20),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null check (char_length(name) between 1 and 40),
  promote_count  smallint not null check (promote_count between 0 and 30),
  demote_count   smallint not null check (demote_count between 0 and 30),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (promote_count + demote_count <= 30)
);

insert into public.league_tiers (tier, slug, name, promote_count, demote_count) values
  (1, 'bronze',   'Bronze',   10, 0),
  (2, 'silver',   'Silver',    7, 5),
  (3, 'gold',     'Gold',      7, 5),
  (4, 'platinum', 'Platinum',  5, 5),
  (5, 'diamond',  'Diamond',   0, 5);

create trigger league_tiers_set_updated_at
  before update on public.league_tiers
  for each row execute function private.set_updated_at();
create trigger league_tiers_audit
  after insert or update or delete on public.league_tiers
  for each row execute function private.audit_row_change();

-- Service-managed like the other game columns: no user UPDATE grant.
alter table public.profiles
  add column league_tier smallint not null default 1
    references public.league_tiers (tier) on delete restrict;

create index profiles_league_tier_idx on public.profiles (league_tier);

create type public.league_outcome as enum ('promoted', 'stayed', 'demoted');

create table public.leagues (
  id            uuid primary key default gen_random_uuid(),
  tier          smallint not null references public.league_tiers (tier) on delete restrict,
  week_start    date not null check (extract(isodow from week_start) = 1),
  finalized_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index leagues_week_tier_idx on public.leagues (week_start, tier);
create index leagues_tier_idx      on public.leagues (tier);
create index leagues_open_idx      on public.leagues (week_start) where finalized_at is null;

create table public.league_members (
  league_id    uuid not null references public.leagues (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week_start   date not null,
  xp           integer not null default 0,
  last_xp_at   timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  final_rank   integer check (final_rank >= 1),
  outcome      public.league_outcome,
  primary key (league_id, user_id),
  constraint league_members_user_week_key unique (user_id, week_start)
);

create index league_members_league_xp_idx on public.league_members (league_id, xp desc);

create or replace function private.league_cohort_size()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 30;
$$;

-- Monday (IST) of the league week containing ts.
create or replace function private.league_week_start(ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', ts at time zone 'Asia/Kolkata')::date;
$$;

-- xp_events trigger: adds the XP to the player's league for that week,
-- joining one first if this is their first positive XP of the week.
create or replace function private.league_track_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wk     date := private.league_week_start(new.created_at);
  my_tier smallint;
  target uuid;
begin
  update public.league_members m
  set xp = m.xp + new.amount, last_xp_at = new.created_at
  where m.user_id = new.user_id and m.week_start = wk;
  if found or new.amount <= 0 then
    return null;
  end if;

  select p.league_tier into my_tier from public.profiles p where p.id = new.user_id;
  -- Serialise cohort filling per tier + week so cohorts don't overfill.
  perform pg_advisory_xact_lock(hashtext('aptric:league:' || my_tier || ':' || wk));

  select l.id into target
  from public.leagues l
  where l.tier = my_tier and l.week_start = wk and l.finalized_at is null
    and (select count(*) from public.league_members m where m.league_id = l.id) < private.league_cohort_size()
  order by l.created_at, l.id
  limit 1;

  if target is null then
    insert into public.leagues (tier, week_start) values (my_tier, wk)
    returning id into target;
  end if;

  insert into public.league_members as m (league_id, user_id, week_start, xp, last_xp_at)
  values (target, new.user_id, wk, new.amount, new.created_at)
  on conflict on constraint league_members_user_week_key
  do update set xp = m.xp + excluded.xp, last_xp_at = excluded.last_xp_at;
  return null;
end;
$$;

create trigger xp_events_league
  after insert on public.xp_events
  for each row execute function private.league_track_xp();

-- Cron: finalises every unfinished league from a past week, oldest first, and
-- moves promoted/demoted players' profiles.league_tier.
create or replace function private.rollover_leagues()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  this_week  date := private.league_week_start(now());
  lg         record;
  n_leagues  integer := 0;
  n_promoted integer := 0;
  n_demoted  integer := 0;
  summary    jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('aptric:rollover_leagues'));

  for lg in
    select l.id, l.tier, l.week_start, t.demote_count,
           (select min(u.tier) from public.league_tiers u where u.tier > l.tier) as up_tier,
           (select max(d.tier) from public.league_tiers d where d.tier < l.tier) as down_tier,
           t.promote_count
    from public.leagues l
    join public.league_tiers t on t.tier = l.tier
    where l.finalized_at is null and l.week_start < this_week
    order by l.week_start, l.tier, l.created_at
    for update of l
  loop
    with ranked as (
      select m.user_id,
             row_number() over (order by m.xp desc, m.last_xp_at, m.joined_at, m.user_id) as rnk,
             count(*) over () as n
      from public.league_members m
      where m.league_id = lg.id
    ),
    zones as (
      select r.*,
             case when lg.up_tier is null then 0
                  else ceil(lg.promote_count * r.n / private.league_cohort_size()::numeric) end as up_zone,
             case when lg.down_tier is null then 0
                  else floor(lg.demote_count * r.n / private.league_cohort_size()::numeric) end as down_zone
      from ranked r
    )
    update public.league_members m
    set final_rank = z.rnk,
        outcome = case
          when z.rnk <= z.up_zone then 'promoted'
          when z.rnk > greatest(z.up_zone, z.n - z.down_zone) then 'demoted'
          else 'stayed'
        end::public.league_outcome
    from zones z
    where m.league_id = lg.id and m.user_id = z.user_id;

    update public.profiles p
    set league_tier = case m.outcome when 'promoted' then lg.up_tier else lg.down_tier end
    from public.league_members m
    where m.league_id = lg.id and m.user_id = p.id and m.outcome in ('promoted', 'demoted');

    update public.leagues l set finalized_at = now() where l.id = lg.id;

    n_leagues  := n_leagues + 1;
    n_promoted := n_promoted + (select count(*) from public.league_members m
                            where m.league_id = lg.id and m.outcome = 'promoted');
    n_demoted  := n_demoted  + (select count(*) from public.league_members m
                            where m.league_id = lg.id and m.outcome = 'demoted');
  end loop;

  summary := jsonb_build_object('week_start', this_week, 'leagues_finalized', n_leagues,
                                'promoted', n_promoted, 'demoted', n_demoted);
  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (null, 'rollover_leagues', 'cron', this_week::text, summary);
  return summary;
end;
$$;

-- The caller's league this week: standings with public profile fields, plus
-- the result of their most recent finished league week.
create or replace function public.get_my_league()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  wk      date := private.league_week_start(now());
  mine    record;
  tier    record;
  last    record;
  n       integer;
begin
  select m.league_id, l.tier into mine
  from public.league_members m join public.leagues l on l.id = m.league_id
  where m.user_id = uid and m.week_start = wk;

  select t.tier, t.slug, t.name, t.promote_count, t.demote_count into tier
  from public.league_tiers t
  where t.tier = coalesce(mine.tier, (select p.league_tier from public.profiles p where p.id = uid));

  select count(*) into n from public.league_members m where m.league_id = mine.league_id;

  select m.week_start, l.tier, m.final_rank, m.outcome into last
  from public.league_members m join public.leagues l on l.id = m.league_id
  where m.user_id = uid and l.finalized_at is not null
  order by m.week_start desc limit 1;

  return jsonb_build_object(
    'week_start',   wk,
    'week_ends_at', (wk + 7)::timestamp at time zone 'Asia/Kolkata',
    'league_id',    mine.league_id,
    'tier',         jsonb_build_object('tier', tier.tier, 'slug', tier.slug, 'name', tier.name,
                                       'promote_count', tier.promote_count, 'demote_count', tier.demote_count),
    -- Current zone sizes for this cohort (see rollover_leagues).
    'promote_zone', case when exists (select 1 from public.league_tiers t where t.tier > tier.tier)
                      then ceil(tier.promote_count * n / private.league_cohort_size()::numeric)::integer else 0 end,
    'demote_zone',  case when exists (select 1 from public.league_tiers t where t.tier < tier.tier)
                      then floor(tier.demote_count * n / private.league_cohort_size()::numeric)::integer else 0 end,
    'members',      coalesce((
      select jsonb_agg(jsonb_build_object(
          'rank',         x.rnk,
          'user_id',      x.user_id,
          'handle',       p.handle,
          'display_name', p.display_name,
          'avatar_url',   p.avatar_url,
          'xp',           x.xp,
          'is_me',        x.user_id = uid
        ) order by x.rnk)
      from (
        select m.user_id, m.xp,
               row_number() over (order by m.xp desc, m.last_xp_at, m.joined_at, m.user_id) as rnk
        from public.league_members m
        where m.league_id = mine.league_id
      ) x
      join public.profiles p on p.id = x.user_id
    ), '[]'::jsonb),
    'last_result',  case when last.week_start is not null then jsonb_build_object(
                      'week_start', last.week_start, 'tier', last.tier,
                      'final_rank', last.final_rank, 'outcome', last.outcome) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.levels             enable row level security;
alter table public.track_sections     enable row level security;
alter table public.streak_freeze_uses enable row level security;
alter table public.league_tiers       enable row level security;
alter table public.leagues            enable row level security;
alter table public.league_members     enable row level security;

revoke all on public.levels, public.track_sections, public.streak_freeze_uses,
              public.league_tiers, public.leagues, public.league_members
  from anon, authenticated;

-- Config: everyone reads, admins write.
grant select, insert, update, delete on public.levels, public.track_sections, public.league_tiers
  to authenticated;

create policy "levels: read" on public.levels
  for select to authenticated using (is_active or (select private.is_admin()));
create policy "levels: admin insert" on public.levels
  for insert to authenticated with check ((select private.is_admin()));
create policy "levels: admin update" on public.levels
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "levels: admin delete" on public.levels
  for delete to authenticated using ((select private.is_admin()));

create policy "track_sections: read" on public.track_sections
  for select to authenticated using (true);
create policy "track_sections: admin insert" on public.track_sections
  for insert to authenticated with check ((select private.is_admin()));
create policy "track_sections: admin update" on public.track_sections
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "track_sections: admin delete" on public.track_sections
  for delete to authenticated using ((select private.is_admin()));

create policy "league_tiers: read" on public.league_tiers
  for select to authenticated using (true);
create policy "league_tiers: admin insert" on public.league_tiers
  for insert to authenticated with check ((select private.is_admin()));
create policy "league_tiers: admin update" on public.league_tiers
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "league_tiers: admin delete" on public.league_tiers
  for delete to authenticated using ((select private.is_admin()));

-- Game state: written only by the job / trigger functions. Users read their
-- own rows; standings with other players come from get_my_league().
grant select on public.streak_freeze_uses, public.leagues, public.league_members to authenticated;

create policy "streak_freeze_uses: read own or admin" on public.streak_freeze_uses
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "league_members: read own or admin" on public.league_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "leagues: read own or admin" on public.leagues
  for select to authenticated
  using (
    exists (select 1 from public.league_members m
            where m.league_id = leagues.id and m.user_id = (select auth.uid()))
    or (select private.is_admin())
  );

revoke execute on all functions in schema private from public, anon;
-- Job functions are for the cron owner (postgres) only.
revoke execute on function private.generate_daily_sets(date)        from authenticated, service_role;
revoke execute on function private.settle_broken_streaks()          from authenticated, service_role;
revoke execute on function private.rollover_leagues()               from authenticated, service_role;
revoke execute on function private.settle_streak(uuid, date)        from authenticated, service_role;
revoke execute on function private.league_track_xp()                from authenticated, service_role;

revoke execute on function public.get_my_league() from public, anon;
grant  execute on function public.get_my_league() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schedules (pg_cron runs in UTC). cron.schedule() with an existing name
-- replaces that job, so re-applying this migration is safe.
-- ---------------------------------------------------------------------------
select cron.schedule('aptric-daily-sets',      '0 18 * * *',  $$select private.generate_daily_sets()$$);
select cron.schedule('aptric-streaks',         '5 * * * *',   $$select private.settle_broken_streaks()$$);
select cron.schedule('aptric-league-rollover', '35 18 * * 0', $$select private.rollover_leagues()$$);
