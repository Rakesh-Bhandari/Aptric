# Import a PDF question bank into Supabase

You are working on **Aptric**, a daily aptitude practice app for Indian placement and competitive exams. I have attached a **PDF question bank** to this session. Your job: turn every usable question in it into a correct, self-contained multiple-choice question and write it to the Supabase database through the Supabase MCP tools (`execute_sql`, and `apply_migration` once if needed). The database is the only output. Do not change code or commit anything.

The PDF may be messy. Questions may come without options, without an answer, with a wrong answer key, with garbled maths, split across columns or pages, or mixed with ads. **You are the examiner.** Nothing goes in unverified: questions you approve are **published immediately** with no human review after you, and a wrong answer key in front of a learner is the worst possible outcome. When you are unsure, the question goes in as `draft` (rules below) rather than as a guess.

## Settings (change these only if I tell you to)

| Setting | Value |
| --- | --- |
| `SOURCE` | `testbook-banking-qa-smartbook` for *Best 4000 Smart Question Bank, Banking, Quantitative Aptitude in English* (Testbook SmartBook / S. Chand). For any other PDF, make a new short slug: publisher + exam + subject, lowercase-hyphenated. |
| `VERSION` | `pdf-import/2026-10-05.1`. It goes into `questions.prompt_version` so the whole import can be found or rolled back. |
| `STATUS` | **`published` (approved)** for every question that passed verification. Do **not** put questions in `in_review`: this session is the reviewer, and verified questions go live to learners right away. Only `unverified` questions (Step 3c) go in as `draft`, out of learners' reach, for an admin to fix. |
| Batch size | 15 questions per `execute_sql` call. |

## Step 0: connect and prepare the database

1. Load the Supabase tools with ToolSearch (`select:mcp__Supabase__list_projects,mcp__Supabase__execute_sql,mcp__Supabase__apply_migration`). Run `list_projects` and use the project named **`aptric`** (ref `wjkrvgnrxqlbmfljczrk` when this prompt was written). Do **not** use `nexathon-2026`. If neither name matches, ask me.

2. Check the import plumbing exists:

   ```sql
   select to_regclass('public.question_sources')                                  as sources_table,
          to_regprocedure('private.import_questions(text,text,jsonb)')            as import_fn,
          (select count(*) from public.subtopics where slug = 'simplification')   as simplification_subtopic;
   ```

   If anything is null or 0, apply the repository migration `supabase/migrations/20261005000001_question_sources.sql` with `apply_migration` (name `question_sources`, query = the file's full contents, unchanged). Then run the check again. That migration adds:
   - `public.question_sources`: one row per (source, ref) with the book's chapter, level, page, printed answer, Correct%/Skipped%, time-to-answer, **the exams the question appeared in**, and a `key_status`.
   - `private.import_questions(source, version, items jsonb)`: an idempotent upsert, described in Step 4.
   - the subtopic `quantitative-aptitude / arithmetic / simplification` ("Simplification & Approximation").

3. Load the taxonomy and tag catalog, so you only use slugs that exist:

   ```sql
   select s.slug as section, t.slug as topic, st.slug as subtopic, st.name
   from public.subtopics st join public.topics t on t.id = st.topic_id join public.sections s on s.id = t.section_id
   where st.is_active order by s.sort_order, t.sort_order, st.sort_order;

   select slug, kind from public.tags order by kind, sort_order, slug;
   ```

4. Resume support. See what this source already has in the database. Skip refs that are already in with a final `key_status` unless I asked for a re-import:

   ```sql
   select qs.ref, qs.key_status, q.status
   from public.question_sources qs join public.questions q on q.id = qs.question_id
   where qs.source = '<SOURCE>' order by qs.ref;
   ```

## Step 1: map the PDF before extracting anything

Get a text layer with page markers. It is fast to search, but **not trustworthy for maths**:

```bash
pdftotext -layout "<pdf>" "<scratchpad>/qb.txt"
awk 'BEGIN{p=1} /\f/{p++} {print p": "$0}' "<scratchpad>/qb.txt" > "<scratchpad>/qbp.txt"
```

Then build a page map: which pages hold questions (chapter, level, question-number range), the answer key, the solutions, and pages to ignore (cover, introduction, tips, ads, "buy now" pages, other books' catalogues). Write it to `<scratchpad>/page-map.md`; it is your checklist for the whole session.

**What the Testbook Banking QA sample (88 pages) looked like when this prompt was written. Verify it; don't trust it blindly:**

| Pages | Content |
| --- | --- |
| 1–12 | Cover, introduction, how-to-use, tips, table of contents (skip). The ToC lists 16 chapters, but this sample PDF contains **only Chapter 1, Simplification**. |
| 13–22 | Simplification **Level 1**, Q1–174 |
| 23, 25–33 | **Level 2**, Q175–334 |
| 34, 36–39 | **Level 3**, Q335–401 |
| 24, 35, 40 | "To Practice 3599 More Questions" ads (skip) |
| 41–43 | **Smart Answer Key** for Q1–401: per question `Ans` (A–E), `Correct %` (printed above) and `Skipped %` (printed below) |
| 44–85 | **Solutions** "Sol 1." … in two columns, same level split (ads on some pages, e.g. 60 and 78) |
| 86–88 | Catalogue / back cover (skip) |

Things to know about this book:
- Each question has **5 options A–E** and a **TTA** ("Time To Answer", in seconds). Keep all 5 options in book order, so `correct_index` = A→0, B→1, C→2, D→3, E→4.
- **Levels:** Level 1 → `easy`, Level 2 → `medium`, Level 3 → `hard`. The book defines who each level is for: L1 = Bank Clerk/PO Prelims, Office Assistant, Cooperative Banks; L2 = Bank Clerk/SO Mains, Officer Scale I, Insurance, Grade B and Grade A Prelims; L3 = SBI PO Mains, IBPS PO Mains, LIC AAO, Grade A Officer, Officer Scale 1 Mains.
- The book does **not** print per-question exam history ("SBI PO 2019" and the like). So `exams` stays `[]` for its questions unless a question itself names an exam. Never invent one.
- The text layer **mangles maths**: `(1/729)2/3` is $(1/729)^{2/3}$, `(21.98)2` is a square, `?3` is $?^3$, and `∛`/`√` signs drift onto other lines. Two-column layout interleaves questions, e.g. Q1 next to Q8, and Sol 1 next to Sol 8.

## Step 2: decide where each chapter goes

Use the chapter's default subtopic below, but classify each question by **what it actually tests** if that is clearly another existing subtopic. Use only slugs that Step 0 returned.

| Book chapter | section / topic / subtopic |
| --- | --- |
| Simplification (incl. Approximation) | `quantitative-aptitude / arithmetic / simplification` |
| Number Series (missing/wrong number) | `logical-reasoning / verbal-reasoning / series` |
| Algebra (banking = quadratic equations, comparing x and y) | `quantitative-aptitude / algebra / equations-and-inequalities` |
| Percentage | `quantitative-aptitude / arithmetic / percentages` |
| Ratio & Proportion | `quantitative-aptitude / arithmetic / ratio-and-proportion` (ages → `problems-on-ages`) |
| Average | `quantitative-aptitude / arithmetic / averages` |
| Interest | `quantitative-aptitude / arithmetic / simple-and-compound-interest` |
| Profit & Loss | `quantitative-aptitude / arithmetic / profit-and-loss` |
| Speed, Time & Distance | `quantitative-aptitude / time-work-distance / time-speed-distance` (trains → `trains`, boats → `boats-and-streams`) |
| Mixture & Allegation | `quantitative-aptitude / arithmetic / mixtures-and-alligations` |
| Time and Work | `quantitative-aptitude / time-work-distance / time-and-work` (pipes → `pipes-and-cisterns`) |
| Permutation, Combination & Probability | `quantitative-aptitude / counting-and-probability / permutations-and-combinations` or `probability` |
| Mensuration | `quantitative-aptitude / geometry-and-mensuration / mensuration` |
| Data Sufficiency | `quantitative-aptitude / data-sufficiency / data-sufficiency` |
| Data Interpretation | `data-interpretation / tables-and-caselets / tables` or `caselets`, `data-interpretation / charts / bar-charts`, `line-graphs` or `pie-charts`, `data-interpretation / mixed / mixed-graphs`, by the data's form |
| Comparison of Quantities | the subtopic of the underlying maths (often `equations-and-inequalities`) |

If a chapter fits no existing subtopic, stop and ask me before creating one.

## Step 3: extract, repair and verify, 15 questions at a time

Work in book order, one level of one chapter at a time. For each batch:

**3a. Read the pages as images.** Use `Read` with `pages` (at most 20 per call; read a few at a time). Transcribe each question from the image, using the text layer only to speed up typing. Also read that question range's answer-key rows and the matching "Sol N." blocks.

**3b. Build each item:**

- `ref`: `<chapter-slug>/q<4-digit book number>`, e.g. `simplification/q0012`. It must be stable: re-imports find the question by it.
- `stem`: self-contained Markdown. Every number, table, passage or direction it needs goes in the stem. Write maths in KaTeX: `$\sqrt{5089} - \sqrt{2641} + \sqrt{1186} = ?$`, `$(21.98)^2$`, `$\frac{3}{4}$`, `$\sqrt[3]{4913}$`, `$12 \times 4 \div 3$`. Keep the book's wording, including "(You are not expected to calculate the exact value)". Fix only obvious typos ("None of theses", "shouldcome", stray spaces in numbers like `456. 18`). For sets of questions sharing one direction, table or caselet, copy the shared data into **every** stem as a Markdown table or paragraph.
- `options`: all of the book's options in book order, no "A)" labels, each written exactly like the stem's maths. They must be distinct and non-empty. "None of these" stays as an option if the book has it.
- `correct_index`: 0-based, from **your verified answer** (3c), not blindly the book's.
- `explanation`: a clean step-by-step Markdown/KaTeX solution of your own, using the book's solution where it is right. It must end at the keyed option's value ("Hence ? ≈ 54."). If "None of these" is correct, state the actual value. For approximation questions, show the rounding and why the keyed option is the closest.
- `hint`: one sentence on the method, without the answer.
- `difficulty`: from the level, as in the Step 1 notes. If a book has no levels, judge it: easy = 1–2 steps, medium = 2–4 steps, hard = multi-step or needs insight.
- `est_seconds`: the book's TTA (clamped to 5–3600). If it has none: easy 45, medium 90, hard 150.
- `difficulty_rating`: if the book gives Correct %, use `round(1600 - 8 * correct_pct)` clamped to 600–2000 (94% → 848, 10% → 1520). Otherwise easy 1000, medium 1200, hard 1400.
- `chapter`, `level`, `page` (the PDF page the question is on), `book_answer` (the printed letter, or null), `correct_pct`, `skipped_pct`, `tta_seconds`: copied from the book; null if absent.
- `exams`: every exam the question is printed as having appeared in, e.g. `(SBI PO Prelims 2019)`, `IBPS Clerk Mains 2020 (Memory Based)`, `[SSC CGL 2018, Shift 2]`, or a section header such as "Previous Year Questions: IBPS PO". Write one object per appearance: `{"exam": "SBI PO", "stage": "Prelims", "year": 2019, "date": "2019-06-08", "shift": "1", "raw": "<as printed>"}`, leaving out unknown fields. Use `[]` if nothing is printed. Never guess.
- `tags` (lowercase-hyphen slugs; new ones are created automatically as `general` tags):
  - always the existing exam tag that fits the book: `bank-po` for banking books, `ssc` for SSC books, and so on (from the Step 0 catalog);
  - the book's target group for the level, if it defines one. For this book: L1 → `bank-prelims`, L2 → `bank-mains`, L3 → `bank-po-mains`;
  - for each **printed** exam appearance: `pyq`, the exam slug and the exam-year slug, e.g. `sbi-po` + `sbi-po-2019`. Exam slugs: SBI PO `sbi-po`, SBI Clerk `sbi-clerk`, IBPS PO `ibps-po`, IBPS Clerk `ibps-clerk`, IBPS SO `ibps-so`, IBPS RRB PO/Officer Scale I `ibps-rrb-po`, IBPS RRB Clerk/Office Assistant `ibps-rrb-clerk`, RBI Grade B `rbi-grade-b`, RBI Assistant `rbi-assistant`, NABARD Grade A `nabard-grade-a`, LIC AAO `lic-aao`, LIC ADO `lic-ado`, NIACL AO `niacl-ao`, SSC CGL `ssc-cgl`, SSC CHSL `ssc-chsl`; others follow the same pattern (≤ 40 characters).
- `key_status`, `status` and `review_note`: from 3c.
- `notes`: anything an admin should know: "options written by importer", "typo fixed in option C", "book solution solves a different question", and so on.

**3c. Verify every question as an examiner.** Solve it yourself from the stem **before** looking at the book's key. Check arithmetic digit by digit, then compare:

| Situation | What to do | `key_status` | `status` |
| --- | --- | --- | --- |
| Your answer = book key, exactly one option correct | use it | `matched` | `STATUS` |
| No book key | solve a second time by a different method; both agree | `supplied` | `STATUS` |
| Your answer ≠ book key | re-read the image (a misread exponent is the usual cause), then solve again by a different method. If both of your solves agree, key **your** answer and say in `notes` and `review_note`: "Book key X is wrong because …" | `corrected` | `STATUS` |
| Still unsure, two options defensible, or data missing or illegible | insert with your best key plus `review_note` starting `IMPORT-UNVERIFIED:` and the reason | `unverified` | `draft` |
| **No options in the book** (open-ended question) | write 4 options: the correct value plus 3 plausible distractors from common mistakes; correct option at a varied position; check that no distractor is also correct; note "options written by importer" | `supplied` | `STATUS` |
| Options partly garbled | rebuild them only if the image, solution or answer key makes them certain; otherwise treat as unverified | as above | as above |
| Needs a figure, graph or image you can't render exactly as text or a table (geometry figures, unreadable charts, dice nets) | **skip it**: do not insert; list it in the final report | n/a | n/a |
| Not a question (example, theory, ad) or unrecoverable | skip it and list it | n/a | n/a |

For **approximation** questions ("What approximate value…"), the keyed option must be the clear closest. If two options are about equally close, it is `unverified`. Also check that no wrong option is also defensible, that the explanation agrees with the key, and that the stem makes sense on its own.

## Step 4: write each batch

Send each verified batch with one `execute_sql` call: exactly this statement, replacing only `<SOURCE>`, `<VERSION>` and the JSON array between the `$json$` markers. The JSON must be valid: escape backslashes in KaTeX (`\\sqrt`, `\\frac`, `\\times`) and double quotes (`\"`). No other SQL escaping is needed inside `$json$`.

```sql
select jsonb_pretty(private.import_questions('<SOURCE>', '<VERSION>', $json$
[
  {"ref": "simplification/q0003", "section": "quantitative-aptitude", "topic": "arithmetic", "subtopic": "simplification",
   "stem": "What approximate value will come in place of the question mark (?) in the following question?\n\n$\\sqrt{5089} - \\sqrt{2641} + \\sqrt{1186} = ?$",
   "options": ["54", "90", "43", "25", "38"], "correct_index": 0,
   "explanation": "Take the nearest perfect squares: $5089 \\approx 5041 = 71^2$, $2641 \\approx 2601 = 51^2$, $1186 \\approx 1156 = 34^2$.\n\n$71 - 51 + 34 = 54$.\n\nHence ? ≈ **54**.",
   "hint": "Replace each number under the root with the nearest perfect square.",
   "difficulty": "easy", "est_seconds": 62, "difficulty_rating": 1144,
   "tags": ["bank-po", "bank-prelims"], "status": "published", "review_note": null,
   "chapter": "Simplification", "level": 1, "page": 13, "book_answer": "A", "key_status": "matched",
   "correct_pct": 57, "skipped_pct": 35, "tta_seconds": 62, "exams": [], "notes": null}
]
$json$::jsonb));
```

The function handles each item in its own subtransaction and returns one result per item:

| `outcome` | Meaning | Action |
| --- | --- | --- |
| `inserted` | new question, options, answer key, tags and source row written | none |
| `updated` | this source created this question on an earlier run; its content, key or status changed in place (option ids kept, so attempt history stays valid). A published question you now mark `unverified` goes back to `draft`. | none |
| `unchanged` | re-run with identical content | none |
| `linked_existing` | an identical question (same normalised stem + options) is already in the bank; its content was left alone, and your tags and source/exam row were attached to it | note it in the report |
| `kept` | the question belongs to another source, or an admin retired it: only tags and the source row were refreshed | if your new key differs, list it in the report for a human; don't touch it |
| `error` | nothing was saved for that item; `error` says why (unknown subtopic, duplicate options, index out of range, empty explanation, content collides with another question, …) | fix the item and resend **only** the failed items |

Keep a running tally of outcomes and of every `corrected`, `unverified` and skipped question, with its reason, in `<scratchpad>/import-log.md`. If the session gets long, that file and the Step 0 resume query are how you pick up where you left off.

## Step 5: confirm

```sql
select qs.chapter, qs.level, q.difficulty, q.status, qs.key_status, count(*) as n,
       count(a.question_id) as with_key,
       count(*) filter (where jsonb_array_length(qs.exams) > 0) as with_exam_history
from public.question_sources qs
join public.questions q on q.id = qs.question_id
left join public.question_answers a on a.question_id = q.id
where qs.source = '<SOURCE>'
group by 1, 2, 3, 4, 5 order by 1, 2, 4, 5;
```

Every row must have `with_key = n`, and every row with `key_status` other than `unverified` must be `published`. Spot-check 10 random published questions by reading them back (stem, options, keyed option, explanation) and re-solving them.

Then report to me:
1. Totals per chapter and level: questions in the PDF, inserted, updated, linked to existing, kept, skipped, errors.
2. Key status totals: matched, supplied, corrected, unverified.
3. A table of every **corrected** key (ref, book answer, your answer, one-line reason) and every **unverified** or **skipped** question (ref, page, reason).
4. Exam history found (how many questions had printed exam appearances, and which exams), or "none printed in this PDF".
5. Anything systematic, e.g. a run of misprinted keys or a page you couldn't read.

## Undo

Take this import back out. Questions nobody has played yet are deleted; questions already played (or used in a daily set or contest) are retired, so learners' history stays intact:

```sql
update public.questions q set status = 'retired'
where q.prompt_version = '<VERSION>' and q.source = 'import' and q.status <> 'retired'
  and (exists (select 1 from public.attempts a where a.question_id = q.id)
    or exists (select 1 from public.daily_set_items d where d.question_id = q.id)
    or exists (select 1 from public.contest_items c where c.question_id = q.id));
delete from public.questions q
where q.prompt_version = '<VERSION>' and q.source = 'import' and q.status <> 'retired';
-- Source rows of deleted questions go with them (on delete cascade). This also
-- drops the links this import attached to questions it did not create:
delete from public.question_sources qs
using public.questions q
where qs.source = '<SOURCE>' and q.id = qs.question_id and q.prompt_version is distinct from '<VERSION>';
```
