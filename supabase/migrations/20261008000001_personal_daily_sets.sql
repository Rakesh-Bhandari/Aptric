-- Personalised daily sets.
--
-- A daily set used to be shared: one per track, level and date, made by
-- private.generate_daily_sets(). Now each player can also have a PERSONAL set
-- for their local date. The API builds it on first use (backend/src/personalSet.js:
-- difficulty mix from the player's level band and league, topic preferences,
-- seeded by user id + date) and stores it here, so every refresh returns the
-- same set. Shared sets stay as the fallback when a personal set can't be made.
--
--   daily_sets.user_id          NULL = shared set, else the one player it belongs to
--   user_topic_preferences      topics a player prefers or never wants in their daily set
--
-- Everything else keyed on daily_set_id (attempts, hint uses, XP, rating events,
-- streaks, the result card) already works per set, so it works per player.

-- ---------------------------------------------------------------------------
-- Topic preferences
-- ---------------------------------------------------------------------------
create table public.user_topic_preferences (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  topic_id    uuid not null references public.topics (id) on delete cascade,
  preference  text not null check (preference in ('prefer', 'exclude')),
  created_at  timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create index user_topic_preferences_topic_idx on public.user_topic_preferences (topic_id);

alter table public.user_topic_preferences enable row level security;

create policy "user_topic_preferences: read own" on public.user_topic_preferences
  for select to authenticated using (user_id = (select auth.uid()));

-- Writes go through the API (PATCH /me/preferences), which replaces the whole list.
revoke all on public.user_topic_preferences from anon, authenticated;
grant select on public.user_topic_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- daily_sets.user_id
-- ---------------------------------------------------------------------------
alter table public.daily_sets
  add column user_id uuid references public.profiles (id) on delete cascade;

-- One shared set per track, level and date; one personal set per player and date.
alter table public.daily_sets drop constraint daily_sets_track_date_level_key;
create unique index daily_sets_shared_key on public.daily_sets (track_id, set_date, level) where user_id is null;
create unique index daily_sets_personal_key on public.daily_sets (user_id, set_date) where user_id is not null;

-- Players read shared sets and their own, never another player's.
drop policy "daily_sets: read released" on public.daily_sets;
create policy "daily_sets: read released" on public.daily_sets
  for select to authenticated
  using (
    (published_at <= now() and (user_id is null or user_id = (select auth.uid())))
    or (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Today's set: the player's own personal set first, else as before.
-- A set the player already started wins over everything, so a set never
-- changes under them mid-day.
-- ---------------------------------------------------------------------------
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
    where s.set_date = me.today
      and s.published_at <= now()
      and (
        s.user_id = target_user_id
        or (s.user_id is null and s.track_id = me.track_id and (s.level <= me.level or x.started))
      )
    order by x.started desc, (s.user_id is not null) desc, s.level desc
    limit 1
  ) s on true;
$$;

-- ---------------------------------------------------------------------------
-- Shared set generation: only shared sets count (personal sets reuse the bank
-- on purpose and must not use up questions for the shared ones).
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
          and s.user_id is null
          and s.set_date >= gen_date - reuse_window_days
      );

    for lvl in
      select l.level, l.slug, l.easy_count, l.medium_count, l.hard_count
      from public.levels l where l.is_active order by l.level
    loop
      wanted := lvl.easy_count + lvl.medium_count + lvl.hard_count;

      if exists (
        select 1 from public.daily_sets s
        where s.user_id is null and s.track_id = trk.id and s.set_date = gen_date and s.level = lvl.level
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
        on conflict (track_id, set_date, level) where user_id is null do nothing
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

revoke execute on function private.generate_daily_sets(date) from authenticated, service_role;
