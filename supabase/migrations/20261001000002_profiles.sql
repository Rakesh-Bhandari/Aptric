-- Profiles: one row per auth.users row, created by trigger on signup.

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  handle            text not null unique
                      check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name      text check (char_length(display_name) between 1 and 64),
  avatar_url        text check (char_length(avatar_url) <= 2048),
  bio               text check (char_length(bio) <= 280),
  role              public.user_role not null default 'user',
  timezone          text not null default 'UTC',
  -- Game state: written only by service_role / security-definer functions.
  level             integer not null default 1 check (level >= 1),
  xp                bigint  not null default 0 check (xp >= 0),
  rating            integer not null default 1200 check (rating >= 0),
  current_streak    integer not null default 0 check (current_streak >= 0),
  longest_streak    integer not null default 0 check (longest_streak >= current_streak),
  last_streak_date  date,
  streak_freezes    integer not null default 0 check (streak_freezes between 0 and 10),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is
  'Public-facing user profile. Game columns (level, xp, rating, streak*) are service-managed.';

-- Leaderboards.
create index profiles_xp_idx     on public.profiles (xp desc);
create index profiles_rating_idx on public.profiles (rating desc);
-- Cheap admin lookup used by private.is_admin().
create index profiles_admin_idx  on public.profiles (id) where role = 'admin';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Reject unknown IANA timezone names.
create or replace function private.validate_profile_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function private.validate_profile_timezone();

-- ---------------------------------------------------------------------------
-- is_admin(): used by RLS policies. SECURITY DEFINER so it can read profiles
-- without recursing through the profiles policies.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- New-user trigger: auth.users insert -> public.profiles row.
-- Must never fail, or signup fails; every input from metadata is sanitised.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base      text;
  candidate text;
  tz        text := coalesce(nullif(meta ->> 'timezone', ''), 'UTC');
  attempt   integer := 0;
begin
  base := lower(coalesce(
    nullif(meta ->> 'handle', ''),
    nullif(meta ->> 'user_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  ));
  base := left(regexp_replace(base, '[^a-z0-9_]', '', 'g'), 18);
  if char_length(base) < 3 then
    base := 'user' || base;
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop
    attempt := attempt + 1;
    candidate := base || '_' || substr(md5(random()::text || attempt::text), 1, 5);
  end loop;

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
  );
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
