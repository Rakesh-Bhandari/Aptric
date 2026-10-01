-- Indexes for daily question selection (NOT EXISTS seen-question checks).
-- Run once against an existing database; database.sql already includes them for fresh installs.
ALTER TABLE `user_attempts` ADD INDEX `idx_user_question` (`user_id`, `question_id`);
ALTER TABLE `questions` ADD INDEX `idx_difficulty_category` (`difficulty`, `category`);
