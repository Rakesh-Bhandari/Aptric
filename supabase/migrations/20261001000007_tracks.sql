-- Tracks: each user follows one track (e.g. placements, CAT, banking) and each
-- track gets its own daily set. Users with no track follow the default one.

create table public.tracks (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 80),
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- At most one default track.
create unique index tracks_one_default_idx on public.tracks (is_default) where is_default;

insert into public.tracks (slug, name, sort_order, is_default)
values ('general', 'General Aptitude', 0, true);

create trigger tracks_set_updated_at
  before update on public.tracks
  for each row execute function private.set_updated_at();
create trigger tracks_audit
  after insert or update or delete on public.tracks
  for each row execute function private.audit_row_change();

-- SECURITY DEFINER so it works as a column default for any inserting role.
create or replace function private.default_track_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.tracks where is_default;
$$;

revoke execute on function private.default_track_id() from public, anon;
grant execute on function private.default_track_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles.track_id: NULL means "the default track".
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column track_id uuid references public.tracks (id) on delete set null;

create index profiles_track_idx on public.profiles (track_id);

grant update (track_id) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- daily_sets: one set per track per date.
-- ---------------------------------------------------------------------------
alter table public.daily_sets
  add column track_id uuid references public.tracks (id) on delete restrict;
update public.daily_sets set track_id = private.default_track_id();
alter table public.daily_sets
  alter column track_id set default private.default_track_id(),
  alter column track_id set not null,
  drop constraint daily_sets_set_date_key,
  add constraint daily_sets_track_date_key unique (track_id, set_date);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tracks enable row level security;

revoke all on public.tracks from anon;
grant select, insert, update, delete on public.tracks to authenticated;

create policy "tracks: read active" on public.tracks
  for select to authenticated
  using (is_active or (select private.is_admin()));
create policy "tracks: admin insert" on public.tracks
  for insert to authenticated with check ((select private.is_admin()));
create policy "tracks: admin update" on public.tracks
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "tracks: admin delete" on public.tracks
  for delete to authenticated using ((select private.is_admin()));
