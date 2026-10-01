-- Accounts move from Supabase Auth to the Node backend (backend/).
--
-- Supabase is now only the Postgres database. The backend owns sign-up,
-- passwords, email links, Google sign-in and sessions, and connects with a
-- direct Postgres connection. For each request it runs
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<user id>","role":"authenticated"}';
--
-- so auth.uid(), every RLS policy, column grant and SECURITY DEFINER rule in
-- the earlier migrations keeps working unchanged.
--
--   * private.accounts:    one row per user (email, bcrypt hash, Google id, ban).
--                          Existing auth.users rows are copied in with their ids
--                          and password hashes (Supabase stores bcrypt), so
--                          everyone keeps their account and password.
--   * private.sessions:    refresh tokens (sha256 only), rotated on every refresh.
--   * private.auth_tokens: single-use email / OAuth links (sha256 only).
--
-- None of these are reachable through the Data API or by anon/authenticated.

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table private.accounts (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null check (email = lower(email) and char_length(email) between 3 and 320),
  password_hash      text,
  email_verified_at  timestamptz,
  google_sub         text unique,
  -- Sign-up details (display_name, timezone, avatar_url, ...) read once by
  -- private.handle_new_user() when the profile is created.
  metadata           jsonb not null default '{}'::jsonb,
  banned_until       timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index accounts_email_key on private.accounts (email);

create trigger accounts_set_updated_at
  before update on private.accounts
  for each row execute function private.set_updated_at();

create table private.sessions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references private.accounts (id) on delete cascade,
  token_hash    text not null unique,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index sessions_account_idx on private.sessions (account_id);
create index sessions_expires_idx on private.sessions (expires_at);

create table private.auth_tokens (
  token_hash  text primary key,
  account_id  uuid not null references private.accounts (id) on delete cascade,
  purpose     text not null check (purpose in ('signup', 'magiclink', 'recovery', 'oauth')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index auth_tokens_account_idx on private.auth_tokens (account_id, purpose);

alter table private.accounts    enable row level security;
alter table private.sessions    enable row level security;
alter table private.auth_tokens enable row level security;
revoke all on private.accounts, private.sessions, private.auth_tokens from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Copy existing Supabase Auth users (ids, emails, bcrypt hashes, confirmation,
-- bans, Google identities). Columns are looked up first so the copy also runs
-- against an auth schema without some of them.
-- ---------------------------------------------------------------------------
do $$
declare
  has_col  text[];
  verified text := 'null';
  banned   text := 'null';
begin
  select array_agg(column_name::text) into has_col
  from information_schema.columns
  where table_schema = 'auth' and table_name = 'users';

  if has_col is null then
    return;
  end if;
  if 'email_confirmed_at' = any (has_col) then
    verified := 'u.email_confirmed_at';
  elsif 'confirmed_at' = any (has_col) then
    verified := 'u.confirmed_at';
  end if;
  if 'banned_until' = any (has_col) then
    banned := 'u.banned_until';
  end if;

  execute format($q$
    insert into private.accounts (id, email, password_hash, email_verified_at, metadata,
                                  banned_until, last_sign_in_at, created_at)
    select u.id,
           lower(coalesce(nullif(btrim(u.email), ''), u.id::text || '@users.invalid')),
           nullif(u.encrypted_password, ''),
           %s,
           coalesce(u.raw_user_meta_data, '{}'::jsonb),
           %s,
           u.last_sign_in_at,
           coalesce(u.created_at, now())
    from auth.users u
    on conflict do nothing
  $q$, verified, banned);

  if to_regclass('auth.identities') is not null then
    execute $q$
      update private.accounts a
      set google_sub = i.provider_id
      from auth.identities i
      where i.user_id = a.id and i.provider = 'google'
    $q$;
  end if;
end;
$$;

-- Profiles now hang off accounts instead of auth.users.
drop trigger if exists on_auth_user_created on auth.users;

alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references private.accounts (id) on delete cascade;

comment on table public.profiles is
  'Public-facing user profile, one per private.accounts row. Game columns (level, xp, rating, streak*) are service-managed.';

-- ---------------------------------------------------------------------------
-- New-account trigger: private.accounts insert -> public.profiles row.
-- Same rules as 20261001000006 (handle only from valid, unclaimed metadata);
-- reads accounts.metadata instead of raw_user_meta_data.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.metadata, '{}'::jsonb);
  candidate text;
  tz        text := coalesce(nullif(meta ->> 'timezone', ''), 'UTC');
begin
  candidate := regexp_replace(lower(coalesce(meta ->> 'handle', '')), '[^a-z0-9_]', '', 'g');
  if candidate !~ '^[a-z0-9_]{3,24}$'
     or exists (select 1 from public.profiles where handle = candidate) then
    candidate := null;
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;

  insert into public.profiles (id, handle, display_name, avatar_url, timezone)
  values (
    new.id,
    candidate,
    nullif(left(coalesce(meta ->> 'display_name', meta ->> 'full_name', meta ->> 'name', ''), 64), ''),
    nullif(left(coalesce(meta ->> 'avatar_url', meta ->> 'picture', ''), 2048), ''),
    tz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_account_created
  after insert on private.accounts
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Bans: block sign-in and refresh in private.accounts and end every session.
-- Access tokens are short-lived (15 minutes) and every gameplay RPC checks
-- profiles.banned_at anyway.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_ban(
  target_user_id uuid,
  banned         boolean,
  reason         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'you cannot ban yourself' using errcode = 'check_violation';
  end if;

  select * into p from public.profiles where id = target_user_id for update;
  if not found then
    raise exception 'profile % not found', target_user_id using errcode = 'no_data_found';
  end if;
  if banned and p.role = 'admin' then
    raise exception 'demote an admin before banning them' using errcode = 'check_violation';
  end if;
  if (p.banned_at is not null) = banned then
    return;
  end if;

  update public.profiles set
    banned_at     = case when banned then now() end,
    banned_reason = case when banned then nullif(btrim(reason), '') end,
    banned_by     = case when banned then auth.uid() end
  where id = target_user_id;

  update private.accounts
  set banned_until = case when banned then 'infinity'::timestamptz end
  where id = target_user_id;
  if banned then
    delete from private.sessions where account_id = target_user_id;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    case when banned then 'ban' else 'unban' end,
    'profiles',
    target_user_id::text,
    jsonb_build_object('banned_at', p.banned_at, 'banned_reason', p.banned_reason),
    case when banned
      then jsonb_build_object('banned_at', now(), 'banned_reason', nullif(btrim(reason), ''))
      else jsonb_build_object('banned_at', null, 'banned_reason', null)
    end
  );
end;
$$;

-- User search: emails and last sign-in now come from private.accounts.
create or replace function public.admin_list_users(
  search      text default null,
  only_role   public.user_role default null,
  only_banned boolean default null,
  target_user_id uuid default null,
  page_size   integer default 50,
  page_offset integer default 0
)
returns table (
  id              uuid,
  handle          text,
  display_name    text,
  email           text,
  role            public.user_role,
  level           integer,
  xp              bigint,
  current_streak  integer,
  longest_streak  integer,
  timezone        text,
  banned_at       timestamptz,
  banned_reason   text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  attempts        bigint,
  correct         bigint,
  total_count     bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pattern text;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(search), '') is not null then
    pattern := '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    with matched as (
      select p.*, a.email, a.last_sign_in_at
      from public.profiles p
      left join private.accounts a on a.id = p.id
      where (target_user_id is null or p.id = target_user_id)
        and (only_role is null or p.role = only_role)
        and (only_banned is null or (p.banned_at is not null) = only_banned)
        and (pattern is null
             or p.handle ilike pattern
             or p.display_name ilike pattern
             or a.email ilike pattern
             or p.id::text = btrim(search))
    ),
    page as (
      select m.*, count(*) over () as total_count
      from matched m
      order by m.created_at desc, m.id
      limit least(greatest(page_size, 1), 200)
      offset greatest(page_offset, 0)
    )
    select pg.id, pg.handle, pg.display_name, pg.email, pg.role, pg.level, pg.xp,
           pg.current_streak, pg.longest_streak, pg.timezone, pg.banned_at, pg.banned_reason,
           pg.created_at, pg.last_sign_in_at,
           (select count(*) from public.attempts a where a.user_id = pg.id),
           (select count(*) from public.attempts a where a.user_id = pg.id and a.is_correct),
           pg.total_count
    from page pg
    order by pg.created_at desc, pg.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime is no longer used (the app polls league standings): stop
-- broadcasting league XP changes and drop the channel policy.
-- ---------------------------------------------------------------------------
drop trigger if exists league_members_broadcast on public.league_members;
drop function if exists private.league_broadcast();
drop policy if exists "league channels: members receive" on realtime.messages;
drop function if exists private.is_league_member(text);

-- ---------------------------------------------------------------------------
-- Housekeeping: expired sessions and used/expired links, daily.
-- ---------------------------------------------------------------------------
create or replace function private.purge_auth_tokens()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.sessions    where expires_at < now();
  delete from private.auth_tokens where expires_at < now() - interval '1 day';
$$;

revoke execute on function private.purge_auth_tokens() from public, anon, authenticated, service_role;

select cron.schedule('aptric-purge-auth-tokens', '40 3 * * *', $$select private.purge_auth_tokens()$$);
