-- Plans and entitlements: the foundation for memberships, ad-free access and
-- tiered AI features. Nothing here changes what players can do today: only the
-- 'free' plan is active and its limits equal the API's current defaults. Paid
-- plans are seeded inactive; switch them on (is_active) when billing ships.
--
--   public.plans             what each plan includes: `features` (switches the app
--                            checks, e.g. ads) and `limits` (numbers the API
--                            enforces, e.g. tutor messages per day). A key missing
--                            from `limits` means "use the API's configured default".
--   public.subscriptions     who holds which plan, mirrored from the payment
--                            provider by the API (webhooks). Players read their own.
--   private.billing_events   every provider webhook, stored once (idempotency).
--   private.entitlements_for(uid) -> jsonb { plan, features, limits } (API only)
--
-- Players cannot write any of it: the API (secret key) is the only writer.

create table public.plans (
  id          text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  name        text not null check (char_length(name) between 1 and 64),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  features    jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  limits      jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function private.set_updated_at();

insert into public.plans (id, name, sort_order, is_active, features, limits) values
  ('free', 'Free', 0, true,
    '{"ads": true, "ai_tier": "standard", "advanced_analytics": false, "contest_history": false}',
    '{"tutor_messages_per_hour": 60, "tutor_messages_per_day": 200}'),
  ('plus', 'Plus', 10, false,
    '{"ads": false, "ai_tier": "standard", "advanced_analytics": true, "contest_history": true}',
    '{"tutor_messages_per_hour": 120, "tutor_messages_per_day": 600}'),
  ('pro', 'Pro', 20, false,
    '{"ads": false, "ai_tier": "advanced", "advanced_analytics": true, "contest_history": true}',
    '{"tutor_messages_per_hour": 240, "tutor_messages_per_day": 2000}');

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles (id) on delete cascade,
  plan_id                   text not null references public.plans (id),
  status                    text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  -- Where it was bought: a payment provider, a promo code, or granted by hand.
  provider                  text not null check (provider in ('razorpay', 'stripe', 'apple', 'google_play', 'promo', 'manual')),
  provider_customer_id      text,
  provider_subscription_id  text,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id, status);
create unique index subscriptions_provider_ref_key
  on public.subscriptions (provider, provider_subscription_id) where provider_subscription_id is not null;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table private.billing_events (
  provider      text not null,
  event_id      text not null,
  type          text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  primary key (provider, event_id)
);

alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table private.billing_events enable row level security;

revoke all on public.plans, public.subscriptions from anon, authenticated;
revoke all on private.billing_events from public, anon, authenticated;
grant select on public.plans, public.subscriptions to authenticated;

create policy "plans: read active" on public.plans
  for select to authenticated using (is_active or private.is_admin());

create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());

-- ---------------------------------------------------------------------------
-- The plan a player is on: their best live subscription, else 'free'.
-- past_due keeps access (a grace period while the provider retries the card);
-- canceled keeps it until the paid period ends.
-- ---------------------------------------------------------------------------
create or replace function private.entitlements_for(uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select p.*
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id and p.is_active
    where s.user_id = uid
      and s.status in ('trialing', 'active', 'past_due', 'canceled')
      and (s.current_period_end is null or s.current_period_end > now())
      and (s.status <> 'canceled' or s.current_period_end > now())
    order by p.sort_order desc
    limit 1
  ), chosen as (
    select * from best
    union all
    select * from public.plans where id = 'free' and not exists (select 1 from best)
  )
  select jsonb_build_object('plan', id, 'name', name, 'features', features, 'limits', limits)
  from chosen;
$$;

revoke execute on function private.entitlements_for(uuid) from public, anon, authenticated;
grant execute on function private.entitlements_for(uuid) to service_role;
