-- Add preferred_language column to users table for i18n support
-- Use procedure to handle IF NOT EXISTS for MySQL 5.7 compatibility
SET @column_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'preferred_language');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE users ADD COLUMN preferred_language VARCHAR(5) NOT NULL DEFAULT ''en'' AFTER full_name', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
