-- Exports everything import-v1-users.mjs needs from the v1 TiDB/MySQL database
-- as NDJSON: one JSON object per line, its kind in "t".
--
--   mysql --host <tidb-host> --port 4000 --user <user> -p --ssl-mode=VERIFY_IDENTITY \
--         --ssl-ca backend/src/certs/isrgrootx1.pem \
--         --batch --raw --skip-column-names apti_db1 \
--     < supabase/scripts/export-v1-users.sql > v1-users.ndjson
--
-- Read-only. --raw keeps each JSON document on one line (JSON_OBJECT already
-- escapes newlines inside strings). Verification tokens, OTP hashes and
-- token_version are deliberately not exported. Timestamps are UTC (the SET
-- below), dates are the v1 Asia/Kolkata days as stored.
--
-- The output holds emails and password hashes: keep it out of git and delete
-- it once the cutover is signed off.
--
-- Kinds:
--   user          one per users row
--   attempts      one per user with attempts: counts by status, points, date range
--   streak_day    one per (user, day) that counted for the v1 streak: the user
--                 finished (correct / wrong / gave_up) a question from that
--                 day's daily set (same rule as backend migration 004)
--   feedback      one per user_feedback row
--   totals        one row of raw table counts, for the verification report

SET time_zone = '+00:00';

SELECT JSON_OBJECT(
  't', 'user',
  'user_id', user_id,
  'email', email,
  'user_name', user_name,
  'handle', handle,
  'password_hash', password_hash,
  'google_id', google_id,
  'is_verified', is_verified,
  'is_banned', is_banned,
  'role', role,
  'score', score,
  'day_streak', day_streak,
  'last_streak_date', DATE_FORMAT(last_streak_date, '%Y-%m-%d'),
  'questions_solved', questions_solved,
  'questions_attempted', questions_attempted,
  'profile_pic', profile_pic,
  'bio', bio,
  'created_at', DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ'),
  'last_login', DATE_FORMAT(last_login, '%Y-%m-%dT%H:%i:%sZ')
)
FROM users;

SELECT JSON_OBJECT(
  't', 'attempts',
  'user_id', user_id,
  'total', COUNT(*),
  'correct', SUM(status = 'correct'),
  'wrong', SUM(status = 'wrong'),
  'hint_used', SUM(status = 'hint_used'),
  'gave_up', SUM(status = 'gave_up'),
  'points', SUM(COALESCE(points_earned, 0)),
  'first_date', DATE_FORMAT(MIN(attempt_date), '%Y-%m-%d'),
  'last_date', DATE_FORMAT(MAX(attempt_date), '%Y-%m-%d')
)
FROM user_attempts
GROUP BY user_id;

SELECT JSON_OBJECT('t', 'streak_day', 'user_id', d.user_id, 'd', DATE_FORMAT(d.d, '%Y-%m-%d'))
FROM (
  SELECT DISTINCT a.user_id, a.attempt_date AS d
  FROM user_attempts a
  JOIN user_daily_log l
    ON l.user_id = a.user_id AND l.challenge_date = a.attempt_date
  WHERE a.status IN ('correct', 'wrong', 'gave_up')
    AND JSON_CONTAINS(l.question_ids_json, CAST(a.question_id AS JSON))
) d;

SELECT JSON_OBJECT(
  't', 'feedback',
  'feedback_id', feedback_id,
  'user_id', user_id,
  'rating', CAST(rating AS CHAR),
  'comment', comment,
  'created_at', DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ')
)
FROM user_feedback;

SELECT JSON_OBJECT(
  't', 'totals',
  'users', (SELECT COUNT(*) FROM users),
  'user_attempts', (SELECT COUNT(*) FROM user_attempts),
  'user_feedback', (SELECT COUNT(*) FROM user_feedback),
  'score_sum', (SELECT COALESCE(SUM(score), 0) FROM users),
  'exported_at', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ')
);
