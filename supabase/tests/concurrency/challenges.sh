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
#   4. a private league never goes past its size when many players join with the code together,
#   5. a hosted contest never goes past max_participants when many players join together,
#   6. hosted-contest XP is paid once and stays within 3 rewards a player a day when settlement runs in parallel,
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
  # One statement at a time, so a failure cannot stop the rest.
  while IFS= read -r stmt; do "${PSQL[@]}" -c "$stmt" >/dev/null 2>&1; done <<'SQL'
delete from public.contests where host_id in (select id from public.profiles where handle like 'race\_%')
delete from public.challenges where challenger_id in (select id from public.profiles where handle like 'race\_%') or opponent_id in (select id from public.profiles where handle like 'race\_%')
delete from public.attempts where user_id in (select id from public.profiles where handle like 'race\_%')
delete from public.xp_events where user_id in (select id from public.profiles where handle like 'race\_%')
delete from public.groups where owner_id in (select id from public.profiles where handle like 'race\_%')
delete from public.follows where follower_id in (select id from public.profiles where handle like 'race\_%')
delete from public.daily_set_items where daily_set_id = 'dddddddd-0000-0000-0000-00000000aace'
delete from public.daily_sets where id = 'dddddddd-0000-0000-0000-00000000aace'
delete from public.questions where stem like 'Race question%'
delete from public.subtopics where id = 'aaaaaaaa-0000-0000-0000-00000000ace2'
delete from public.topics where id = 'aaaaaaaa-0000-0000-0000-00000000ace1'
delete from private.accounts where email like 'race\_%@example.com'
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

# 4. League size: a verified owner makes a league of 3, then five players join with the code at once -> two get in
"${PSQL[@]}" >/dev/null <<'SQL'
update private.accounts set email_verified_at = now() where email = 'race_a@example.com';
SQL
gid=$("${PSQL[@]}" <<'SQL' | tail -1
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where handle = 'race_a'), 'role', 'authenticated')::text, false);
select public.create_group('Race league', 'friends', 'invite_code', null, 3) ->> 'id';
SQL
)
"${PSQL[@]}" -c "update public.groups set max_members = 3 where id = '$gid'" >/dev/null
gcode=$("${PSQL[@]}" -c "select invite_code from public.groups where id = '$gid'")
for h in b c d e f g; do ( as "race_$h" "select public.join_group('$gcode')" > "/tmp/race_j$h.out" ) & done
wait
for h in b c d e f g; do rm -f "/tmp/race_j$h.out"; done
check "league never exceeds its size" "$("${PSQL[@]}" -c "select count(*) from public.group_members where group_id = '$gid' and status = 'active'")" "3"

# 5. Hosted contest cap: a live unlisted contest for 3 players, six join at once -> three get in
"${PSQL[@]}" >/dev/null <<'SQL'
insert into public.contests (id, slug, title, starts_at, ends_at, created_by, host_id, visibility, status, max_participants, published_at)
select 'eeeeeeee-0000-0000-0000-000000000001', 'race-cap-' || md5('cap'), 'Race cap', now() - interval '1 minute', now() + interval '1 hour', p.id, p.id, 'unlisted', 'scheduled', 3, now()
from public.profiles p where p.handle = 'race_a';
insert into public.contest_items (contest_id, question_id, position)
select 'eeeeeeee-0000-0000-0000-000000000001', id, row_number() over (order by id) - 1 from public.questions where stem like 'Race question%';
SQL
for h in b c d e f g; do ( as "race_$h" "select public.join_contest('eeeeeeee-0000-0000-0000-000000000001')" > "/tmp/race_c$h.out" ) & done
wait
for h in b c d e f g; do rm -f "/tmp/race_c$h.out"; done
check "hosted contest never exceeds max_participants" "$("${PSQL[@]}" -c "select count(*) from public.contest_entries where contest_id = 'eeeeeeee-0000-0000-0000-000000000001'")" "3"

# 6. Hosted XP: four ended public contests (two hosts), the same six finishers, settled by four sessions at once
"${PSQL[@]}" >/dev/null <<'SQL'
insert into public.contests (id, slug, title, starts_at, ends_at, created_by, host_id, visibility, status, host_review_state, max_participants, published_at)
select ('eeeeeeee-0000-0000-0000-00000000010' || n)::uuid, 'race-xp-' || n || md5('xp'), 'Race xp ' || n, now() - interval '3 hours', now() - interval '2 hours', p.id, p.id,
       'public', 'scheduled', 'approved', 50, now() - interval '6 hours'
from generate_series(1, 4) n join public.profiles p on p.handle = case when n <= 2 then 'race_a' else 'race_h' end;
insert into public.contest_items (contest_id, question_id, position)
select c.id, q.id, row_number() over (partition by c.id order by q.id) - 1
from public.contests c, (select id from public.questions where stem like 'Race question%' order by id limit 5) q where c.id::text like 'eeeeeeee-0000-0000-0000-00000000010%';
insert into public.contest_entries (contest_id, user_id, score, correct, answered, time_ms)
select c.id, p.id, 10 * length(p.handle), 3, 5, 1000
from public.contests c, public.profiles p
where c.id::text like 'eeeeeeee-0000-0000-0000-00000000010%' and p.handle in ('race_b', 'race_c', 'race_d', 'race_e', 'race_f', 'race_g');
SQL
for i in 1 2 3 4; do ( "${PSQL[@]}" -c "select private.settle_hosted_contests()" >/dev/null 2>&1 ) & done
wait
check "no player gets more than 3 hosted-contest rewards a day" "$("${PSQL[@]}" -c "select coalesce(max(n), 0) from (select count(*) n from public.xp_events where reason = 'hosted_contest' group by user_id) x")" "3"
check "each reward is paid exactly once" "$("${PSQL[@]}" -c "select count(*) from public.xp_events where reason = 'hosted_contest'")" "$("${PSQL[@]}" -c "select count(*) from public.contest_rewards where contest_id::text like 'eeeeeeee-0000-0000-0000-00000000010%'")"
check "every ended contest is settled once" "$("${PSQL[@]}" -c "select count(*) from public.contests where id::text like 'eeeeeeee-0000-0000-0000-00000000010%' and settled_at is not null")" "4"

exit $fail
