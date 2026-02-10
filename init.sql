-- Webhook Server Database Schema
-- MySQL 8.0 compatible
-- For Docker first-time initialization

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS webhook_db;
USE webhook_db;

-- Users table for admin authentication
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    sso_provider VARCHAR(50) NULL,
    sso_subject VARCHAR(255) NULL,
    email VARCHAR(255) NULL,
    full_name VARCHAR(255) NULL,
    preferred_language VARCHAR(5) NOT NULL DEFAULT 'en',
    last_login TIMESTAMP NULL,
    login_attempts INT DEFAULT 0 COMMENT 'Sikertelen bejelentkezesi kiserlet szamlalo',
    locked_until DATETIME DEFAULT NULL COMMENT 'Fiok zarolas vege (NULL = nincs zarolva)'
);

-- Teams table
CREATE TABLE teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Team members table
CREATE TABLE team_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_team_user (team_id, user_id)
);

-- Sources table for webhook sources
CREATE TABLE sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('synology', 'proxmox', 'proxmox_backup', 'gitlab', 'docker_updater', 'media-webhook', 'uptime-kuma', 'generic') NOT NULL,
    secret_key VARCHAR(255) NOT NULL,
    webhook_secret VARCHAR(255) NULL COMMENT 'Optional X-Webhook-Secret header validation',
    visibility ENUM('personal', 'team') NOT NULL DEFAULT 'personal',
    team_id INT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Targets table for destination services
CREATE TABLE targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('mattermost', 'rocketchat', 'slack', 'discord', 'webhook') NOT NULL,
    webhook_url VARCHAR(500) NOT NULL,
    visibility ENUM('personal', 'team') NOT NULL DEFAULT 'personal',
    team_id INT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Routes table for source to target mappings
CREATE TABLE routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    target_id INT NOT NULL,
    message_template TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    visibility ENUM('personal', 'team') NOT NULL DEFAULT 'personal',
    team_id INT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Events table for storing received webhook events
CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    event_type VARCHAR(100),
    payload_json JSON NOT NULL,
    visibility ENUM('personal', 'team') NOT NULL DEFAULT 'personal',
    team_id INT NULL,
    created_by_user_id INT NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_source_received (source_id, received_at),
    INDEX idx_processed (processed_at)
);

-- Deliveries table for tracking message delivery status
CREATE TABLE deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    target_id INT NOT NULL,
    status ENUM('pending', 'sent', 'failed', 'retry') NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    visibility ENUM('personal', 'team') NOT NULL DEFAULT 'personal',
    team_id INT NULL,
    created_by_user_id INT NOT NULL,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_status_attempts (status, attempts),
    INDEX idx_event_target (event_id, target_id)
);

-- System settings table
CREATE TABLE system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sessions table (express-session compatible)
CREATE TABLE sessions (
    session_id VARCHAR(128) NOT NULL PRIMARY KEY,
    expires INT UNSIGNED NOT NULL,
    data MEDIUMTEXT,
    INDEX idx_expires (expires)
);

-- Audit logs table
CREATE TABLE audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(100) NULL,
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Migrations tracking table
CREATE TABLE migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (username: admin, password: admin123)
INSERT INTO users (username, password_hash, role) VALUES
('admin', '$2b$12$EBp8whTw2v0WezYX8XazqO9oN9cVESRoCnWCjscgvsUcmGTLtUJJe', 'admin');

-- Insert sample data (for testing)
INSERT INTO sources (name, type, secret_key, created_by_user_id) VALUES
('Synology NAS', 'synology', 'h7k9m2x_secret_key_12345', 1),
('Proxmox Server', 'proxmox', 'n4p8w6z_secret_key_67890', 1);

INSERT INTO targets (name, type, webhook_url, created_by_user_id) VALUES
('Test Mattermost', 'mattermost', 'https://mattermost.example.com/hooks/test123', 1);

INSERT INTO routes (source_id, target_id, message_template, created_by_user_id) VALUES
(1, 1, 'Alert from {{source}}: {{message}}', 1);

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_sensitive) VALUES
('app_name', 'Webhook Server', 'string', 'Alkalmazas megjelenített neve', FALSE),
('jwt_expiry', '24h', 'string', 'JWT token elettartama', FALSE),
('session_timeout', '3600', 'number', 'Session timeout masodpercben', FALSE),
('webhook_retry_attempts', '3', 'number', 'Webhook kezbesitesi probalkozasok szama', FALSE),
('webhook_signature_validation', 'true', 'boolean', 'Webhook signature validacio engedelyezese', FALSE),
('sso_enabled', 'false', 'boolean', 'SSO bejelentkezes engedelyezese', FALSE),
('sso_only', 'false', 'boolean', 'Csak SSO bejelentkezes engedelyezett (lokalis login letiltva)', FALSE),
('sso_provider', 'authentik', 'string', 'SSO provider tipusa (csak Authentik tamogatott)', FALSE),
('sso_client_id', '', 'string', 'Authentik Client ID', TRUE),
('sso_client_secret', '', 'string', 'Authentik Client Secret', TRUE),
('sso_authority_url', '', 'string', 'Authentik Authority/Discovery URL', FALSE),
('sso_redirect_uri', '', 'string', 'Authentik Redirect URI', FALSE),
('sso_scopes', 'openid profile email', 'string', 'SSO kert scope-ok', FALSE),
('timezone', 'Europe/Budapest', 'string', 'Alapertelmezett idozona', FALSE),
('rbac_enabled', 'true', 'boolean', 'Szerepkor-alapu hozzaferes-vezerles engedelyezese', FALSE),
('min_admin_count', '1', 'number', 'Minimalis admin felhasznalok szama', FALSE),
('user_registration_enabled', 'false', 'boolean', 'Uj felhasznalok regisztraciojanak engedelyezese', FALSE),
('default_user_role', 'user', 'string', 'Alapertelmezett szerepkor uj felhasznaloknak', FALSE);

-- Indexes
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_targets_type ON targets(type);
CREATE INDEX idx_routes_active ON routes(is_active);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_setting_key ON system_settings(setting_key);
CREATE INDEX idx_setting_type ON system_settings(setting_type);
CREATE INDEX idx_sso_provider_user ON users(sso_provider, sso_subject);
CREATE INDEX idx_email ON users(email);
CREATE INDEX idx_users_locked_until ON users(locked_until);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- Record baseline migration as executed (schema is complete)
INSERT INTO migrations (version, description) VALUES
('000_initial_schema', 'Teljes adatbazis sema');

-- Update admin user with email and additional info
UPDATE users
SET email = 'admin@localhost',
    full_name = 'System Administrator',
    role = 'admin',
    is_active = TRUE
WHERE username = 'admin' AND email IS NULL;
