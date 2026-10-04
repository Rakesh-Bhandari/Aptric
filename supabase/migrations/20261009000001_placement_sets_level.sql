-- Placement now moves the player's XP level. Before, finish_placement() only
-- stored a band floor (profiles.placement_level), so the Level shown across the
-- app (profiles.level, derived from XP) never changed. A placement band is
-- worth its min_profile_level: if the player is below it, they are granted the
-- XP to reach it (a 'placement' row in the XP ledger). Never lowers XP, and the
-- jump does not hand out streak freezes.

-- answers: [{ "question_id": uuid, "option_id": uuid | null, "time_ms": int | null }].
-- Questions missing from answers (or with a null option) count as skipped.
create or replace function public.finish_placement(test_id uuid, answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := private.require_uid();
  test     public.placement_tests;
  earned   numeric := 0;
  possible numeric := 0;
  n_right  integer := 0;
  item     record;
  chosen   uuid;
  spent    integer;
  ans_key  record;
  weight   integer;
  right_   boolean;
  results  jsonb := '[]'::jsonb;
  lvl      smallint;
  target_level integer;
  target_xp    bigint;
  freezes      smallint;
  score_   numeric;
begin
  if jsonb_typeof(coalesce(answers, '[]'::jsonb)) <> 'array' then
    raise exception 'answers must be an array' using errcode = 'invalid_parameter_value';
  end if;

  select * into test from public.placement_tests t where t.id = finish_placement.test_id for update;
  if not found or test.user_id <> uid then
    raise exception 'placement test not found' using errcode = 'insufficient_privilege';
  end if;
  if test.completed_at is not null then
    raise exception 'placement test already finished' using errcode = 'unique_violation';
  end if;

  for item in
    select u.qid, u.ord, q.difficulty
    from unnest(test.question_ids) with ordinality as u(qid, ord)
    join public.questions q on q.id = u.qid
    order by u.ord
  loop
    select (a ->> 'option_id')::uuid, least(greatest((a ->> 'time_ms')::integer, 0), 86400000)
      into chosen, spent
    from jsonb_array_elements(coalesce(answers, '[]'::jsonb)) a
    where (a ->> 'question_id')::uuid = item.qid
    limit 1;
    if not found then
      chosen := null;
      spent := null;
    end if;
    if chosen is not null and not exists (
      select 1 from public.question_options o where o.id = chosen and o.question_id = item.qid
    ) then
      raise exception 'option does not belong to this question' using errcode = 'invalid_parameter_value';
    end if;

    select qa.correct_option_id, qa.explanation into ans_key
    from public.question_answers qa where qa.question_id = item.qid;

    weight   := case item.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end;
    right_   := chosen is not null and chosen = ans_key.correct_option_id;
    possible := possible + weight;
    if right_ then
      earned  := earned + weight;
      n_right := n_right + 1;
    end if;

    insert into public.attempts (user_id, question_id, context, selected_option_id, is_correct, time_ms)
    values (uid, item.qid, 'assessment', chosen, right_, spent)
    on conflict on constraint attempts_user_question_context_key do nothing;

    results := results || jsonb_build_object(
      'question_id',        item.qid,
      'difficulty',         item.difficulty,
      'selected_option_id', chosen,
      'correct_option_id',  ans_key.correct_option_id,
      'is_correct',         right_,
      'explanation',        ans_key.explanation);
  end loop;

  score_ := case when possible > 0 then round(earned / possible, 3) else 0 end;
  lvl    := private.placement_level_for(score_);

  update public.placement_tests t
  set completed_at = now(), correct = n_right, score = score_, placed_level = lvl
  where t.id = test.id;

  update public.profiles p
  set placement_level = lvl, placed_at = now(), onboarded_at = coalesce(p.onboarded_at, now())
  where p.id = uid;

  select l.min_profile_level into target_level from public.levels l where l.level = lvl;
  target_xp := private.level_xp(coalesce(target_level, 1));
  select p.streak_freezes into freezes from public.profiles p where p.id = uid;
  perform private.award_xp(
    uid,
    greatest(0, target_xp - (select p.xp from public.profiles p where p.id = uid))::integer,
    'placement',
    'placement:' || test.id::text,
    jsonb_build_object('placed_level', lvl));
  update public.profiles p set streak_freezes = freezes where p.id = uid;

  return jsonb_build_object(
    'test_id', test.id,
    'correct', n_right,
    'total',   cardinality(test.question_ids),
    'score',   score_,
    'level',   (select jsonb_build_object('level', l.level, 'slug', l.slug, 'name', l.name)
                from public.levels l where l.level = lvl),
    'profile_level', (select p.level from public.profiles p where p.id = uid),
    'results', results
  );
end;
$$;
