-- Where an imported question came from: the book or paper, its number there,
-- the book's own answer key and stats, and the exams it appeared in. One row
-- per (source, ref), so re-running an import finds and updates the same
-- question instead of inserting a copy. Admin-only, like question_answers.

create table public.question_sources (
  question_id   uuid not null references public.questions (id) on delete cascade,
  -- Stable slug for the book/paper, e.g. 'testbook-banking-qa-smartbook'.
  source        text not null check (source ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(source) <= 80),
  -- Stable id inside the source, e.g. 'simplification/q0012'.
  ref           text not null check (char_length(ref) between 1 and 120),
  chapter       text check (char_length(chapter) <= 120),
  level         smallint check (level between 1 and 9),
  page          integer check (page > 0),
  -- The book's printed key as written (a letter like 'C'), null when it has none.
  book_answer   text check (char_length(book_answer) <= 20),
  -- matched: our solve agrees with the book; corrected: the book key was wrong;
  -- supplied: the book had no key and we solved it; unverified: kept in review.
  key_status    text not null check (key_status in ('matched', 'corrected', 'supplied', 'unverified')),
  correct_pct   numeric(5, 2) check (correct_pct between 0 and 100),
  skipped_pct   numeric(5, 2) check (skipped_pct between 0 and 100),
  tta_seconds   integer check (tta_seconds > 0),
  -- Exams the question appeared in, as printed: [{"exam": "SBI PO Prelims", "year": 2019, "date": "2019-06-08", "shift": "1"}].
  exams         jsonb not null default '[]'::jsonb check (jsonb_typeof(exams) = 'array'),
  notes         text check (char_length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (source, ref)
);

create index question_sources_question_idx on public.question_sources (question_id);

create trigger question_sources_set_updated_at
  before update on public.question_sources
  for each row execute function private.set_updated_at();
create trigger question_sources_audit
  after insert or update or delete on public.question_sources
  for each row execute function private.audit_row_change();

alter table public.question_sources enable row level security;

revoke all on public.question_sources from anon;
revoke all on public.question_sources from authenticated;
grant select on public.question_sources to authenticated;

create policy "question_sources: admin read" on public.question_sources
  for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Taxonomy: banking books open with a Simplification & Approximation chapter
-- (BODMAS, surds, "approximate value of ?") that no existing subtopic covers.
-- ---------------------------------------------------------------------------
insert into public.subtopics (topic_id, slug, name, description, sort_order)
select t.id, 'simplification', 'Simplification & Approximation',
       'BODMAS, fractions, powers and roots, and approximate-value questions.', 9
from public.topics t
join public.sections s on s.id = t.section_id
where s.slug = 'quantitative-aptitude' and t.slug = 'arithmetic'
on conflict (topic_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Bulk import / re-import of questions from a source (run as postgres, e.g.
-- through the Supabase MCP execute_sql tool; not callable by app users).
--
-- p_items is a JSON array; each item:
--   ref, section, topic, subtopic (slugs), stem, options (2-10 strings),
--   correct_index (0-based), explanation, hint?, difficulty, est_seconds?,
--   difficulty_rating?, tags?[], status? ('draft'|'in_review'|'published'),
--   review_note?, chapter?, level?, page?, book_answer?, key_status,
--   correct_pct?, skipped_pct?, tta_seconds?, exams?[], notes?
--
-- Per item, in its own subtransaction (one bad item never loses the batch):
--   * (source, ref) already imported and still draft/in_review -> update that
--     question in place (options matched by position so attempts stay valid)
--   * (source, ref) already imported but published/retired, or linked to a
--     question from elsewhere -> keep its content, refresh tags and source row
--   * same content_hash already in the bank -> leave its content alone, add
--     the tags and link this source row to it
--   * otherwise insert a new question (source 'import').
-- Status only ever moves forward (draft -> in_review -> published).
-- Returns one {ref, outcome, question_id?, error?} per item.
-- ---------------------------------------------------------------------------
create or replace function private.import_questions(
  p_source  text,
  p_version text,
  p_items   jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  it        jsonb;
  results   jsonb := '[]'::jsonb;
  v_ref     text;
  v_sub     uuid;
  v_opts    text[];
  v_n       integer;
  v_idx     integer;
  v_stem    text;
  v_expl    text;
  v_hash    text;
  v_status  public.question_status;
  v_qid     uuid;
  v_other   uuid;
  v_key     uuid;
  v_tags    text[];
  v_outcome text;
  v_before  text;
begin
  if p_source is null or p_source !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'bad source slug %', p_source using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_ref := it ->> 'ref';
    begin
      if coalesce(btrim(v_ref), '') = '' then
        raise exception 'missing ref';
      end if;

      select st.id into v_sub
      from public.subtopics st
      join public.topics t   on t.id = st.topic_id
      join public.sections s on s.id = t.section_id
      where s.slug = it ->> 'section' and t.slug = it ->> 'topic' and st.slug = it ->> 'subtopic';
      if v_sub is null then
        raise exception 'unknown subtopic %/%/%', it ->> 'section', it ->> 'topic', it ->> 'subtopic';
      end if;

      v_stem := btrim(coalesce(it ->> 'stem', ''));
      v_expl := btrim(coalesce(it ->> 'explanation', ''));
      select array_agg(btrim(o) order by ord) into v_opts
      from jsonb_array_elements_text(coalesce(it -> 'options', '[]'::jsonb)) with ordinality as x (o, ord);
      v_n   := coalesce(array_length(v_opts, 1), 0);
      v_idx := (it ->> 'correct_index')::integer;

      if v_stem = '' then raise exception 'empty stem'; end if;
      if v_n < 2 or v_n > 10 then raise exception 'needs 2-10 options, got %', v_n; end if;
      if exists (select 1 from unnest(v_opts) o where o = '') then raise exception 'empty option'; end if;
      if (select count(distinct o) from unnest(v_opts) o) <> v_n then raise exception 'options not distinct'; end if;
      if v_idx is null or v_idx < 0 or v_idx >= v_n then raise exception 'correct_index % out of range', v_idx; end if;
      if v_expl = '' then raise exception 'empty explanation'; end if;

      v_status := coalesce(it ->> 'status', 'in_review')::public.question_status;
      if v_status = 'retired' then raise exception 'cannot import as retired'; end if;
      v_hash := private.content_hash(v_stem, v_opts);

      select array_agg(distinct lower(tg)) into v_tags
      from jsonb_array_elements_text(coalesce(it -> 'tags', '[]'::jsonb)) tg
      where lower(tg) ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(tg) <= 40;
      insert into public.tags (slug, name, kind)
      select tg, initcap(replace(tg, '-', ' ')), 'general' from unnest(coalesce(v_tags, '{}')) tg
      on conflict (slug) do nothing;

      select qs.question_id into v_qid
      from public.question_sources qs where qs.source = p_source and qs.ref = v_ref;

      if v_qid is not null and not exists (
        select 1 from public.questions q
        where q.id = v_qid and q.source = 'import' and q.status in ('draft', 'in_review')
      ) then
        -- Linked to a question from elsewhere, or already published/retired:
        -- keep its content and status, refresh only tags and the source row.
        v_outcome := 'kept';
      elsif v_qid is not null then
        -- Re-import of a question this source created that is still unreviewed.
        select q.id into v_other from public.questions q where q.content_hash = v_hash and q.id <> v_qid;
        if v_other is not null then
          raise exception 'edited content duplicates question %', v_other;
        end if;

        select md5(q.stem || q.content_hash || q.subtopic_id::text || q.difficulty::text || q.est_seconds::text
                   || coalesce((select a.explanation || a.correct_option_id::text || coalesce(a.hint, '')
                                from public.question_answers a where a.question_id = q.id), ''))
          into v_before
        from public.questions q where q.id = v_qid
        for update;

        update public.questions q set
          subtopic_id       = v_sub,
          stem              = v_stem,
          difficulty        = (it ->> 'difficulty')::public.question_difficulty,
          est_seconds       = coalesce((it ->> 'est_seconds')::integer, q.est_seconds),
          difficulty_rating = coalesce((it ->> 'difficulty_rating')::integer, q.difficulty_rating),
          content_hash      = v_hash,
          status            = case when q.status in ('draft', 'in_review') and v_status > q.status
                                   then v_status else q.status end,
          review_note       = coalesce(nullif(btrim(it ->> 'review_note'), ''), q.review_note)
        where q.id = v_qid;

        insert into public.question_options as qo (question_id, position, body)
        select v_qid, (x.ord - 1)::smallint, x.body
        from unnest(v_opts) with ordinality as x (body, ord)
        on conflict (question_id, position) do update
          set body = excluded.body
          where qo.body is distinct from excluded.body;
        -- Fails (and skips this item) if a learner picked a now-surplus option.
        delete from public.question_options o where o.question_id = v_qid and o.position >= v_n;

        select o.id into v_key from public.question_options o where o.question_id = v_qid and o.position = v_idx;
        insert into public.question_answers as qa (question_id, correct_option_id, explanation, hint)
        values (v_qid, v_key, v_expl, nullif(btrim(it ->> 'hint'), ''))
        on conflict (question_id) do update
          set correct_option_id = excluded.correct_option_id,
              explanation       = excluded.explanation,
              hint              = excluded.hint
          where (qa.correct_option_id, qa.explanation, qa.hint)
                is distinct from (excluded.correct_option_id, excluded.explanation, excluded.hint);

        v_outcome := case when v_before is distinct from (
            select md5(q.stem || q.content_hash || q.subtopic_id::text || q.difficulty::text || q.est_seconds::text
                       || coalesce((select a.explanation || a.correct_option_id::text || coalesce(a.hint, '')
                                    from public.question_answers a where a.question_id = q.id), ''))
            from public.questions q where q.id = v_qid)
          then 'updated' else 'unchanged' end;
      else
        select q.id into v_qid from public.questions q where q.content_hash = v_hash;
        if v_qid is not null then
          -- Already in the bank from elsewhere: keep its content, record the source.
          v_outcome := 'linked_existing';
        else
          insert into public.questions (subtopic_id, stem, difficulty, difficulty_rating, est_seconds, status,
                                        source, content_hash, model, prompt_version, review_note)
          values (v_sub, v_stem, (it ->> 'difficulty')::public.question_difficulty,
                  coalesce((it ->> 'difficulty_rating')::integer, 1200),
                  coalesce((it ->> 'est_seconds')::integer, 60),
                  v_status, 'import', v_hash, 'claude-code', p_version,
                  nullif(btrim(it ->> 'review_note'), ''))
          returning id into v_qid;

          insert into public.question_options (question_id, position, body)
          select v_qid, (x.ord - 1)::smallint, x.body
          from unnest(v_opts) with ordinality as x (body, ord);

          insert into public.question_answers (question_id, correct_option_id, explanation, hint)
          select v_qid, o.id, v_expl, nullif(btrim(it ->> 'hint'), '')
          from public.question_options o where o.question_id = v_qid and o.position = v_idx;
          v_outcome := 'inserted';
        end if;
      end if;

      insert into public.question_tags (question_id, tag)
      select v_qid, tg from unnest(coalesce(v_tags, '{}')) tg
      on conflict do nothing;

      insert into public.question_sources as qs (question_id, source, ref, chapter, level, page, book_answer,
                                                  key_status, correct_pct, skipped_pct, tta_seconds, exams, notes)
      values (v_qid, p_source, v_ref, it ->> 'chapter', (it ->> 'level')::smallint, (it ->> 'page')::integer,
              nullif(btrim(it ->> 'book_answer'), ''), coalesce(it ->> 'key_status', 'unverified'),
              (it ->> 'correct_pct')::numeric, (it ->> 'skipped_pct')::numeric, (it ->> 'tta_seconds')::integer,
              coalesce(it -> 'exams', '[]'::jsonb), nullif(btrim(it ->> 'notes'), ''))
      on conflict (source, ref) do update set
        question_id = excluded.question_id, chapter = excluded.chapter, level = excluded.level,
        page = excluded.page, book_answer = excluded.book_answer, key_status = excluded.key_status,
        correct_pct = excluded.correct_pct, skipped_pct = excluded.skipped_pct,
        tta_seconds = excluded.tta_seconds, exams = excluded.exams, notes = excluded.notes;

      results := results || jsonb_build_object('ref', v_ref, 'outcome', v_outcome, 'question_id', v_qid);
    exception when others then
      results := results || jsonb_build_object('ref', v_ref, 'outcome', 'error', 'error', sqlerrm);
    end;
    v_sub := null; v_qid := null; v_other := null; v_key := null; v_tags := null;
  end loop;

  return results;
end;
$$;

revoke execute on function private.import_questions(text, text, jsonb) from public, anon, authenticated;
