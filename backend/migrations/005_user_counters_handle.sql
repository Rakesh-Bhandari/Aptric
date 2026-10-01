-- Leaderboard counters, score index and public handles.
-- Run once against an existing database; database.sql already includes these for fresh installs.

-- questions_solved    = attempts with status 'correct'
-- questions_attempted = attempts with status 'correct' or 'wrong'
-- Kept in step by /submit-answer and admin question deletes.
ALTER TABLE `users`
  ADD COLUMN `questions_solved` INT NOT NULL DEFAULT 0 AFTER `last_streak_date`,
  ADD COLUMN `questions_attempted` INT NOT NULL DEFAULT 0 AFTER `questions_solved`,
  ADD COLUMN `handle` VARCHAR(40) DEFAULT NULL COMMENT 'Public profile slug; user_id is never exposed' AFTER `user_name`;

ALTER TABLE `users` ADD INDEX `idx_score` (`score`);

-- One-time counter backfill.
UPDATE `users` u
JOIN (
    SELECT user_id,
           SUM(status = 'correct') AS solved,
           SUM(status IN ('correct', 'wrong')) AS attempted
    FROM `user_attempts`
    GROUP BY user_id
) a ON a.user_id = u.user_id
SET u.questions_solved = a.solved, u.questions_attempted = a.attempted;

-- One-time handle backfill: "<name slug, max 24>-<8 random hex>", same shape as
-- makeHandle() in src/utils/helpers.js. Names with no [a-z0-9] become "user".
UPDATE `users`
SET `handle` = CONCAT(
    COALESCE(NULLIF(TRIM(BOTH '-' FROM LEFT(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(user_name), '[^a-z0-9]+', '-')), 24)), ''), 'user'),
    '-',
    LEFT(MD5(CONCAT(user_id, UUID())), 8)
)
WHERE `handle` IS NULL;

ALTER TABLE `users` MODIFY `handle` VARCHAR(40) NOT NULL COMMENT 'Public profile slug; user_id is never exposed';
ALTER TABLE `users` ADD UNIQUE KEY `handle` (`handle`);
