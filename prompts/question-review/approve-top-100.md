# Review and approve the next 100 questions in the queue

You are working on **Aptric**, a daily aptitude practice app for Indian placement and competitive exams. Your job in this session is to act as the examiner for the **100 oldest questions waiting in the review queue** (`status = 'in_review'`). Solve each question yourself and decide whether to publish, fix, or retire it. Then write the decision to Supabase using the Supabase MCP tools (`execute_sql`). Do not write files or change code. The database is the only output.

Publishing a question puts it in front of learners. A wrong answer key in a published question is the worst outcome, so **when in doubt, don't publish.**

## Step 1: find the project and lock in the 100 questions

Load the Supabase MCP tools (use ToolSearch for `execute_sql` and `list_projects` if they are deferred). Then pick the Aptric project with `list_projects`. If more than one project could be it, ask me. Then run:

```sql
select count(*) as in_review from public.questions where status = 'in_review';
```

If it is 0, stop and tell me. Otherwise, take the snapshot. "Top 100" means the oldest first, the same order as the admin review queue:

```sql
select q.id
from public.questions q
where q.status = 'in_review'
order by q.created_at, q.id
limit 100;
```

Keep this list of ids for the whole session and work only on these questions, even if new ones arrive. If fewer than 100 come back, review all of them.

## Step 2: review in batches of 10

Go through the snapshot 10 ids at a time. For each batch:

### 2a. Read the questions *without* the answer key

```sql
select q.id, s.name as section, t.name as topic, st.name as subtopic,
       q.difficulty, q.est_seconds, q.stem,
       (select jsonb_agg(jsonb_build_object('position', o.position, 'body', o.body) order by o.position)
        from public.question_options o where o.question_id = q.id) as options
from public.questions q
join public.subtopics st on st.id = q.subtopic_id
join public.topics t     on t.id = st.topic_id
join public.sections s   on s.id = t.section_id
where q.id = any ('{<id1>,<id2>,...}'::uuid[])
  and q.status = 'in_review'
order by q.created_at, q.id;
```

### 2b. Solve every question from scratch

Before you look at the key, solve each question independently, the way an examiner would. Show the working to yourself, check the arithmetic digit by digit, and write down which option position (0-based) you get. For each question also check:

- The stem is self-contained: every number, fact, table or code it needs is there, and nothing is ambiguous.
- **Exactly one** option is correct, and no wrong option can also be defended.
- The options are distinct and the distractors are plausible.
- The stated difficulty is roughly right. Don't change it; just mention a mismatch in the note.

### 2c. Compare with the stored key

```sql
select a.question_id, o.position as keyed_position, a.explanation, a.hint
from public.question_answers a
join public.question_options o on o.id = a.correct_option_id
where a.question_id = any ('{<id1>,<id2>,...}'::uuid[]);
```

Decide one outcome per question:

| decision | when |
| --- | --- |
| `approve` | Your answer matches the keyed position, exactly one option is correct, the stem is sound, and the explanation is correct and reaches the keyed option. |
| `fix` | The stem and options are sound with exactly one correct option, but the **key is wrong** or the **explanation is wrong or unclear**. Give the correct `correct_position` (it can be the same as the keyed one if only the explanation is bad) and a full corrected step-by-step Markdown `explanation`. The question is then published with the fix. |
| `reject` | The question is broken and can't be fixed without rewriting the stem or options: no correct option, two defensible options, missing data, factual errors, or a trivial duplicate of another question in the batch. It is retired. |
| `hold` | You are genuinely unsure, for example two careful solves disagree, or the stem or an option needs a small wording edit. It stays `in_review` with your note, for a human. |

If you got a different answer from the key, solve it a **second time** by a different method before you choose `fix`. If the two solves still disagree, choose `hold`.

Never edit stems or options in this session. Their `content_hash` is the dedupe key and the answer key points at option ids.

### 2d. Write the batch's decisions

Run this exact statement once per batch, replacing only the JSON array between the `$json$` markers. The JSON must be valid: escape backslashes (`\\frac`) and double quotes (`\"`) inside strings. Every item needs `id` and `decision`. `note` is a one-line reason (required for `fix`, `reject` and `hold`, optional for `approve`). `correct_position` and `explanation` are used only for `fix`. Leave `explanation` null to keep the stored one.

```sql
with d as (
  select *
  from jsonb_to_recordset($json$
[
  {"id": "00000000-0000-0000-0000-000000000000", "decision": "approve", "correct_position": null, "explanation": null, "note": null}
]
$json$::jsonb) as x(id uuid, decision text, correct_position int, explanation text, note text)
  where x.decision in ('approve', 'fix', 'reject', 'hold')
),
target as (
  select q.id
  from public.questions q
  join d on d.id = q.id
  where q.status = 'in_review'
  for update of q
),
fixed as (
  update public.question_answers a set
    correct_option_id = o.id,
    explanation       = coalesce(nullif(btrim(d.explanation), ''), a.explanation)
  from d
  join target t on t.id = d.id
  join public.question_options o on o.question_id = d.id and o.position = d.correct_position
  where a.question_id = d.id and d.decision = 'fix'
  returning a.question_id
),
decided as (
  select d.id, d.decision, nullif(btrim(d.note), '') as note,
         case when d.decision = 'reject' then 'retired' else 'published' end::public.question_status as new_status
  from d
  join target t on t.id = d.id
  where d.decision = 'reject'
     or (   (d.decision = 'approve' or d.id in (select question_id from fixed))
        and exists (select 1 from public.question_answers a where a.question_id = d.id)
        and (select count(*) from public.question_options o where o.question_id = d.id) >= 2)
),
changed as (
  update public.questions q set
    status      = x.new_status,
    reviewed_at = now(),
    review_note = x.note
  from decided x
  where q.id = x.id
  returning q.id, q.status
),
held as (
  update public.questions q set
    reviewed_at = now(),
    review_note = nullif(btrim(d.note), '')
  from d
  join target t on t.id = d.id
  where q.id = d.id and d.decision = 'hold'
  returning q.id
),
logged as (
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  select null,
         case when c.status = 'published' then 'approve' else 'reject' end,
         'questions', c.id::text,
         jsonb_build_object('status', 'in_review'),
         jsonb_build_object('status', c.status, 'note', x.note, 'via', 'claude-code-review',
                            'answer_fixed', x.decision = 'fix')
  from changed c
  join decided x on x.id = c.id
  returning 1
)
select (select count(*) from d)                                                as decisions,
       (select count(*) from target)                                           as still_in_review,
       (select count(*) from changed where status = 'published')               as published,
       (select count(*) from fixed)                                            as keys_fixed,
       (select count(*) from changed where status = 'retired')                 as retired,
       (select count(*) from held)                                             as held,
       (select count(*) from d join target t on t.id = d.id where d.decision = 'fix')
         - (select count(*) from fixed)                                        as fix_failed,
       (select count(*) from logged)                                           as audited;
```

Check the result before moving on:

- `decisions` must equal the number of items you sent. If it is lower, a `decision` value was misspelled.
- `still_in_review` lower than `decisions` means someone else already decided those questions. Skip them and note it.
- `fix_failed` above 0 means a `correct_position` didn't match an option. That question was not published. Correct it and resend just that item.
- `published + retired + held` must equal `still_in_review`.

If the statement errors, nothing in that batch was saved. Fix the JSON and run it again.

## Step 3: confirm

After all batches:

```sql
select q.status, count(*) as questions, count(*) filter (where q.published_at is not null) as stamped
from public.questions q
where q.id = any ('{<all 100 snapshot ids>}'::uuid[])
group by q.status
order by q.status;
```

Every published question must have `published_at` set (a trigger stamps it). Then tell me:

1. Totals: published (of which key or explanation fixed), retired, held, skipped.
2. A short table of every `fix`, `reject` and `hold`: id, subtopic, and the one-line reason.
3. Any pattern you noticed, for example a subtopic with many wrong keys. That is worth checking in its generator prompt.

To undo a mistaken publish later: `update public.questions set status = 'in_review' where id = '<id>';`. The row audit trigger records every change.
