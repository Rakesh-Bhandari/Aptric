-- Onboarding: users pick their own handle.
--
-- profiles.handle is now null until the user chooses one on /onboarding; the
-- frontend redirects any signed-in user whose handle is null. The signup trigger
-- only fills it when a valid, unclaimed handle is passed in metadata (e.g. users
-- created by an admin script). It no longer derives one from the email address
-- or OAuth profile, so Google and magic-link users always go through onboarding.

alter table public.profiles alter column handle drop not null;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
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
  );
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

