-- Seed taxonomy (sections > topics > subtopics) and the tag catalog with exam tags.
--
-- Rows are inserted ON CONFLICT DO NOTHING (by slug), so admin edits made
-- after this migration are never overwritten and existing rows are kept.

-- ---------------------------------------------------------------------------
-- Tag catalog. question_tags.tag must now name a row here.
-- ---------------------------------------------------------------------------
create type public.tag_kind as enum ('exam', 'general');

create table public.tags (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name         text not null check (char_length(name) between 1 and 80),
  kind         public.tag_kind not null default 'general',
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tags_kind_idx on public.tags (kind, sort_order);

insert into public.tags (slug, name, kind, sort_order) values
  ('tcs-nqt',  'TCS NQT',  'exam', 1),
  ('infosys',  'Infosys',  'exam', 2),
  ('amcat',    'AMCAT',    'exam', 3),
  ('cat',      'CAT',      'exam', 4),
  ('gate',     'GATE',     'exam', 5),
  ('bank-po',  'Bank PO',  'exam', 6),
  ('ssc',      'SSC',      'exam', 7)
on conflict (slug) do nothing;

-- Tags already in use become 'general' catalog entries so the FK can be added.
insert into public.tags (slug, name)
select distinct tag, tag from public.question_tags
on conflict (slug) do nothing;

alter table public.question_tags
  add constraint question_tags_tag_fkey foreign key (tag)
    references public.tags (slug) on update cascade on delete restrict;

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function private.set_updated_at();
create trigger tags_audit
  after insert or update or delete on public.tags
  for each row execute function private.audit_row_change();

alter table public.tags enable row level security;

revoke all on public.tags from anon;
grant select, insert, update, delete on public.tags to authenticated;

create policy "tags: read active" on public.tags
  for select to authenticated
  using (is_active or (select private.is_admin()));
create policy "tags: admin insert" on public.tags
  for insert to authenticated with check ((select private.is_admin()));
create policy "tags: admin update" on public.tags
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "tags: admin delete" on public.tags
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------
insert into public.sections (slug, name, description, sort_order) values
  ('quantitative-aptitude', 'Quantitative Aptitude', 'Arithmetic, algebra, geometry and counting.',             1),
  ('logical-reasoning',     'Logical Reasoning',     'Verbal, analytical and non-verbal reasoning.',            2),
  ('verbal-ability',        'Verbal Ability',        'Reading, grammar and vocabulary.',                        3),
  ('data-interpretation',   'Data Interpretation',   'Reading and computing from tables, charts and caselets.', 4),
  ('technical-aptitude',    'Technical Aptitude',    'Programming and computer science fundamentals.',          5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Topics and subtopics
-- ---------------------------------------------------------------------------
create temporary table taxonomy_seed (
  section_slug  text,
  topic_slug    text,
  topic_name    text,
  topic_order   integer,
  sub_slug      text,
  sub_name      text,
  sub_order     integer
);

insert into taxonomy_seed values
  -- Quantitative Aptitude
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'number-system',               'Number System',               1),
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'percentages',                 'Percentages',                 2),
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'profit-and-loss',             'Profit & Loss',               3),
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'simple-and-compound-interest','Simple & Compound Interest',  4),
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'ratio-and-proportion',        'Ratio & Proportion',          5),
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'averages',                    'Averages',                    6),
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'mixtures-and-alligations',    'Mixtures & Alligations',      7),
  ('quantitative-aptitude', 'arithmetic',               'Arithmetic',               1, 'problems-on-ages',            'Problems on Ages',            8),
  ('quantitative-aptitude', 'time-work-distance',       'Time, Work & Distance',    2, 'time-and-work',               'Time & Work',                 1),
  ('quantitative-aptitude', 'time-work-distance',       'Time, Work & Distance',    2, 'pipes-and-cisterns',          'Pipes & Cisterns',            2),
  ('quantitative-aptitude', 'time-work-distance',       'Time, Work & Distance',    2, 'time-speed-distance',         'Time, Speed & Distance',      3),
  ('quantitative-aptitude', 'time-work-distance',       'Time, Work & Distance',    2, 'trains',                      'Problems on Trains',          4),
  ('quantitative-aptitude', 'time-work-distance',       'Time, Work & Distance',    2, 'boats-and-streams',           'Boats & Streams',             5),
  ('quantitative-aptitude', 'counting-and-probability', 'Counting & Probability',   3, 'permutations-and-combinations','Permutations & Combinations',1),
  ('quantitative-aptitude', 'counting-and-probability', 'Counting & Probability',   3, 'probability',                 'Probability',                 2),
  ('quantitative-aptitude', 'geometry-and-mensuration', 'Geometry & Mensuration',   4, 'mensuration',                 'Mensuration',                 1),
  ('quantitative-aptitude', 'geometry-and-mensuration', 'Geometry & Mensuration',   4, 'geometry',                    'Geometry',                    2),
  ('quantitative-aptitude', 'algebra',                  'Algebra',                  5, 'equations-and-inequalities',  'Equations & Inequalities',    1),
  ('quantitative-aptitude', 'algebra',                  'Algebra',                  5, 'progressions',                'Progressions',                2),
  ('quantitative-aptitude', 'algebra',                  'Algebra',                  5, 'logarithms',                  'Logarithms',                  3),
  ('quantitative-aptitude', 'data-sufficiency',         'Data Sufficiency',         6, 'data-sufficiency',            'Data Sufficiency',            1),
  -- Logical Reasoning
  ('logical-reasoning',     'verbal-reasoning',         'Verbal Reasoning',         1, 'series',                      'Number & Letter Series',      1),
  ('logical-reasoning',     'verbal-reasoning',         'Verbal Reasoning',         1, 'coding-decoding',             'Coding-Decoding',             2),
  ('logical-reasoning',     'verbal-reasoning',         'Verbal Reasoning',         1, 'blood-relations',             'Blood Relations',             3),
  ('logical-reasoning',     'verbal-reasoning',         'Verbal Reasoning',         1, 'direction-sense',             'Direction Sense',             4),
  ('logical-reasoning',     'arrangements-and-puzzles', 'Arrangements & Puzzles',   2, 'seating-arrangement',         'Seating Arrangement',         1),
  ('logical-reasoning',     'arrangements-and-puzzles', 'Arrangements & Puzzles',   2, 'puzzles',                     'Puzzles',                     2),
  ('logical-reasoning',     'arrangements-and-puzzles', 'Arrangements & Puzzles',   2, 'input-output',                'Input-Output',                3),
  ('logical-reasoning',     'deductive-reasoning',      'Deductive Reasoning',      3, 'syllogism',                   'Syllogism',                   1),
  ('logical-reasoning',     'deductive-reasoning',      'Deductive Reasoning',      3, 'statement-and-conclusion',    'Statement & Conclusion',      2),
  ('logical-reasoning',     'clocks-and-calendars',     'Clocks & Calendars',       4, 'clocks',                      'Clocks',                      1),
  ('logical-reasoning',     'clocks-and-calendars',     'Clocks & Calendars',       4, 'calendars',                   'Calendars',                   2),
  ('logical-reasoning',     'non-verbal-reasoning',     'Non-Verbal Reasoning',     5, 'cubes-and-dice',              'Cubes & Dice',                1),
  ('logical-reasoning',     'non-verbal-reasoning',     'Non-Verbal Reasoning',     5, 'venn-diagrams',               'Venn Diagrams',               2),
  -- Verbal Ability
  ('verbal-ability',        'reading',                  'Reading',                  1, 'reading-comprehension',       'Reading Comprehension',       1),
  ('verbal-ability',        'reading',                  'Reading',                  1, 'para-jumbles',                'Para Jumbles',                2),
  ('verbal-ability',        'reading',                  'Reading',                  1, 'cloze-test',                  'Cloze Test',                  3),
  ('verbal-ability',        'grammar',                  'Grammar & Usage',          2, 'sentence-correction',         'Sentence Correction',         1),
  ('verbal-ability',        'grammar',                  'Grammar & Usage',          2, 'fill-in-the-blanks',          'Fill in the Blanks',          2),
  ('verbal-ability',        'vocabulary',               'Vocabulary',               3, 'synonyms-and-antonyms',       'Synonyms & Antonyms',         1),
  ('verbal-ability',        'vocabulary',               'Vocabulary',               3, 'idioms-and-phrases',          'Idioms & Phrases',            2),
  -- Data Interpretation
  ('data-interpretation',   'tables-and-caselets',      'Tables & Caselets',        1, 'tables',                      'Tables',                      1),
  ('data-interpretation',   'tables-and-caselets',      'Tables & Caselets',        1, 'caselets',                    'Caselets',                    2),
  ('data-interpretation',   'charts',                   'Charts',                   2, 'bar-charts',                  'Bar Charts',                  1),
  ('data-interpretation',   'charts',                   'Charts',                   2, 'line-graphs',                 'Line Graphs',                 2),
  ('data-interpretation',   'charts',                   'Charts',                   2, 'pie-charts',                  'Pie Charts',                  3),
  ('data-interpretation',   'mixed-di',                 'Mixed',                    3, 'mixed-graphs',                'Mixed Graphs',                1),
  -- Technical Aptitude
  ('technical-aptitude',    'programming',              'Programming',              1, 'output-prediction',           'Output Prediction',           1),
  ('technical-aptitude',    'programming',              'Programming',              1, 'oop',                         'Object-Oriented Programming', 2),
  ('technical-aptitude',    'programming',              'Programming',              1, 'dsa',                         'Data Structures & Algorithms',3),
  ('technical-aptitude',    'cs-fundamentals',          'CS Fundamentals',          2, 'dbms',                        'DBMS',                        1),
  ('technical-aptitude',    'cs-fundamentals',          'CS Fundamentals',          2, 'operating-systems',           'Operating Systems',           2),
  ('technical-aptitude',    'cs-fundamentals',          'CS Fundamentals',          2, 'computer-networks',           'Computer Networks',           3);

insert into public.topics (section_id, slug, name, sort_order)
select distinct sec.id, t.topic_slug, t.topic_name, t.topic_order
from taxonomy_seed t
join public.sections sec on sec.slug = t.section_slug
on conflict (section_id, slug) do nothing;

insert into public.subtopics (topic_id, slug, name, sort_order)
select top.id, t.sub_slug, t.sub_name, t.sub_order
from taxonomy_seed t
join public.sections sec on sec.slug = t.section_slug
join public.topics top on top.section_id = sec.id and top.slug = t.topic_slug
on conflict (topic_id, slug) do nothing;

drop table taxonomy_seed;
