#!/usr/bin/env bash
# Race tests for challenges: real parallel sessions against a migrated database (pgTAP runs in one
# transaction, so it cannot do this). Usage:
#
#   PGHOST=... PGPORT=... PGUSER=postgres PGDATABASE=... supabase/tests/concurrency/challenges.sh
#
# It creates its own players and questions (handles start with "race_"), checks that
#   1. one share link can be accepted by exactly one of five players at the same moment,
#   2. the same two players can create at most 3 challenges a day, however many requests arrive together,
#   3. the daily XP cap (5 rewarded challenges per player) holds when many challenges finish at once,
# and removes everything it created. A failing check exits non-zero.
set -uo pipefail
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -t -A)
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1 ($2)"; else echo "FAIL $1: got $2, want $3"; fail=1; fi; }
as() { # as <user handle> <sql>: runs one statement as that player
  "${PSQL[@]}" -c "select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where handle = '$1'), 'role', 'authenticated')::text, false);" -c "$2" >/dev/null 2>&1
  echo $?
}

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1
delete from public.challenges where challenger_id in (select id from public.profiles where handle like 'race\_%')
   or opponent_id in (select id from public.profiles where handle like 'race\_%');
delete from public.xp_events where user_id in (select id from public.profiles where handle like 'race\_%');
delete from public.follows where follower_id in (select id from public.profiles where handle like 'race\_%');
delete from public.daily_sets where id = 'dddddddd-0000-0000-0000-00000000aace';
delete from public.questions where stem like 'Race question%';
delete from private.accounts where email like 'race\_%@example.com';
SQL
}
trap cleanup EXIT
cleanup

"${PSQL[@]}" <<'SQL'
insert into private.accounts (email, metadata)
select 'race_' || h || '@example.com', jsonb_build_object('handle', 'race_' || h, 'timezone', 'UTC')
from unnest(array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) h;
insert into public.follows (follower_id, followee_id)
select x.id, y.id from public.profiles x, public.profiles y
where x.handle in ('race_a', 'race_b') and y.handle in ('race_a', 'race_b') and x.id <> y.id;
insert into public.topics (id, section_id, slug, name)
  select 'aaaaaaaa-0000-0000-0000-00000000ace1', id, 'race-topic', 'Race' from public.sections order by sort_order limit 1
  on conflict do nothing;
insert into public.subtopics (id, topic_id, slug, name) values ('aaaaaaaa-0000-0000-0000-00000000ace2', 'aaaaaaaa-0000-0000-0000-00000000ace1', 'race-sub', 'Race')
  on conflict do nothing;
insert into public.questions (id, subtopic_id, stem, difficulty, status, content_hash)
select ('aaaaaaaa-0000-0000-0000-0000000ace' || lpad(n::text, 2, '0'))::uuid, 'aaaaaaaa-0000-0000-0000-00000000ace2', 'Race question ' || n, 'easy', 'published', md5('race' || n) || md5('race' || n)
from generate_series(1, 6) n;
insert into public.question_options (id, question_id, position, body)
select ('bbbbbbbb-0000-0000-0000-0000000ace' || lpad((n * 2 + p)::text, 2, '0'))::uuid, ('aaaaaaaa-0000-0000-0000-0000000ace' || lpad(n::text, 2, '0'))::uuid, p, 'option ' || p
from generate_series(1, 6) n, generate_series(0, 1) p;
insert into public.question_answers (question_id, correct_option_id, explanation)
select ('aaaaaaaa-0000-0000-0000-0000000ace' || lpad(n::text, 2, '0'))::uuid, ('bbbbbbbb-0000-0000-0000-0000000ace' || lpad((n * 2)::text, 2, '0'))::uuid, 'x' from generate_series(1, 6) n;
SQL

# 1. One link, five players accepting at once -> exactly one wins
token=$("${PSQL[@]}" -c "
  with c as (select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where handle = 'race_a'), 'role', 'authenticated')::text, false))
  select (public.create_challenge('custom_set', null, null, (select array_agg(id) from (select id from public.questions where stem like 'Race question%' order by id limit 5) q)) ->> 'id') from c;")
"${PSQL[@]}" -c "select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where handle = 'race_a'), 'role', 'authenticated')::text, false);" -c "select 1" >/dev/null
# the challenger plays and locks in the score (sent), in one session
"${PSQL[@]}" <<SQL >/dev/null
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where handle = 'race_a'), 'role', 'authenticated')::text, false);
select public.start_challenge_run('$token');
select public.finish_challenge_run('$token');
SQL
link=$("${PSQL[@]}" -c "select share_token from public.challenges where id = '$token'")
pids=(); codes=()
for h in b c d e f; do ( as "race_$h" "select public.accept_challenge(null, '$link')" > "/tmp/race_$h.out" ) & pids+=($!); done
wait
won=0; for h in b c d e f; do [ "$(cat /tmp/race_$h.out)" = "0" ] && won=$((won + 1)); rm -f "/tmp/race_$h.out"; done
check "link accepted by exactly one player" "$won" "1"
check "one accepted run exists" "$("${PSQL[@]}" -c "select count(*) from public.challenge_runs where challenge_id = '$token' and user_id <> (select challenger_id from public.challenges where id = '$token')")" "1"

# 2. Pair limit: six simultaneous requests between two friends -> three succeed
"${PSQL[@]}" >/dev/null <<'SQL'
insert into public.daily_sets (id, track_id, level, set_date, published_at)
  values ('dddddddd-0000-0000-0000-00000000aace', private.default_track_id(), 1, date '2000-01-01', now() - interval '1 hour');
insert into public.daily_set_items (daily_set_id, question_id, position)
select 'dddddddd-0000-0000-0000-00000000aace', id, row_number() over (order by id) - 1 from public.questions where stem like 'Race question%' order by id limit 5;
insert into public.attempts (user_id, question_id, context, daily_set_id, selected_option_id, is_correct, time_ms)
select p.id, i.question_id, 'daily', 'dddddddd-0000-0000-0000-00000000aace', a.correct_option_id, true, 1000
from public.profiles p, public.daily_set_items i join public.question_answers a on a.question_id = i.question_id
where p.handle = 'race_a' and i.daily_set_id = 'dddddddd-0000-0000-0000-00000000aace';
SQL
delete_before=$("${PSQL[@]}" -c "select count(*) from public.challenges where challenger_id = (select id from public.profiles where handle = 'race_a') and opponent_id = (select id from public.profiles where handle = 'race_b')")
for i in 1 2 3 4 5 6; do ( as race_a "select public.create_challenge('daily', 'dddddddd-0000-0000-0000-00000000aace', 'race_b')" > "/tmp/race_p$i.out" ) & done
wait
ok=0; for i in 1 2 3 4 5 6; do [ "$(cat /tmp/race_p$i.out)" = "0" ] && ok=$((ok + 1)); rm -f "/tmp/race_p$i.out"; done
pair_total=$("${PSQL[@]}" -c "select count(*) from public.challenges where least(challenger_id, opponent_id) = least((select id from public.profiles where handle = 'race_a'), (select id from public.profiles where handle = 'race_b')) and greatest(challenger_id, opponent_id) = greatest((select id from public.profiles where handle = 'race_a'), (select id from public.profiles where handle = 'race_b')) and created_at > now() - interval '24 hours'")
check "at most 3 challenges per pair per day" "$pair_total" "3"

# 3. XP cap: eight completed challenges rewarded in parallel -> five paid
"${PSQL[@]}" >/dev/null <<'SQL'
insert into public.challenges (challenger_id, opponent_id, set_kind, question_ids, share_token, status, challenger_score, challenger_time_ms, opponent_score, opponent_time_ms,
                               winner_id, accepted_at, completed_at, sent_at, challenger_locked_at)
select (select id from public.profiles where handle = 'race_g'), (select id from public.profiles where handle = 'race_h'), 'custom_set',
       (select array_agg(id) from (select id from public.questions where stem like 'Race question%' order by id limit 5) q), 'raceraceracerac' || n,
       'completed', 5, 1000, 3, 2000, (select id from public.profiles where handle = 'race_g'), now(), now(), now(), now()
from generate_series(0, 7) n;
SQL
ids=$("${PSQL[@]}" -c "select id from public.challenges where share_token like 'raceraceracerac%' order by share_token")
for id in $ids; do ( "${PSQL[@]}" -c "select private.reward_challenge(c) from public.challenges c where c.id = '$id'" >/dev/null 2>&1 ) & done
wait
check "rewarded challenges per player per day (g)" "$("${PSQL[@]}" -c "select count(*) from public.xp_events where reason = 'challenge_play' and user_id = (select id from public.profiles where handle = 'race_g')")" "5"
check "rewarded challenges per player per day (h)" "$("${PSQL[@]}" -c "select count(*) from public.xp_events where reason = 'challenge_play' and user_id = (select id from public.profiles where handle = 'race_h')")" "5"
check "winner bonuses stay within the cap" "$("${PSQL[@]}" -c "select count(*) from public.xp_events where reason = 'challenge_win'")" "5"

exit $fail
