-- 1. Initialize Database
CREATE DATABASE IF NOT EXISTS apti_db1;
USE apti_db1;

-- 2. Disable foreign keys temporarily to allow dropping tables smoothly
SET FOREIGN_KEY_CHECKS = 0;

-- 3. Drop existing tables (Clean Slate)
DROP TABLE IF EXISTS `feedback_reports`;
DROP TABLE IF EXISTS `user_feedback`;
DROP TABLE IF EXISTS `user_attempts`;
DROP TABLE IF EXISTS `user_daily_log`;
DROP TABLE IF EXISTS `activity_logs`; -- Added this (was missing)
DROP TABLE IF EXISTS `questions`;
DROP TABLE IF EXISTS `users`;

-- 4. Re-enable foreign keys
SET FOREIGN_KEY_CHECKS = 1;


-- --- TABLE 1: Users ---
-- UPDATED: Added 'profile_pic', 'bio', and 'role' to support your server.js
CREATE TABLE `users` (
  `user_id` VARCHAR(12) NOT NULL,
  `google_id` VARCHAR(255) DEFAULT NULL,
  `user_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `score` INT DEFAULT '0',
  `level` VARCHAR(20) DEFAULT 'Beginner',
  `day_streak` INT DEFAULT '0',
  `last_login` DATETIME DEFAULT NULL,
  `answered_qids` JSON DEFAULT (JSON_ARRAY()),
  `premium_level` VARCHAR(20) DEFAULT 'free',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `is_banned` BOOLEAN DEFAULT FALSE,
  `profile_pic` VARCHAR(500) DEFAULT NULL,   -- New
  `bio` TEXT DEFAULT NULL,                   -- New
  `role` VARCHAR(20) DEFAULT 'user',         -- New (for Admin check)
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- --- TABLE 2: Questions ---
CREATE TABLE `questions` (
  `question_id` INT NOT NULL AUTO_INCREMENT,
  `qid` VARCHAR(16) NOT NULL COMMENT 'Public ID like Q123ABC',
  `question_text` TEXT NOT NULL,
  `options` JSON NOT NULL COMMENT '["A", "B", "C", "D"]',
  `correct_answer_index` INT NOT NULL,
  `explanation` TEXT,
  `hint` TEXT,
  `difficulty` VARCHAR(20) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `generated_for_date` DATE DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`question_id`),
  UNIQUE KEY `qid` (`qid`),
  KEY `idx_generated_for_date` (`generated_for_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- --- TABLE 3: User Daily Log ---
-- Links a user to their specific daily questions
CREATE TABLE `user_daily_log` (
  `log_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(12) NOT NULL,
  `challenge_date` DATE NOT NULL,
  `question_ids_json` JSON NOT NULL,
  PRIMARY KEY (`log_id`),
  UNIQUE KEY `user_challenge_date` (`user_id`,`challenge_date`),
  CONSTRAINT `fk_user_log` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- --- TABLE 4: User Attempts ---
-- Tracks every answer submission
CREATE TABLE `user_attempts` (
  `attempt_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(12) NOT NULL,
  `qid` VARCHAR(16) NOT NULL,
  `question_id` INT NOT NULL,
  `selected_answer_index` INT DEFAULT NULL,
  `status` VARCHAR(20) NOT NULL COMMENT 'correct, wrong, hint_used, gave_up',
  `points_earned` INT DEFAULT '0',
  `attempt_date` DATE NOT NULL,
  PRIMARY KEY (`attempt_id`),
  UNIQUE KEY `user_daily_question` (`user_id`,`attempt_date`,`qid`),
  KEY `fk_user_attempts` (`user_id`),
  KEY `fk_question_attempts` (`question_id`),
  CONSTRAINT `user_attempts_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `user_attempts_question_fk` FOREIGN KEY (`question_id`) REFERENCES `questions` (`question_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- --- TABLE 5: Activity Logs ---
-- ADDED: Required by your server.js logActivity() function
CREATE TABLE `activity_logs` (
  `log_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(12) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `details` TEXT,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  CONSTRAINT `fk_activity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- --- TABLE 6: Feedback ---
CREATE TABLE `user_feedback` (
  `feedback_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(12) NOT NULL,
  `rating` DECIMAL(2,1) NOT NULL, -- Changed to DECIMAL for 4.5 ratings
  `comment` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`feedback_id`),
  CONSTRAINT `fk_user_feedback` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- --- TABLE 7: Feedback Reports ---
CREATE TABLE `feedback_reports` (
  `report_id` INT NOT NULL AUTO_INCREMENT,
  `feedback_id` INT NOT NULL,
  `reporter_user_id` VARCHAR(12) NOT NULL,
  `status` VARCHAR(20) DEFAULT 'pending',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `unique_report` (`feedback_id`,`reporter_user_id`),
  CONSTRAINT `fk_report_feedback` FOREIGN KEY (`feedback_id`) REFERENCES `user_feedback` (`feedback_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_user` FOREIGN KEY (`reporter_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `users` 
ADD COLUMN `is_verified` BOOLEAN DEFAULT FALSE,
ADD COLUMN `verification_token` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `otp_code` VARCHAR(6) DEFAULT NULL,
ADD COLUMN `otp_expires` DATETIME DEFAULT NULL;

USE apti_db1;
ALTER TABLE users ADD COLUMN verification_token VARCHAR(255) DEFAULT NULL AFTER password_hash;
ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE AFTER verification_token;
ALTER TABLE users ADD INDEX idx_verification_token (verification_token);

DELETE FROM questions WHERE generated_for_date = CURDATE();
DELETE FROM user_daily_log WHERE challenge_date = CURDATE();
DELETE FROM user_attempts WHERE attempt_date = CURDATE();



SELECT * FROM questions 
WHERE generated_for_date = CURDATE();

DELETE FROM users WHERE email = 'rakeshbhandari956@gmail.com';