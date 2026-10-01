-- Password reset hardening + session revocation. Run once against an existing database;
-- database.sql already includes these columns for fresh installs.

-- OTPs are now stored only as a SHA-256 hex digest. Existing plaintext codes are discarded.
ALTER TABLE `users` CHANGE COLUMN `otp_code` `otp_hash` CHAR(64) DEFAULT NULL;
UPDATE `users` SET `otp_hash` = NULL, `otp_expires` = NULL;

-- Wrong-guess counter; the code is invalidated after 5 misses.
ALTER TABLE `users` ADD COLUMN `otp_attempts` INT NOT NULL DEFAULT 0 AFTER `otp_expires`;

-- Embedded in every JWT; incrementing it revokes all of the user's existing sessions.
-- Existing tokens carry no version and are treated as 0, so they stay valid after this migration.
ALTER TABLE `users` ADD COLUMN `token_version` INT NOT NULL DEFAULT 0 AFTER `otp_attempts`;
