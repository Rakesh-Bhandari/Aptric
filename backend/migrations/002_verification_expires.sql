-- Expiry for email verification tokens (24h). Run once against an existing database;
-- database.sql already includes the column for fresh installs.
ALTER TABLE `users` ADD COLUMN `verification_expires` DATETIME DEFAULT NULL AFTER `verification_token`;

-- Give pending tokens a 24h window from signup (NULL expiry is treated as expired).
UPDATE `users` SET `verification_expires` = `created_at` + INTERVAL 24 HOUR
  WHERE `verification_token` IS NOT NULL AND `verification_expires` IS NULL;

-- Login now rejects unverified users. Accounts that never had a token (admin-created,
-- Google OAuth) were never pending activation, so mark them verified.
UPDATE `users` SET `is_verified` = TRUE
  WHERE `is_verified` = FALSE AND `verification_token` IS NULL;
