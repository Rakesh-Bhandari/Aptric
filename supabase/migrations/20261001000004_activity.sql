-- User activity: attempts, XP ledger, reports, feedback, audit log.

-- ---------------------------------------------------------------------------
-- Attempts. Graded server-side, so only service_role / definer functions write.
-- A "context" is (context, daily_set_id): practice attempts have no set, daily
-- attempts name the set. One attempt per user + question + context.
-- ---------------------------------------------------------------------------
create table public.attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  question_id         uuid not null references public.questions (id) on delete restrict,
  context             public.attempt_context not null,
  daily_set_id        uuid references public.daily_sets (id) on delete restrict,
  selected_option_id  uuid,
  is_correct          boolean not null,
  time_ms             integer check (time_ms between 0 and 86400000),
  used_hint           boolean not null default false,
  xp_awarded          integer not null default 0 check (xp_awarded >= 0),
  created_at          timestamptz not null default now(),
  check ((context = 'daily') = (daily_set_id is not null)),
  foreign key (selected_option_id, question_id)
    references public.question_options (id, question_id),
  constraint attempts_user_question_context_key
    unique nulls not distinct (user_id, question_id, context, daily_set_id)
);

create index attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index attempts_question_idx     on public.attempts (question_id);
create index attempts_daily_set_idx    on public.attempts (daily_set_id, user_id) where daily_set_id is not null;
create index attempts_selected_option_idx on public.attempts (selected_option_id, question_id)
  where selected_option_id is not null;

-- ---------------------------------------------------------------------------
-- XP ledger (append-only). profiles.xp is the running sum, maintained by the
-- same definer function / service code that inserts here.
-- ---------------------------------------------------------------------------
create table public.xp_events (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  amount           integer not null check (amount <> 0),
  reason           text not null check (reason ~ '^[a-z][a-z0-9_]{1,39}$'),
  attempt_id       uuid references public.attempts (id) on delete set null,
  daily_set_id     uuid references public.daily_sets (id) on delete restrict,
  -- Lets writers retry safely, e.g. 'attempt:<uuid>' or 'daily_bonus:<user>:<date>'.
  idempotency_key  text unique,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index xp_events_user_created_idx on public.xp_events (user_id, created_at desc);
create index xp_events_attempt_idx      on public.xp_events (attempt_id) where attempt_id is not null;
create index xp_events_daily_set_idx    on public.xp_events (daily_set_id) where daily_set_id is not null;

-- FK cascades (user deletion) and set-null (attempt deletion) must still work;
-- forbid_mutation lets cascaded deletes through, and SET NULL on attempt_id is
-- an UPDATE, so only guard updates of the ledger's own facts.
create trigger xp_events_no_update
  before update of user_id, amount, reason, daily_set_id, idempotency_key, metadata, created_at
  on public.xp_events
  for each row execute function private.forbid_mutation();
create trigger xp_events_no_delete
  before delete on public.xp_events
  for each row execute function private.forbid_mutation();
create trigger xp_events_no_truncate
  before truncate on public.xp_events
  for each statement execute function private.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Reports (user flags a question)
-- ---------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid default auth.uid() references public.profiles (id) on delete set null,
  question_id      uuid not null references public.questions (id) on delete cascade,
  reason           public.report_reason not null,
  details          text check (char_length(details) <= 2000),
  status           public.report_status not null default 'open',
  resolution_note  text check (char_length(resolution_note) <= 2000),
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_question_idx       on public.reports (question_id);
create index reports_reporter_idx       on public.reports (reporter_id);
create index reports_resolved_by_idx    on public.reports (resolved_by);
-- One open report per user per question.
create unique index reports_one_open_per_user_idx
  on public.reports (reporter_id, question_id) where status in ('open', 'triaged');

create or replace function private.reports_stamp_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'dismissed') and old.status not in ('resolved', 'dismissed') then
    new.resolved_at := now();
    new.resolved_by := auth.uid();
  elsif new.status in ('open', 'triaged') then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;
  return new;
end;
$$;

create trigger reports_stamp_resolution
  before update of status on public.reports
  for each row execute function private.reports_stamp_resolution();
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Feedback (general product feedback)
-- ---------------------------------------------------------------------------
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  category    public.feedback_category not null default 'general',
  rating      smallint check (rating between 1 and 5),
  message     text not null check (char_length(message) between 1 and 5000),
  page        text check (char_length(page) <= 200),
  status      public.feedback_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index feedback_status_created_idx on public.feedback (status, created_at desc);
create index feedback_user_idx           on public.feedback (user_id);

create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log (append-only). Written by triggers and definer functions only.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null check (char_length(action) between 1 and 64),
  entity_type  text not null check (char_length(entity_type) between 1 and 64),
  entity_id    text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);

-- actor_id ON DELETE SET NULL is an UPDATE of actor_id only; allow that.
create trigger audit_log_no_update
  before update of action, entity_type, entity_id, before, after, created_at
  on public.audit_log
  for each row execute function private.forbid_mutation();
create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function private.forbid_mutation();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.forbid_mutation();

-- Generic row-change auditing for admin-managed content.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec     jsonb := to_jsonb(coalesce(new, old));
  -- Answer keys stay private: admins can read audit_log, so log only that the
  -- answer row changed, not its contents.
  is_private boolean := tg_table_name = 'question_answers';
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'question_id'),
    case when tg_op in ('UPDATE', 'DELETE') and not is_private then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') and not is_private then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke execute on all functions in schema private from public, anon;

create trigger sections_audit         after insert or update or delete on public.sections         for each row execute function private.audit_row_change();
create trigger topics_audit           after insert or update or delete on public.topics           for each row execute function private.audit_row_change();
create trigger subtopics_audit        after insert or update or delete on public.subtopics        for each row execute function private.audit_row_change();
create trigger questions_audit        after insert or update or delete on public.questions        for each row execute function private.audit_row_change();
create trigger question_options_audit after insert or update or delete on public.question_options for each row execute function private.audit_row_change();
create trigger question_answers_audit after insert or update or delete on public.question_answers for each row execute function private.audit_row_change();
create trigger daily_sets_audit       after insert or update or delete on public.daily_sets       for each row execute function private.audit_row_change();
