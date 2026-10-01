-- Aptric v2 foundation: enums, private helper schema, shared trigger functions.

-- `private` holds helpers that policies and triggers call. It is NOT in the
-- PostgREST exposed schemas, so nothing here is reachable as an RPC endpoint.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('user', 'admin');

create type public.question_status as enum ('draft', 'in_review', 'published', 'retired');

create type public.question_difficulty as enum ('easy', 'medium', 'hard');

create type public.question_source as enum ('manual', 'ai', 'import');

-- Where an attempt happened. `daily` attempts also carry a daily_set_id.
create type public.attempt_context as enum ('daily', 'practice', 'assessment');

create type public.report_reason as enum (
  'wrong_answer', 'ambiguous', 'typo', 'duplicate', 'offensive', 'other'
);

create type public.report_status as enum ('open', 'triaged', 'resolved', 'dismissed');

create type public.feedback_category as enum ('general', 'bug', 'feature', 'content', 'other');

create type public.feedback_status as enum ('new', 'read', 'archived');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Makes a table append-only. Updates and direct deletes are rejected for every
-- role, including service_role. Deletes that arrive through an ON DELETE
-- CASCADE (pg_trigger_depth() > 1, i.e. fired from the FK's RI trigger) are
-- allowed so that deleting a user account still works.
create or replace function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception '% is append-only (% not allowed)', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on all functions in schema private from public, anon;
