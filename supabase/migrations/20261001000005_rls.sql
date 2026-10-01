-- Row Level Security, table/column privileges, and admin RPCs.
--
-- Model:
--   * anon: no table access at all.
--   * authenticated users: read published content and their own rows; may edit
--     a few profile fields and file reports/feedback. Never read answer keys,
--     never write xp/score/streak columns, attempts, or the XP ledger.
--   * admins (profiles.role = 'admin'): manage content via RLS policies; answer
--     keys and roles only through the SECURITY DEFINER admin_* functions below.
--   * service_role: bypasses RLS (backend jobs, grading, XP awards).
--
-- Privileges do the column-level work (RLS is row-level only); policies do
-- the row-level work.

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.sections          enable row level security;
alter table public.topics            enable row level security;
alter table public.subtopics         enable row level security;
alter table public.questions         enable row level security;
alter table public.question_options  enable row level security;
alter table public.question_answers  enable row level security;
alter table public.question_tags     enable row level security;
alter table public.daily_sets        enable row level security;
alter table public.daily_set_items   enable row level security;
alter table public.attempts          enable row level security;
alter table public.xp_events         enable row level security;
alter table public.reports           enable row level security;
alter table public.feedback          enable row level security;
alter table public.audit_log         enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges. Start from nothing, then grant exactly what the policies need.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Content: admins write through RLS; everyone else is limited to SELECT by policy.
grant select, insert, update, delete on
  public.sections, public.topics, public.subtopics,
  public.questions, public.question_options, public.question_tags,
  public.daily_sets, public.daily_set_items
to authenticated;

-- question_answers: no grants to anon/authenticated at all.

-- Profiles: only cosmetic columns are user-writable. role, level, xp, rating
-- and streak columns are writable only by service_role / definer functions.
grant select on public.profiles to authenticated;
grant update (handle, display_name, avatar_url, bio, timezone) on public.profiles to authenticated;

-- Server-written, user-readable.
grant select on public.attempts, public.xp_events, public.audit_log to authenticated;

-- Reports/feedback: users insert a few columns; admins may change status.
grant select, delete on public.reports to authenticated;
grant insert (question_id, reason, details) on public.reports to authenticated;
grant update (status, resolution_note)      on public.reports to authenticated;

grant select, delete on public.feedback to authenticated;
grant insert (category, rating, message, page) on public.feedback to authenticated;
grant update (status)                          on public.feedback to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- (select auth.uid()) / (select private.is_admin()) are wrapped in sub-selects
-- so Postgres evaluates them once per statement, not once per row.
-- ---------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- taxonomy ------------------------------------------------------------------
create policy "sections: read active" on public.sections
  for select to authenticated
  using (is_active or (select private.is_admin()));
create policy "sections: admin insert" on public.sections
  for insert to authenticated with check ((select private.is_admin()));
create policy "sections: admin update" on public.sections
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "sections: admin delete" on public.sections
  for delete to authenticated using ((select private.is_admin()));

create policy "topics: read active" on public.topics
  for select to authenticated
  using (is_active or (select private.is_admin()));
create policy "topics: admin insert" on public.topics
  for insert to authenticated with check ((select private.is_admin()));
create policy "topics: admin update" on public.topics
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "topics: admin delete" on public.topics
  for delete to authenticated using ((select private.is_admin()));

create policy "subtopics: read active" on public.subtopics
  for select to authenticated
  using (is_active or (select private.is_admin()));
create policy "subtopics: admin insert" on public.subtopics
  for insert to authenticated with check ((select private.is_admin()));
create policy "subtopics: admin update" on public.subtopics
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "subtopics: admin delete" on public.subtopics
  for delete to authenticated using ((select private.is_admin()));

-- questions -----------------------------------------------------------------
-- Users see published questions, plus any question they have already
-- attempted (so history still renders after a question is retired).
create policy "questions: read published, attempted, or admin" on public.questions
  for select to authenticated
  using (
    status = 'published'
    or (select private.is_admin())
    or exists (
      select 1 from public.attempts a
      where a.question_id = questions.id and a.user_id = (select auth.uid())
    )
  );
create policy "questions: admin insert" on public.questions
  for insert to authenticated with check ((select private.is_admin()));
create policy "questions: admin update" on public.questions
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "questions: admin delete" on public.questions
  for delete to authenticated using ((select private.is_admin()));

-- Options and tags follow their question's visibility (the sub-select is
-- itself filtered by the questions policy above).
create policy "question_options: read if question visible" on public.question_options
  for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_options.question_id));
create policy "question_options: admin insert" on public.question_options
  for insert to authenticated with check ((select private.is_admin()));
create policy "question_options: admin update" on public.question_options
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "question_options: admin delete" on public.question_options
  for delete to authenticated using ((select private.is_admin()));

create policy "question_tags: read if question visible" on public.question_tags
  for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_tags.question_id));
create policy "question_tags: admin insert" on public.question_tags
  for insert to authenticated with check ((select private.is_admin()));
create policy "question_tags: admin update" on public.question_tags
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "question_tags: admin delete" on public.question_tags
  for delete to authenticated using ((select private.is_admin()));

-- question_answers: RLS enabled with NO policies and no grants => deny all
-- except service_role and SECURITY DEFINER functions.

-- daily sets ----------------------------------------------------------------
create policy "daily_sets: read released" on public.daily_sets
  for select to authenticated
  using (published_at <= now() or (select private.is_admin()));
create policy "daily_sets: admin insert" on public.daily_sets
  for insert to authenticated with check ((select private.is_admin()));
create policy "daily_sets: admin update" on public.daily_sets
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "daily_sets: admin delete" on public.daily_sets
  for delete to authenticated using ((select private.is_admin()));

create policy "daily_set_items: read if set visible" on public.daily_set_items
  for select to authenticated
  using (exists (select 1 from public.daily_sets s where s.id = daily_set_items.daily_set_id));
create policy "daily_set_items: admin insert" on public.daily_set_items
  for insert to authenticated with check ((select private.is_admin()));
create policy "daily_set_items: admin update" on public.daily_set_items
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "daily_set_items: admin delete" on public.daily_set_items
  for delete to authenticated using ((select private.is_admin()));

-- attempts / xp_events (read-only for users) ---------------------------------
create policy "attempts: read own or admin" on public.attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "xp_events: read own or admin" on public.xp_events
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- reports -------------------------------------------------------------------
create policy "reports: read own or admin" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
-- The question must be visible to the reporter (sub-select runs under RLS).
create policy "reports: insert own" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = reports.question_id)
  );
create policy "reports: admin update" on public.reports
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "reports: admin delete" on public.reports
  for delete to authenticated using ((select private.is_admin()));

-- feedback ------------------------------------------------------------------
create policy "feedback: read own or admin" on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "feedback: insert own" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "feedback: admin update" on public.feedback
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "feedback: admin delete" on public.feedback
  for delete to authenticated using ((select private.is_admin()));

-- audit_log -----------------------------------------------------------------
create policy "audit_log: admin read" on public.audit_log
  for select to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Admin RPCs (SECURITY DEFINER; each checks is_admin() itself)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(target_user_id uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role public.user_role;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  select role into old_role from public.profiles where id = target_user_id for update;
  if not found then
    raise exception 'profile % not found', target_user_id using errcode = 'no_data_found';
  end if;
  if old_role = new_role then
    return;
  end if;
  if old_role = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'cannot demote the last admin' using errcode = 'check_violation';
  end if;

  update public.profiles set role = new_role where id = target_user_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'set_role', 'profiles', target_user_id::text,
          jsonb_build_object('role', old_role), jsonb_build_object('role', new_role));
end;
$$;

create or replace function public.admin_get_question_answer(target_question_id uuid)
returns table (question_id uuid, correct_option_id uuid, explanation text, hint text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  return query
    select a.question_id, a.correct_option_id, a.explanation, a.hint, a.updated_at
    from public.question_answers a
    where a.question_id = target_question_id;
end;
$$;

create or replace function public.admin_upsert_question_answer(
  target_question_id uuid,
  correct_option_id  uuid,
  explanation        text,
  hint               text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  insert into public.question_answers as qa (question_id, correct_option_id, explanation, hint)
  values (target_question_id, admin_upsert_question_answer.correct_option_id,
          admin_upsert_question_answer.explanation, admin_upsert_question_answer.hint)
  on conflict (question_id) do update
    set correct_option_id = excluded.correct_option_id,
        explanation       = excluded.explanation,
        hint              = excluded.hint;
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, public.user_role)          from public, anon;
revoke execute on function public.admin_get_question_answer(uuid)                      from public, anon;
revoke execute on function public.admin_upsert_question_answer(uuid, uuid, text, text) from public, anon;
grant  execute on function public.admin_set_user_role(uuid, public.user_role)          to authenticated, service_role;
grant  execute on function public.admin_get_question_answer(uuid)                      to authenticated, service_role;
grant  execute on function public.admin_upsert_question_answer(uuid, uuid, text, text) to authenticated, service_role;
