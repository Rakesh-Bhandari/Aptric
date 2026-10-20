-- Server-authoritative anonymous solver sessions. No client role may read or write these rows.
create table if not exists public.anonymous_trial_sessions (
  id uuid primary key,
  question_ids jsonb not null check (jsonb_typeof(question_ids) = 'array' and jsonb_array_length(question_ids) = 10),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 10),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  check (expires_at > started_at),
  check (completed_at is null or completed_at >= started_at),
  check (completed_at is null or jsonb_array_length(answers) = 10)
);

create index if not exists anonymous_trial_sessions_expiry_idx
  on public.anonymous_trial_sessions (expires_at);

alter table public.anonymous_trial_sessions enable row level security;
revoke all on table public.anonymous_trial_sessions from public, anon, authenticated;
-- All access is through the backend's service_role-only backend_sql gateway.
