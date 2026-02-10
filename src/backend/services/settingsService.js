const database = require('../config/database');
const crypto = require('crypto');

class SettingsService {
  constructor() {
    this.cache = new Map();

    // AES-256-GCM encryption setup
    this.algorithm = 'aes-256-gcm';

    // Encryption key from environment (32 bytes = 256 bits)
    if (process.env.SETTINGS_ENCRYPTION_KEY) {
      const encKeyHex = process.env.SETTINGS_ENCRYPTION_KEY;
      if (encKeyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(encKeyHex)) {
        console.error('⚠️  SETTINGS_ENCRYPTION_KEY invalid format - must be 64 hex chars (256-bit)');
        this.encryptionKey = null;
      } else {
        this.encryptionKey = Buffer.from(encKeyHex, 'hex');
        console.log('🔐 Settings encryption enabled (AES-256-GCM)');
      }
    } else {
      this.encryptionKey = null;
      console.warn('⚠️  SETTINGS_ENCRYPTION_KEY not set - sensitive values will NOT be encrypted!');
    }
  }

  /**
   * Encryption with AES-256-GCM (authenticated encryption)
   */
  encryptValue(plaintext) {
    if (!this.encryptionKey) {
      console.warn('Encryption skipped - no encryption key available');
      return plaintext; // Fallback to plain text if no key
    }

    try {
      // Generate random IV (12 bytes, GCM standard)
      const iv = crypto.randomBytes(12);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag (GCM mode - integrity protection)
      const authTag = cipher.getAuthTag();

      // Store all information in a single JSON
      return JSON.stringify({
        iv: iv.toString('hex'),
        encrypted: encrypted,
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm
      });
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decryption with AES-256-GCM
   */
  decryptValue(encryptedData) {
    if (!this.encryptionKey) {
      // If no encryption key, try treating it as plain text
      return encryptedData;
    }

    try {
      // Parse JSON format
      const data = typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        Buffer.from(data.iv, 'hex')
      );

      // Set authentication tag (integrity check)
      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

      // Decrypt
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error.message);
      // Fallback: try as plain text (backward compatibility)
      return encryptedData;
    }
  }

  /**
   * Get a setting by key
   */
  async getSetting(key) {
    try {
      // Try from cache first
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }

      const rows = await database.query(
        'SELECT setting_value, setting_type, is_sensitive FROM system_settings WHERE setting_key = ?',
        [key]
      );

      if (rows.length === 0) {
        return null;
      }

      const setting = rows[0];
      let value = setting.setting_value;

      // Decrypt if necessary
      if (setting.is_sensitive && value) {
        value = this.decryptValue(value);
      }

      // Type conversion
      value = this.convertValue(value, setting.setting_type);

      // Save to cache (do not cache sensitive values)
      if (!setting.is_sensitive) {
        this.cache.set(key, value);
      }

      return value;
    } catch (error) {
      console.error('Settings getSetting error:', error.message);
      throw error;
    }
  }

  /**
   * Save a setting
   */
  async setSetting(key, value, type = 'string', isSensitive = false) {
    try {
      let valueToStore = String(value);

      // Encrypt if necessary AND encryption key is available
      if (isSensitive && value && this.encryptionKey) {
        valueToStore = this.encryptValue(String(value));
      }

      const result = await database.query(
        `INSERT INTO system_settings (setting_key, setting_value, setting_type, is_sensitive)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         setting_type = VALUES(setting_type),
         is_sensitive = VALUES(is_sensitive),
         updated_at = CURRENT_TIMESTAMP`,
        [key, valueToStore, type, isSensitive]
      );

      // Update cache (do not cache sensitive values)
      if (!isSensitive) {
        this.cache.set(key, this.convertValue(value, type));
      } else {
        this.cache.delete(key); // Remove from cache if present
      }

      return result;
    } catch (error) {
      console.error('Settings setSetting error:', error.message);
      throw error;
    }
  }

  /**
   * Get all settings (for admin use)
   */
  async getAllSettings(includeSensitive = false) {
    try {
      const query = includeSensitive
        ? 'SELECT setting_key, setting_value, setting_type, description, is_sensitive, updated_at FROM system_settings ORDER BY setting_key'
        : 'SELECT setting_key, setting_value, setting_type, description, is_sensitive, updated_at FROM system_settings WHERE is_sensitive = FALSE ORDER BY setting_key';

      const rows = await database.query(query);

      const settings = {};
      for (const row of rows) {
        let value = row.setting_value;

        // Handle sensitive values
        if (row.is_sensitive) {
          if (includeSensitive && value) {
            // Decrypt for admin
            try {
              value = this.decryptValue(value);
            } catch (error) {
              console.error('Settings decryption error:', error.message);
              value = '***DECRYPTION_ERROR***';
            }
          } else {
            value = '***HIDDEN***';
          }
        }

        settings[row.setting_key] = {
          value: this.convertValue(value, row.setting_type),
          type: row.setting_type,
          description: row.description,
          isSensitive: Boolean(row.is_sensitive),
          updatedAt: row.updated_at
        };
      }

      return settings;
    } catch (error) {
      console.error('Settings getAllSettings error:', error.message);
      throw error;
    }
  }

  /**
   * Bulk update settings
   */
  async updateSettings(settingsData) {
    try {
      const results = [];

      for (const [key, data] of Object.entries(settingsData)) {
        // If data is not an object, it's a direct value
        let value, type, isSensitive;

        if (typeof data === 'object' && data !== null && !Array.isArray(data) && 'value' in data) {
          // New format: {value, type, isSensitive}
          ({ value, type = 'string', isSensitive = false } = data);
        } else {
          // Legacy format: direct value - query type from database
          value = data;

          // Retrieve the existing setting's type and sensitivity
          const existing = await database.query(
            'SELECT setting_type, is_sensitive FROM system_settings WHERE setting_key = ?',
            [key]
          );

          if (existing && existing.length > 0) {
            type = existing[0].setting_type || 'string';
            isSensitive = Boolean(existing[0].is_sensitive);
          } else {
            type = 'string';
            isSensitive = false;
          }
        }

        console.log(`[SETTINGS] Updating ${key}: value=${value}, type=${type}`);
        await this.setSetting(key, value, type, isSensitive);
        results.push({ key, success: true });
      }

      // Clear cache after bulk update
      this.clearCache();

      return results;
    } catch (error) {
      console.error('Settings updateSettings error:', error.message);
      throw error;
    }
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key) {
    try {
      const result = await database.query(
        'DELETE FROM system_settings WHERE setting_key = ?',
        [key]
      );

      this.cache.delete(key);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Settings deleteSetting error:', error.message);
      throw error;
    }
  }

  /**
   * Validate SSO settings
   */
  async validateSSOSettings() {
    try {
      const required = ['sso_provider', 'sso_client_id', 'sso_client_secret', 'sso_authority_url'];
      const settings = {};

      for (const key of required) {
        settings[key] = await this.getSetting(key);
      }

      // Basic validation
      if (!settings.sso_provider || settings.sso_provider === '') {
        return { valid: false, error: 'SSO provider is not configured' };
      }

      if (!settings.sso_client_id || settings.sso_client_id === '') {
        return { valid: false, error: 'SSO Client ID is missing' };
      }

      if (!settings.sso_client_secret || settings.sso_client_secret === '') {
        return { valid: false, error: 'SSO Client Secret is missing' };
      }

      if (!settings.sso_authority_url || settings.sso_authority_url === '') {
        return { valid: false, error: 'SSO Authority URL is missing' };
      }

      // URL validation
      try {
        new URL(settings.sso_authority_url);
      } catch {
        return { valid: false, error: 'SSO Authority URL format is invalid' };
      }

      return { valid: true, settings };
    } catch (error) {
      console.error('SSO settings validation error:', error.message);
      return { valid: false, error: 'SSO settings validation error' };
    }
  }


  /**
   * Value type conversion
   */
  convertValue(value, type) {
    if (value === null || value === undefined) {
      return null;
    }

    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true' || value === true || value === 1;
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return String(value);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Initialization - check default settings
   */
  async initialize() {
    try {
      // Check if the system_settings table exists
      const tables = await database.query(
        "SHOW TABLES LIKE 'system_settings'"
      );

      if (tables.length === 0) {
        console.log('⚠️  system_settings table missing, skipping');
        return;
      }

      // Test the connection
      await this.getSetting('app_name');
      console.log('✅ SettingsService initialized');

      return true;
    } catch (error) {
      console.error('❌ SettingsService init error:', error.message);
      return false;
    }
  }
}

// Singleton instance
const settingsService = new SettingsService();

module.exports = settingsService;