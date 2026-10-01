-- Local development seed (runs on `supabase db reset`, never on remote).
insert into public.sections (slug, name, sort_order) values
  ('quantitative-aptitude', 'Quantitative Aptitude', 1),
  ('logical-reasoning',     'Logical Reasoning',     2),
  ('verbal-ability',        'Verbal Ability',        3),
  ('data-interpretation',   'Data Interpretation',   4),
  ('puzzles',               'Puzzles',               5),
  ('technical-aptitude',    'Technical Aptitude',    6)
on conflict (slug) do nothing;
