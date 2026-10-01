-- Content: taxonomy (sections > topics > subtopics) and the question bank.

-- ---------------------------------------------------------------------------
-- Taxonomy
-- ---------------------------------------------------------------------------
create table public.sections (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 80),
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.topics (
  id           uuid primary key default gen_random_uuid(),
  section_id   uuid not null references public.sections (id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 80),
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (section_id, slug)
);

create table public.subtopics (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.topics (id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 80),
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (topic_id, slug)
);

-- (section_id, slug) / (topic_id, slug) uniques already index the FK columns.

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------
create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  -- Deleting a subtopic that still has questions is refused; retire them first.
  subtopic_id        uuid not null references public.subtopics (id) on delete restrict,
  stem               text not null check (char_length(stem) between 1 and 10000), -- markdown
  difficulty         public.question_difficulty not null,
  difficulty_rating  integer not null default 1200 check (difficulty_rating between 0 and 4000),
  est_seconds        integer not null default 60 check (est_seconds between 5 and 3600),
  status             public.question_status not null default 'draft',
  source             public.question_source not null default 'manual',
  -- sha256 hex of the normalised stem + options, computed by the writer. Dedupe key.
  content_hash       text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by         uuid references public.profiles (id) on delete set null,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index questions_subtopic_status_idx on public.questions (subtopic_id, status);
create index questions_status_idx          on public.questions (status, created_at desc);
create index questions_published_pick_idx  on public.questions (subtopic_id, difficulty, difficulty_rating)
  where status = 'published';
create index questions_created_by_idx      on public.questions (created_by);

-- Stamp published_at the first time a question goes live.
create or replace function private.questions_stamp_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger questions_stamp_published
  before insert or update of status on public.questions
  for each row execute function private.questions_stamp_published();

create table public.question_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  position     smallint not null check (position between 0 and 9),
  body         text not null check (char_length(body) between 1 and 2000), -- markdown
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (question_id, position),
  -- Target for composite FKs that must point at an option OF THE SAME question.
  unique (id, question_id)
);

-- PRIVATE: never readable by anon/authenticated. See RLS migration.
create table public.question_answers (
  question_id        uuid primary key references public.questions (id) on delete cascade,
  correct_option_id  uuid not null,
  explanation        text not null check (char_length(explanation) <= 10000), -- markdown
  hint               text check (char_length(hint) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (correct_option_id, question_id)
    references public.question_options (id, question_id)
);

create index question_answers_correct_option_idx
  on public.question_answers (correct_option_id, question_id);

create table public.question_tags (
  question_id  uuid not null references public.questions (id) on delete cascade,
  tag          text not null check (tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(tag) <= 40),
  created_at   timestamptz not null default now(),
  primary key (question_id, tag)
);

create index question_tags_tag_idx on public.question_tags (tag);

-- ---------------------------------------------------------------------------
-- Daily sets
-- ---------------------------------------------------------------------------
create table public.daily_sets (
  id            uuid primary key default gen_random_uuid(),
  set_date      date not null unique,
  title         text check (char_length(title) <= 120),
  -- Visible to users once published_at <= now(). NULL = not scheduled.
  published_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index daily_sets_published_at_idx on public.daily_sets (published_at);

create table public.daily_set_items (
  daily_set_id  uuid not null references public.daily_sets (id) on delete cascade,
  question_id   uuid not null references public.questions (id) on delete restrict,
  position      smallint not null check (position between 0 and 99),
  primary key (daily_set_id, position),
  unique (daily_set_id, question_id)
);

create index daily_set_items_question_idx on public.daily_set_items (question_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger sections_set_updated_at         before update on public.sections         for each row execute function private.set_updated_at();
create trigger topics_set_updated_at           before update on public.topics           for each row execute function private.set_updated_at();
create trigger subtopics_set_updated_at        before update on public.subtopics        for each row execute function private.set_updated_at();
create trigger questions_set_updated_at        before update on public.questions        for each row execute function private.set_updated_at();
create trigger question_options_set_updated_at before update on public.question_options for each row execute function private.set_updated_at();
create trigger question_answers_set_updated_at before update on public.question_answers for each row execute function private.set_updated_at();
create trigger daily_sets_set_updated_at       before update on public.daily_sets       for each row execute function private.set_updated_at();
