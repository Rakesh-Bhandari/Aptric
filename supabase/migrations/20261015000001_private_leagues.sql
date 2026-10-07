-- Community, slice 3b: private leagues for a college, a batch, a coaching class or a group of friends.
--
-- Not the weekly Bronze -> Diamond ladder: a separate, invite-only group that sits on top of the XP players
-- already earn. Nothing here can change a score; the leaderboard is computed in SQL from XP the game awarded.
--
--   * groups, group_members      the league and who is in it (owner / admin / member; active / pending / removed)
--   * group_announcements        official notices (pinned, 280 characters, not subject to the 48-hour rule)
--   * private.user_xp_daily      XP and correct answers per player per day (IST days, like the weekly leagues),
--                                kept up to date by triggers on xp_events and attempts, so a league read sums at
--                                most (members x days in the window) small rows and never scans attempts
--
-- A league is invisible to non-members (no public listing): you find one only with its invite code or link.
-- Join modes: invite_code (in at once), approval (an admin approves) or email_domain (a verified email on the
-- league's domain, so "IIT-X 2026 batch" really is that batch; such leagues carry a verified badge).
-- Limits: 10 leagues per player, 300 members per league, 5 leagues owned. Owners and admins see handles, ranks and
-- XP: never answers (no function exposes them, and the attempts policy is unchanged). Removing a member takes them
-- off the board at once.

-- ---------------------------------------------------------------------------
-- XP aggregate
-- ---------------------------------------------------------------------------
create table private.user_xp_daily (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  -- The IST calendar day, the same boundary the weekly leagues use.
  day      date not null,
  xp       integer not null default 0,
  correct  integer not null default 0 check (correct >= 0),
  -- When the day's last XP arrived: reaching a total earlier breaks ties.
  last_at  timestamptz,
  primary key (user_id, day)
);

alter table private.user_xp_daily enable row level security;
revoke all on private.user_xp_daily from public, anon, authenticated;

insert into private.user_xp_daily (user_id, day, xp, last_at)
select e.user_id, (e.created_at at time zone 'Asia/Kolkata')::date, sum(e.amount), max(e.created_at)
from public.xp_events e group by 1, 2
on conflict do nothing;

insert into private.user_xp_daily as d (user_id, day, correct)
select a.user_id, (a.created_at at time zone 'Asia/Kolkata')::date, count(*)
from public.attempts a where a.is_correct group by 1, 2
on conflict (user_id, day) do update set correct = excluded.correct;

-- Never allowed to break answering a question.
create or replace function private.xp_daily_from_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into private.user_xp_daily as d (user_id, day, xp, last_at)
    values (new.user_id, (new.created_at at time zone 'Asia/Kolkata')::date, new.amount, new.created_at)
    on conflict (user_id, day) do update set xp = d.xp + excluded.xp, last_at = greatest(d.last_at, excluded.last_at);
  exception when others then
    null;
  end;
  return null;
end;
$$;

create trigger xp_daily_from_xp
  after insert on public.xp_events
  for each row execute function private.xp_daily_from_xp();

create or replace function private.xp_daily_from_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into private.user_xp_daily as d (user_id, day, correct)
    values (new.user_id, (new.created_at at time zone 'Asia/Kolkata')::date, 1)
    on conflict (user_id, day) do update set correct = d.correct + 1;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create trigger xp_daily_from_attempt
  after insert on public.attempts
  for each row when (new.is_correct)
  execute function private.xp_daily_from_attempt();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.groups (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 3 and 60),
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  kind                  text not null check (kind in ('college', 'batch', 'friends', 'coaching')),
  owner_id              uuid not null references public.profiles (id) on delete cascade,
  join_mode             text not null default 'invite_code' check (join_mode in ('invite_code', 'approval', 'email_domain')),
  -- Rotatable. Never readable through the table: only admins get it, from get_group_invite().
  invite_code           text not null unique check (invite_code ~ '^[a-z0-9]{10}$'),
  allowed_email_domain  text check (allowed_email_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  max_members           integer not null default 300 check (max_members between 2 and 300),
  is_archived           boolean not null default false,
  season_start          date,
  season_end            date,
  -- Default board is the current week (resets Monday); off keeps it to the season.
  weekly_reset          boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (join_mode <> 'email_domain' or allowed_email_domain is not null),
  check ((season_start is null) = (season_end is null) and (season_start is null or season_end >= season_start))
);

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function private.set_updated_at();

create table public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status     text not null default 'active' check (status in ('active', 'pending', 'removed')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx   on public.group_members (user_id, status);
create index group_members_active_idx on public.group_members (group_id) where status = 'active';
-- One owner per league.
create unique index group_members_one_owner_idx on public.group_members (group_id) where role = 'owner';

create table public.group_announcements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 280),
  created_by  uuid references public.profiles (id) on delete set null,
  is_pinned   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index group_announcements_group_idx on public.group_announcements (group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers (not reachable from the API)
-- ---------------------------------------------------------------------------
create or replace function private.is_group_member(uid uuid, gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid and m.status = 'active');
$$;

create or replace function private.is_group_admin(uid uuid, gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members m
                 where m.group_id = gid and m.user_id = uid and m.status = 'active' and m.role in ('owner', 'admin'));
$$;

-- Do two players belong to the same live league? (They may then challenge each other.)
create or replace function private.share_group(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members x
    join public.group_members y on y.group_id = x.group_id and y.status = 'active' and y.user_id = b
    join public.groups g on g.id = x.group_id and not g.is_archived
    where x.user_id = a and x.status = 'active');
$$;

-- Friends, and now people in the same private league.
create or replace function private.can_challenge(uid uuid, other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid <> other and not private.is_blocked_pair(uid, other)
         and (private.is_friend(uid, other) or private.share_group(uid, other));
$$;

-- A league as the caller may see it (never the invite code).
create or replace function private.group_summary(g public.groups, viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',            g.id,
    'name',          g.name,
    'slug',          g.slug,
    'kind',          g.kind,
    'join_mode',     g.join_mode,
    -- Verified: joining needs a verified email on this domain.
    'verified',      g.join_mode = 'email_domain',
    'domain',        g.allowed_email_domain,
    'max_members',   g.max_members,
    'member_count',  (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active'),
    'is_archived',   g.is_archived,
    'season_start',  g.season_start,
    'season_end',    g.season_end,
    'weekly_reset',  g.weekly_reset,
    'created_at',    g.created_at,
    'my_role',       (select m.role from public.group_members m where m.group_id = g.id and m.user_id = viewer and m.status = 'active'),
    'my_status',     (select m.status from public.group_members m where m.group_id = g.id and m.user_id = viewer),
    'announcement',  (select jsonb_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at)
                      from public.group_announcements a
                      where a.group_id = g.id and a.is_pinned and private.is_group_member(viewer, g.id)
                      order by a.created_at desc limit 1));
$$;

-- Raises "league not found" unless the caller is an owner or admin of an existing league. Returns it, locked.
create or replace function private.admin_group(uid uuid, gid uuid)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  select * into g from public.groups x where x.id = gid for update;
  if not found or not private.is_group_admin(uid, gid) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  return g;
end;
$$;

create or replace function private.group_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::integer, 1), '') from generate_series(1, 10);
$$;

-- The days a window covers (IST dates) and the equally long window before it, for "versus last week".
create or replace function private.group_window(g public.groups, win text, from_date date, to_date date)
returns table (d_from date, d_to date, p_from date, p_to date)
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if win = 'weekly' then
    d_from := private.league_week_start(now()); d_to := d_from + 6; p_from := d_from - 7; p_to := d_to - 7;
  elsif win = 'monthly' then
    d_from := date_trunc('month', today)::date; d_to := (d_from + interval '1 month')::date - 1;
    p_from := (d_from - interval '1 month')::date; p_to := d_from - 1;
  elsif win = 'season' then
    if g.season_start is null then
      raise exception 'This league has no season set.' using errcode = 'invalid_parameter_value';
    end if;
    d_from := g.season_start; d_to := g.season_end;
  elsif win = 'custom' then
    if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 92 then
      raise exception 'Choose a date range of up to 93 days.' using errcode = 'invalid_parameter_value';
    end if;
    d_from := from_date; d_to := to_date; p_from := from_date - (to_date - from_date + 1); p_to := from_date - 1;
  elsif win = 'all_time' then
    d_from := null; d_to := null;
  else
    raise exception 'unknown window' using errcode = 'invalid_parameter_value';
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating, joining, leaving
-- ---------------------------------------------------------------------------
create or replace function public.create_group(
  name                  text,
  kind                  text,
  join_mode             text default 'invite_code',
  allowed_email_domain  text default null,
  max_members           integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := private.require_uid();
  nm     text := btrim(coalesce(create_group.name, ''));
  dom    text := lower(nullif(btrim(coalesce(create_group.allowed_email_domain, '')), ''));
  slug_  text;
  g      public.groups;
begin
  if char_length(nm) not between 3 and 60 or nm ~ '[<>]' then
    raise exception 'Give the league a name of 3 to 60 characters.' using errcode = 'invalid_parameter_value';
  end if;
  if create_group.kind not in ('college', 'batch', 'friends', 'coaching') or create_group.join_mode not in ('invite_code', 'approval', 'email_domain') then
    raise exception 'unknown kind or join mode' using errcode = 'invalid_parameter_value';
  end if;
  if not private.is_verified(uid) then
    raise exception 'Verify your email to start a league.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if create_group.join_mode = 'email_domain' then
    -- The organiser must hold a verified address on that domain, or anyone could claim "iitx.ac.in".
    if dom is null or not exists (select 1 from private.accounts a
                                  where a.id = uid and a.email_verified_at is not null and split_part(a.email, '@', 2) = dom) then
      raise exception 'To limit a league to a domain, use a verified email on that domain.' using errcode = 'insufficient_privilege';
    end if;
  else
    dom := null;
  end if;
  perform private.social_limit('group_create', 86400, 3);
  perform pg_advisory_xact_lock(hashtextextended('groups:' || uid, 0));
  if (select count(*) from public.groups x where x.owner_id = uid and not x.is_archived) >= 5 then
    raise exception 'You can run up to 5 leagues.' using errcode = 'program_limit_exceeded';
  end if;
  if (select count(*) from public.group_members m join public.groups x on x.id = m.group_id
      where m.user_id = uid and m.status in ('active', 'pending') and not x.is_archived) >= 10 then
    raise exception 'You can be in up to 10 leagues.' using errcode = 'program_limit_exceeded';
  end if;

  loop
    slug_ := left(trim(both '-' from regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g')), 40);
    if slug_ = '' then slug_ := 'league'; end if;
    slug_ := slug_ || '-' || substr(md5(random()::text), 1, 5);
    exit when not exists (select 1 from public.groups x where x.slug = slug_);
  end loop;

  insert into public.groups (name, slug, kind, owner_id, join_mode, invite_code, allowed_email_domain, max_members)
  values (nm, slug_, create_group.kind, uid, create_group.join_mode, private.group_token(), dom,
          least(greatest(coalesce(create_group.max_members, 300), 2), 300))
  returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  return private.group_summary(g, uid);
end;
$$;

-- Join with the code from a link. Every wrong guess looks the same: {"status": "not_found"} (a normal answer, not an
-- error, so the attempt is still counted when the transaction ends: an error would roll the counter back).
create or replace function public.join_group(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  c    text := lower(btrim(coalesce(code, '')));
  g    public.groups;
  m    public.group_members;
  n    integer;
  mail text;
  nf   constant jsonb := jsonb_build_object('status', 'not_found');
begin
  -- 10 tries an hour, hits and misses alike: a code cannot be guessed.
  perform private.social_limit('group_join', 3600, 10);
  if c !~ '^[a-z0-9]{10}$' then
    return nf;
  end if;
  select * into g from public.groups x where x.invite_code = c and not x.is_archived for update;
  if not found or private.is_blocked_pair(uid, g.owner_id) then
    return nf;
  end if;

  select * into m from public.group_members x where x.group_id = g.id and x.user_id = uid;
  if found then
    if m.status = 'removed' then
      return nf;
    end if;
    return jsonb_build_object('status', m.status, 'group', private.group_summary(g, uid));   -- already in (or already asked)
  end if;

  perform pg_advisory_xact_lock(hashtextextended('groups:' || uid, 0));
  if (select count(*) from public.group_members x join public.groups y on y.id = x.group_id
      where x.user_id = uid and x.status in ('active', 'pending') and not y.is_archived) >= 10 then
    raise exception 'You can be in up to 10 leagues.' using errcode = 'program_limit_exceeded';
  end if;
  select count(*) into n from public.group_members x where x.group_id = g.id and x.status = 'active';
  if n >= g.max_members then
    raise exception 'This league is full.' using errcode = 'program_limit_exceeded';
  end if;

  if g.join_mode = 'email_domain' then
    select a.email into mail from private.accounts a where a.id = uid and a.email_verified_at is not null;
    if mail is null or split_part(mail, '@', 2) <> g.allowed_email_domain then
      raise exception 'This league is for verified @% emails.', g.allowed_email_domain using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (g.id, uid, 'member', case when g.join_mode = 'approval' then 'pending' else 'active' end)
  returning * into m;
  return jsonb_build_object('status', m.status, 'group', private.group_summary(g, uid));
end;
$$;

-- Leaves a league (the owner cannot: archive it instead). A pending request is withdrawn.
create or replace function public.leave_group(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if exists (select 1 from public.group_members m where m.group_id = target_group_id and m.user_id = uid and m.role = 'owner') then
    raise exception 'The owner cannot leave. Archive the league instead.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- A removed member stays on record, so the code cannot bring them back.
  delete from public.group_members m where m.group_id = target_group_id and m.user_id = uid and m.status <> 'removed';
  if not found then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('left', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
create or replace function public.get_my_groups()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.require_uid() as uid)
  select jsonb_build_object('items', coalesce((
    select jsonb_agg(private.group_summary(g, me.uid) order by g.is_archived, g.name)
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.user_id = me.uid and m.status in ('active', 'pending')), '[]'::jsonb))
  from me;
$$;

create or replace function public.get_group(target_group_id uuid default null, target_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups;
begin
  if (target_group_id is null) = (target_slug is null) then
    raise exception 'give a league id or slug' using errcode = 'invalid_parameter_value';
  end if;
  select * into g from public.groups x
  where (x.id = target_group_id or x.slug = lower(btrim(target_slug)))
    and exists (select 1 from public.group_members m where m.group_id = x.id and m.user_id = uid and m.status in ('active', 'pending'));
  if not found then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  return private.group_summary(g, uid);
end;
$$;

-- The board: rank by XP earned in the window, then correct answers, then who got there first.
-- win: 'weekly' | 'monthly' | 'season' | 'all_time' | 'custom' (from_date..to_date, up to 93 days).
-- Each row carries the change in rank against the window before it; 'most_improved' is whoever gained the most XP.
create or replace function public.get_group_leaderboard(
  target_group_id uuid,
  win             text default 'weekly',
  from_date       date default null,
  to_date         date default null,
  page_size       integer default 50,
  page_offset     integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid      uuid := private.require_uid();
  g        public.groups;
  w        record;
  n_limit  integer := least(greatest(coalesce(page_size, 50), 1), 100);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  select * into g from public.groups x where x.id = target_group_id;
  if not found or not private.is_group_member(uid, g.id) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  select * into w from private.group_window(g, win, from_date, to_date);

  return (
    with hidden as (
      select b.blocked_id as id from public.blocks b where b.blocker_id = uid
      union select b.blocker_id from public.blocks b where b.blocked_id = uid
    ), members as (
      select m.user_id, m.role from public.group_members m
      join public.profiles p on p.id = m.user_id and p.banned_at is null
      where m.group_id = g.id and m.status = 'active'
    ), cur as (
      select mb.user_id, mb.role, coalesce(sum(x.xp), 0)::integer as xp, coalesce(sum(x.correct), 0)::integer as correct, max(x.last_at) as last_at
      from members mb
      left join private.user_xp_daily x on x.user_id = mb.user_id and (w.d_from is null or x.day between w.d_from and w.d_to)
      group by mb.user_id, mb.role
    ), prev as (
      select mb.user_id, coalesce(sum(x.xp), 0)::integer as xp, coalesce(sum(x.correct), 0)::integer as correct, max(x.last_at) as last_at
      from members mb
      left join private.user_xp_daily x on x.user_id = mb.user_id and x.day between w.p_from and w.p_to
      where w.p_from is not null
      group by mb.user_id
    ), ranked as (
      select c.*, row_number() over (order by c.xp desc, c.correct desc, c.last_at asc nulls last, c.user_id) as rnk
      from cur c
    ), prev_ranked as (
      select p.user_id, p.xp as pxp, row_number() over (order by p.xp desc, p.correct desc, p.last_at asc nulls last, p.user_id) as prnk
      from prev p
    ), joined as (
      select r.*, pr.pxp, pr.prnk from ranked r left join prev_ranked pr on pr.user_id = r.user_id
    ), visible as (
      select j.* from joined j where j.user_id = uid or j.user_id not in (select h.id from hidden h)
    )
    select jsonb_build_object(
      'group',   private.group_summary(g, uid),
      'window',  jsonb_build_object('name', win, 'from', w.d_from, 'to', w.d_to),
      'total',   (select count(*) from visible),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'rank', v.rnk, 'user', private.user_card(uid, v.user_id), 'xp', v.xp, 'correct', v.correct,
          'streak', (select p.current_streak from public.profiles p where p.id = v.user_id),
          'role', v.role, 'is_me', v.user_id = uid,
          'rank_delta', case when v.prnk is not null then v.prnk - v.rnk end) order by v.rnk)
        from (select * from visible order by rnk limit n_limit offset n_offset) v), '[]'::jsonb),
      'me', (select jsonb_build_object('rank', v.rnk, 'xp', v.xp, 'correct', v.correct, 'rank_delta', case when v.prnk is not null then v.prnk - v.rnk end)
             from visible v where v.user_id = uid),
      'most_improved', (select jsonb_build_object('user', private.user_card(uid, v.user_id), 'gain', v.xp - v.pxp)
                        from visible v where v.pxp is not null and v.xp - v.pxp > 0
                        order by v.xp - v.pxp desc, v.xp desc, v.user_id limit 1))
  );
end;
$$;

-- What the members did lately (facts only, the same events as the friends feed), for people who share the league.
create or replace function public.get_group_activity(target_group_id uuid, cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  cur_ts  timestamptz := private.cursor_ts(cursor);
  cur_key text := private.cursor_key(cursor);
begin
  if not private.is_group_member(uid, target_group_id) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  return (
    with page as (
      select e.id, e.user_id, e.kind, e.data, e.created_at, row_number() over (order by e.created_at desc, e.id desc) as rn
      from (
        select e.* from public.friend_events e
        join public.group_members m on m.group_id = target_group_id and m.user_id = e.user_id and m.status = 'active'
        join public.profiles p on p.id = e.user_id and p.banned_at is null
        left join public.profile_privacy pp on pp.user_id = e.user_id
        where e.created_at > now() - interval '14 days' and coalesce(pp.share_activity, true) and e.user_id <> uid
          and not private.is_blocked_pair(uid, e.user_id)
          and (cur_ts is null or (e.created_at, e.id) < (cur_ts, cur_key::bigint))
        order by e.created_at desc, e.id desc limit 21
      ) e
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'data', g.data, 'created_at', g.created_at,
                                                              'user', private.user_card(uid, g.user_id)) order by g.rn)
                         from page g where g.rn <= 20), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 20 then (select g.created_at::text || '|' || g.id from page g where g.rn = 20) end)
  );
end;
$$;

-- Finished challenges between members of the league (who beat whom).
create or replace function public.get_group_challenges(target_group_id uuid)
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
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'completed_at', c.completed_at, 'question_count', cardinality(c.question_ids),
             'challenger', private.user_card(uid, c.challenger_id), 'opponent', private.user_card(uid, c.opponent_id),
             'challenger_score', c.challenger_score, 'opponent_score', c.opponent_score,
             'winner', case when c.is_draw then 'draw' when c.winner_id = c.challenger_id then 'challenger' else 'opponent' end)
           order by c.completed_at desc)
    from (select x.* from public.challenges x
          where x.status = 'completed' and x.completed_at > now() - interval '14 days'
            and private.is_group_member(x.challenger_id, target_group_id) and private.is_group_member(x.opponent_id, target_group_id)
            and not private.is_blocked_pair(uid, x.challenger_id) and not private.is_blocked_pair(uid, x.opponent_id)
          order by x.completed_at desc limit 20) c), '[]'::jsonb));
end;
$$;

create or replace function public.get_group_announcements(target_group_id uuid)
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
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'pinned', a.is_pinned, 'created_at', a.created_at,
                                        'author', case when a.created_by is not null then private.user_card(uid, a.created_by) end)
                     order by a.is_pinned desc, a.created_at desc)
    from (select x.* from public.group_announcements x where x.group_id = target_group_id order by x.created_at desc limit 20) a), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin tools (owner and admins)
-- ---------------------------------------------------------------------------
-- Each argument left out (null) is unchanged. The domain can only be set together with the email_domain mode,
-- and only by someone whose own verified email is on it.
create or replace function public.update_group(
  target_group_id       uuid,
  name                  text default null,
  join_mode             text default null,
  allowed_email_domain  text default null,
  max_members           integer default null,
  season_start          date default null,
  season_end            date default null,
  clear_season          boolean default false,
  weekly_reset          boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  g    public.groups := private.admin_group(uid, target_group_id);
  mode text := coalesce(update_group.join_mode, g.join_mode);
  dom  text := coalesce(lower(nullif(btrim(update_group.allowed_email_domain), '')), g.allowed_email_domain);
  nm   text := coalesce(nullif(btrim(update_group.name), ''), g.name);
  s0   date := case when update_group.clear_season then null else coalesce(update_group.season_start, g.season_start) end;
  s1   date := case when update_group.clear_season then null else coalesce(update_group.season_end, g.season_end) end;
  mx   integer := coalesce(update_group.max_members, g.max_members);
begin
  perform private.social_limit('group_admin', 3600, 60);
  if g.is_archived then
    raise exception 'This league is archived.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if char_length(nm) not between 3 and 60 or nm ~ '[<>]' then
    raise exception 'Give the league a name of 3 to 60 characters.' using errcode = 'invalid_parameter_value';
  end if;
  if mode not in ('invite_code', 'approval', 'email_domain') then
    raise exception 'unknown join mode' using errcode = 'invalid_parameter_value';
  end if;
  if mode = 'email_domain' and (mode is distinct from g.join_mode or dom is distinct from g.allowed_email_domain) then
    if dom is null or g.owner_id <> uid or not exists (select 1 from private.accounts a
         where a.id = uid and a.email_verified_at is not null and split_part(a.email, '@', 2) = dom) then
      raise exception 'Only the owner can limit a league to a domain, with a verified email on it.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if mode <> 'email_domain' then
    dom := null;
  end if;
  if (s0 is null) <> (s1 is null) or (s0 is not null and s1 < s0) then
    raise exception 'A season needs a start and an end date, in that order.' using errcode = 'invalid_parameter_value';
  end if;
  if mx < greatest((select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active'), 2) or mx > 300 then
    raise exception 'The size cannot be smaller than the current members or more than 300.' using errcode = 'invalid_parameter_value';
  end if;

  update public.groups x
  set name = nm, join_mode = mode, allowed_email_domain = dom, max_members = mx, season_start = s0, season_end = s1,
      weekly_reset = coalesce(update_group.weekly_reset, x.weekly_reset)
  where x.id = g.id returning * into g;
  return private.group_summary(g, uid);
end;
$$;

create or replace function public.get_group_invite(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups := private.admin_group(uid, target_group_id);
begin
  return jsonb_build_object('code', g.invite_code);
end;
$$;

-- A new code at once; the old link stops working.
create or replace function public.rotate_group_code(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups := private.admin_group(uid, target_group_id);
begin
  perform private.social_limit('group_admin', 3600, 60);
  update public.groups x set invite_code = private.group_token() where x.id = g.id returning * into g;
  return jsonb_build_object('code', g.invite_code);
end;
$$;

create or replace function public.get_group_requests(target_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if not private.is_group_admin(uid, target_group_id) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(private.user_card(uid, m.user_id) || jsonb_build_object('requested_at', m.joined_at) order by m.joined_at)
    from public.group_members m join public.profiles p on p.id = m.user_id and p.banned_at is null
    where m.group_id = target_group_id and m.status = 'pending' and not private.is_blocked_pair(uid, m.user_id)), '[]'::jsonb));
end;
$$;

-- The active members, for the admin screen (handles only).
create or replace function public.get_group_members(target_group_id uuid)
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
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(private.user_card(uid, m.user_id) || jsonb_build_object('role', m.role, 'joined_at', m.joined_at)
                     order by (m.role = 'owner') desc, (m.role = 'admin') desc, m.joined_at)
    from public.group_members m join public.profiles p on p.id = m.user_id and p.banned_at is null
    where m.group_id = target_group_id and m.status = 'active' and (m.user_id = uid or not private.is_blocked_pair(uid, m.user_id))), '[]'::jsonb));
end;
$$;

create or replace function public.respond_group_request(target_group_id uuid, target_handle text, approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups := private.admin_group(uid, target_group_id);
  tid uuid;
  n   integer;
begin
  perform private.social_limit('group_admin', 3600, 60);
  select p.id into tid from public.profiles p where p.handle = lower(btrim(coalesce(target_handle, '')));
  if tid is null or not exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = tid and m.status = 'pending') then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  if approve is null then
    raise exception 'approve must be true or false' using errcode = 'invalid_parameter_value';
  end if;
  if approve then
    select count(*) into n from public.group_members m where m.group_id = g.id and m.status = 'active';
    if n >= g.max_members then
      raise exception 'This league is full.' using errcode = 'program_limit_exceeded';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('groups:' || tid, 0));
    if (select count(*) from public.group_members x join public.groups y on y.id = x.group_id
        where x.user_id = tid and x.status = 'active' and not y.is_archived) >= 10 then
      raise exception 'This player is already in 10 leagues.' using errcode = 'program_limit_exceeded';
    end if;
    update public.group_members m set status = 'active', joined_at = now() where m.group_id = g.id and m.user_id = tid;
  else
    delete from public.group_members m where m.group_id = g.id and m.user_id = tid and m.status = 'pending';
  end if;
  return jsonb_build_object('status', case when approve then 'active' else 'declined' end);
end;
$$;

-- Owners and admins remove members (admins cannot remove admins or the owner). They drop off the board at once
-- and cannot come back with the code.
create or replace function public.remove_group_member(target_group_id uuid, target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  g    public.groups := private.admin_group(uid, target_group_id);
  tid  uuid;
  trole text;
  mine text := (select m.role from public.group_members m where m.group_id = target_group_id and m.user_id = uid);
begin
  perform private.social_limit('group_admin', 3600, 60);
  select p.id into tid from public.profiles p where p.handle = lower(btrim(coalesce(target_handle, '')));
  select m.role into trole from public.group_members m where m.group_id = g.id and m.user_id = tid and m.status in ('active', 'pending');
  if tid is null or trole is null then
    raise exception 'member not found' using errcode = 'no_data_found';
  end if;
  if trole = 'owner' or tid = uid or (trole = 'admin' and mine <> 'owner') then
    raise exception 'You cannot remove this member.' using errcode = 'insufficient_privilege';
  end if;
  update public.group_members m set status = 'removed', role = 'member' where m.group_id = g.id and m.user_id = tid;
  return jsonb_build_object('removed', true);
end;
$$;

create or replace function public.set_group_member_role(target_group_id uuid, target_handle text, new_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups := private.admin_group(uid, target_group_id);
  tid uuid;
begin
  if g.owner_id <> uid then
    raise exception 'Only the owner can change roles.' using errcode = 'insufficient_privilege';
  end if;
  if new_role not in ('admin', 'member') then
    raise exception 'unknown role' using errcode = 'invalid_parameter_value';
  end if;
  select p.id into tid from public.profiles p where p.handle = lower(btrim(coalesce(target_handle, '')));
  update public.group_members m set role = new_role
  where m.group_id = g.id and m.user_id = tid and m.status = 'active' and m.role <> 'owner';
  if not found then
    raise exception 'member not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('role', new_role);
end;
$$;

-- An official notice: pinned (it replaces the pinned one), 280 characters, not subject to the 48-hour rule.
create or replace function public.post_group_announcement(target_group_id uuid, body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups := private.admin_group(uid, target_group_id);
  t   text;
  a   public.group_announcements;
begin
  if g.is_archived then
    raise exception 'This league is archived.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  t := private.clean_community_text(post_group_announcement.body, 280, uid);
  perform private.social_limit('group_announce', 86400, 10);
  update public.group_announcements x set is_pinned = false where x.group_id = g.id and x.is_pinned;
  insert into public.group_announcements (group_id, body, created_by) values (g.id, t, uid) returning * into a;
  -- Keep the last 20.
  delete from public.group_announcements x
  where x.group_id = g.id and x.id not in (select y.id from public.group_announcements y where y.group_id = g.id order by y.created_at desc limit 20);
  return jsonb_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at);
end;
$$;

create or replace function public.delete_group_announcement(target_group_id uuid, announcement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups := private.admin_group(uid, target_group_id);
begin
  delete from public.group_announcements a where a.id = announcement_id and a.group_id = g.id;
  if not found then
    raise exception 'announcement not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

-- Read-only from now on: no joins, notices or challenges. Members can still see the board.
create or replace function public.archive_group(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  g   public.groups := private.admin_group(uid, target_group_id);
begin
  if g.owner_id <> uid then
    raise exception 'Only the owner can archive a league.' using errcode = 'insufficient_privilege';
  end if;
  update public.groups x set is_archived = true where x.id = g.id returning * into g;
  return private.group_summary(g, uid);
end;
$$;

-- The board as CSV for the organiser: rank, handle, XP, correct answers, streak. No names, no emails.
create or replace function public.export_group_results(
  target_group_id uuid,
  win             text default 'weekly',
  from_date       date default null,
  to_date         date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  g    public.groups;
  w    record;
  csv  text;
begin
  select * into g from public.groups x where x.id = target_group_id;
  if not found or not private.is_group_admin(uid, g.id) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;
  select * into w from private.group_window(g, win, from_date, to_date);
  select 'rank,handle,xp,correct,streak' || E'\n' || coalesce(string_agg(
           r.rnk || ',' || r.handle || ',' || r.xp || ',' || r.correct || ',' || r.streak, E'\n' order by r.rnk), '')
  into csv
  from (
    select row_number() over (order by c.xp desc, c.correct desc, c.last_at asc nulls last, c.user_id) as rnk, c.handle, c.xp, c.correct, c.streak
    from (
      select p.id as user_id, p.handle, p.current_streak as streak,
             coalesce(sum(x.xp), 0)::integer as xp, coalesce(sum(x.correct), 0)::integer as correct, max(x.last_at) as last_at
      from public.group_members m
      join public.profiles p on p.id = m.user_id and p.banned_at is null
      left join private.user_xp_daily x on x.user_id = p.id and (w.d_from is null or x.day between w.d_from and w.d_to)
      where m.group_id = g.id and m.status = 'active'
      group by p.id, p.handle, p.current_streak
    ) c
  ) r;
  return jsonb_build_object('filename', g.slug || '-' || win || '.csv', 'csv', csv);
end;
$$;

-- ---------------------------------------------------------------------------
-- The college / batch feed: posts by people who share a league with you (optionally one league).
-- Replaces get_feed with one more argument.
-- ---------------------------------------------------------------------------
drop function public.get_feed(text, text, uuid, text);

create or replace function public.get_feed(
  feed      text default 'everyone',
  sort      text default 'new',
  topic_id  uuid default null,
  cursor    text default null,
  group_id  uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  as_of   timestamptz := now();
  cur_ts  timestamptz;
  cur_id  uuid;
  cur_sc  double precision;
  parts   text[];
  result  jsonb;
begin
  if feed not in ('following', 'topic', 'everyone', 'mine', 'group') then
    raise exception 'unknown feed' using errcode = 'invalid_parameter_value';
  end if;
  if sort not in ('new', 'hot') then
    raise exception 'unknown sort' using errcode = 'invalid_parameter_value';
  end if;
  if feed = 'topic' and get_feed.topic_id is null then
    raise exception 'choose a topic' using errcode = 'invalid_parameter_value';
  end if;
  if feed = 'group' and get_feed.group_id is not null and not private.is_group_member(uid, get_feed.group_id) then
    raise exception 'league not found' using errcode = 'no_data_found';
  end if;

  if cursor is not null then
    begin
      parts := string_to_array(cursor, '|');
      if sort = 'new' then
        cur_ts := parts[1]::timestamptz; cur_id := parts[2]::uuid;
      else
        as_of := parts[1]::timestamptz; cur_sc := parts[2]::double precision; cur_id := parts[3]::uuid;
      end if;
    exception when others then
      raise exception 'invalid cursor' using errcode = 'invalid_parameter_value';
    end;
  end if;

  result := (
    with hidden as (
      select b.blocked_id as id from public.blocks b where b.blocker_id = uid
      union select b.blocker_id from public.blocks b where b.blocked_id = uid
      union select m.muted_id from public.mutes m where m.muter_id = uid
    ), base as (
      select p.*,
             (p.like_count + 2 * p.reply_count)::double precision
               / power(greatest(extract(epoch from (as_of - p.created_at)) / 3600.0, 0) + 2, 1.5) as hot_score
      from public.posts p
      join public.profiles a on a.id = p.author_id and a.banned_at is null
      where p.expires_at > now()
        and p.created_at <= as_of
        and (p.status = 'visible' or (p.author_id = uid and p.status = 'hidden'))
        and (p.author_id = uid or p.author_id not in (select h.id from hidden h))
        and case feed
              when 'following' then p.author_id = uid or p.author_id in (select f.followee_id from public.follows f where f.follower_id = uid)
              when 'topic' then p.topic_id = get_feed.topic_id
              when 'mine' then p.author_id = uid
              when 'group' then p.author_id = uid or exists (
                select 1 from public.group_members a
                join public.groups gg on gg.id = a.group_id and not gg.is_archived
                join public.group_members b on b.group_id = a.group_id and b.status = 'active' and b.user_id = p.author_id
                where a.user_id = uid and a.status = 'active' and (get_feed.group_id is null or a.group_id = get_feed.group_id))
              else true
            end
    ), page as (
      select b.*, row_number() over (
               order by case when sort = 'hot' then b.hot_score end desc nulls last,
                        case when sort = 'new' then b.created_at end desc nulls last, b.id desc) as rn
      from base b
      where case
              when cursor is null then true
              when sort = 'new' then (b.created_at, b.id) < (cur_ts, cur_id)
              else (b.hot_score, b.id) < (cur_sc, cur_id)
            end
      order by case when sort = 'hot' then b.hot_score end desc nulls last,
               case when sort = 'new' then b.created_at end desc nulls last, b.id desc
      limit 21
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg((select private.post_card(px, uid) from public.posts px where px.id = g.id) order by g.rn)
                         from page g where g.rn <= 20), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 20 then (
        select case when sort = 'new' then g.created_at::text || '|' || g.id
                    else as_of::text || '|' || g.hot_score::text || '|' || g.id end
        from page g where g.rn = 20) end,
      'server_now', now())
  );
  return result;
end;
$$;


-- ---------------------------------------------------------------------------
-- Push: a new switch for league announcements
-- ---------------------------------------------------------------------------
alter table private.push_preferences add column groups boolean not null default true;

-- ---------------------------------------------------------------------------
-- RLS and privileges. Read-only for players; the invite code is not a readable column.
-- ---------------------------------------------------------------------------
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.group_announcements  enable row level security;

revoke all on public.groups, public.group_members, public.group_announcements from anon, authenticated;
grant select (id, name, slug, kind, owner_id, join_mode, allowed_email_domain, max_members, is_archived, season_start, season_end,
              weekly_reset, created_at, updated_at) on public.groups to authenticated;
grant select on public.group_members, public.group_announcements to authenticated;

create policy "groups: read as a member" on public.groups
  for select to authenticated
  using (private.is_group_member((select auth.uid()), id));
create policy "group_members: read own and, for admins, the league's" on public.group_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_group_admin((select auth.uid()), group_id));
create policy "group_announcements: read as a member" on public.group_announcements
  for select to authenticated
  using (private.is_group_member((select auth.uid()), group_id));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  private.xp_daily_from_xp(), private.xp_daily_from_attempt(), private.is_group_admin(uuid, uuid), private.share_group(uuid, uuid),
  private.group_summary(public.groups, uuid), private.admin_group(uuid, uuid), private.group_token(),
  private.group_window(public.groups, text, date, date)
  from public, anon, authenticated;
-- The read policies run as the reader.
grant execute on function private.is_group_member(uuid, uuid), private.is_group_admin(uuid, uuid) to authenticated;

revoke execute on function
  public.create_group(text, text, text, text, integer), public.join_group(text), public.leave_group(uuid), public.get_my_groups(),
  public.get_group(uuid, text), public.get_group_leaderboard(uuid, text, date, date, integer, integer),
  public.get_group_activity(uuid, text), public.get_group_challenges(uuid), public.get_group_announcements(uuid),
  public.update_group(uuid, text, text, text, integer, date, date, boolean, boolean), public.get_group_invite(uuid),
  public.rotate_group_code(uuid), public.get_group_requests(uuid), public.get_group_members(uuid),
  public.respond_group_request(uuid, text, boolean), public.remove_group_member(uuid, text), public.set_group_member_role(uuid, text, text),
  public.post_group_announcement(uuid, text), public.delete_group_announcement(uuid, uuid), public.archive_group(uuid),
  public.export_group_results(uuid, text, date, date), public.get_feed(text, text, uuid, text, uuid)
  from public, anon;
grant execute on function
  public.create_group(text, text, text, text, integer), public.join_group(text), public.leave_group(uuid), public.get_my_groups(),
  public.get_group(uuid, text), public.get_group_leaderboard(uuid, text, date, date, integer, integer),
  public.get_group_activity(uuid, text), public.get_group_challenges(uuid), public.get_group_announcements(uuid),
  public.update_group(uuid, text, text, text, integer, date, date, boolean, boolean), public.get_group_invite(uuid),
  public.rotate_group_code(uuid), public.get_group_requests(uuid), public.get_group_members(uuid),
  public.respond_group_request(uuid, text, boolean), public.remove_group_member(uuid, text), public.set_group_member_role(uuid, text, text),
  public.post_group_announcement(uuid, text), public.delete_group_announcement(uuid, uuid), public.archive_group(uuid),
  public.export_group_results(uuid, text, date, date), public.get_feed(text, text, uuid, text, uuid)
  to authenticated, service_role;

-- Dark until plans.features.community_groups is true (the 'pilot' plan has it).
update public.plans set features = features || '{"community_groups": true}' where id = 'pilot';

notify pgrst, 'reload schema';
