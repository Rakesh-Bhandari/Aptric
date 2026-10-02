# Generate 50 questions: Quantitative Aptitude › Arithmetic › Percentages

You are working on **Aptric**, a daily aptitude practice app for Indian placement and competitive exams. Your job in this session: write **50 original multiple-choice questions** for one subtopic and store them directly in the Supabase database using the Supabase MCP tools (`execute_sql`). Do not write files or change code; the database is the only output.

## Target

| | |
| --- | --- |
| Section | Quantitative Aptitude (`quantitative-aptitude`) |
| Topic | Arithmetic (`arithmetic`) |
| Subtopic | Percentages (`percentages`) |
| Count | 50: 15 easy, 25 medium, 10 hard |

**Cover:** percentage change, successive increases/decreases, fraction-percentage conversions, population and depreciation, election and examination (pass mark) problems, income/expenditure and savings, price-consumption (expenditure constant), "x% more than / less than" comparisons. Spread the 50 questions across all of these; no single idea should take more than about a fifth of the set.

**Difficulty:**
- **easy**: one or two steps, a single standard formula or idea; under a minute for a prepared candidate.
- **medium**: two to four steps or a combination of two ideas; typical of TCS NQT, AMCAT and Infosys.
- **hard**: multi-step reasoning, a non-obvious insight or careful case analysis; the hard end of CAT / bank PO, still solvable without a calculator in under four minutes.

## Step 1: check the database

Load the Supabase MCP tools (use ToolSearch for `execute_sql` and `list_projects` if they are deferred) and pick the Aptric project (`list_projects`; ask me if more than one could be it). Then run:

```sql
select st.id as subtopic_id,
       (select count(*) from public.questions q where q.subtopic_id = st.id and q.status <> 'retired') as existing
from public.subtopics st
join public.topics t   on t.id = st.topic_id
join public.sections s on s.id = t.section_id
where s.slug = 'quantitative-aptitude' and t.slug = 'arithmetic' and st.slug = 'percentages';
```

If no row comes back, stop and tell me: the taxonomy is not seeded. If `existing` is above 0, read the existing stems so you don't repeat them:

```sql
select q.difficulty, left(q.stem, 300) as stem
from public.questions q
where q.subtopic_id = '<subtopic_id>' and q.status <> 'retired'
order by q.created_at desc
limit 200;
```

## Step 2: write the questions (in 5 batches of 10)

Work in batches of 10 (each batch a mix of difficulties; across all five batches hit exactly 15 easy / 25 medium / 10 hard). For every question produce:

- `stem`: the full question in Markdown, self-contained (every number, fact, table or code it needs). Use KaTeX for maths (`$\frac{3}{4}$`, `$x^2$`). Vary names, contexts and numbers; Indian context (₹, Indian names and cities) is welcome. No trivially reworded copies of another question (same structure with only numbers or names changed).
- `options`: exactly 4 distinct strings, no "A)"/"1." labels. Wrong options must be plausible (the results of common mistakes). Never "None of these" or "All of the above" (except where the format for this subtopic says otherwise).
- `correct_index`: 0-based index (0–3) of the single correct option. Spread the correct answer evenly over positions 0–3.
- `difficulty`: `easy`, `medium` or `hard`.
- `est_seconds`: seconds a prepared candidate needs (about 30–60 easy, 60–120 medium, 120–240 hard).
- `explanation`: a step-by-step Markdown solution that ends at the correct option.
- `hint`: one sentence pointing to the method without giving the answer, or `null`.
- `tags`: 1–3 exam tags from `tcs-nqt`, `infosys`, `amcat`, `cat`, `bank-po`, `ssc` that the question style fits.

**Verify before inserting.** For every question, solve it again from scratch without looking at your key, as an examiner would. Check the arithmetic digit by digit, that exactly one option is correct, that no wrong option is also defensible, and that the explanation agrees with the keyed option. Fix or replace any question that fails. Quality over speed: a wrong answer key is the worst possible outcome.

## Step 3: insert each batch

Insert each verified batch with one `execute_sql` call using exactly this statement, replacing only the JSON array between the `$json$` markers. The JSON must be valid: escape backslashes (`\\frac`) and double quotes (`\"`) inside strings; no other SQL escaping is needed inside the `$json$` quotes. Questions go in as `in_review`, so an admin approves them in the review queue before learners see them.

```sql
with sub as (
  select st.id
  from public.subtopics st
  join public.topics t   on t.id = st.topic_id
  join public.sections s on s.id = t.section_id
  where s.slug = 'quantitative-aptitude' and t.slug = 'arithmetic' and st.slug = 'percentages'
),
input as (
  select distinct on (h.hash) x.*, h.opts, h.hash
  from jsonb_to_recordset($json$
[
  {"stem": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "difficulty": "easy",
   "est_seconds": 45, "explanation": "...", "hint": "...", "tags": ["tcs-nqt"]}
]
$json$::jsonb) as x(stem text, options jsonb, correct_index int, difficulty public.question_difficulty,
                    est_seconds int, explanation text, hint text, tags text[])
  cross join lateral (
    select array(select jsonb_array_elements_text(x.options)) as opts,
           private.content_hash(x.stem, array(select jsonb_array_elements_text(x.options))) as hash
  ) h
  where jsonb_array_length(x.options) = 4 and x.correct_index between 0 and 3
  order by h.hash
),
new_q as (
  insert into public.questions (subtopic_id, stem, difficulty, est_seconds, status, source, content_hash, model, prompt_version)
  select sub.id, i.stem, i.difficulty, i.est_seconds, 'in_review', 'ai', i.hash, 'claude-code', 'claude-code-bank/2026-10-02.1'
  from input i cross join sub
  on conflict (content_hash) do nothing
  returning id, content_hash
),
new_opts as (
  insert into public.question_options (question_id, position, body)
  select q.id, (o.ord - 1)::smallint, o.body
  from new_q q
  join input i on i.hash = q.content_hash
  cross join lateral unnest(i.opts) with ordinality as o (body, ord)
  returning id, question_id, position
),
new_keys as (
  insert into public.question_answers (question_id, correct_option_id, explanation, hint)
  select q.id, o.id, i.explanation, nullif(i.hint, '')
  from new_q q
  join input i    on i.hash = q.content_hash
  join new_opts o on o.question_id = q.id and o.position = i.correct_index
  returning question_id
),
new_tags as (
  insert into public.question_tags (question_id, tag)
  select distinct q.id, tg
  from new_q q
  join input i on i.hash = q.content_hash
  cross join lateral unnest(i.tags) as tg
  where tg in (select slug from public.tags)
  returning question_id
)
select (select count(*) from input)    as valid_unique,
       (select count(*) from new_q)    as inserted,
       (select count(*) from new_keys) as keyed,
       (select count(*) from new_tags) as tags_added;
```

`valid_unique` below 10 means some items had the wrong option count, an out-of-range `correct_index`, or duplicated another item in the batch. `inserted` below `valid_unique` means those questions already exist in the bank (same normalised stem and options). `keyed` must equal `inserted`. Write replacements for anything that was dropped, so the subtopic ends with 50 new questions. If the statement errors, nothing in that batch was saved: fix the JSON and run it again.

## Step 4: confirm

```sql
select q.difficulty, count(*) as questions, count(a.question_id) as with_answer_key
from public.questions q
left join public.question_answers a on a.question_id = q.id
where q.subtopic_id = '<subtopic_id>' and q.prompt_version = 'claude-code-bank/2026-10-02.1'
group by q.difficulty
order by q.difficulty;
```

Every question must have an answer key, and the counts must be 15 easy, 25 medium, 10 hard (more if this prompt was run before). Finish by telling me the totals per difficulty, how many were dropped as duplicates, and anything you were unsure about.
