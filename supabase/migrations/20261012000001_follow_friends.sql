-- Community, slice 1: follow / friends.
--
--   * follows            asymmetric follow; "friends" are mutual follows
--   * follow_requests    approval for private accounts (profiles.is_private)
--   * blocks             a block removes follows both ways and hides each user from the other
--   * profile_privacy    who may see which part of a profile; opt-outs for the activity feed and search
--   * friend_events      the friend activity feed: real events only, never free text, 14-day window
--   * user_reports       "report this person" (the admin queue arrives with the posts slice)
--
-- Every game rule is here, not in the API: each RPC is SECURITY DEFINER, checks
-- auth.uid() through private.require_uid() (banned players are refused there),
-- and answers "user not found" the same way for a missing user, a banned user
-- and a block in either direction, so a block can't be detected by probing.
--
-- Limits: following <= 1,000; 60 follows/unfollows per hour and 300 per day;
-- 100 pending requests; 30 searches per minute. Follower notifications are
-- deduplicated by (recipient, follower) in private.push_log (backend/src/push/jobs.js).
--
-- Friends filter: the leaderboards and contest standings take friends_only, which
-- keeps the players you follow plus you (as Codeforces' friends list does).

-- ---------------------------------------------------------------------------
-- Visibility levels and privacy
-- ---------------------------------------------------------------------------
create type public.visibility_level as enum ('everyone', 'followers', 'friends', 'nobody');

alter table public.profiles add column is_private boolean not null default false;

comment on column public.profiles.is_private is
  'Private account: following needs approval. Only changed through set_privacy().';

create table public.profile_privacy (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  -- Per field group. Accuracy and solve counts:
  stats_visibility   public.visibility_level not null default 'followers',
  exam_visibility    public.visibility_level not null default 'nobody',
  college_visibility public.visibility_level not null default 'nobody',
  -- display_name in search, follower lists and the activity feed (the handle is always shown).
  name_visibility    public.visibility_level not null default 'nobody',
  -- Opt-out: appear in other people's activity feed.
  share_activity     boolean not null default true,
  -- Opt-out: appear in search results and suggestions.
  discoverable       boolean not null default true,
  updated_at         timestamptz not null default now()
);

create trigger profile_privacy_set_updated_at
  before update on public.profile_privacy
  for each row execute function private.set_updated_at();

insert into public.profile_privacy (user_id) select id from public.profiles on conflict do nothing;

create or replace function private.profiles_create_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile_privacy (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_create_privacy
  after insert on public.profiles
  for each row execute function private.profiles_create_privacy();

-- Left-anchored handle search.
create index profiles_handle_prefix_idx on public.profiles (handle text_pattern_ops);

-- ---------------------------------------------------------------------------
-- Graph tables
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id, created_at desc);
create index follows_follower_idx on public.follows (follower_id, created_at desc);

create table public.follow_requests (
  id            uuid primary key default gen_random_uuid(),
  follower_id   uuid not null references public.profiles (id) on delete cascade,
  followee_id   uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follow_requests_inbox_idx on public.follow_requests (followee_id, status, created_at desc);

create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.friend_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('daily_set', 'league_up', 'streak', 'challenge_won')),
  -- Facts only, e.g. {"correct": 9, "total": 10}; the app words them.
  data        jsonb not null default '{}'::jsonb,
  dedupe_key  text not null check (char_length(dedupe_key) <= 120),
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index friend_events_user_idx on public.friend_events (user_id, created_at desc);
create index friend_events_created_idx on public.friend_events (created_at);

create table public.user_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.profiles (id) on delete set null,
  reported_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (reason in ('spam', 'abuse', 'impersonation', 'personal_info', 'other')),
  details      text check (char_length(details) <= 500),
  status       text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at   timestamptz not null default now()
);

-- One open report per reporter and person.
create unique index user_reports_open_key on public.user_reports (reporter_id, reported_id) where status = 'open';
create index user_reports_queue_idx on public.user_reports (status, created_at);

-- ---------------------------------------------------------------------------
-- Helpers (not reachable from the API)
-- ---------------------------------------------------------------------------
create or replace function private.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.blocks
                 where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- a follows b
create or replace function private.is_following(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.follows where follower_id = a and followee_id = b);
$$;

create or replace function private.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_following(a, b) and private.is_following(b, a);
$$;

-- May `viewer` see a field of `owner` that `lvl` guards?
create or replace function private.visible_to(viewer uuid, owner uuid, lvl public.visibility_level)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer = owner
      or (not private.is_blocked_pair(viewer, owner)
          and case lvl
                when 'everyone' then true
                when 'followers' then private.is_following(viewer, owner)
                when 'friends' then private.is_friend(viewer, owner)
                else false
              end);
$$;

-- Can `viewer` read `owner`'s activity events? (the friend_events read policy)
create or replace function private.can_view_events(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer = owner
      or (private.is_following(viewer, owner)
          and not private.is_blocked_pair(viewer, owner)
          and coalesce((select pp.share_activity from public.profile_privacy pp where pp.user_id = owner), true));
$$;

-- The user a handle names, or "user not found" (missing, banned and blocked look the same).
create or replace function private.social_target(uid uuid, target_handle text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tid uuid;
begin
  select p.id into tid from public.profiles p
  where p.handle = lower(btrim(coalesce(target_handle, ''))) and p.banned_at is null;
  if tid is null or (tid <> uid and private.is_blocked_pair(uid, tid)) then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  return tid;
end;
$$;

-- Counts one hit for the caller in a fixed window. Over the limit: SQLSTATE RL429
-- (the API answers 429). Raising rolls the hit back, so a blocked caller stays at the cap.
create or replace function private.social_limit(bucket text, window_seconds integer, max_hits integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select * into r from public.gen_rate_limit(auth.uid(), bucket, window_seconds, max_hits);
  if not r.allowed then
    raise exception 'too many requests' using errcode = 'RL429', detail = r.retry_after_seconds::text;
  end if;
end;
$$;

-- Pages are cursor-based: "<timestamptz>|<key>". Anything else is a 22023.
create or replace function private.cursor_ts(cursor text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if cursor is null then return null; end if;
  return split_part(cursor, '|', 1)::timestamptz;
exception when others then
  raise exception 'invalid cursor' using errcode = 'invalid_parameter_value';
end;
$$;

create or replace function private.cursor_key(cursor text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text := split_part(coalesce(cursor, ''), '|', 2);
begin
  if cursor is null then return null; end if;
  if k !~ '^[0-9a-f-]{1,40}$' then
    raise exception 'invalid cursor' using errcode = 'invalid_parameter_value';
  end if;
  return k;
end;
$$;

-- How `viewer` relates to `target`. A declined request reads as "requested" for a week,
-- so being declined is never visible to the requester.
create or replace function private.relationship(viewer uuid, target uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_me',       viewer = target,
    'following',   private.is_following(viewer, target),
    'followed_by', private.is_following(target, viewer),
    'friend',      private.is_friend(viewer, target),
    'requested',   exists (select 1 from public.follow_requests r
                           where r.follower_id = viewer and r.followee_id = target
                             and (r.status = 'pending'
                                  or (r.status = 'declined' and r.responded_at > now() - interval '7 days'))));
$$;

-- The small public card used by search, lists and the feed.
create or replace function private.user_card(viewer uuid, target uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'handle',         p.handle,
    'display_name',   case when private.visible_to(viewer, p.id, coalesce(pp.name_visibility, 'nobody')) then p.display_name end,
    'avatar_url',     p.avatar_url,
    'level',          p.level,
    'current_streak', p.current_streak,
    'is_private',     p.is_private,
    'league_tier',    (select jsonb_build_object('tier', t.tier, 'slug', t.slug, 'name', t.name)
                       from public.league_tiers t where t.tier = p.league_tier),
    'relationship',   private.relationship(viewer, p.id))
  from public.profiles p
  left join public.profile_privacy pp on pp.user_id = p.id
  where p.id = target;
$$;

-- ---------------------------------------------------------------------------
-- Activity events: written by triggers from things that really happened.
-- A failure here must never break answering a question.
-- ---------------------------------------------------------------------------
create or replace function private.friend_event_daily()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c integer;
  t integer;
begin
  begin
    select count(*) filter (where a.is_correct), count(*) into c, t
    from public.attempts a
    where a.user_id = new.user_id and a.daily_set_id = new.daily_set_id and a.context = 'daily';
    insert into public.friend_events (user_id, kind, data, dedupe_key)
    values (new.user_id, 'daily_set', jsonb_build_object('correct', c, 'total', t),
            'daily_set:' || new.daily_set_id)
    on conflict do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger friend_event_daily
  after insert on public.xp_events
  for each row when (new.reason = 'daily_complete' and new.daily_set_id is not null)
  execute function private.friend_event_daily();

create or replace function private.friend_event_league()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.friend_events (user_id, kind, data, dedupe_key)
    select new.id, 'league_up', jsonb_build_object('tier', t.tier, 'slug', t.slug, 'name', t.name),
           'league_up:' || t.tier || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD')
    from public.league_tiers t where t.tier = new.league_tier
    on conflict do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger friend_event_league
  after update of league_tier on public.profiles
  for each row when (new.league_tier > old.league_tier)
  execute function private.friend_event_league();

create or replace function private.friend_event_streak()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.friend_events (user_id, kind, data, dedupe_key)
    values (new.id, 'streak', jsonb_build_object('days', new.current_streak),
            'streak:' || new.current_streak || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
    on conflict do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger friend_event_streak
  after update of current_streak on public.profiles
  for each row when (new.current_streak > old.current_streak and new.current_streak in (7, 14, 30, 50, 100, 200, 365))
  execute function private.friend_event_streak();

-- Events live 14 days. Reads already ignore older rows; this only frees space.
create or replace function private.prune_friend_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.friend_events
  where id in (select e.id from public.friend_events e where e.created_at < now() - interval '14 days' limit 5000);
  get diagnostics n = row_count;
  return n;
end;
$$;

select cron.schedule('aptric-friend-events-prune', '25 3 * * *', $$select private.prune_friend_events()$$);

-- ---------------------------------------------------------------------------
-- Follow / unfollow / requests
-- ---------------------------------------------------------------------------
create or replace function public.follow_user(target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  tid  uuid := private.social_target(uid, target_handle);
  priv boolean;
begin
  if tid = uid then
    raise exception 'you cannot follow yourself' using errcode = 'invalid_parameter_value';
  end if;
  perform private.social_limit('follow_h', 3600, 60);
  perform private.social_limit('follow_d', 86400, 300);
  -- One writer per follower, so the caps below can't be raced past.
  perform pg_advisory_xact_lock(hashtextextended('follow:' || uid, 0));

  if private.is_following(uid, tid) then
    return jsonb_build_object('status', 'following');
  end if;

  select p.is_private into priv from public.profiles p where p.id = tid;

  if priv then
    if (select count(*) from public.follow_requests r where r.follower_id = uid and r.status = 'pending') >= 100 then
      raise exception 'too many pending follow requests' using errcode = 'program_limit_exceeded';
    end if;
    -- A request that was declined stays declined for a week, silently.
    insert into public.follow_requests as r (follower_id, followee_id)
    values (uid, tid)
    on conflict (follower_id, followee_id) do update
      set status = 'pending', created_at = now(), responded_at = null
      where r.status = 'accepted' or (r.status = 'declined' and r.responded_at < now() - interval '7 days');
    return jsonb_build_object('status', 'requested');
  end if;

  if (select count(*) from public.follows f where f.follower_id = uid) >= 1000 then
    raise exception 'you can follow up to 1,000 people' using errcode = 'program_limit_exceeded';
  end if;
  insert into public.follows (follower_id, followee_id) values (uid, tid) on conflict do nothing;
  delete from public.follow_requests r where r.follower_id = uid and r.followee_id = tid and r.status = 'pending';
  return jsonb_build_object('status', 'following');
end;
$$;

-- Unfollows, or withdraws a pending request.
create or replace function public.unfollow_user(target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  tid uuid := private.social_target(uid, target_handle);
begin
  perform private.social_limit('follow_h', 3600, 60);
  perform private.social_limit('follow_d', 86400, 300);
  delete from public.follows f where f.follower_id = uid and f.followee_id = tid;
  delete from public.follow_requests r where r.follower_id = uid and r.followee_id = tid and r.status = 'pending';
  return jsonb_build_object('status', 'none');
end;
$$;

-- Makes someone stop following you (any account, but mostly private ones).
create or replace function public.remove_follower(target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  tid uuid := private.social_target(uid, target_handle);
begin
  perform private.social_limit('follow_h', 3600, 60);
  delete from public.follows f where f.follower_id = tid and f.followee_id = uid;
  return jsonb_build_object('status', 'removed');
end;
$$;

create or replace function public.respond_follow_request(request_id uuid, accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  req public.follow_requests;
begin
  -- Locked, so answering twice (or from two tabs) is applied once.
  select * into req from public.follow_requests r
  where r.id = request_id and r.followee_id = uid for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  if req.status <> 'pending' then
    return jsonb_build_object('status', req.status);
  end if;
  if accept is null then
    raise exception 'accept must be true or false' using errcode = 'invalid_parameter_value';
  end if;

  if accept then
    if private.is_blocked_pair(uid, req.follower_id) then
      raise exception 'request not found' using errcode = 'no_data_found';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('follow:' || req.follower_id, 0));
    if (select count(*) from public.follows f where f.follower_id = req.follower_id) >= 1000 then
      raise exception 'this person follows the maximum number of people' using errcode = 'program_limit_exceeded';
    end if;
    insert into public.follows (follower_id, followee_id) values (req.follower_id, uid) on conflict do nothing;
  end if;

  update public.follow_requests r
  set status = case when accept then 'accepted' else 'declined' end, responded_at = now()
  where r.id = req.id;
  return jsonb_build_object('status', case when accept then 'accepted' else 'declined' end);
end;
$$;

create or replace function public.get_follow_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.require_uid() as uid)
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(private.user_card(me.uid, r.follower_id) || jsonb_build_object('id', r.id, 'requested_at', r.created_at)
                       order by r.created_at desc)
      from (select q.* from public.follow_requests q
            join public.profiles p on p.id = q.follower_id and p.banned_at is null
            where q.followee_id = me.uid and q.status = 'pending'
              and not private.is_blocked_pair(me.uid, q.follower_id)
            order by q.created_at desc limit 50) r), '[]'::jsonb))
  from me;
$$;

-- ---------------------------------------------------------------------------
-- Blocks and reports
-- ---------------------------------------------------------------------------
create or replace function public.block_user(target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  tid uuid;
begin
  select p.id into tid from public.profiles p where p.handle = lower(btrim(coalesce(target_handle, '')));
  if tid is null then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  if tid = uid then
    raise exception 'you cannot block yourself' using errcode = 'invalid_parameter_value';
  end if;
  perform private.social_limit('block_d', 86400, 100);

  insert into public.blocks (blocker_id, blocked_id) values (uid, tid) on conflict do nothing;
  delete from public.follows f
  where (f.follower_id = uid and f.followee_id = tid) or (f.follower_id = tid and f.followee_id = uid);
  delete from public.follow_requests r
  where (r.follower_id = uid and r.followee_id = tid) or (r.follower_id = tid and r.followee_id = uid);
  return jsonb_build_object('blocked', true);
end;
$$;

create or replace function public.unblock_user(target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  tid uuid;
begin
  select p.id into tid from public.profiles p where p.handle = lower(btrim(coalesce(target_handle, '')));
  if tid is null then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  perform private.social_limit('block_d', 86400, 100);
  delete from public.blocks b where b.blocker_id = uid and b.blocked_id = tid;
  return jsonb_build_object('blocked', false);
end;
$$;

-- Only the people you blocked, never who blocked you.
create or replace function public.get_blocks()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.require_uid() as uid)
  select jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('handle', p.handle, 'avatar_url', p.avatar_url, 'blocked_at', b.created_at)
                     order by b.created_at desc)
    from public.blocks b join public.profiles p on p.id = b.blocked_id
    where b.blocker_id = me.uid), '[]'::jsonb))
  from me;
$$;

create or replace function public.report_user(target_handle text, reason text, details text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  tid uuid;
begin
  select p.id into tid from public.profiles p where p.handle = lower(btrim(coalesce(target_handle, '')));
  if tid is null then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  if tid = uid then
    raise exception 'you cannot report yourself' using errcode = 'invalid_parameter_value';
  end if;
  perform private.social_limit('report_user_d', 86400, 10);
  insert into public.user_reports (reporter_id, reported_id, reason, details)
  values (uid, tid, report_user.reason, nullif(btrim(report_user.details), ''))
  on conflict (reporter_id, reported_id) where status = 'open' do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lists, search, suggestions
-- ---------------------------------------------------------------------------
-- A page (30) of one side of the follow graph. Private accounts show their lists to their followers only.
create or replace function private.follow_list(uid uuid, tid uuid, incoming boolean, cursor text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cur_ts  timestamptz := private.cursor_ts(cursor);
  cur_key text := private.cursor_key(cursor);
  priv    boolean;
begin
  select p.is_private into priv from public.profiles p where p.id = tid;
  if priv and tid <> uid and not private.is_following(uid, tid) then
    return jsonb_build_object('restricted', true, 'items', '[]'::jsonb, 'next_cursor', null);
  end if;

  return (
    with page as (
      select t.created_at, t.other_id, row_number() over (order by t.created_at desc, t.other_id desc) as rn
      from (
        select f.created_at, case when incoming then f.follower_id else f.followee_id end as other_id
        from public.follows f
        where case when incoming then f.followee_id else f.follower_id end = tid
      ) t
      join public.profiles p on p.id = t.other_id and p.banned_at is null
      where (cur_ts is null or (t.created_at, t.other_id) < (cur_ts, cur_key::uuid))
        and not private.is_blocked_pair(uid, t.other_id)
      order by t.created_at desc, t.other_id desc
      limit 31
    )
    select jsonb_build_object(
      'restricted', false,
      'items', coalesce((select jsonb_agg(private.user_card(uid, g.other_id) || jsonb_build_object('followed_at', g.created_at)
                                          order by g.rn)
                         from page g where g.rn <= 30), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 30
                          then (select g.created_at::text || '|' || g.other_id from page g where g.rn = 30) end)
  );
end;
$$;

create or replace function public.get_followers(target_handle text, cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  return private.follow_list(uid, private.social_target(uid, target_handle), true, cursor);
end;
$$;

create or replace function public.get_following(target_handle text, cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  return private.follow_list(uid, private.social_target(uid, target_handle), false, cursor);
end;
$$;

-- Handle prefix search (2+ characters). Matches handles only, so a real name or an
-- email address can never be looked up.
create or replace function public.search_users(q text, cursor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  term text := lower(btrim(coalesce(q, '')));
  cur  text := nullif(btrim(coalesce(cursor, '')), '');
begin
  perform private.social_limit('search', 60, 30);
  term := ltrim(term, '@');
  if term !~ '^[a-z0-9_]{2,24}$' then
    return jsonb_build_object('items', '[]'::jsonb, 'next_cursor', null);
  end if;
  if cur is not null and cur !~ '^[a-z0-9_]{1,24}$' then
    raise exception 'invalid cursor' using errcode = 'invalid_parameter_value';
  end if;

  return (
    with page as (
      select p.id, p.handle, row_number() over (order by p.handle) as rn
      from public.profiles p
      join public.profile_privacy pp on pp.user_id = p.id
      where p.handle like replace(term, '_', '\_') || '%'
        and p.id <> uid and p.banned_at is null and pp.discoverable
        and (cur is null or p.handle > cur)
        and not private.is_blocked_pair(uid, p.id)
      order by p.handle
      limit 21
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(private.user_card(uid, g.id) order by g.rn) from page g where g.rn <= 20), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 20 then (select g.handle from page g where g.rn = 20) end)
  );
end;
$$;

-- People in this week's league of the caller who are not yet followed: the empty-state suggestions.
create or replace function public.get_suggested_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  lg  uuid;
begin
  select m.league_id into lg from public.league_members m
  where m.user_id = uid and m.week_start = private.league_week_start(now());

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(private.user_card(uid, s.user_id) order by s.xp desc, s.user_id)
    from (
      select m.user_id, m.xp
      from public.league_members m
      join public.profiles p on p.id = m.user_id and p.banned_at is null
      join public.profile_privacy pp on pp.user_id = m.user_id and pp.discoverable
      where m.league_id = lg and m.user_id <> uid
        and not private.is_following(uid, m.user_id)
        and not private.is_blocked_pair(uid, m.user_id)
      order by m.xp desc, m.user_id
      limit 10
    ) s), '[]'::jsonb));
end;
$$;

-- What the people you follow did in the last 14 days (never free text), newest first, 20 per page.
create or replace function public.get_friend_activity(cursor text default null)
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
  return (
    with page as (
      select e.id, e.user_id, e.kind, e.data, e.created_at,
             row_number() over (order by e.created_at desc, e.id desc) as rn
      from (
        select e.* from public.friend_events e
        join public.follows f on f.followee_id = e.user_id and f.follower_id = uid
        join public.profiles p on p.id = e.user_id and p.banned_at is null
        left join public.profile_privacy pp on pp.user_id = e.user_id
        where e.created_at > now() - interval '14 days'
          and coalesce(pp.share_activity, true)
          and not private.is_blocked_pair(uid, e.user_id)
          and (cur_ts is null or (e.created_at, e.id) < (cur_ts, cur_key::bigint))
        order by e.created_at desc, e.id desc
        limit 21
      ) e
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'data', g.data, 'created_at', g.created_at,
                                                             'user', private.user_card(uid, g.user_id)) order by g.rn)
                         from page g where g.rn <= 20), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 20
                          then (select g.created_at::text || '|' || g.id from page g where g.rn = 20) end)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacy settings
-- ---------------------------------------------------------------------------
create or replace function public.get_privacy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.require_uid() as uid)
  select jsonb_build_object(
    'is_private',         p.is_private,
    'stats_visibility',   pp.stats_visibility,
    'exam_visibility',    pp.exam_visibility,
    'college_visibility', pp.college_visibility,
    'name_visibility',    pp.name_visibility,
    'share_activity',     pp.share_activity,
    'discoverable',       pp.discoverable)
  from me
  join public.profiles p on p.id = me.uid
  join public.profile_privacy pp on pp.user_id = me.uid;
$$;

-- Each argument left out (null) is unchanged. Going public accepts everyone waiting.
create or replace function public.set_privacy(
  is_private          boolean default null,
  stats_visibility    public.visibility_level default null,
  exam_visibility     public.visibility_level default null,
  college_visibility  public.visibility_level default null,
  name_visibility     public.visibility_level default null,
  share_activity      boolean default null,
  discoverable        boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  perform private.social_limit('privacy_h', 3600, 60);

  insert into public.profile_privacy (user_id) values (uid) on conflict do nothing;
  update public.profile_privacy pp
  set stats_visibility   = coalesce(set_privacy.stats_visibility, pp.stats_visibility),
      exam_visibility    = coalesce(set_privacy.exam_visibility, pp.exam_visibility),
      college_visibility = coalesce(set_privacy.college_visibility, pp.college_visibility),
      name_visibility    = coalesce(set_privacy.name_visibility, pp.name_visibility),
      share_activity     = coalesce(set_privacy.share_activity, pp.share_activity),
      discoverable       = coalesce(set_privacy.discoverable, pp.discoverable)
  where pp.user_id = uid;

  if set_privacy.is_private is not null then
    update public.profiles p set is_private = set_privacy.is_private where p.id = uid;
    if not set_privacy.is_private then
      insert into public.follows (follower_id, followee_id)
      select r.follower_id, uid from public.follow_requests r
      where r.followee_id = uid and r.status = 'pending'
        and (select count(*) from public.follows f where f.follower_id = r.follower_id) < 1000
      on conflict do nothing;
      update public.follow_requests r set status = 'accepted', responded_at = now()
      where r.followee_id = uid and r.status = 'pending';
    end if;
  end if;
  return public.get_privacy();
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles honour blocks and privacy. The existing function keeps the facts;
-- this wrapper decides who may see which.
-- ---------------------------------------------------------------------------
alter function public.get_player_profile(text) set schema private;
alter function private.get_player_profile(text) rename to player_profile_base;
revoke execute on function private.player_profile_base(text) from public, anon, authenticated;
grant execute on function private.player_profile_base(text) to service_role;

create or replace function public.get_player_profile(target_handle text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  tid  uuid;
  base jsonb;
  pr   public.profile_privacy;
  stats boolean;
begin
  if target_handle is null then
    tid := uid;
  else
    select p.id into tid from public.profiles p where p.handle = lower(target_handle);
    if tid is null or (tid <> uid and private.is_blocked_pair(uid, tid)) then
      raise exception 'player not found' using errcode = 'no_data_found';
    end if;
  end if;

  base := private.player_profile_base(target_handle);

  select * into pr from public.profile_privacy x where x.user_id = tid;
  stats := private.visible_to(uid, tid, coalesce(pr.stats_visibility, 'followers'));
  if not stats then
    base := base || jsonb_build_object('solved', null, 'attempts', null, 'correct', null, 'sections', '[]'::jsonb);
  end if;

  return base || jsonb_build_object(
    'stats_hidden',    not stats,
    'exam_goal',       (select p.exam_goal from public.profiles p
                        where p.id = tid and private.visible_to(uid, tid, coalesce(pr.exam_visibility, 'nobody'))),
    'is_private',      (select p.is_private from public.profiles p where p.id = tid),
    'follower_count',  (select count(*) from public.follows f join public.profiles p on p.id = f.follower_id and p.banned_at is null
                        where f.followee_id = tid),
    'following_count', (select count(*) from public.follows f join public.profiles p on p.id = f.followee_id and p.banned_at is null
                        where f.follower_id = tid),
    'relationship',    private.relationship(uid, tid));
end;
$$;

revoke execute on function public.get_player_profile(text) from public, anon;
grant  execute on function public.get_player_profile(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leaderboards, league and contest standings: blocked players are left out, and
-- friends_only keeps the players you follow plus you (re-ranked among them). Each entry says
-- whether you follow that player, for the Follow button.
-- ---------------------------------------------------------------------------
drop function public.get_leaderboard(text, integer, integer);

create or replace function public.get_leaderboard(
  board        text default 'all_time',
  page_size    integer default 50,
  page_offset  integer default 0,
  friends_only boolean default false
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
  fo   boolean := coalesce(friends_only, false);
begin
  if board = 'weekly' then
    return (
      with hidden as (
        select b.blocked_id as id from public.blocks b where b.blocker_id = uid
        union select b.blocker_id from public.blocks b where b.blocked_id = uid
      ), f as (
        select w.*, case when fo then (row_number() over (order by w.rank, w.handle))::integer else w.rank end as shown_rank
        from private.leaderboard_weekly w
        where w.user_id not in (select h.id from hidden h)
          and (not fo or w.user_id = uid or w.user_id in (select x.followee_id from public.follows x where x.follower_id = uid))
      )
      select jsonb_build_object(
        'board',        board,
        'week_start',   private.league_week_start(now()),
        'refreshed_at', (select max(w.refreshed_at) from private.leaderboard_weekly w),
        'total',        (select count(*) from f),
        'entries',      coalesce((
          select jsonb_agg((to_jsonb(x) - 'refreshed_at' - 'shown_rank')
                           || jsonb_build_object('rank', x.shown_rank, 'is_me', x.user_id = uid,
                                                 'following', x.user_id in (select y.followee_id from public.follows y where y.follower_id = uid))
                           order by x.shown_rank, x.handle)
          from (select * from f order by f.shown_rank, f.handle limit n_limit offset n_offset) x), '[]'::jsonb),
        'me',           (select (to_jsonb(m) - 'refreshed_at' - 'shown_rank') || jsonb_build_object('rank', m.shown_rank)
                         from f m where m.user_id = uid)
      )
    );
  elsif board in ('all_time', 'rating') then
    return (
      with hidden as (
        select b.blocked_id as id from public.blocks b where b.blocker_id = uid
        union select b.blocker_id from public.blocks b where b.blocked_id = uid
      ), f as (
        select a.*, case when board = 'rating' then a.rating_rank else a.xp_rank end as r0
        from private.leaderboard_all_time a
        where (board = 'all_time' or a.rating_rank is not null)
          and a.user_id not in (select h.id from hidden h)
          and (not fo or a.user_id = uid or a.user_id in (select x.followee_id from public.follows x where x.follower_id = uid))
      ), g as (
        select f.*, case when fo then (row_number() over (order by f.r0, f.handle))::integer else f.r0 end as r
        from f
      )
      select jsonb_build_object(
        'board',        board,
        'refreshed_at', (select max(a.refreshed_at) from private.leaderboard_all_time a),
        'total',        (select count(*) from g),
        'entries',      coalesce((
          select jsonb_agg((to_jsonb(x) - 'refreshed_at' - 'r' - 'r0')
                           || jsonb_build_object('rank', x.r, 'is_me', x.user_id = uid,
                                                 'following', x.user_id in (select y.followee_id from public.follows y where y.follower_id = uid))
                           order by x.r, x.handle)
          from (select * from g order by g.r, g.handle limit n_limit offset n_offset) x), '[]'::jsonb),
        'me',           (select (to_jsonb(m) - 'refreshed_at' - 'r' - 'r0') || jsonb_build_object('rank', m.r)
                         from g m where m.user_id = uid)
      )
    );
  else
    raise exception 'board must be all_time, rating or weekly' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

revoke execute on function public.get_leaderboard(text, integer, integer, boolean) from public, anon;
grant  execute on function public.get_leaderboard(text, integer, integer, boolean) to authenticated, service_role;

-- The weekly league cohort: the same ranks, without players you blocked or who blocked you.
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
      where x.user_id = uid or not private.is_blocked_pair(uid, x.user_id)
    ), '[]'::jsonb),
    'last_result',  case when last.week_start is not null then jsonb_build_object(
                      'week_start', last.week_start, 'tier', last.tier,
                      'final_rank', last.final_rank, 'outcome', last.outcome) end
  );
end;
$$;

drop function public.get_contest_standings(uuid, integer, integer);

create or replace function public.get_contest_standings(
  contest_id   uuid,
  page_size    integer default 50,
  page_offset  integer default 0,
  friends_only boolean default false
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
  fo       boolean := coalesce(friends_only, false);
begin
  if not exists (select 1 from public.contests c
                 where c.id = get_contest_standings.contest_id and (c.is_published or private.is_admin())) then
    raise exception 'contest not found' using errcode = 'no_data_found';
  end if;

  return (
    with hidden as (
      select b.blocked_id as id from public.blocks b where b.blocker_id = uid
      union select b.blocker_id from public.blocks b where b.blocked_id = uid
    ), f as (
      select case when fo then (row_number() over (order by r.rank))::bigint else r.rank end as rank,
             r.user_id, r.score, r.correct, r.answered, r.time_ms
      from private.contest_ranking(get_contest_standings.contest_id) r
      where r.user_id not in (select h.id from hidden h)
        and (not fo or r.user_id = uid or r.user_id in (select x.followee_id from public.follows x where x.follower_id = uid))
    )
    select jsonb_build_object(
      'total',   (select count(*) from f),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'rank', r.rank, 'user_id', r.user_id, 'handle', p.handle, 'display_name', p.display_name,
                 'avatar_url', p.avatar_url, 'score', r.score, 'correct', r.correct, 'answered', r.answered,
                 'time_ms', r.time_ms, 'is_me', r.user_id = uid,
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

revoke execute on function public.get_contest_standings(uuid, integer, integer, boolean) from public, anon;
grant  execute on function public.get_contest_standings(uuid, integer, integer, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Push: one more opt-in (new followers, requests and accepted requests)
-- ---------------------------------------------------------------------------
alter table private.push_preferences add column social boolean not null default true;

-- ---------------------------------------------------------------------------
-- RLS and privileges. Everything is written by the functions above; users may
-- only read the rows that concern them.
-- ---------------------------------------------------------------------------
alter table public.profile_privacy enable row level security;
alter table public.follows         enable row level security;
alter table public.follow_requests enable row level security;
alter table public.blocks          enable row level security;
alter table public.friend_events   enable row level security;
alter table public.user_reports    enable row level security;

revoke all on public.profile_privacy, public.follows, public.follow_requests, public.blocks,
              public.friend_events, public.user_reports from anon, authenticated;
revoke all on sequence public.friend_events_id_seq from anon, authenticated;

grant select on public.profile_privacy, public.follows, public.follow_requests, public.blocks,
                public.friend_events to authenticated;
grant select on public.user_reports to authenticated;
grant update (status) on public.user_reports to authenticated;

create policy "profile_privacy: read own" on public.profile_privacy
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "follows: read own edges" on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

create policy "follow_requests: read own" on public.follow_requests
  for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

-- Only the blocker sees a block; the blocked player learns nothing from the table.
create policy "blocks: read own" on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "friend_events: read own or followed" on public.friend_events
  for select to authenticated
  using (created_at > now() - interval '14 days'
         and private.can_view_events((select auth.uid()), user_id));

create policy "user_reports: admin read" on public.user_reports
  for select to authenticated
  using ((select private.is_admin()));
create policy "user_reports: admin update" on public.user_reports
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  private.is_blocked_pair(uuid, uuid), private.is_following(uuid, uuid), private.is_friend(uuid, uuid),
  private.visible_to(uuid, uuid, public.visibility_level), private.can_view_events(uuid, uuid),
  private.social_target(uuid, text), private.social_limit(text, integer, integer),
  private.cursor_ts(text), private.cursor_key(text),
  private.relationship(uuid, uuid), private.user_card(uuid, uuid),
  private.follow_list(uuid, uuid, boolean, text), private.prune_friend_events(),
  private.friend_event_daily(), private.friend_event_league(), private.friend_event_streak(),
  private.profiles_create_privacy()
  from public, anon, authenticated;
-- The friend_events read policy runs as the reader.
grant execute on function private.can_view_events(uuid, uuid), private.is_following(uuid, uuid),
  private.is_blocked_pair(uuid, uuid) to authenticated;

revoke execute on function
  public.follow_user(text), public.unfollow_user(text), public.remove_follower(text),
  public.respond_follow_request(uuid, boolean), public.get_follow_requests(),
  public.block_user(text), public.unblock_user(text), public.get_blocks(), public.report_user(text, text, text),
  public.get_followers(text, text), public.get_following(text, text), public.search_users(text, text),
  public.get_suggested_users(), public.get_friend_activity(text), public.get_privacy(),
  public.set_privacy(boolean, public.visibility_level, public.visibility_level, public.visibility_level,
                     public.visibility_level, boolean, boolean)
  from public, anon;
grant execute on function
  public.follow_user(text), public.unfollow_user(text), public.remove_follower(text),
  public.respond_follow_request(uuid, boolean), public.get_follow_requests(),
  public.block_user(text), public.unblock_user(text), public.get_blocks(), public.report_user(text, text, text),
  public.get_followers(text, text), public.get_following(text, text), public.search_users(text, text),
  public.get_suggested_users(), public.get_friend_activity(text), public.get_privacy(),
  public.set_privacy(boolean, public.visibility_level, public.visibility_level, public.visibility_level,
                     public.visibility_level, boolean, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Feature flag. The slice ships dark: the API (backend/src/routes/rpc.js) and the
-- app only open it for plans whose `features` has "community_follow": true.
--   everyone:        update public.plans set features = features || '{"community_follow": true}';
--   a pilot college: grant the 'pilot' plan below to its players, e.g.
--     insert into public.subscriptions (user_id, plan_id, status, provider)
--     select id, 'pilot', 'active', 'manual' from public.profiles where ...;
-- ---------------------------------------------------------------------------
insert into public.plans (id, name, sort_order, is_active, features, limits)
values ('pilot', 'Pilot', 5, true,
        '{"ads": true, "ai_tier": "standard", "advanced_analytics": false, "contest_history": false, "community_follow": true}',
        '{"tutor_messages_per_hour": 60, "tutor_messages_per_day": 200}')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
