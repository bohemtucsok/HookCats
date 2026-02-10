/**
 * Environment variable validation
 * Checks that critical environment variables are set and valid
 */

function validateEnv() {
  const errors = [];

  // Required variables
  const required = ['JWT_SECRET', 'WEBHOOK_SECRET', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME', 'DB_USER'];

  required.forEach(key => {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  });

  // JWT_SECRET validation (256-bit minimum)
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET is too short! Minimum 32 characters required (256-bit). Generate with: openssl rand -base64 32');
    }

    // Check for example/default secrets
    const exampleSecrets = [
      'AbCdEfGhIjKlMnOpQrStUvWxYz123456789',
      'your_jwt_secret_key_here',
      'change_this_secret'
    ];

    if (exampleSecrets.includes(process.env.JWT_SECRET)) {
      errors.push('SECURITY ERROR: Do not use the example JWT_SECRET! Generate a new one: openssl rand -base64 32');
    }
  }

  // WEBHOOK_SECRET length validation
  if (process.env.WEBHOOK_SECRET && process.env.WEBHOOK_SECRET.length < 16) {
    errors.push('WEBHOOK_SECRET is too short! Minimum 16 characters required. Generate with: openssl rand -base64 24');
  }

  // SETTINGS_ENCRYPTION_KEY validation (optional, but if set must be 256-bit)
  if (process.env.SETTINGS_ENCRYPTION_KEY) {
    const encKey = process.env.SETTINGS_ENCRYPTION_KEY;
    if (encKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(encKey)) {
      errors.push('SETTINGS_ENCRYPTION_KEY must be 64 hex characters (256-bit). Generate with: openssl rand -hex 32');
    }
  } else {
    console.warn('⚠️  SETTINGS_ENCRYPTION_KEY is not set - sensitive settings will not be encrypted!');
  }

  // NODE_ENV validation
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    console.warn(`⚠️  WARNING: NODE_ENV value is non-standard: "${nodeEnv}"`);
  }

  // Additional checks for production environment
  if (nodeEnv === 'production') {
    if (!process.env.CORS_ORIGIN) {
      errors.push('CORS_ORIGIN is required in production environment!');
    } else if (process.env.CORS_ORIGIN === '*') {
      console.log('⚠️  CORS_ORIGIN=* (Restrict this in production!)');
    }
  }

  // If there are errors, throw an exception
  if (errors.length > 0) {
    console.error('❌ Environment variable validation error:');
    errors.forEach(error => console.error(`   ${error}`));
    throw new Error(`${errors.length} environment variable validation error(s).`);
  }

  // Successful validation (concise)
  console.log(`✅ Environment OK (${nodeEnv})`);
  if (process.env.SETTINGS_ENCRYPTION_KEY) {
    console.log('✅ SETTINGS_ENCRYPTION_KEY configured (AES-256 encryption)');
  }
}

module.exports = { validateEnv };
