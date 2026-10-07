-- Community, slice 3a: 1v1 "Beat my score" challenges (asynchronous, Chess.com-style accept flow).
--
--   challenger plays a set first (score, time and hints are locked in) -> the opponent sees only the target
--   ("8/10 in 4:12"), accepts, and plays the SAME frozen question list under the same rules -> head-to-head result.
--
--   * challenges            the match; question_ids are frozen at creation and never readable through the table
--   * challenge_runs        one timed attempt per player; the clock is the server's
--   * challenge_answers     one scoring attempt per question, graded in SQL against question_answers
--   * challenge_hints       hints used (a tie-break; there is no tutor in a run)
--   * integrity_events      things that look like collusion, for moderators
--
-- Rules (all here, none in the API):
--   winner = more correct; tie -> less total time; tie -> fewer hints; otherwise a draw.
--   XP: 5 for taking part, +10 for the winner, for at most 5 rewarded challenges a day per player (the count is
--   taken under a per-player lock, so parallel requests cannot go past it). No rating change.
--   The same two players: 3 challenges a day. accept_by = 48 hours after it was sent; complete_by = 24 hours after
--   accepting. An opponent never receives the questions before accepting (accepting starts their clock).
--   Only friends (or people who share a league) can be challenged by name; anyone with the share link can accept.
--   Blocks hide each player from the other, as everywhere.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.challenges (
  id                   uuid primary key default gen_random_uuid(),
  challenger_id        uuid not null references public.profiles (id) on delete cascade,
  -- Null until someone accepts through the share link.
  opponent_id          uuid references public.profiles (id) on delete cascade,
  set_kind             text not null check (set_kind in ('daily', 'practice_topic', 'custom_set')),
  set_ref              uuid,
  question_ids         uuid[] not null check (cardinality(question_ids) between 3 and 20),
  share_token          text not null unique check (share_token ~ '^[a-z0-9]{16}$'),
  challenger_score     integer check (challenger_score >= 0),
  challenger_time_ms   bigint check (challenger_time_ms >= 0),
  challenger_hints     integer not null default 0 check (challenger_hints >= 0),
  challenger_locked_at timestamptz,
  opponent_score       integer check (opponent_score >= 0),
  opponent_time_ms     bigint check (opponent_time_ms >= 0),
  opponent_hints       integer not null default 0 check (opponent_hints >= 0),
  status               text not null default 'pending'
                         check (status in ('pending', 'accepted', 'completed', 'declined', 'expired', 'cancelled')),
  winner_id            uuid references public.profiles (id) on delete set null,
  is_draw              boolean not null default false,
  created_at           timestamptz not null default now(),
  -- Set when the challenger's score is locked in and the challenge becomes visible to the opponent.
  sent_at              timestamptz,
  accept_by            timestamptz,
  accepted_at          timestamptz,
  complete_by          timestamptz,
  completed_at         timestamptz,
  rematch_of           uuid references public.challenges (id) on delete set null,
  check (challenger_id <> opponent_id)
);

create index challenges_challenger_idx on public.challenges (challenger_id, created_at desc);
create index challenges_opponent_idx   on public.challenges (opponent_id, created_at desc) where opponent_id is not null;
create index challenges_open_idx       on public.challenges (status, accept_by, complete_by) where status in ('pending', 'accepted');

create table public.challenge_runs (
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  started_at    timestamptz not null default now(),
  deadline_at   timestamptz not null,
  finished_at   timestamptz,
  violation     text check (violation in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'page_left', 'time_up')),
  primary key (challenge_id, user_id),
  check (violation is null or finished_at is not null)
);

create table public.challenge_answers (
  challenge_id        uuid not null,
  user_id             uuid not null,
  question_id         uuid not null references public.questions (id) on delete restrict,
  selected_option_id  uuid,
  is_correct          boolean not null,
  used_hint           boolean not null default false,
  -- Measured by the server: the time since the previous answer (or the start of the run).
  time_ms             integer not null check (time_ms >= 0),
  created_at          timestamptz not null default now(),
  -- One scoring attempt per question.
  primary key (challenge_id, user_id, question_id),
  foreign key (challenge_id, user_id) references public.challenge_runs (challenge_id, user_id) on delete cascade,
  foreign key (selected_option_id, question_id) references public.question_options (id, question_id)
);

create table public.challenge_hints (
  challenge_id  uuid not null,
  user_id       uuid not null,
  question_id   uuid not null,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, user_id, question_id),
  foreign key (challenge_id, user_id) references public.challenge_runs (challenge_id, user_id) on delete cascade
);

create table public.integrity_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in ('challenge_pair_repeat', 'challenge_identical_result')),
  ref_id      uuid,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index integrity_events_user_idx on public.integrity_events (user_id, created_at desc);
create index integrity_events_ref_idx  on public.integrity_events (kind, ref_id);

-- ---------------------------------------------------------------------------
-- Helpers (not reachable from the API)
-- ---------------------------------------------------------------------------
-- May `uid` challenge `other` by name? Friends only for now; private leagues add their members.
create or replace function private.can_challenge(uid uuid, other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid <> other and not private.is_blocked_pair(uid, other) and private.is_friend(uid, other);
$$;

-- Seconds a run may take: twice the questions' own estimate, between 5 and 45 minutes.
create or replace function private.challenge_time_limit(qids uuid[])
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(secs => least(greatest(coalesce((select sum(q.est_seconds) from public.questions q where q.id = any (qids)), 0) * 2, 300), 2700));
$$;

create or replace function private.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::integer, 1), '') from generate_series(1, 16);
$$;

-- A published question with an answer key.
create or replace function private.playable_questions(qids uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.questions q join public.question_answers a on a.question_id = q.id
          where q.id = any (qids) and q.status = 'published') = cardinality(qids);
$$;

-- Decides the result once both scores are in. Winner: correct, then less time, then fewer hints.
create or replace function private.challenge_outcome(c public.challenges)
returns table (winner uuid, draw boolean)
language sql
immutable
set search_path = ''
as $$
  select case
           when c.challenger_score > c.opponent_score then c.challenger_id
           when c.challenger_score < c.opponent_score then c.opponent_id
           when c.challenger_time_ms < c.opponent_time_ms then c.challenger_id
           when c.challenger_time_ms > c.opponent_time_ms then c.opponent_id
           when c.challenger_hints < c.opponent_hints then c.challenger_id
           when c.challenger_hints > c.opponent_hints then c.opponent_id
         end,
         not (c.challenger_score <> c.opponent_score or c.challenger_time_ms <> c.opponent_time_ms
              or c.challenger_hints <> c.opponent_hints);
$$;

-- Rewards one finished challenge: 5 XP each for taking part, +10 for the winner, at most 5 rewarded
-- challenges per player per UTC day. The count is taken under a per-player lock, so two challenges
-- finishing at once cannot both slip under the cap.
create or replace function private.reward_challenge(c public.challenges)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u       uuid;
  rewarded boolean;
  flagged boolean;
begin
  flagged := exists (select 1 from public.integrity_events e where e.ref_id = c.id);
  if flagged then
    return;
  end if;
  -- Always lock in the same order, so two finishing challenges cannot deadlock.
  for u in select x from unnest(array[least(c.challenger_id, c.opponent_id), greatest(c.challenger_id, c.opponent_id)]) x loop
    perform pg_advisory_xact_lock(hashtextextended('challenge_xp:' || u, 0));
    rewarded := (select count(*) from public.xp_events e
                 where e.user_id = u and e.reason = 'challenge_play'
                   and e.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') < 5;
    if rewarded then
      perform private.award_xp(u, 5, 'challenge_play', 'challenge_play:' || c.id || ':' || u, jsonb_build_object('challenge_id', c.id));
      if c.winner_id = u then
        perform private.award_xp(u, 10, 'challenge_win', 'challenge_win:' || c.id, jsonb_build_object('challenge_id', c.id));
      end if;
    end if;
  end loop;
end;
$$;

-- Flags results that look arranged. They stay on record; flagged challenges earn no XP.
create or replace function private.check_challenge_integrity(c public.challenges)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  -- The same two players finishing a third challenge in a day.
  select count(*) into n from public.challenges x
  where x.status = 'completed' and x.completed_at > now() - interval '24 hours'
    and least(x.challenger_id, x.opponent_id) = least(c.challenger_id, c.opponent_id)
    and greatest(x.challenger_id, x.opponent_id) = greatest(c.challenger_id, c.opponent_id);
  if n >= 3 then
    insert into public.integrity_events (user_id, kind, ref_id, data)
    values (c.challenger_id, 'challenge_pair_repeat', c.id, jsonb_build_object('opponent_id', c.opponent_id, 'count_24h', n));
  end if;
  -- The same score in nearly the same time.
  if c.challenger_score = c.opponent_score and abs(c.challenger_time_ms - c.opponent_time_ms) <= 500 and c.challenger_score > 0 then
    insert into public.integrity_events (user_id, kind, ref_id, data)
    values (c.opponent_id, 'challenge_identical_result', c.id,
            jsonb_build_object('score', c.challenger_score, 'time_ms_a', c.challenger_time_ms, 'time_ms_b', c.opponent_time_ms));
  end if;
end;
$$;

-- Closes one player's run (idempotent) and moves the challenge on: the challenger's score is locked
-- and the challenge is sent; the opponent's finish completes it. The challenge row must be locked.
create or replace function private.finish_challenge_run(c public.challenges, uid uuid, violation text default null)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.challenge_runs;
  score   integer;
  hints   integer;
  ms      bigint;
  o       record;
begin
  select * into r from public.challenge_runs x where x.challenge_id = c.id and x.user_id = uid for update;
  if not found then
    return c;
  end if;
  if r.finished_at is null then
    update public.challenge_runs x
    set finished_at = least(now(), x.deadline_at),
        violation = case when now() >= x.deadline_at then 'time_up' else finish_challenge_run.violation end
    where x.challenge_id = c.id and x.user_id = uid
    returning * into r;
  end if;

  select count(*) filter (where a.is_correct), count(*) filter (where a.used_hint) into score, hints
  from public.challenge_answers a where a.challenge_id = c.id and a.user_id = uid;
  -- Wall-clock time from start to finish (so leaving questions unanswered does not help).
  ms := greatest(0, floor(extract(epoch from (r.finished_at - r.started_at)) * 1000))::bigint;

  if uid = c.challenger_id and c.challenger_locked_at is null then
    update public.challenges x
    set challenger_score = score, challenger_time_ms = ms, challenger_hints = hints, challenger_locked_at = now(),
        sent_at = coalesce(x.sent_at, now()), accept_by = coalesce(x.accept_by, now() + interval '48 hours')
    where x.id = c.id returning * into c;
  elsif uid = c.opponent_id and c.status = 'accepted' then
    update public.challenges x
    set opponent_score = score, opponent_time_ms = ms, opponent_hints = hints, status = 'completed', completed_at = now()
    where x.id = c.id returning * into c;
    select * into o from private.challenge_outcome(c);
    update public.challenges x set winner_id = o.winner, is_draw = o.draw where x.id = c.id returning * into c;
    perform private.check_challenge_integrity(c);
    perform private.reward_challenge(c);
    if c.winner_id is not null then
      insert into public.friend_events (user_id, kind, data, dedupe_key)
      values (c.winner_id, 'challenge_won', jsonb_build_object('score', case when c.winner_id = c.challenger_id then c.challenger_score else c.opponent_score end,
                                                               'total', cardinality(c.question_ids)),
              'challenge_won:' || c.id)
      on conflict do nothing;
    end if;
  end if;
  return c;
end;
$$;

-- Applies the clock to a challenge (call with the row locked): stale drafts are cancelled, unanswered
-- challenges expire, and a run that is out of time is closed with what was answered.
create or replace function private.settle_challenge(c public.challenges)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.challenge_runs;
begin
  if c.status = 'pending' and c.challenger_locked_at is null then
    -- A draft: the challenger's own run may be out of time; an abandoned draft is cancelled after a day.
    select * into r from public.challenge_runs x where x.challenge_id = c.id and x.user_id = c.challenger_id;
    if found and r.finished_at is null and now() >= r.deadline_at then
      c := private.finish_challenge_run(c, c.challenger_id, 'time_up');
    elsif c.created_at < now() - interval '24 hours' then
      update public.challenges x set status = 'cancelled' where x.id = c.id returning * into c;
    end if;
  end if;
  if c.status = 'pending' and c.sent_at is not null and now() >= c.accept_by then
    update public.challenges x set status = 'expired' where x.id = c.id returning * into c;
  elsif c.status = 'accepted' then
    select * into r from public.challenge_runs x where x.challenge_id = c.id and x.user_id = c.opponent_id;
    if found and r.finished_at is null and now() >= least(r.deadline_at, c.complete_by) then
      c := private.finish_challenge_run(c, c.opponent_id, 'time_up');
    end if;
  end if;
  return c;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a player sees of a challenge. The questions are never in here.
-- ---------------------------------------------------------------------------
create or replace function private.challenge_summary(c public.challenges, viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  role_ text := case when viewer = c.challenger_id then 'challenger' when viewer = c.opponent_id then 'opponent' else 'viewer' end;
  mine  public.challenge_runs;
  total integer := cardinality(c.question_ids);
  done  boolean := c.status = 'completed';
begin
  select * into mine from public.challenge_runs x where x.challenge_id = c.id and x.user_id = viewer;
  return jsonb_build_object(
    'id',             c.id,
    'status',         c.status,
    'draft',          c.challenger_locked_at is null and c.status = 'pending',
    'role',           role_,
    'set_kind',       c.set_kind,
    'question_count', total,
    'challenger',     private.user_card(viewer, c.challenger_id),
    'opponent',       case when c.opponent_id is not null then private.user_card(viewer, c.opponent_id) end,
    -- The target: the challenger's locked-in result (visible to the opponent and to people with the link).
    'target',         case when c.challenger_locked_at is not null
                        then jsonb_build_object('score', c.challenger_score, 'total', total, 'time_ms', c.challenger_time_ms) end,
    'created_at',     c.created_at,
    'sent_at',        c.sent_at,
    'accept_by',      c.accept_by,
    'accepted_at',    c.accepted_at,
    'complete_by',    c.complete_by,
    'completed_at',   c.completed_at,
    'rematch_of',     c.rematch_of,
    'share_token',    case when role_ = 'challenger' then c.share_token end,
    'my_run',         case when mine.challenge_id is not null then jsonb_build_object(
                        'started_at', mine.started_at, 'deadline_at', mine.deadline_at, 'finished_at', mine.finished_at,
                        'violation', mine.violation,
                        'answered', (select count(*) from public.challenge_answers a where a.challenge_id = c.id and a.user_id = viewer)) end,
    'result',         case when done then jsonb_build_object(
                        'winner', case when c.is_draw then 'draw' when c.winner_id = c.challenger_id then 'challenger' else 'opponent' end,
                        'challenger', jsonb_build_object('score', c.challenger_score, 'time_ms', c.challenger_time_ms, 'hints', c.challenger_hints),
                        'opponent',   jsonb_build_object('score', c.opponent_score, 'time_ms', c.opponent_time_ms, 'hints', c.opponent_hints)) end,
    'can_accept',     c.status = 'pending' and c.sent_at is not null and now() < c.accept_by and viewer <> c.challenger_id
                      and (c.opponent_id = viewer or c.opponent_id is null)
                      and not private.is_blocked_pair(viewer, c.challenger_id),
    'server_now',     now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating, accepting, declining
-- ---------------------------------------------------------------------------
-- set_kind 'daily': set_ref is a daily set you finished (score and time come from your own answers; sent at once).
-- 'practice_topic': set_ref is a topic; 10 random published questions are frozen, you play them, then it is sent.
-- 'custom_set': question_ids (5 to 20 published questions); you play them, then it is sent.
-- opponent_handle is optional: without one the challenge is shared by link.
create or replace function public.create_challenge(
  set_kind         text,
  set_ref          uuid default null,
  opponent_handle  text default null,
  question_ids     uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  opp   uuid;
  qids  uuid[];
  c     public.challenges;
  ds    public.daily_sets;
  n     integer;
  pair  integer;
  score integer;
  ms    bigint;
  hints integer;
begin
  if create_challenge.set_kind not in ('daily', 'practice_topic', 'custom_set') then
    raise exception 'unknown set kind' using errcode = 'invalid_parameter_value';
  end if;
  if create_challenge.opponent_handle is not null then
    opp := private.social_target(uid, create_challenge.opponent_handle);
    if opp = uid then
      raise exception 'you cannot challenge yourself' using errcode = 'invalid_parameter_value';
    end if;
    if not private.can_challenge(uid, opp) then
      raise exception 'You can challenge friends. Follow each other first, or share a link.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if create_challenge.set_kind = 'daily' then
    select * into ds from public.daily_sets s where s.id = create_challenge.set_ref and s.published_at is not null and s.published_at <= now();
    if not found then
      raise exception 'set not found' using errcode = 'no_data_found';
    end if;
    select array_agg(i.question_id order by i.position) into qids from public.daily_set_items i where i.daily_set_id = ds.id;
    select count(*) filter (where a.is_correct), coalesce(sum(a.time_ms), 0), count(*)
      into score, ms, n
    from public.attempts a where a.user_id = uid and a.context = 'daily' and a.daily_set_id = ds.id;
    if qids is null or n < cardinality(qids) then
      raise exception 'Finish that daily set first, then challenge a friend to beat it.' using errcode = 'object_not_in_prerequisite_state';
    end if;
    select count(*) into hints from public.hint_uses h where h.user_id = uid and h.daily_set_id = ds.id;
  elsif create_challenge.set_kind = 'practice_topic' then
    select array_agg(x.id) into qids from (
      select q.id from public.questions q
      join public.subtopics st on st.id = q.subtopic_id
      join public.question_answers a on a.question_id = q.id
      where st.topic_id = create_challenge.set_ref and q.status = 'published'
      order by random() limit 10) x;
    if qids is null or cardinality(qids) < 5 then
      raise exception 'There are not enough questions on that topic yet.' using errcode = 'no_data_found';
    end if;
  else
    qids := array(select distinct x from unnest(create_challenge.question_ids) x);
    if cardinality(qids) not between 5 and 20 or not private.playable_questions(qids) then
      raise exception 'Choose 5 to 20 published questions.' using errcode = 'invalid_parameter_value';
    end if;
    -- Keep the player's order and drop repeats.
    qids := array(select x from unnest(create_challenge.question_ids) with ordinality t(x, i) group by x order by min(i));
  end if;

  perform private.social_limit('challenge_c', 86400, greatest(private.plan_limit(uid, 'challenges_per_day', 20), 1));
  if opp is not null then
    -- The same two players: 3 challenges a day, either way round. One writer per pair, so it cannot be raced.
    perform pg_advisory_xact_lock(hashtextextended('challenge_pair:' || least(uid, opp) || greatest(uid, opp), 0));
    select count(*) into pair from public.challenges x
    where x.created_at > now() - interval '24 hours'
      and least(x.challenger_id, x.opponent_id) = least(uid, opp) and greatest(x.challenger_id, x.opponent_id) = greatest(uid, opp);
    if pair >= 3 then
      raise exception 'You and this player have reached 3 challenges today. Try again tomorrow.' using errcode = 'program_limit_exceeded';
    end if;
  end if;

  insert into public.challenges (challenger_id, opponent_id, set_kind, set_ref, question_ids, share_token)
  values (uid, opp, create_challenge.set_kind,
          case when create_challenge.set_kind = 'custom_set' then null else create_challenge.set_ref end, qids, private.random_token())
  returning * into c;

  if create_challenge.set_kind = 'daily' then
    -- Locked in from the player's own finished set; visible to the opponent from now.
    update public.challenges x
    set challenger_score = score, challenger_time_ms = ms, challenger_hints = hints, challenger_locked_at = now(),
        sent_at = now(), accept_by = now() + interval '48 hours'
    where x.id = c.id returning * into c;
  end if;
  return private.challenge_summary(c, uid);
end;
$$;

-- The challenger's turn on a practice-topic or custom set: starts the clock and returns the questions.
create or replace function public.start_challenge_run(target_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.challenges;
begin
  select * into c from public.challenges x where x.id = target_challenge_id and x.challenger_id = uid for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  if c.status <> 'pending' or c.challenger_locked_at is not null then
    raise exception 'You have already played this one.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  insert into public.challenge_runs (challenge_id, user_id, deadline_at)
  values (c.id, uid, now() + private.challenge_time_limit(c.question_ids))
  on conflict do nothing;
  return public.get_challenge_run(c.id);
end;
$$;

-- Accepting starts the opponent's clock and hands over the questions. One accept wins; the row is locked,
-- so a second accept (or an accept at the moment of expiry) is refused.
create or replace function public.accept_challenge(target_challenge_id uuid default null, token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.challenges;
begin
  if (target_challenge_id is null) = (token is null) then
    raise exception 'give a challenge id or a link token' using errcode = 'invalid_parameter_value';
  end if;
  if target_challenge_id is not null then
    select * into c from public.challenges x
    where x.id = target_challenge_id and (x.opponent_id = uid) for update;
  else
    select * into c from public.challenges x where x.share_token = lower(btrim(token)) for update;
  end if;
  if not found or c.challenger_id = uid or c.sent_at is null or private.is_blocked_pair(uid, c.challenger_id)
     or (c.opponent_id is not null and c.opponent_id <> uid) then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  perform private.social_limit('challenge_a', 86400, 60);
  c := private.settle_challenge(c);
  if c.status = 'accepted' and c.opponent_id = uid then
    return public.get_challenge_run(c.id);   -- opening it again (a second tab, a refresh)
  end if;
  if c.status <> 'pending' then
    raise exception 'This challenge is no longer open.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if exists (select 1 from public.challenges x where x.status = 'accepted' and x.opponent_id = uid
             and exists (select 1 from public.challenge_runs r where r.challenge_id = x.id and r.user_id = uid and r.finished_at is null)
             and x.id <> c.id) then
    raise exception 'Finish the challenge you are playing first.' using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.challenges x
  set opponent_id = uid, status = 'accepted', accepted_at = now(), complete_by = now() + interval '24 hours'
  where x.id = c.id returning * into c;
  insert into public.challenge_runs (challenge_id, user_id, deadline_at)
  values (c.id, uid, now() + private.challenge_time_limit(c.question_ids));
  return public.get_challenge_run(c.id);
end;
$$;

create or replace function public.decline_challenge(target_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.challenges;
begin
  select * into c from public.challenges x where x.id = target_challenge_id and x.opponent_id = uid and x.sent_at is not null for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  if c.status = 'pending' then
    update public.challenges x set status = 'declined' where x.id = c.id returning * into c;
  end if;
  return private.challenge_summary(c, uid);
end;
$$;

-- The challenger withdraws it, as long as nobody has started playing.
create or replace function public.cancel_challenge(target_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.challenges;
begin
  select * into c from public.challenges x where x.id = target_challenge_id and x.challenger_id = uid for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  if c.status <> 'pending' then
    raise exception 'It can no longer be cancelled.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.challenges x set status = 'cancelled' where x.id = c.id returning * into c;
  return private.challenge_summary(c, uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Playing
-- ---------------------------------------------------------------------------
-- The caller's run: the questions (never the key), their answers so far and the server's clock. Only the two
-- players, and only once their own run has started: an opponent who has not accepted gets nothing.
create or replace function public.get_challenge_run(target_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  c    public.challenges;
  r    public.challenge_runs;
begin
  select * into c from public.challenges x
  where x.id = target_challenge_id and (x.challenger_id = uid or x.opponent_id = uid) for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  select * into r from public.challenge_runs x where x.challenge_id = c.id and x.user_id = uid;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'challenge', private.challenge_summary(c, uid),
    'run', jsonb_build_object('started_at', r.started_at, 'deadline_at', r.deadline_at, 'finished_at', r.finished_at, 'violation', r.violation),
    'questions', (
      select jsonb_agg(private.question_card(t.q) || jsonb_build_object(
               'position', t.i - 1,
               'answer', case when a.question_id is not null then jsonb_build_object('selected_option_id', a.selected_option_id, 'is_correct', a.is_correct) end,
               'hint_used', h.question_id is not null,
               -- The key and explanation only once this player's own run is over.
               'correct_option_id', case when r.finished_at is not null then qa.correct_option_id end,
               'explanation',       case when r.finished_at is not null then qa.explanation end)
             order by t.i)
      from unnest(c.question_ids) with ordinality t(q, i)
      left join public.challenge_answers a on a.challenge_id = c.id and a.user_id = uid and a.question_id = t.q
      left join public.challenge_hints h on h.challenge_id = c.id and h.user_id = uid and h.question_id = t.q
      left join public.question_answers qa on qa.question_id = t.q),
    'server_now', now());
end;
$$;

-- Grades one answer. One scoring attempt per question; the time is the server's.
create or replace function public.submit_challenge_answer(target_challenge_id uuid, question_id uuid, option_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  c       public.challenges;
  r       public.challenge_runs;
  key_    uuid;
  right_  boolean;
  since   timestamptz;
  n       integer;
  hinted  boolean;
begin
  select * into c from public.challenges x
  where x.id = target_challenge_id and (x.challenger_id = uid or x.opponent_id = uid) for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  select * into r from public.challenge_runs x where x.challenge_id = c.id and x.user_id = uid for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  if r.finished_at is not null or now() >= r.deadline_at then
    raise exception 'attempt already submitted' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not (submit_challenge_answer.question_id = any (c.question_ids)) then
    raise exception 'question is not in this challenge' using errcode = 'insufficient_privilege';
  end if;
  if option_id is not null and not exists (select 1 from public.question_options o
                                           where o.id = submit_challenge_answer.option_id and o.question_id = submit_challenge_answer.question_id) then
    raise exception 'option does not belong to this question' using errcode = 'invalid_parameter_value';
  end if;
  select qa.correct_option_id into key_ from public.question_answers qa where qa.question_id = submit_challenge_answer.question_id;
  if key_ is null then
    raise exception 'question has no answer key' using errcode = 'no_data_found';
  end if;

  right_ := option_id is not null and option_id = key_;
  since := coalesce((select max(a.created_at) from public.challenge_answers a where a.challenge_id = c.id and a.user_id = uid), r.started_at);
  hinted := exists (select 1 from public.challenge_hints h where h.challenge_id = c.id and h.user_id = uid and h.question_id = submit_challenge_answer.question_id);

  insert into public.challenge_answers (challenge_id, user_id, question_id, selected_option_id, is_correct, used_hint, time_ms)
  values (c.id, uid, submit_challenge_answer.question_id, option_id, right_, hinted,
          least(greatest(floor(extract(epoch from (now() - since)) * 1000), 0), 86400000)::integer)
  on conflict do nothing;
  if not found then
    raise exception 'question already answered' using errcode = 'unique_violation';
  end if;

  select count(*) into n from public.challenge_answers a where a.challenge_id = c.id and a.user_id = uid;
  -- The last answer closes the run.
  if n >= cardinality(c.question_ids) then
    c := private.finish_challenge_run(c, uid);
  end if;
  return jsonb_build_object('is_correct', right_, 'answered', n, 'finished', n >= cardinality(c.question_ids),
                            'challenge', private.challenge_summary(c, uid));
end;
$$;

-- A hint costs nothing but counts in a tie. (No tutor exists in a run.)
create or replace function public.challenge_hint(target_challenge_id uuid, question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.challenges;
  r   public.challenge_runs;
  txt text;
begin
  select * into c from public.challenges x
  where x.id = target_challenge_id and (x.challenger_id = uid or x.opponent_id = uid) for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  select * into r from public.challenge_runs x where x.challenge_id = c.id and x.user_id = uid;
  if not found or r.finished_at is not null or now() >= r.deadline_at
     or not (challenge_hint.question_id = any (c.question_ids))
     or exists (select 1 from public.challenge_answers a where a.challenge_id = c.id and a.user_id = uid and a.question_id = challenge_hint.question_id) then
    raise exception 'no hint available' using errcode = 'object_not_in_prerequisite_state';
  end if;
  select qa.hint into txt from public.question_answers qa where qa.question_id = challenge_hint.question_id;
  if txt is null then
    raise exception 'no hint available' using errcode = 'no_data_found';
  end if;
  insert into public.challenge_hints (challenge_id, user_id, question_id) values (c.id, uid, challenge_hint.question_id) on conflict do nothing;
  return jsonb_build_object('hint', txt);
end;
$$;

-- Ends the caller's run (idempotent): "I am done", or the page was left (a violation). Answers given count.
create or replace function public.finish_challenge_run(target_challenge_id uuid, violation text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.challenges;
begin
  if finish_challenge_run.violation is not null
     and finish_challenge_run.violation not in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'page_left') then
    raise exception 'unknown violation' using errcode = 'invalid_parameter_value';
  end if;
  select * into c from public.challenges x
  where x.id = target_challenge_id and (x.challenger_id = uid or x.opponent_id = uid) for update;
  if not found or not exists (select 1 from public.challenge_runs r where r.challenge_id = c.id and r.user_id = uid) then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  c := private.finish_challenge_run(c, uid, finish_challenge_run.violation);
  return private.challenge_summary(c, uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- One challenge, by id (a player in it) or by share token (anyone signed in: the target only).
create or replace function public.get_challenge(target_challenge_id uuid default null, token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.challenges;
begin
  if (target_challenge_id is null) = (token is null) then
    raise exception 'give a challenge id or a link token' using errcode = 'invalid_parameter_value';
  end if;
  if target_challenge_id is not null then
    select * into c from public.challenges x where x.id = target_challenge_id and (x.challenger_id = uid or (x.opponent_id = uid and x.sent_at is not null)) for update;
  else
    select * into c from public.challenges x where x.share_token = lower(btrim(token)) and x.sent_at is not null for update;
  end if;
  if not found or private.is_blocked_pair(uid, c.challenger_id)
     or (uid not in (c.challenger_id, coalesce(c.opponent_id, c.challenger_id)) and c.opponent_id is not null) then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  c := private.settle_challenge(c);
  return private.challenge_summary(c, uid) || jsonb_build_object(
    -- After your own run is over you may review the questions with the key.
    'review', case when exists (select 1 from public.challenge_runs r where r.challenge_id = c.id and r.user_id = uid and r.finished_at is not null)
      then (select jsonb_agg(jsonb_build_object(
              'question', private.question_card(t.q), 'correct_option_id', qa.correct_option_id, 'explanation', qa.explanation,
              'mine', (select jsonb_build_object('selected_option_id', a.selected_option_id, 'is_correct', a.is_correct)
                       from public.challenge_answers a where a.challenge_id = c.id and a.user_id = uid and a.question_id = t.q))
              order by t.i)
            from unnest(c.question_ids) with ordinality t(q, i) join public.question_answers qa on qa.question_id = t.q) end);
end;
$$;

-- tab: 'incoming' (waiting for you, or in play), 'outgoing' (you sent, or are still playing) or 'completed'
-- (finished, declined, expired, cancelled). 20 per page, newest first.
create or replace function public.list_challenges(tab text default 'incoming', cursor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  cur_ts  timestamptz := private.cursor_ts(cursor);
  cur_key text := private.cursor_key(cursor);
  c       public.challenges;
begin
  if list_challenges.tab not in ('incoming', 'outgoing', 'completed') then
    raise exception 'unknown tab' using errcode = 'invalid_parameter_value';
  end if;
  -- Bring this player's open challenges up to date (expiry) before listing.
  for c in
    select x.* from public.challenges x
    where (x.challenger_id = uid or x.opponent_id = uid) and x.status in ('pending', 'accepted') for update
  loop
    perform private.settle_challenge(c);
  end loop;

  return (
    with page as (
      select x.*, row_number() over (order by x.created_at desc, x.id desc) as rn
      from (
        select y.* from public.challenges y
        where case list_challenges.tab
                when 'incoming' then y.opponent_id = uid and y.sent_at is not null and y.status in ('pending', 'accepted')
                when 'outgoing' then y.challenger_id = uid and y.status in ('pending', 'accepted')
                else (y.challenger_id = uid or (y.opponent_id = uid and y.sent_at is not null))
                     and y.status in ('completed', 'declined', 'expired', 'cancelled')
              end
          and not private.is_blocked_pair(uid, case when y.challenger_id = uid then coalesce(y.opponent_id, uid) else y.challenger_id end)
          and (cur_ts is null or (y.created_at, y.id) < (cur_ts, cur_key::uuid))
        order by y.created_at desc, y.id desc
        limit 21
      ) x
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg((select private.challenge_summary(cc, uid) from public.challenges cc where cc.id = g.id) order by g.rn)
                         from page g where g.rn <= 20), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 20 then (select g.created_at::text || '|' || g.id from page g where g.rn = 20) end,
      'server_now', now())
  );
end;
$$;

-- A new challenge to the other player of a finished one, on fresh questions from the same topics.
-- You play first, as always; it is sent to them when your score is locked in.
create or replace function public.request_rematch(target_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  c    public.challenges;
  opp  uuid;
  qids uuid[];
  nc   public.challenges;
  pair integer;
begin
  select * into c from public.challenges x
  where x.id = target_challenge_id and x.status = 'completed' and (x.challenger_id = uid or x.opponent_id = uid);
  if not found then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  opp := case when c.challenger_id = uid then c.opponent_id else c.challenger_id end;
  if private.is_blocked_pair(uid, opp) then
    raise exception 'challenge not found' using errcode = 'no_data_found';
  end if;
  perform private.social_limit('challenge_c', 86400, greatest(private.plan_limit(uid, 'challenges_per_day', 20), 1));
  perform pg_advisory_xact_lock(hashtextextended('challenge_pair:' || least(uid, opp) || greatest(uid, opp), 0));
  select count(*) into pair from public.challenges x
  where x.created_at > now() - interval '24 hours'
    and least(x.challenger_id, x.opponent_id) = least(uid, opp) and greatest(x.challenger_id, x.opponent_id) = greatest(uid, opp);
  if pair >= 3 then
    raise exception 'You and this player have reached 3 challenges today. Try again tomorrow.' using errcode = 'program_limit_exceeded';
  end if;

  select array_agg(x.id) into qids from (
    select q.id from public.questions q
    join public.question_answers a on a.question_id = q.id
    where q.status = 'published' and q.subtopic_id in (select q2.subtopic_id from public.questions q2 where q2.id = any (c.question_ids))
      and not (q.id = any (c.question_ids))
    order by random() limit cardinality(c.question_ids)) x;
  if qids is null or cardinality(qids) < 5 then
    qids := c.question_ids;   -- not enough new ones in those topics: the same set again
  end if;
  insert into public.challenges (challenger_id, opponent_id, set_kind, question_ids, share_token, rematch_of)
  values (uid, opp, 'custom_set', qids, private.random_token(), c.id)
  returning * into nc;
  return private.challenge_summary(nc, uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Clock: expire and settle in the background (the reads above do the same on demand)
-- ---------------------------------------------------------------------------
create or replace function private.settle_challenges()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.challenges;
  n integer := 0;
begin
  for c in
    select x.* from public.challenges x
    where x.status in ('pending', 'accepted')
      and (x.created_at < now() - interval '24 hours' and x.challenger_locked_at is null
           or x.accept_by <= now() or x.complete_by <= now()
           or exists (select 1 from public.challenge_runs r where r.challenge_id = x.id and r.finished_at is null and r.deadline_at <= now()))
    order by x.created_at limit 500 for update skip locked
  loop
    perform private.settle_challenge(c);
    n := n + 1;
  end loop;
  return jsonb_build_object('settled', n);
end;
$$;

select cron.schedule('aptric-challenges-settle', '*/10 * * * *', $$select private.settle_challenges()$$);

-- ---------------------------------------------------------------------------
-- Push: "challenges" is a new switch (on by default); the job SQL also keeps quiet hours (22:00-07:00 local).
-- ---------------------------------------------------------------------------
alter table private.push_preferences add column challenges boolean not null default true;

-- ---------------------------------------------------------------------------
-- RLS and privileges. The tables are read-only for players, and the question list is not a readable column.
-- ---------------------------------------------------------------------------
alter table public.challenges        enable row level security;
alter table public.challenge_runs    enable row level security;
alter table public.challenge_answers enable row level security;
alter table public.challenge_hints   enable row level security;
alter table public.integrity_events  enable row level security;

revoke all on public.challenges, public.challenge_runs, public.challenge_answers, public.challenge_hints, public.integrity_events
  from anon, authenticated;
revoke all on sequence public.integrity_events_id_seq from anon, authenticated;

-- Everything but question_ids and share_token.
grant select (id, challenger_id, opponent_id, set_kind, set_ref, challenger_score, challenger_time_ms, challenger_hints,
              challenger_locked_at, opponent_score, opponent_time_ms, opponent_hints, status, winner_id, is_draw, created_at,
              sent_at, accept_by, accepted_at, complete_by, completed_at, rematch_of)
  on public.challenges to authenticated;
grant select on public.challenge_runs, public.challenge_answers, public.challenge_hints, public.integrity_events to authenticated;

create policy "challenges: read as a player" on public.challenges
  for select to authenticated
  using (challenger_id = (select auth.uid()) or (opponent_id = (select auth.uid()) and sent_at is not null));
create policy "challenge_runs: read own" on public.challenge_runs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_answers: read own" on public.challenge_answers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_hints: read own" on public.challenge_hints
  for select to authenticated using (user_id = (select auth.uid()));
create policy "integrity_events: admin read" on public.integrity_events
  for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  private.can_challenge(uuid, uuid), private.challenge_time_limit(uuid[]), private.random_token(), private.playable_questions(uuid[]),
  private.challenge_outcome(public.challenges), private.reward_challenge(public.challenges),
  private.check_challenge_integrity(public.challenges), private.finish_challenge_run(public.challenges, uuid, text),
  private.settle_challenge(public.challenges), private.challenge_summary(public.challenges, uuid), private.settle_challenges()
  from public, anon, authenticated;

revoke execute on function
  public.create_challenge(text, uuid, text, uuid[]), public.start_challenge_run(uuid), public.accept_challenge(uuid, text),
  public.decline_challenge(uuid), public.cancel_challenge(uuid), public.get_challenge_run(uuid),
  public.submit_challenge_answer(uuid, uuid, uuid), public.challenge_hint(uuid, uuid), public.finish_challenge_run(uuid, text),
  public.get_challenge(uuid, text), public.list_challenges(text, text), public.request_rematch(uuid)
  from public, anon;
grant execute on function
  public.create_challenge(text, uuid, text, uuid[]), public.start_challenge_run(uuid), public.accept_challenge(uuid, text),
  public.decline_challenge(uuid), public.cancel_challenge(uuid), public.get_challenge_run(uuid),
  public.submit_challenge_answer(uuid, uuid, uuid), public.challenge_hint(uuid, uuid), public.finish_challenge_run(uuid, text),
  public.get_challenge(uuid, text), public.list_challenges(text, text), public.request_rematch(uuid)
  to authenticated, service_role;

-- Dark until plans.features.community_challenges is true (the 'pilot' plan has it).
update public.plans set features = features || '{"community_challenges": true}' where id = 'pilot';

notify pgrst, 'reload schema';
