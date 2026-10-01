-- Streaks are now driven by daily-question answers instead of logins.
-- Run once against an existing database; database.sql already includes the column for fresh installs.

ALTER TABLE `users` ADD COLUMN `last_streak_date` DATE DEFAULT NULL AFTER `day_streak`;

-- One-time backfill from history: a streak day is a date on which the user
-- finished (correct / wrong / gave_up) a question from that date's daily set.
-- Each user gets the length and end date of their most recent run of consecutive
-- days. Runs that ended before yesterday are zeroed by the next /api/cron/streak-check.
-- Note: attempt_date rows written before this change used UTC days, not Asia/Kolkata.
UPDATE `users` SET `day_streak` = 0, `last_streak_date` = NULL;

UPDATE `users` u
JOIN (
    SELECT user_id, last_d, streak
    FROM (
        SELECT user_id, MAX(d) AS last_d, COUNT(*) AS streak,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY MAX(d) DESC) AS rn
        FROM (
            -- Consecutive days share the same grp (date minus its row number).
            SELECT user_id, d,
                   DATE_SUB(d, INTERVAL ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d) DAY) AS grp
            FROM (
                SELECT DISTINCT a.user_id, a.attempt_date AS d
                FROM `user_attempts` a
                JOIN `user_daily_log` l
                  ON l.user_id = a.user_id AND l.challenge_date = a.attempt_date
                WHERE a.status IN ('correct', 'wrong', 'gave_up')
                  AND JSON_CONTAINS(l.question_ids_json, CAST(a.question_id AS JSON))
            ) days
        ) islands
        GROUP BY user_id, grp
    ) runs
    WHERE rn = 1
) s ON s.user_id = u.user_id
SET u.day_streak = s.streak, u.last_streak_date = s.last_d;
