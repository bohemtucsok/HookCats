#!/usr/bin/env node

/**
 * Database Migration Runner
 * Runs all pending migrations on startup
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigrations() {
  let connection;

  try {
    console.log('🔄 Starting database migrations...');

    // Wait for MySQL to be ready
    await waitForDatabase();

    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'mysql',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: 'root',
      password: process.env.MYSQL_ROOT_PASSWORD,
      database: process.env.DB_NAME || 'webhook_db',
      multipleStatements: true
    });

    console.log('✅ Connected to database');

    // Check if migrations table exists
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'migrations'"
    );

    if (tables.length === 0) {
      console.log('📋 Creating migrations table...');
      await connection.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          version VARCHAR(50) NOT NULL UNIQUE,
          description TEXT,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // Get list of executed migrations
    const [executedMigrations] = await connection.query(
      'SELECT version FROM migrations ORDER BY id'
    );
    const executedVersions = new Set(executedMigrations.map(m => m.version));

    // Migration files directory
    const migrationsDir = path.join(__dirname, '../backend/migrations');

    // Get all migration files
    let migrationFiles;
    try {
      migrationFiles = await fs.readdir(migrationsDir);
      migrationFiles = migrationFiles
        .filter(f => f.endsWith('.sql'))
        .sort(); // Sort alphabetically (001, 002, etc.)
    } catch (error) {
      console.log('⚠️  No migrations directory found, skipping migrations');
      return;
    }

    let migrationsRun = 0;

    // Run each migration if not already executed
    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');

      if (executedVersions.has(version)) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`🔄 Running migration: ${file}`);

      try {
        // Read migration file
        const migrationPath = path.join(migrationsDir, file);
        const sql = await fs.readFile(migrationPath, 'utf8');

        // Execute migration
        await connection.query(sql);

        // Record migration
        await connection.query(
          'INSERT INTO migrations (version, description) VALUES (?, ?)',
          [version, `Migration from ${file}`]
        );

        // Special case: if 000_initial_schema.sql was executed, mark all migrations as done
        // The base schema includes everything from 001-013
        if (version === '000_initial_schema') {
          console.log('📋 Marking all migrations as completed (included in base schema)...');
          const baselineMigrations = [
            '001_add_system_settings',
            '002_add_sso_only_setting',
            '002_extend_users_table',
            '003_add_rbac_system',
            '004_add_team_management',
            '005_add_webhook_secret_to_sources',
            '006_remove_smtp_settings',
            '007_rename_sso_user_id_to_sso_subject',
            '008_add_proxmox_backup_type',
            '008_add_uptime_kuma_type',
            '009_add_gitlab_source_type',
            '010_add_media_webhook_type',
            '011_add_account_lockout',
            '012_docker_updater_source',
            '013_add_preferred_language'
          ];

          for (const baselineVersion of baselineMigrations) {
            await connection.query(
              'INSERT IGNORE INTO migrations (version, description) VALUES (?, ?)',
              [baselineVersion, `Baseline migration (included in 000_initial_schema)`]
            );
            // Add to executedVersions set to skip in current run
            executedVersions.add(baselineVersion);
          }
        }

        console.log(`✅ Migration ${file} completed`);
        migrationsRun++;

      } catch (error) {
        // Check if this is a "duplicate entry" error for migrations table
        if (error.message && error.message.includes('Duplicate entry') && error.message.includes('migrations')) {
          console.log(`⚠️  Migration ${file} already recorded in migrations table, marking as complete`);
          // Try to insert again with IGNORE
          try {
            await connection.query(
              'INSERT IGNORE INTO migrations (version, description) VALUES (?, ?)',
              [version, `Migration from ${file}`]
            );
          } catch (ignoreError) {
            // If even IGNORE fails, just log it
            console.log(`   Note: ${ignoreError.message}`);
          }
          migrationsRun++;
        } else {
          console.error(`❌ Migration ${file} failed:`, error.message);
          // Don't throw - continue with other migrations
          // but log it clearly
          console.error('   SQL Error:', error.sqlMessage || error.message);
        }
      }
    }

    if (migrationsRun > 0) {
      console.log(`✅ ${migrationsRun} migration(s) completed successfully`);
    } else {
      console.log('✅ Database schema up to date');
    }

  } catch (error) {
    console.error('❌ Migration runner failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function waitForDatabase() {
  const maxRetries = 30;
  const retryDelay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'mysql',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: 'root',
        password: process.env.MYSQL_ROOT_PASSWORD
      });
      await connection.end();
      console.log('✅ Database is ready');
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`⏳ Waiting for database... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw new Error('Database not ready after maximum retries');
      }
    }
  }
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('✅ Migration runner completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration runner failed:', error.message);
    process.exit(1);
  });
