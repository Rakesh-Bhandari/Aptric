-- Anonymous corrections for public educational resources. Reports are private
-- moderation records; the public can submit through the backend only.
create table if not exists public.resource_feedback (
  id bigint generated always as identity primary key,
  topic text not null check (char_length(topic) between 1 and 120),
  feedback_type text not null check (feedback_type in ('typo', 'solution', 'clarity', 'suggestion')),
  message text not null check (char_length(message) between 8 and 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists resource_feedback_open_idx
  on public.resource_feedback (created_at desc)
  where status in ('open', 'reviewing');

alter table public.resource_feedback enable row level security;
revoke all on table public.resource_feedback from public, anon, authenticated;
-- The API writes through public.backend_sql using the service_role credential.
-- No client role receives direct read or write access.
