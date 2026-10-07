-- Community, slice 4: user-hosted contests, built on the existing contest engine.
--
--   One engine. A hosted contest is a row in public.contests (with contest_items, contest_entries and
--   contest_answers) plus ownership and visibility. Joining, answering, finishing, ranking and the integrity
--   path (server clock, one scoring attempt per question, attempts that end when the page is left, no tutor)
--   are the SAME functions official contests use; this migration only adds guards in front of them.
--
--   * contests (extended)   host_id (null = Aptric), visibility public | unlisted | group, group_id, max_participants,
--                           status draft | scheduled | cancelled (live / ended come from the clock, never from a job),
--                           host_review_state none | pending | approved | rejected, host_plays, late_join_minutes,
--                           hidden_at, status_note, settled_at.
--   * contest_access        salted hash of an access code (unlisted contests only). No grants, no policies: unreadable.
--   * contest_reports       players reporting a hosted contest (3 distinct verified reporters hide it until a moderator looks).
--   * host_strikes          written by moderators; 2 in 30 days = no hosting until the older one ages out.
--   * contest_rewards       XP paid for a hosted contest (one row per player: settlement is idempotent).
--
-- Rules (all here, none in the API):
--   Who can host: a profile that is not banned, has no hosting suspension, and either is level 5+, has a verified
--   email, is 30+ days old and has no post strikes in 30 days, OR is an owner/admin of the league it hosts for.
--   Quota: plans.limits.hosted_contests_per_month (default 2) and hosted_max_participants (default 50).
--   Questions: only published, verified, servable Aptric questions (5 to 30), never ones the host wrote, never ones
--   already in another scheduled contest. Hosts cannot upload questions. The host never receives an answer key and
--   never reads another player's answers; after the end they see aggregates (participation, hardest question).
--   Start: at least 1 hour after creation and after publishing. Duration 10 minutes to 7 days.
--   Public contests wait for a moderator (host_review_state = pending) before they are listed; unlisted and group
--   contests start immediately and are reachable only by link / code / league membership.
--   XP: public and group contests with >= 5 finishers (not the host, 50% or more answered, no integrity violation),
--   10 XP + 15 / 10 / 5 for places 1 to 3, at most 3 rewarded contests per player per UTC day, and at most 2 per
--   player per host per week. No rating change (ratings belong to daily sets only).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.contests
  add column host_id            uuid references public.profiles (id) on delete set null,
  add column visibility         text not null default 'public' check (visibility in ('public', 'unlisted', 'group')),
  add column group_id           uuid references public.groups (id) on delete set null,
  add column max_participants   integer check (max_participants between 2 and 5000),
  add column status             text not null default 'scheduled' check (status in ('draft', 'scheduled', 'cancelled')),
  add column host_review_state  text not null default 'none' check (host_review_state in ('none', 'pending', 'approved', 'rejected')),
  add column host_plays         boolean not null default false,
  -- Entry stays open this long after the start (null: until the end, as official contests do).
  add column late_join_minutes  integer check (late_join_minutes between 0 and 10080),
  add column published_at       timestamptz,
  add column hidden_at          timestamptz,
  add column status_note        text check (char_length(status_note) <= 300),
  add column settled_at         timestamptz,
  add constraint contests_official_shape check (
    host_id is not null or (visibility = 'public' and group_id is null and max_participants is null and not host_plays)),
  add constraint contests_group_shape check (group_id is null or visibility = 'group');

create index contests_host_idx on public.contests (host_id, starts_at desc) where host_id is not null;
create index contests_group_idx on public.contests (group_id, starts_at desc) where group_id is not null;
create index contests_pending_idx on public.contests (created_at) where host_review_state = 'pending';

-- Official contests keep their meaning: status mirrors is_published. Backfill without 60 audit rows.
alter table public.contests disable trigger contests_audit;
update public.contests set status = case when is_published then 'scheduled' else 'draft' end;
alter table public.contests enable trigger contests_audit;

-- The engine's functions test is_published. For a hosted contest that flag is derived, never set by hand:
-- it is true only while the contest is scheduled, not hidden, and (if public) approved.
create or replace function private.contests_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.host_id is null then
    new.status := case when new.is_published then 'scheduled' else 'draft' end;
    new.host_review_state := 'none';
  else
    new.is_published := new.status = 'scheduled' and new.hidden_at is null
                        and (new.visibility <> 'public' or new.host_review_state = 'approved');
  end if;
  return new;
end;
$$;

create trigger contests_sync
  before insert or update on public.contests
  for each row execute function private.contests_sync();

-- ---------------------------------------------------------------------------
-- New tables (RLS on from the start; players have no write grants)
-- ---------------------------------------------------------------------------
create table public.contest_access (
  contest_id  uuid primary key references public.contests (id) on delete cascade,
  salt        text not null,
  code_hash   text not null
);

create table public.host_strikes (
  id          bigint generated always as identity primary key,
  host_id     uuid not null references public.profiles (id) on delete cascade,
  contest_id  uuid references public.contests (id) on delete set null,
  reason      text not null check (char_length(reason) between 1 and 300),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index host_strikes_host_idx on public.host_strikes (host_id, created_at desc);

create table public.contest_reports (
  id           bigint generated always as identity primary key,
  contest_id   uuid not null references public.contests (id) on delete cascade,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (reason in ('spam', 'offensive', 'cheating', 'wrong_info', 'other')),
  detail       text check (char_length(detail) <= 300),
  status       text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at   timestamptz not null default now(),
  unique (contest_id, reporter_id)
);
create index contest_reports_open_idx on public.contest_reports (contest_id) where status = 'open';

create table public.contest_rewards (
  contest_id  uuid not null references public.contests (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  rank        integer not null,
  xp          integer not null check (xp > 0),
  created_at  timestamptz not null default now(),
  primary key (contest_id, user_id)
);
create index contest_rewards_user_idx on public.contest_rewards (user_id, created_at desc);

alter table public.contest_access  enable row level security;
alter table public.host_strikes    enable row level security;
alter table public.contest_reports enable row level security;
alter table public.contest_rewards enable row level security;

revoke all on public.contest_access, public.host_strikes, public.contest_reports, public.contest_rewards from anon, authenticated;
grant select on public.host_strikes, public.contest_reports, public.contest_rewards to authenticated;

create policy "host_strikes: admin read" on public.host_strikes
  for select to authenticated using ((select private.is_admin()));
create policy "contest_reports: admin read" on public.contest_reports
  for select to authenticated using ((select private.is_admin()));
create policy "contest_rewards: read own or admin" on public.contest_rewards
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Hosted contests are read through the RPCs below, which apply visibility. Through the table a player still
-- sees official published contests; a host also sees their own rows (nothing secret is stored on them).
drop policy "contests: read published" on public.contests;
create policy "contests: read official, own or admin" on public.contests
  for select to authenticated
  using ((is_published and host_id is null) or host_id = (select auth.uid()) or (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Helpers (not reachable from the API)
-- ---------------------------------------------------------------------------

-- May this person open this contest at all? (Blocks look like "not found".)
create or replace function private.contest_access_ok(c public.contests, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.host_id is null then c.is_published or private.is_admin()
    else private.is_admin()
      or c.host_id = uid
      or (not private.is_blocked_pair(c.host_id, uid)
          and (exists (select 1 from public.contest_entries e where e.contest_id = c.id and e.user_id = uid)
               or (c.is_published and (c.visibility <> 'group' or private.is_group_member(uid, c.group_id)))))
  end;
$$;

create or replace function private.host_strikes_30d(uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.host_strikes s where s.host_id = uid and s.created_at > now() - interval '30 days';
$$;

-- Hosting gate. {ok, reasons[], ...} so the app can say what is missing.
create or replace function private.host_gate(uid uuid, gid uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p        public.profiles;
  min_lvl  integer := private.plan_limit(uid, 'host_min_level', 5);
  min_age  integer := private.plan_limit(uid, 'host_min_age_days', 30);
  reasons  text[] := '{}';
  via_group boolean := gid is not null and private.is_group_admin(uid, gid)
                       and exists (select 1 from public.groups g where g.id = gid and not g.is_archived);
  verified boolean := private.is_verified(uid);
  strikes  integer := private.author_strikes(uid);
  host_str integer := private.host_strikes_30d(uid);
begin
  select * into p from public.profiles x where x.id = uid;
  if not found or p.banned_at is not null then
    reasons := array_append(reasons, 'banned');
  end if;
  if host_str >= 2 then
    reasons := array_append(reasons, 'suspended');
  end if;
  if not via_group then
    if p.level < min_lvl then reasons := array_append(reasons, 'level'); end if;
    if not verified then reasons := array_append(reasons, 'email'); end if;
    if p.created_at > now() - make_interval(days => min_age) then reasons := array_append(reasons, 'age'); end if;
    if strikes > 0 then reasons := array_append(reasons, 'strikes'); end if;
  end if;
  return jsonb_build_object(
    'ok', cardinality(reasons) = 0, 'reasons', to_jsonb(reasons), 'via_group', via_group,
    'level', p.level, 'min_level', min_lvl, 'verified', verified,
    'age_days', extract(day from now() - p.created_at)::integer, 'min_age_days', min_age,
    'post_strikes', strikes, 'host_strikes', host_str);
end;
$$;

create or replace function private.host_quota(uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used',  (select count(*) from public.contests c
              where c.host_id = uid and c.status <> 'draft'
                and c.published_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'),
    'limit', private.plan_limit(uid, 'hosted_contests_per_month', 2),
    'max_participants', private.plan_limit(uid, 'hosted_max_participants', 50));
$$;

-- Questions served outside contests exclude those in a contest that has not ended. A hosted contest only counts while
-- it is scheduled (a draft or a cancelled one frees its questions, so nobody can lock the bank by drafting).
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
      and (c.host_id is null or c.status = 'scheduled')
  );
$$;

-- Posts about a question are blocked while it is in a contest that is running (a scheduled hosted contest that
-- is still waiting for approval counts too: its questions are fixed).
create or replace function private.question_in_live_contest(qid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contest_items i join public.contests c on c.id = i.contest_id
                 where i.question_id = qid and (c.is_published or (c.host_id is not null and c.status = 'scheduled'))
                   and now() >= c.starts_at and now() < c.ends_at);
$$;

-- The summary every contest function returns (exam_integrity's, plus ownership, visibility and access).
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
    'state',          case when c.status = 'cancelled' then 'cancelled' else private.contest_state(c) end,
    'question_count', (select count(*) from public.contest_items i where i.contest_id = c.id),
    'participants',   (select count(*) from public.contest_entries e where e.contest_id = c.id),
    'my_entry',       (select jsonb_build_object('score', r.score, 'correct', r.correct,
                                                 'answered', r.answered, 'time_ms', r.time_ms, 'rank', r.rank)
                       from private.contest_ranking(c.id) r where r.user_id = uid),
    'finished_at',    (select e.finished_at from public.contest_entries e where e.contest_id = c.id and e.user_id = uid),
    'violation',      (select e.violation from public.contest_entries e where e.contest_id = c.id and e.user_id = uid),
    'hosted',         c.host_id is not null,
    'is_host',        c.host_id is not null and c.host_id = uid,
    'host',           (select jsonb_build_object('handle', p.handle, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
                       from public.profiles p where p.id = c.host_id),
    'visibility',     c.visibility,
    'group',          (select jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug)
                       from public.groups g where g.id = c.group_id and private.is_group_member(uid, g.id)),
    'needs_code',     exists (select 1 from public.contest_access a where a.contest_id = c.id),
    'max_participants', c.max_participants,
    'host_plays',     c.host_plays,
    'late_join_until', case when c.late_join_minutes is not null then c.starts_at + make_interval(mins => c.late_join_minutes) end,
    'status_note',    case when c.host_id = uid or private.is_admin() then c.status_note end
  );
$$;

-- ---------------------------------------------------------------------------
-- Listing and joining
-- ---------------------------------------------------------------------------

-- Live, upcoming and the last 30 days' listed contests: official, and public hosted ones a moderator approved.
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
      and (c.host_id is null
           or (c.visibility = 'public' and c.host_review_state = 'approved' and not private.is_blocked_pair(c.host_id, uid)))
  ), '[]'::jsonb);
end;
$$;

-- Contests I host or entered (any visibility), last 30 days and what is coming.
create or replace function public.list_my_contests()
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
    select jsonb_agg(private.contest_summary(c, uid) order by c.starts_at desc)
    from public.contests c
    where c.id in (
      select k.id from public.contests k
      where k.host_id is not null and k.status <> 'draft' and k.ends_at > now() - interval '30 days'
        and (k.host_id = uid or exists (select 1 from public.contest_entries e where e.contest_id = k.id and e.user_id = uid))
      order by k.starts_at desc limit 50)
      and private.contest_access_ok(c, uid)
  ), '[]'::jsonb);
end;
$$;

-- A league's contests, for its members only.
create or replace function public.list_group_contests(target_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if not private.is_group_member(uid, target_group_id) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  return coalesce((
    select jsonb_agg(private.contest_summary(c, uid) order by c.starts_at desc)
    from public.contests c
    where c.group_id = target_group_id and c.visibility = 'group' and c.is_published and c.hidden_at is null
      and c.ends_at > now() - interval '30 days' and not private.is_blocked_pair(c.host_id, uid)
  ), '[]'::jsonb);
end;
$$;

-- Registers for an upcoming or live contest. Idempotent. A contest with an access code needs it the first time:
-- a wrong or missing code answers {entered: false, code: ...} (and counts toward a limit) instead of raising, so
-- guesses are counted and a wrong code looks the same every time.
drop function public.join_contest(uuid);
create or replace function public.join_contest(contest_id uuid, access_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  c       public.contests;
  a       public.contest_access;
  entered boolean;
begin
  select * into c from public.contests x where x.id = join_contest.contest_id;
  if not found or not private.contest_access_ok(c, uid) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if c.host_id is not null and c.max_participants is not null then
    -- Serialises joins of one contest, so the cap cannot be passed by parallel requests.
    select * into c from public.contests x where x.id = c.id for update;
  end if;
  entered := exists (select 1 from public.contest_entries e where e.contest_id = c.id and e.user_id = uid);
  if entered then
    return private.contest_summary(c, uid) || jsonb_build_object('entered', true);
  end if;

  if c.status = 'cancelled' then
    raise exception 'this contest was cancelled' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not c.is_published then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if private.contest_state(c) = 'ended' then
    raise exception 'contest has ended' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if c.host_id is not null then
    if c.host_id = uid and not c.host_plays then
      raise exception 'you host this contest; turn on "I play for fun" to enter it' using errcode = 'object_not_in_prerequisite_state';
    end if;
    if c.late_join_minutes is not null and now() > c.starts_at + make_interval(mins => c.late_join_minutes) then
      raise exception 'entry for this contest has closed' using errcode = 'object_not_in_prerequisite_state';
    end if;
    select * into a from public.contest_access x where x.contest_id = c.id;
    if found and c.host_id is distinct from uid then
      if access_code is null or btrim(access_code) = '' then
        return private.contest_summary(c, uid) || jsonb_build_object('entered', false, 'code', 'required');
      end if;
      perform private.social_limit('contest_code', 3600, 10);
      if a.code_hash <> encode(sha256(convert_to(a.salt || lower(btrim(access_code)), 'UTF8')), 'hex') then
        return private.contest_summary(c, uid) || jsonb_build_object('entered', false, 'code', 'wrong');
      end if;
    end if;
    if c.max_participants is not null
       and (select count(*) from public.contest_entries e where e.contest_id = c.id) >= c.max_participants then
      raise exception 'this contest is full' using errcode = 'object_not_in_prerequisite_state';
    end if;
  end if;

  insert into public.contest_entries (contest_id, user_id) values (c.id, uid)
  on conflict do nothing;
  return private.contest_summary(c, uid) || jsonb_build_object('entered', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Contest page, answers, finish, standings: the engine's functions with the access guard in front
-- ---------------------------------------------------------------------------

-- What the host may see while the contest runs: counts only. After the end: aggregates, never one player's answers.
create or replace function private.host_dashboard(c public.contests)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  qn      integer := (select count(*) from public.contest_items i where i.contest_id = c.id);
  ended   boolean := private.contest_state(c) = 'ended';
  out     jsonb;
begin
  out := jsonb_build_object(
    'registrations', (select count(*) from public.contest_entries e where e.contest_id = c.id and e.user_id <> c.host_id),
    'started',       (select count(*) from public.contest_entries e where e.contest_id = c.id and e.user_id <> c.host_id and e.answered > 0),
    'finished',      (select count(*) from public.contest_entries e
                      where e.contest_id = c.id and e.user_id <> c.host_id and (e.finished_at is not null or e.answered >= qn)),
    'active_now',    case when private.contest_state(c) = 'live' then
                       (select count(*) from public.contest_entries e
                        where e.contest_id = c.id and e.user_id <> c.host_id and e.finished_at is null
                          and e.last_answer_at > now() - interval '5 minutes') end,
    'capacity',      c.max_participants);
  if ended then
    out := out || jsonb_build_object(
      'average_time_ms', (select round(avg(e.time_ms))::bigint from public.contest_entries e
                          where e.contest_id = c.id and e.user_id <> c.host_id and e.answered > 0),
      'average_score',   (select round(avg(e.score), 1) from public.contest_entries e
                          where e.contest_id = c.id and e.user_id <> c.host_id and e.answered > 0),
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'position', i.position, 'question_id', q.id, 'stem', q.stem, 'difficulty', q.difficulty,
                 'answers', s.n, 'accuracy', case when s.n > 0 then round(100.0 * s.right_ / s.n) end)
               order by i.position)
        from public.contest_items i
        join public.questions q on q.id = i.question_id
        left join lateral (
          select count(*) n, count(*) filter (where a.is_correct) right_
          from public.contest_answers a
          where a.contest_id = c.id and a.question_id = i.question_id and a.user_id <> c.host_id
        ) s on true
        where i.contest_id = c.id), '[]'::jsonb));
    out := out || jsonb_build_object('hardest', (
      select x from jsonb_array_elements(out -> 'questions') x
      where (x ->> 'accuracy') is not null
      order by (x ->> 'accuracy')::numeric, (x ->> 'position')::integer limit 1));
  end if;
  return out;
end;
$$;

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
  select * into c from public.contests x where x.id = get_contest.contest_id;
  if not found or not private.contest_access_ok(c, uid) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  state  := private.contest_state(c);
  joined := exists (select 1 from public.contest_entries e where e.contest_id = c.id and e.user_id = uid);

  return private.contest_summary(c, uid) || jsonb_build_object(
    'joined',    joined,
    'dashboard', case when c.host_id is not null and (c.host_id = uid or private.is_admin()) then private.host_dashboard(c) end,
    'questions', case when c.status <> 'cancelled' and (state = 'ended' or (state = 'live' and joined and c.is_published)) then coalesce((
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

-- As exam_integrity.sql, plus: the contest must be reachable by the caller, and a hosted contest needs a real entry
-- (join_contest checks the code, the cap, the late-entry window and the host rule; answering must not skip them).
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
  if not found or not private.contest_access_ok(c, uid) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if private.contest_state(c) <> 'live' then
    raise exception 'contest is not live' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if c.host_id is not null and not exists (select 1 from public.contest_entries e where e.contest_id = c.id and e.user_id = uid) then
    raise exception 'contest not joined' using errcode = 'no_data_found';
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
  if not found or not private.contest_access_ok(c, uid) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;

  select * into entry from public.contest_entries e
  where e.contest_id = c.id and e.user_id = uid for update;
  if not found then
    raise exception 'contest not joined' using errcode = 'no_data_found';
  end if;

  if entry.finished_at is null and private.contest_state(c) = 'live' then
    update public.contest_entries e
    set finished_at = now(), violation = finish_contest.violation
    where e.contest_id = c.id and e.user_id = uid;
  end if;

  return private.contest_summary(c, uid);
end;
$$;

-- Standings: by score, then time, then whoever finished first. Friends and one-of-my-leagues filters. Final once the
-- contest has ended: nothing can be answered after ends_at, so the order cannot change (except a ban, which removes a player).
drop function public.get_contest_standings(uuid, integer, integer, boolean);
create or replace function public.get_contest_standings(
  contest_id   uuid,
  page_size    integer default 50,
  page_offset  integer default 0,
  friends_only boolean default false,
  group_id     uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid      uuid := private.require_uid();
  c        public.contests;
  n_limit  integer := least(greatest(coalesce(page_size, 50), 1), 100);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
  fo       boolean := coalesce(friends_only, false);
  gid      uuid := get_contest_standings.group_id;
  filtered boolean;
begin
  select * into c from public.contests x where x.id = get_contest_standings.contest_id;
  if not found or not private.contest_access_ok(c, uid) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if gid is not null and not private.is_group_member(uid, gid) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  filtered := fo or gid is not null;

  return (
    with hidden as (
      select b.blocked_id as id from public.blocks b where b.blocker_id = uid
      union select b.blocker_id from public.blocks b where b.blocked_id = uid
    ), f as (
      select case when filtered then (row_number() over (order by r.rank))::bigint else r.rank end as rank,
             r.user_id, r.score, r.correct, r.answered, r.time_ms
      from private.contest_ranking(get_contest_standings.contest_id) r
      where r.user_id not in (select h.id from hidden h)
        and (not fo or r.user_id = uid or r.user_id in (select x.followee_id from public.follows x where x.follower_id = uid))
        and (gid is null or private.is_group_member(r.user_id, gid))
    )
    select jsonb_build_object(
      'total',   (select count(*) from f),
      'final',   private.contest_state(c) = 'ended',
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'rank', r.rank, 'user_id', r.user_id, 'handle', p.handle, 'display_name', p.display_name,
                 'avatar_url', p.avatar_url, 'score', r.score, 'correct', r.correct, 'answered', r.answered,
                 'time_ms', r.time_ms, 'is_me', r.user_id = uid, 'is_host', c.host_id is not null and r.user_id = c.host_id,
                 'following', r.user_id in (select y.followee_id from public.follows y where y.follower_id = uid)) order by r.rank)
        from (select * from f order by rank limit n_limit offset n_offset) r
        join public.profiles p on p.id = r.user_id
      ), '[]'::jsonb),
      'me',      (select jsonb_build_object('rank', r.rank, 'score', r.score, 'correct', r.correct,
                                            'answered', r.answered, 'time_ms', r.time_ms)
                  from f r where r.user_id = uid)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hosting: status, question picker, draft, publish, cancel
-- ---------------------------------------------------------------------------

create or replace function public.get_host_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  return private.host_gate(uid) || jsonb_build_object(
    'quota', private.host_quota(uid),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug,
                                                              'gate', private.host_gate(uid, g.id) -> 'ok') order by g.name)
                        from public.groups g
                        where not g.is_archived and private.is_group_admin(uid, g.id)), '[]'::jsonb));
end;
$$;

-- Random questions a host could use: servable (published, keyed, active taxonomy, in no other contest that has not
-- ended), narrowed by section / topic / subtopic and difficulty, never ones the host wrote or used in the last 60 days.
-- `seen` tells only the host that they have answered a question before.
create or replace function public.host_pick_questions(
  section_id     uuid default null,
  topic_id       uuid default null,
  subtopic_id    uuid default null,
  difficulty     public.question_difficulty default null,
  question_count integer default 10,
  exclude_ids    uuid[] default '{}'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if not (private.host_gate(uid) ->> 'ok')::boolean
     and not exists (select 1 from public.groups g where not g.is_archived and private.is_group_admin(uid, g.id)
                     and (private.host_gate(uid, g.id) ->> 'ok')::boolean) then
    raise exception 'you cannot host contests yet' using errcode = 'insufficient_privilege';
  end if;
  if question_count is null or question_count < 1 or question_count > 30 then
    raise exception 'pick 1 to 30 questions' using errcode = 'invalid_parameter_value';
  end if;
  perform private.social_limit('host_pick', 3600, 120);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'stem', p.stem, 'difficulty', p.difficulty,
                                        'subtopic', p.subtopic, 'seen', p.seen))
    from (
      select q.id, q.stem, q.difficulty, st.name as subtopic,
             exists (select 1 from public.attempts a where a.user_id = uid and a.question_id = q.id) as seen
      from public.questions q
      join public.subtopics st on st.id = q.subtopic_id
      join public.topics t on t.id = st.topic_id
      where private.servable_question(q.id)
        and q.created_by is distinct from uid
        and not exists (select 1 from public.contest_items ci join public.contests k on k.id = ci.contest_id
                        where ci.question_id = q.id and k.host_id = uid and k.status <> 'draft'
                          and k.starts_at > now() - interval '60 days')
        and (host_pick_questions.difficulty is null or q.difficulty = host_pick_questions.difficulty)
        and (case
               when host_pick_questions.subtopic_id is not null then st.id = host_pick_questions.subtopic_id
               when host_pick_questions.topic_id is not null then t.id = host_pick_questions.topic_id
               when host_pick_questions.section_id is not null then t.section_id = host_pick_questions.section_id
               else true
             end)
        and not (q.id = any (coalesce(host_pick_questions.exclude_ids, '{}')))
      order by random()
      limit question_count
    ) p
  ), '[]'::jsonb);
end;
$$;

-- Everything the host needs to edit or watch one contest. No answer keys; no other player's answers.
create or replace function private.host_contest_row(c public.contests, uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.contest_summary(c, uid) || jsonb_build_object(
    'status',        c.status,
    'review_state',  c.host_review_state,
    'hidden',        c.hidden_at is not null,
    'late_join_minutes', c.late_join_minutes,
    'has_code',      exists (select 1 from public.contest_access a where a.contest_id = c.id),
    'created_at',    c.created_at,
    'published_at',  c.published_at,
    'settled',       c.settled_at is not null,
    'questions',     coalesce((
      select jsonb_agg(jsonb_build_object(
               'position', i.position, 'question_id', q.id, 'stem', q.stem, 'difficulty', q.difficulty,
               'seen', exists (select 1 from public.attempts a where a.user_id = uid and a.question_id = q.id)) order by i.position)
      from public.contest_items i join public.questions q on q.id = i.question_id
      where i.contest_id = c.id), '[]'::jsonb),
    'seen_count',    (select count(*) from public.contest_items i
                      where i.contest_id = c.id and exists (select 1 from public.attempts a where a.user_id = uid and a.question_id = i.question_id)),
    'dashboard',     private.host_dashboard(c));
$$;

create or replace function public.list_my_hosted_contests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  return jsonb_build_object(
    'status', private.host_gate(uid) || jsonb_build_object('quota', private.host_quota(uid)),
    'items', coalesce((
      select jsonb_agg(private.host_contest_row(c, uid) - 'questions' order by c.starts_at desc)
      from public.contests c
      where c.id in (select k.id from public.contests k where k.host_id = uid order by k.starts_at desc limit 60)), '[]'::jsonb));
end;
$$;

create or replace function public.host_get_contest(target_contest_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.contests;
begin
  select * into c from public.contests x where x.id = target_contest_id and x.host_id = uid;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  return private.host_contest_row(c, uid);
end;
$$;

-- Creates (target_contest_id null) or edits a DRAFT. The code is stored hashed; null leaves it as it was, clear_access_code removes it.
create or replace function public.host_save_contest(
  target_contest_id uuid,
  title             text,
  description       text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  question_ids      uuid[] default '{}',
  visibility        text default 'unlisted',
  group_id          uuid default null,
  access_code       text default null,
  clear_access_code boolean default false,
  max_participants  integer default null,
  late_join_minutes integer default 15,
  host_plays        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := private.require_uid();
  ids      uuid[] := coalesce(question_ids, '{}');
  n        integer := coalesce(array_length(ids, 1), 0);
  c        public.contests;
  quota    jsonb := private.host_quota(uid);
  cap      integer := (private.host_quota(uid) ->> 'max_participants')::integer;
  gate     jsonb;
  code     text := nullif(lower(btrim(coalesce(access_code, ''))), '');
  mins     integer;
  salt_    text;
  bad      uuid;
  base     text;
begin
  perform private.social_limit('host_save', 3600, 60);
  visibility := coalesce(visibility, 'unlisted');
  if visibility not in ('public', 'unlisted', 'group') then
    raise exception 'choose public, unlisted or group' using errcode = 'invalid_parameter_value';
  end if;
  if visibility = 'group' and group_id is null then
    raise exception 'choose the league this contest is for' using errcode = 'invalid_parameter_value';
  end if;
  if visibility <> 'group' and group_id is not null then
    raise exception 'only a league contest names a league' using errcode = 'invalid_parameter_value';
  end if;
  gate := private.host_gate(uid, group_id);
  if not (gate ->> 'ok')::boolean then
    raise exception 'you cannot host contests yet' using errcode = 'insufficient_privilege', detail = (gate -> 'reasons')::text;
  end if;
  if group_id is not null and not (private.is_group_admin(uid, group_id)
        and exists (select 1 from public.groups g where g.id = group_id and not g.is_archived)) then
    raise exception 'only an admin of the league can host for it' using errcode = 'insufficient_privilege';
  end if;

  title := private.clean_community_text(title, 120, uid);
  if nullif(btrim(coalesce(description, '')), '') is null then
    description := null;
  else
    description := private.clean_community_text(description, 1000, uid);
  end if;
  if starts_at is null or ends_at is null then
    raise exception 'set a start and an end time' using errcode = 'invalid_parameter_value';
  end if;
  if ends_at - starts_at < interval '10 minutes' or ends_at - starts_at > interval '7 days' then
    raise exception 'a contest runs for 10 minutes to 7 days' using errcode = 'invalid_parameter_value';
  end if;
  if starts_at < now() + interval '1 hour' then
    raise exception 'start at least an hour from now, so there is time to review and to remind players'
      using errcode = 'invalid_parameter_value';
  end if;
  if n > 30 then
    raise exception 'a contest holds at most 30 questions' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(distinct x) from unnest(ids) x) <> n then
    raise exception 'a question can only appear once' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from public.questions q where q.id = any (ids)) <> n then
    raise exception 'some questions do not exist' using errcode = 'invalid_parameter_value';
  end if;
  select x into bad from unnest(ids) x
  where not private.contest_question_ready(x) or not private.servable_question(x)
     or exists (select 1 from public.questions q where q.id = x and q.created_by = uid) limit 1;
  if bad is not null then
    raise exception 'question % cannot be used (it must be published with an answer key, free of other contests, and not your own)', bad
      using errcode = 'invalid_parameter_value';
  end if;
  max_participants := coalesce(max_participants, cap);
  if max_participants < 2 or max_participants > cap then
    raise exception 'a contest takes 2 to % players on your plan', cap using errcode = 'invalid_parameter_value';
  end if;
  mins := coalesce(late_join_minutes, 15);
  if mins < 0 or mins > least(1440, (extract(epoch from ends_at - starts_at) / 60)::integer) then
    raise exception 'late entry is 0 minutes to a day, and no longer than the contest' using errcode = 'invalid_parameter_value';
  end if;
  if code is not null and visibility <> 'unlisted' then
    raise exception 'only an unlisted contest can have an access code' using errcode = 'invalid_parameter_value';
  end if;
  if code is not null and code !~ '^[a-z0-9]{4,24}$' then
    raise exception 'the access code is 4 to 24 letters or digits' using errcode = 'invalid_parameter_value';
  end if;

  if target_contest_id is null then
    if (select count(*) from public.contests k where k.host_id = uid and k.status = 'draft') >= 5 then
      raise exception 'you already have 5 drafts; finish or delete one first' using errcode = 'object_not_in_prerequisite_state';
    end if;
    base := trim(both '-' from lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')));
    base := left(coalesce(nullif(base, ''), 'contest'), 30);
    insert into public.contests (slug, title, description, starts_at, ends_at, is_published, created_by, host_id, visibility,
                                 group_id, max_participants, status, host_plays, late_join_minutes)
    values (trim(both '-' from base) || '-' || substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 16),
            title, description, starts_at, ends_at, false, uid, uid, visibility, group_id, max_participants, 'draft',
            coalesce(host_plays, false), mins)
    returning * into c;
  else
    select * into c from public.contests x where x.id = target_contest_id and x.host_id = uid for update;
    if not found then
      raise exception 'contest not found' using errcode = 'no_data_found';
    end if;
    if c.status <> 'draft' then
      raise exception 'only a draft can be edited; cancel it and start a new one' using errcode = 'object_not_in_prerequisite_state';
    end if;
    update public.contests x set
      title = host_save_contest.title, description = host_save_contest.description,
      starts_at = host_save_contest.starts_at, ends_at = host_save_contest.ends_at,
      visibility = host_save_contest.visibility, group_id = host_save_contest.group_id,
      max_participants = host_save_contest.max_participants, host_plays = coalesce(host_save_contest.host_plays, false),
      late_join_minutes = mins
    where x.id = c.id returning * into c;
  end if;

  delete from public.contest_items i where i.contest_id = c.id;
  insert into public.contest_items (contest_id, question_id, position)
  select c.id, x.q, (x.ord - 1)::smallint from unnest(ids) with ordinality as x (q, ord);

  if visibility <> 'unlisted' or clear_access_code then
    delete from public.contest_access a where a.contest_id = c.id;
  end if;
  if code is not null then
    salt_ := substr(md5(random()::text || clock_timestamp()::text), 1, 16);
    insert into public.contest_access (contest_id, salt, code_hash)
    values (c.id, salt_, encode(sha256(convert_to(salt_ || code, 'UTF8')), 'hex'))
    on conflict (contest_id) do update set salt = excluded.salt, code_hash = excluded.code_hash;
  end if;

  return private.host_contest_row(c, uid);
end;
$$;

create or replace function public.host_delete_draft(target_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  delete from public.contests c where c.id = target_contest_id and c.host_id = uid and c.status = 'draft';
  if not found then
    raise exception 'draft not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

-- Draft -> scheduled. Re-checks everything, counts against the monthly quota under a per-host lock.
create or replace function public.host_publish_contest(target_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  c     public.contests;
  gate  jsonb;
  quota jsonb;
  n     integer;
  bad   uuid;
begin
  perform private.social_limit('host_publish', 86400, 10);
  select * into c from public.contests x where x.id = target_contest_id and x.host_id = uid for update;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if c.status <> 'draft' then
    raise exception 'this contest is already published' using errcode = 'object_not_in_prerequisite_state';
  end if;
  gate := private.host_gate(uid, c.group_id);
  if not (gate ->> 'ok')::boolean then
    raise exception 'you cannot host contests yet' using errcode = 'insufficient_privilege', detail = (gate -> 'reasons')::text;
  end if;
  if c.group_id is not null and not private.is_group_admin(uid, c.group_id) then
    raise exception 'only an admin of the league can host for it' using errcode = 'insufficient_privilege';
  end if;
  if c.starts_at < now() + interval '1 hour' then
    raise exception 'start at least an hour from now, so there is time to review and to remind players'
      using errcode = 'invalid_parameter_value';
  end if;
  select count(*) into n from public.contest_items i where i.contest_id = c.id;
  if n < 5 then
    raise exception 'add at least 5 questions before publishing' using errcode = 'invalid_parameter_value';
  end if;
  select i.question_id into bad from public.contest_items i
  where i.contest_id = c.id and (not private.contest_question_ready(i.question_id) or not private.servable_question(i.question_id)) limit 1;
  if bad is not null then
    raise exception 'question % is no longer available; swap it out', bad using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('host_quota:' || uid, 0));
  quota := private.host_quota(uid);
  if (quota ->> 'used')::integer >= (quota ->> 'limit')::integer then
    raise exception 'you have used your % hosted contests this month', quota ->> 'limit' using errcode = '54000';
  end if;

  update public.contests x set
    status = 'scheduled', published_at = now(),
    host_review_state = case when x.visibility = 'public' then 'pending' else 'none' end,
    status_note = null
  where x.id = c.id returning * into c;
  return private.host_contest_row(c, uid);
end;
$$;

-- Back to a draft, while nobody (but the host) has entered and it has not started. Gives the quota back.
create or replace function public.host_unpublish_contest(target_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.contests;
begin
  select * into c from public.contests x where x.id = target_contest_id and x.host_id = uid for update;
  if not found or c.status <> 'scheduled' then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if c.starts_at <= now() or exists (select 1 from public.contest_entries e where e.contest_id = c.id and e.user_id <> uid) then
    raise exception 'players have already entered or it has started; cancel it instead' using errcode = 'object_not_in_prerequisite_state';
  end if;
  delete from public.contest_entries e where e.contest_id = c.id;
  update public.contests x set status = 'draft', published_at = null, host_review_state = 'none', status_note = null
  where x.id = c.id returning * into c;
  return private.host_contest_row(c, uid);
end;
$$;

create or replace function public.host_cancel_contest(target_contest_id uuid, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.contests;
begin
  select * into c from public.contests x where x.id = target_contest_id and x.host_id = uid for update;
  if not found or c.status <> 'scheduled' then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if private.contest_state(c) = 'ended' then
    raise exception 'it has already ended' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.contests x set
    status = 'cancelled',
    status_note = case when nullif(btrim(coalesce(reason, '')), '') is null then 'Cancelled by the host.'
                       else private.clean_community_text(reason, 200, uid) end
  where x.id = c.id returning * into c;
  return private.host_contest_row(c, uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports and moderation
-- ---------------------------------------------------------------------------

-- Anyone who can open a hosted contest (and has a verified email) can report it, once. Three distinct reporters hide it
-- until a moderator has looked. The answer is the same whatever happened.
create or replace function public.report_contest(contest_id uuid, reason text, detail text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.contests;
  n   integer;
begin
  perform private.social_limit('contest_report', 3600, 10);
  if reason is null or reason not in ('spam', 'offensive', 'cheating', 'wrong_info', 'other') then
    raise exception 'choose a reason' using errcode = 'invalid_parameter_value';
  end if;
  select * into c from public.contests x where x.id = report_contest.contest_id;
  if not found or c.host_id is null or c.host_id = uid or not private.contest_access_ok(c, uid) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if not private.is_verified(uid) then
    raise exception 'verify your email to report' using errcode = 'insufficient_privilege';
  end if;
  insert into public.contest_reports (contest_id, reporter_id, reason, detail)
  values (c.id, uid, reason, case when nullif(btrim(coalesce(detail, '')), '') is null then null
                                  else left(btrim(detail), 300) end)
  on conflict on constraint contest_reports_contest_id_reporter_id_key do nothing;
  select count(*) into n from public.contest_reports r where r.contest_id = c.id and r.status = 'open';
  if n >= 3 and c.hidden_at is null and c.status = 'scheduled' and private.contest_state(c) <> 'ended' then
    update public.contests x set hidden_at = now(), status_note = 'Hidden while moderators review reports.' where x.id = c.id;
  end if;
  return jsonb_build_object('reported', true);
end;
$$;

-- Admin queue: public contests waiting for approval, reported ones, or everything hosted.
create or replace function public.admin_list_hosted_contests(
  filter      text default 'pending',
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
  n_limit  integer := least(greatest(coalesce(page_size, 50), 1), 100);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if filter not in ('pending', 'reported', 'upcoming', 'all') then
    raise exception 'unknown filter' using errcode = 'invalid_parameter_value';
  end if;
  return (
    with m as (
      select k.id, k.created_at from public.contests k
      where k.host_id is not null and k.status <> 'draft'
        and (case filter
               when 'pending' then k.host_review_state = 'pending' and k.status = 'scheduled'
               when 'reported' then exists (select 1 from public.contest_reports r where r.contest_id = k.id and r.status = 'open')
               when 'upcoming' then k.ends_at > now()
               else true end)
    )
    select jsonb_build_object(
      'total', (select count(*) from m),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'title', c.title, 'description', c.description, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
                 'state', case when c.status = 'cancelled' then 'cancelled' else private.contest_state(c) end,
                 'status', c.status, 'visibility', c.visibility, 'review_state', c.host_review_state,
                 'hidden', c.hidden_at is not null, 'status_note', c.status_note, 'created_at', c.created_at,
                 'participants', (select count(*) from public.contest_entries e where e.contest_id = c.id),
                 'host', jsonb_build_object('id', p.id, 'handle', p.handle, 'level', p.level,
                                            'host_strikes', private.host_strikes_30d(p.id), 'post_strikes', private.author_strikes(p.id)),
                 'questions', coalesce((select jsonb_agg(jsonb_build_object('position', i.position, 'stem', q.stem, 'difficulty', q.difficulty)
                                                         order by i.position)
                                        from public.contest_items i join public.questions q on q.id = i.question_id
                                        where i.contest_id = c.id), '[]'::jsonb),
                 'reports', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n))
                                      from (select x.reason, count(*) n from public.contest_reports x
                                            where x.contest_id = c.id and x.status = 'open' group by x.reason) r), '[]'::jsonb))
               order by c.created_at desc)
        from public.contests c
        join public.profiles p on p.id = c.host_id
        where c.id in (select m.id from m order by m.created_at desc limit n_limit offset n_offset)), '[]'::jsonb))
  );
end;
$$;

-- approve | reject | cancel | hide | unhide | dismiss_reports. Each is audited (the contests trigger records the row change
-- with the note; an explicit row names the action). `strike` adds a host strike with reject / cancel / hide.
create or replace function public.admin_review_hosted_contest(
  target_contest_id uuid,
  action            text,
  note              text default null,
  strike            boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c     public.contests;
  clean text := nullif(btrim(coalesce(note, '')), '');
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if action not in ('approve', 'reject', 'cancel', 'hide', 'unhide', 'dismiss_reports') then
    raise exception 'unknown action' using errcode = 'invalid_parameter_value';
  end if;
  if clean is not null and char_length(clean) > 300 then
    raise exception 'the note is at most 300 characters' using errcode = 'invalid_parameter_value';
  end if;
  select * into c from public.contests x where x.id = target_contest_id and x.host_id is not null for update;
  if not found then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;
  if action in ('reject', 'cancel', 'hide') and clean is null then
    raise exception 'write a note for the host' using errcode = 'invalid_parameter_value';
  end if;
  if strike and action not in ('reject', 'cancel', 'hide') then
    raise exception 'a strike goes with reject, cancel or hide' using errcode = 'invalid_parameter_value';
  end if;

  if action = 'approve' then
    if c.visibility <> 'public' or c.status <> 'scheduled' or c.host_review_state not in ('pending', 'rejected') or private.contest_state(c) = 'ended' then
      raise exception 'this contest is not waiting for approval' using errcode = 'object_not_in_prerequisite_state';
    end if;
    update public.contests x set host_review_state = 'approved', status_note = null where x.id = c.id;
  elsif action = 'reject' then
    if c.host_review_state <> 'pending' then
      raise exception 'this contest is not waiting for approval' using errcode = 'object_not_in_prerequisite_state';
    end if;
    update public.contests x set host_review_state = 'rejected', status_note = clean where x.id = c.id;
  elsif action = 'cancel' then
    update public.contests x set status = 'cancelled', status_note = clean where x.id = c.id;
  elsif action = 'hide' then
    update public.contests x set hidden_at = coalesce(x.hidden_at, now()), status_note = clean where x.id = c.id;
  elsif action = 'unhide' then
    update public.contests x set hidden_at = null, status_note = null where x.id = c.id;
  end if;

  if action in ('reject', 'cancel', 'hide') then
    update public.contest_reports r set status = 'actioned' where r.contest_id = c.id and r.status = 'open';
  elsif action in ('unhide', 'dismiss_reports') then
    update public.contest_reports r set status = 'dismissed' where r.contest_id = c.id and r.status = 'open';
  end if;
  if strike then
    insert into public.host_strikes (host_id, contest_id, reason, created_by) values (c.host_id, c.id, clean, auth.uid());
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'hosted_contest_' || action, 'contest', c.id::text,
          jsonb_build_object('note', clean, 'strike', coalesce(strike, false), 'host_id', c.host_id));

  select * into c from public.contests x where x.id = c.id;
  return jsonb_build_object('id', c.id, 'status', c.status, 'review_state', c.host_review_state, 'hidden', c.hidden_at is not null);
end;
$$;

-- The existing contest editor lists official contests only; hosted ones are moderated from the queue above.
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
    where c.host_id is null
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- XP after the end (idempotent, batch-safe; run by pg_cron)
-- ---------------------------------------------------------------------------
create or replace function private.settle_hosted_contest(c public.contests)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  qn       integer := (select count(*) from public.contest_items i where i.contest_id = c.id);
  n        integer;
  r        record;
  bonus    integer;
  paid     integer := 0;
  today    integer;
  pair     integer;
begin
  if c.settled_at is not null or c.ends_at > now() then
    return 0;
  end if;
  -- Only public and group contests that ran their course earn XP; unlisted ones, hidden or cancelled ones do not.
  if c.status <> 'scheduled' or c.hidden_at is not null or c.visibility = 'unlisted' or not c.is_published then
    update public.contests x set settled_at = now() where x.id = c.id;
    return 0;
  end if;

  select count(*) into n
  from public.contest_entries e
  join public.profiles p on p.id = e.user_id and p.banned_at is null
  where e.contest_id = c.id and e.user_id is distinct from c.host_id
    and e.violation is null and qn > 0 and e.answered * 2 >= qn;

  if n >= 5 then
    for r in
      select z.user_id, z.rk::integer as rk from (
        select e.user_id, row_number() over (order by e.score desc, e.time_ms, e.last_answer_at nulls last, e.joined_at, e.user_id) as rk
        from public.contest_entries e
        join public.profiles p on p.id = e.user_id and p.banned_at is null
        where e.contest_id = c.id and e.user_id is distinct from c.host_id
          and e.violation is null and qn > 0 and e.answered * 2 >= qn) z
      order by z.rk
    loop
      perform pg_advisory_xact_lock(hashtextextended('hosted_xp:' || r.user_id, 0));
      select count(*) into today from public.xp_events e
        where e.user_id = r.user_id and e.reason = 'hosted_contest'
          and e.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
      select count(*) into pair from public.contest_rewards w join public.contests k on k.id = w.contest_id
        where w.user_id = r.user_id and k.host_id = c.host_id and w.created_at > now() - interval '7 days';
      if today < 3 and pair < 2 then
        bonus := case r.rk when 1 then 15 when 2 then 10 when 3 then 5 else 0 end;
        insert into public.contest_rewards (contest_id, user_id, rank, xp) values (c.id, r.user_id, r.rk, 10 + bonus)
        on conflict do nothing;
        if found then
          perform private.award_xp(r.user_id, 10 + bonus, 'hosted_contest', 'hosted_contest:' || c.id || ':' || r.user_id,
                                   jsonb_build_object('contest_id', c.id, 'rank', r.rk));
          paid := paid + 1;
        end if;
      end if;
    end loop;
  end if;
  update public.contests x set settled_at = now() where x.id = c.id;
  return paid;
end;
$$;

create or replace function private.settle_hosted_contests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contests;
  n integer := 0;
begin
  for c in
    select * from public.contests x
    where x.host_id is not null and x.settled_at is null and x.ends_at <= now()
    order by x.ends_at limit 100 for update skip locked
  loop
    perform private.settle_hosted_contest(c);
    n := n + 1;
  end loop;
  return jsonb_build_object('settled', n);
end;
$$;

select cron.schedule('aptric-hosted-contests-settle', '*/5 * * * *', $$select private.settle_hosted_contests()$$);

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  private.contests_sync(), private.contest_access_ok(public.contests, uuid), private.host_strikes_30d(uuid),
  private.host_gate(uuid, uuid), private.host_quota(uuid), private.host_dashboard(public.contests),
  private.host_contest_row(public.contests, uuid), private.settle_hosted_contest(public.contests), private.settle_hosted_contests()
  from public, anon, authenticated;

revoke execute on function
  public.list_my_contests(), public.list_group_contests(uuid), public.join_contest(uuid, text),
  public.get_contest_standings(uuid, integer, integer, boolean, uuid), public.get_host_status(),
  public.host_pick_questions(uuid, uuid, uuid, public.question_difficulty, integer, uuid[]),
  public.list_my_hosted_contests(), public.host_get_contest(uuid),
  public.host_save_contest(uuid, text, text, timestamptz, timestamptz, uuid[], text, uuid, text, boolean, integer, integer, boolean),
  public.host_delete_draft(uuid), public.host_publish_contest(uuid), public.host_unpublish_contest(uuid),
  public.host_cancel_contest(uuid, text), public.report_contest(uuid, text, text),
  public.admin_list_hosted_contests(text, integer, integer), public.admin_review_hosted_contest(uuid, text, text, boolean)
  from public, anon;
grant execute on function
  public.list_my_contests(), public.list_group_contests(uuid), public.join_contest(uuid, text),
  public.get_contest_standings(uuid, integer, integer, boolean, uuid), public.get_host_status(),
  public.host_pick_questions(uuid, uuid, uuid, public.question_difficulty, integer, uuid[]),
  public.list_my_hosted_contests(), public.host_get_contest(uuid),
  public.host_save_contest(uuid, text, text, timestamptz, timestamptz, uuid[], text, uuid, text, boolean, integer, integer, boolean),
  public.host_delete_draft(uuid), public.host_publish_contest(uuid), public.host_unpublish_contest(uuid),
  public.host_cancel_contest(uuid, text), public.report_contest(uuid, text, text),
  public.admin_list_hosted_contests(text, integer, integer), public.admin_review_hosted_contest(uuid, text, text, boolean)
  to authenticated, service_role;

-- The replaced functions keep their existing grants (create or replace), but say so for the two with new signatures.
-- Dark until plans.features.community_contests is true (the 'pilot' plan has it). Limits are per plan and editable.
update public.plans set features = features || '{"community_contests": true}',
                        limits = limits || '{"hosted_contests_per_month": 10, "hosted_max_participants": 300}' where id = 'pilot';
update public.plans set limits = limits || '{"hosted_contests_per_month": 10, "hosted_max_participants": 200}' where id = 'plus';
update public.plans set limits = limits || '{"hosted_contests_per_month": 30, "hosted_max_participants": 1000}' where id = 'pro';

notify pgrst, 'reload schema';
