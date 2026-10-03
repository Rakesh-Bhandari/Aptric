# Question import prompts

[import-pdf-question-bank.md](import-pdf-question-bank.md) imports a PDF question bank (with or without options, answer keys or solutions) into Supabase. It verifies every question, repairs or completes options and keys, and records the source and the exams each question appeared in.

**How to use:** open a new Claude Code session on this repo with the Supabase connector enabled, attach the PDF, and paste the prompt. It was written against *Best 4000 Smart Question Bank, Banking, Quantitative Aptitude in English* (Testbook SmartBook); for another book, tell the session the new `SOURCE` slug.

It relies on `supabase/migrations/20261005000001_question_sources.sql`, which the session applies if the project doesn't have it yet:

- `public.question_sources`: per (source, ref), with the book's chapter, level, page, printed answer, Correct %/Skipped %, time-to-answer, exams appeared in, and whether our key matched, corrected or supplied the book's.
- `private.import_questions(source, version, items)`: an idempotent upsert, so re-running the prompt updates questions in place instead of duplicating them.
- the subtopic `quantitative-aptitude / arithmetic / simplification`.

Imported questions land as `in_review` (or `draft` when unverified) with `source = 'import'` and `prompt_version = 'pdf-import/…'`:

```sql
select qs.key_status, q.status, count(*)
from public.question_sources qs join public.questions q on q.id = qs.question_id
where qs.source = 'testbook-banking-qa-smartbook'
group by 1, 2;
```
