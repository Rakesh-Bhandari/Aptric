-- Question review workflow, duplicate detection and async generation jobs.
-- Run once against an existing database; database.sql already includes these for fresh installs.

-- status: AI questions land as 'draft'; only 'published' questions are served to users.
-- Existing questions were already live, so they are backfilled as 'published'.
ALTER TABLE `questions`
  ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'published' AFTER `category`,
  ADD COLUMN `question_hash` CHAR(64) DEFAULT NULL COMMENT 'SHA-256 hex of the normalised question_text' AFTER `question_text`;
ALTER TABLE `questions` MODIFY `status` VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft | published | rejected';
ALTER TABLE `questions` ADD INDEX `idx_status_difficulty` (`status`, `difficulty`);

-- Hash backfill. Must match questionHash() in src/services/questionBank.js:
-- lower-case, runs of anything other than [a-z0-9] become one space, trimmed.
UPDATE `questions`
SET `question_hash` = SHA2(TRIM(REGEXP_REPLACE(LOWER(`question_text`), '[^a-z0-9]+', ' ')), 256);

-- Existing duplicates keep the hash only on their oldest copy so the unique key
-- can be added; the newer copies stay as they are (NULL hashes never collide).
UPDATE `questions` q
JOIN (
    SELECT `question_hash`, MIN(`question_id`) AS keep_id
    FROM `questions`
    GROUP BY `question_hash`
    HAVING COUNT(*) > 1
) d ON d.question_hash = q.question_hash AND q.question_id <> d.keep_id
SET q.question_hash = NULL;

ALTER TABLE `questions` ADD UNIQUE KEY `question_hash` (`question_hash`);

-- Async AI generation. Admin bulk requests and the daily top-up insert a row;
-- /api/cron/generation-jobs works through it a chunk at a time.
CREATE TABLE `question_generation_jobs` (
  `job_id` INT NOT NULL AUTO_INCREMENT,
  `created_by` VARCHAR(12) DEFAULT NULL COMMENT 'Admin user_id, NULL for the cron top-up',
  `source` VARCHAR(20) NOT NULL DEFAULT 'admin' COMMENT 'admin | topup',
  `status` VARCHAR(20) NOT NULL DEFAULT 'queued' COMMENT 'queued | running | done | failed',
  `items` JSON NOT NULL COMMENT '[{category, difficulty, subTopic, requested, saved, invalid, duplicate, unverified, calls}]',
  `total_requested` INT NOT NULL DEFAULT 0,
  `total_saved` INT NOT NULL DEFAULT 0,
  `total_dropped` INT NOT NULL DEFAULT 0,
  `error` TEXT DEFAULT NULL,
  `locked_until` DATETIME DEFAULT NULL COMMENT 'Lease held by the worker processing a chunk',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `finished_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`job_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_generation_job_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
