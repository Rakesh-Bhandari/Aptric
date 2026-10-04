-- Web Push notifications. The backend (backend/src/push) stores each browser's
-- push subscription and per-kind opt-ins, and an hourly cron call
-- (GET /cron/push) sends the notifications that are due:
--
--   daily    "Your daily set is ready"          08:00-09:00 local time
--   streak   "Keep your N-day streak alive"     20:00-21:00 local time, if no XP yet today
--   contests "Starting in an hour" / "Results"  published contests
--   league   "You were promoted / demoted"      after the weekly rollover
--
-- push_log makes every send idempotent: a row is claimed (dedupe_key) before a
-- notification goes out, so a repeated or overlapping cron run never doubles it.
-- Like the auth tables, none of this is reachable by anon/authenticated; only
-- the backend (secret key) reads it.

create table private.push_subscriptions (
  endpoint      text primary key check (char_length(endpoint) between 10 and 2048),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  p256dh        text not null check (char_length(p256dh) between 1 and 256),
  auth          text not null check (char_length(auth) between 1 and 256),
  user_agent    text check (char_length(user_agent) <= 400),
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz
);

create index push_subscriptions_user_idx on private.push_subscriptions (user_id);

-- One row per player once they change a switch; no row means every kind is on.
create table private.push_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  daily       boolean not null default true,
  streak      boolean not null default true,
  contests    boolean not null default true,
  league      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table private.push_log (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  dedupe_key  text not null check (char_length(dedupe_key) between 1 and 200),
  sent_at     timestamptz not null default now(),
  primary key (user_id, dedupe_key)
);

create index push_log_sent_idx on private.push_log (sent_at);

alter table private.push_subscriptions enable row level security;
alter table private.push_preferences   enable row level security;
alter table private.push_log           enable row level security;
revoke all on private.push_subscriptions, private.push_preferences, private.push_log
  from public, anon, authenticated;
