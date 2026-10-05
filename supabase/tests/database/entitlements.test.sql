-- Plans and entitlements: which plan a player is on, and who can read or write plans/subscriptions.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into private.accounts (id, email, metadata) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.com', '{"handle":"alice","timezone":"UTC"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@example.com',   '{"handle":"bob","timezone":"UTC"}');

select is(private.entitlements_for('00000000-0000-0000-0000-0000000000a1') ->> 'plan', 'free', 'no subscription means the free plan');
select is((private.entitlements_for('00000000-0000-0000-0000-0000000000a1') -> 'features' ->> 'ads')::boolean, true, 'free shows ads');

insert into public.subscriptions (user_id, plan_id, status, provider, current_period_end)
  values ('00000000-0000-0000-0000-0000000000a1', 'plus', 'active', 'manual', now() + interval '10 days');
select is(private.entitlements_for('00000000-0000-0000-0000-0000000000a1') ->> 'plan', 'free', 'a subscription to an inactive plan is ignored');

update public.plans set is_active = true where id in ('plus', 'pro');
select is(private.entitlements_for('00000000-0000-0000-0000-0000000000a1') ->> 'plan', 'plus', 'an active subscription gives its plan');
select is((private.entitlements_for('00000000-0000-0000-0000-0000000000a1') -> 'features' ->> 'ads')::boolean, false, 'plus is ad-free');

insert into public.subscriptions (user_id, plan_id, status, provider, current_period_end)
  values ('00000000-0000-0000-0000-0000000000a1', 'pro', 'canceled', 'manual', now() - interval '1 day');
select is(private.entitlements_for('00000000-0000-0000-0000-0000000000a1') ->> 'plan', 'plus', 'a canceled subscription past its period gives nothing');

insert into public.subscriptions (user_id, plan_id, status, provider, current_period_end)
  values ('00000000-0000-0000-0000-0000000000a1', 'pro', 'canceled', 'manual', now() + interval '1 day');
select is(private.entitlements_for('00000000-0000-0000-0000-0000000000a1') ->> 'plan', 'pro', 'a canceled subscription lasts until its paid period ends, and the best plan wins');
select is(private.entitlements_for('00000000-0000-0000-0000-0000000000b1') ->> 'plan', 'free', 'other players are unaffected');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*)::int from public.subscriptions), 0, 'players cannot read each other''s subscriptions');
select throws_ok(
  $$insert into public.subscriptions (user_id, plan_id, status, provider) values ('00000000-0000-0000-0000-0000000000b1', 'pro', 'active', 'manual')$$,
  '42501', null, 'players cannot grant themselves a plan');
select throws_ok($$select private.entitlements_for('00000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'entitlements_for is API only');

select * from finish();
rollback;
