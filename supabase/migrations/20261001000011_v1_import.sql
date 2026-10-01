-- Bookkeeping for the one-off v1 (TiDB/MySQL) question import.
-- The import itself is supabase/scripts/import-v1-questions.mjs; see supabase/README.md.

-- One "Unsorted (v1 import)" topic per section for questions the importer
-- could not place in a subtopic. Inactive, so users never see it and daily
-- sets never draw from it; reviewers move questions out of it.
insert into public.topics (section_id, slug, name, description, sort_order, is_active)
select id, 'v1-unsorted', 'Unsorted (v1 import)',
       'Imported v1 questions awaiting a subtopic. Move each one, then delete this topic.', 999, false
from public.sections
where slug in ('quantitative-aptitude', 'logical-reasoning', 'verbal-ability',
               'data-interpretation', 'technical-aptitude')
on conflict (section_id, slug) do nothing;

insert into public.subtopics (topic_id, slug, name, is_active)
select top.id, 'unsorted', 'Unsorted', false
from public.topics top
where top.slug = 'v1-unsorted'
on conflict (topic_id, slug) do nothing;

-- Which v1 question became which v2 question. Makes the import re-runnable:
-- v1 rows already listed here are skipped even if their v2 copy was edited.
create table private.v1_question_import (
  v1_question_id  integer primary key,
  v1_qid          text not null unique,
  -- NULL once the v2 question is deleted; the v1 row stays imported.
  question_id     uuid references public.questions (id) on delete set null,
  -- 'inserted' or 'duplicate' (same content_hash as an existing v2 question).
  outcome         text not null check (outcome in ('inserted', 'duplicate')),
  v1_category     text not null,
  v1_status       text,
  -- How the subtopic was chosen: 'keyword:<matched text>', 'keywords:<n>',
  -- 'category:puzzles' or 'unsorted'.
  classified_by   text not null,
  -- Problems found while mapping (no answer key, duplicate options, ...).
  notes           text,
  imported_at     timestamptz not null default now()
);

create index v1_question_import_question_idx on private.v1_question_import (question_id);

revoke all on private.v1_question_import from public, anon, authenticated;
