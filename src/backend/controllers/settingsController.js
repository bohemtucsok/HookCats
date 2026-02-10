const settingsService = require('../services/settingsService');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const { body } = require('express-validator');
const crypto = require('crypto');

/**
 * SSO State Parameter Helper Functions (CSRF Protection)
 */

/**
 * Generate a cryptographically secure SSO state parameter
 * Format: timestamp.nonce.hmac
 * @returns {string} - SSO state string
 */
const generateSSOState = () => {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex'); // 32 random characters

  // HMAC for the timestamp + nonce combination (signed with JWT_SECRET)
  const hmac = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${timestamp}:${nonce}`)
    .digest('hex')
    .substring(0, 32); // First 32 characters (128-bit)

  return `${timestamp}.${nonce}.${hmac}`;
};

/**
 * Validate the SSO state parameter (CSRF protection)
 * Checks: HMAC correctness + timestamp expiry (5 minute TTL)
 * @param {string} state - SSO state string
 * @returns {boolean} - Whether the state is valid
 */
const validateSSOState = (state) => {
  try {
    // Validate state format
    const parts = state.split('.');
    if (parts.length !== 3) {
      console.error('[SSO] Invalid state format - expected 3 parts, got', parts.length);
      return false;
    }

    const [timestamp, nonce, receivedHmac] = parts;

    // Timestamp validation (5 minute TTL)
    const stateAge = Date.now() - parseInt(timestamp);
    const MAX_STATE_AGE = 5 * 60 * 1000; // 5 minutes

    if (stateAge > MAX_STATE_AGE) {
      console.error('[SSO] State expired - age:', Math.floor(stateAge / 1000), 'seconds (max: 300s)');
      return false;
    }

    if (stateAge < 0) {
      console.error('[SSO] State timestamp in future - possible clock skew or attack');
      return false;
    }

    // Recalculate and compare HMAC
    const expectedHmac = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(`${timestamp}:${nonce}`)
      .digest('hex')
      .substring(0, 32);

    // Timing-safe comparison (timing attack protection)
    const hmacMatch = crypto.timingSafeEqual(
      Buffer.from(expectedHmac, 'hex'),
      Buffer.from(receivedHmac, 'hex')
    );

    if (!hmacMatch) {
      console.error('[SSO] HMAC mismatch - possible CSRF attack or state tampering');
      return false;
    }

    console.log('[SSO] State validated successfully, age:', Math.floor(stateAge / 1000), 'seconds');
    return true;

  } catch (error) {
    console.error('[SSO] State validation error:', error.message);
    return false;
  }
};

/**
 * Get all settings
 */
const getSettings = asyncHandler(async (req, res) => {
  try {
    const includeSensitive = req.query.include_sensitive === 'true';
    const settings = await settingsService.getAllSettings(includeSensitive);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    throw new CustomError(req.t('settings.fetch_failed'), 500);
  }
});

/**
 * Get a single setting
 */
const getSetting = asyncHandler(async (req, res) => {
  try {
    const { key } = req.params;
    const value = await settingsService.getSetting(key);

    if (value === null) {
      throw new CustomError(req.t('settings.not_found'), 404);
    }

    res.json({
      success: true,
      data: { key, value }
    });
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    console.error('Get setting error:', error);
    throw new CustomError(req.t('settings.fetch_failed'), 500);
  }
});

/**
 * Save a setting
 */
const setSetting = asyncHandler(async (req, res) => {
  try {
    const { key } = req.params;
    const { value, type = 'string', isSensitive = false } = req.body;

    if (value === undefined) {
      throw new CustomError(req.t('validation.value_required'), 400);
    }

    await settingsService.setSetting(key, value, type, isSensitive);

    res.json({
      success: true,
      data: { message: req.t('settings.saved'), key, value }
    });
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    console.error('Set setting error:', error);
    throw new CustomError(req.t('settings.save_failed'), 500);
  }
});

/**
 * Update multiple settings at once
 */
const updateSettings = asyncHandler(async (req, res) => {
  try {
    const { settings } = req.body;

    console.log('[SETTINGS] updateSettings called with:', Object.keys(settings || {}));

    if (!settings || typeof settings !== 'object') {
      throw new CustomError(req.t('validation.settings_object_required'), 400);
    }

    const results = await settingsService.updateSettings(settings);

    console.log('[SETTINGS] Update results:', results);

    res.json({
      success: true,
      data: { message: req.t('settings.updated'), results }
    });
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    console.error('❌ Update settings error:', error);
    throw new CustomError(req.t('settings.update_failed'), 500);
  }
});

/**
 * Delete a setting
 */
const deleteSetting = asyncHandler(async (req, res) => {
  try {
    const { key } = req.params;
    const deleted = await settingsService.deleteSetting(key);

    if (!deleted) {
      throw new CustomError(req.t('settings.not_found'), 404);
    }

    res.json({
      success: true,
      data: { message: req.t('settings.deleted'), key }
    });
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    console.error('Delete setting error:', error);
    throw new CustomError(req.t('settings.delete_failed'), 500);
  }
});

/**
 * Validate SSO configuration
 */
const validateSSO = asyncHandler(async (req, res) => {
  try {
    const validation = await settingsService.validateSSOSettings();

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('SSO validation error:', error);
    throw new CustomError(req.t('settings.sso_validation_failed'), 500);
  }
});

/**
 * Get SSO settings (public endpoint for the login page)
 */
const getSSOConfig = asyncHandler(async (req, res) => {
  try {
    const ssoEnabled = await settingsService.getSetting('sso_enabled');
    const ssoOnly = await settingsService.getSetting('sso_only');
    const ssoProvider = await settingsService.getSetting('sso_provider');
    const ssoAuthUrl = await settingsService.getSetting('sso_authority_url');
    const ssoClientId = await settingsService.getSetting('sso_client_id');

    // Only public data + CSRF protected state parameter
    const config = {
      enabled: Boolean(ssoEnabled),
      ssoOnly: Boolean(ssoOnly),
      provider: ssoProvider || '',
      authUrl: ssoAuthUrl || '',
      clientId: ssoClientId || '',
      state: generateSSOState()  // SECURITY: Cryptographically secure state (CSRF protection)
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get SSO config error:', error);
    throw new CustomError(req.t('settings.sso_config_fetch_failed'), 500);
  }
});

/**
 * Handle OAuth2 SSO callback
 */
const handleSSOCallback = asyncHandler(async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth2 error
    if (error) {
      console.error('OAuth2 error:', error);
      return res.redirect(`/login?sso_error=${encodeURIComponent(error)}`);
    }

    // Check required parameters
    if (!code || !state) {
      console.error('Missing OAuth2 parameters:', { code: !!code, state: !!state });
      return res.redirect('/login?sso_error=missing_parameters');
    }

    // SECURITY: State parameter validation (CSRF protection)
    // State format: timestamp.nonce.hmac
    // HMAC = sha256(timestamp + nonce, JWT_SECRET)
    if (!validateSSOState(state)) {
      console.error('[SECURITY] Invalid SSO state parameter - possible CSRF attack!', {
        state: state.substring(0, 20) + '...',
        ip: req.ip,
        userAgent: req.get('user-agent')?.substring(0, 50)
      });
      return res.redirect('/login?sso_error=invalid_state');
    }

    // Get SSO configuration
    const ssoEnabled = await settingsService.getSetting('sso_enabled');
    if (!ssoEnabled) {
      return res.redirect('/login?sso_error=sso_disabled');
    }

    const ssoProvider = await settingsService.getSetting('sso_provider');
    const ssoClientId = await settingsService.getSetting('sso_client_id');
    const ssoClientSecret = await settingsService.getSetting('sso_client_secret');
    const ssoAuthUrl = await settingsService.getSetting('sso_authority_url');
    const ssoRedirectUri = await settingsService.getSetting('sso_redirect_uri');

    if (!ssoProvider || !ssoClientId || !ssoClientSecret || !ssoAuthUrl) {
      console.error('Incomplete SSO configuration');
      return res.redirect('/login?sso_error=sso_misconfigured');
    }

    // Determine token exchange endpoint based on provider
    let tokenEndpoint;
    switch (ssoProvider.toLowerCase()) {
      case 'authentik': {
        // Build the token endpoint by extracting the base URL from the authorize URL
        const baseUrl = ssoAuthUrl.replace(/\/application\/o\/authorize\/?\/?$/, '');
        tokenEndpoint = `${baseUrl}/application/o/token/`;
        break;
      }
      case 'keycloak':
        tokenEndpoint = `${ssoAuthUrl.replace(/\/+$/, '')}/protocol/openid-connect/token`;
        break;
      case 'azure':
        tokenEndpoint = `${ssoAuthUrl.replace(/\/+$/, '')}/oauth2/v2.0/token`;
        break;
      case 'google':
        tokenEndpoint = 'https://oauth2.googleapis.com/token';
        break;
      default:
        tokenEndpoint = `${ssoAuthUrl.replace(/\/+$/, '')}/token`;
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ssoClientId,
        client_secret: ssoClientSecret,
        code: code,
        redirect_uri: ssoRedirectUri || `${req.protocol}://${req.get('host')}/api/sso/callback`,
        state: state
      })
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error('Token exchange failed:', tokenError);
      return res.redirect('/login?sso_error=token_exchange_failed');
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('No access token received:', tokenData);
      return res.redirect('/login?sso_error=no_access_token');
    }

    // Fetch user information
    let userInfoEndpoint;
    switch (ssoProvider.toLowerCase()) {
      case 'authentik': {
        // Build the userinfo endpoint by extracting the base URL from the authorize URL
        const baseUrlUserInfo = ssoAuthUrl.replace(/\/application\/o\/authorize\/?\/?$/, '');
        userInfoEndpoint = `${baseUrlUserInfo}/application/o/userinfo/`;
        break;
      }
      case 'keycloak':
        userInfoEndpoint = `${ssoAuthUrl.replace(/\/+$/, '')}/protocol/openid-connect/userinfo`;
        break;
      case 'azure':
        userInfoEndpoint = 'https://graph.microsoft.com/v1.0/me';
        break;
      case 'google':
        userInfoEndpoint = 'https://www.googleapis.com/oauth2/v2/userinfo';
        break;
      default:
        userInfoEndpoint = `${ssoAuthUrl.replace(/\/+$/, '')}/userinfo`;
    }

    const userInfoResponse = await fetch(userInfoEndpoint, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    });

    if (!userInfoResponse.ok) {
      const userInfoError = await userInfoResponse.text();
      console.error('User info fetch failed:', userInfoError);
      return res.redirect('/login?sso_error=userinfo_failed');
    }

    const userInfo = await userInfoResponse.json();
    console.log('SSO User info received:', {
      provider: ssoProvider,
      username: userInfo.preferred_username || userInfo.email || userInfo.sub,
      email: userInfo.email
    });

    // Find or create user in the database
    const authController = require('./authController');
    const jwtToken = await authController.findOrCreateSSOUser(userInfo, ssoProvider, req);

    if (!jwtToken) {
      console.error('Failed to create/find SSO user');
      return res.redirect('/login?sso_error=user_creation_failed');
    }

    // Successful login - HTML meta refresh redirect with clean URL
    // The token is stored in sessionStorage via JavaScript, NEVER visible in the URL!
    console.log('[SSO] Sending token transfer HTML (token length:', jwtToken ? jwtToken.length : 0, ')');

    // HTML page that:
    // 1. Stores the token in sessionStorage via JavaScript
    // 2. Immediately redirects to /dashboard with a CLEAN URL
    // 3. Token NEVER appears in the URL or browser history
    const tokenTransferHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Logging in...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .loading {
            text-align: center;
            color: white;
        }
        .spinner {
            border: 4px solid rgba(255,255,255,0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loading">
        <div class="spinner"></div>
        <h2>Login successful!</h2>
        <p>Redirecting...</p>
    </div>
    <script>
        // Store token in sessionStorage (never visible in URL!)
        const token = ${JSON.stringify(jwtToken)};
        sessionStorage.setItem('sso_token_transfer', token);

        // Immediate redirect with clean URL (0ms delay)
        // Token NEVER goes into the URL or browser history!
        window.location.replace('/');
    </script>
</body>
</html>`;

    res.send(tokenTransferHTML);

  } catch (error) {
    console.error('SSO callback error:', error);
    res.redirect('/login?sso_error=callback_error');
  }
});

/**
 * Reset system settings to defaults
 */
const resetToDefaults = asyncHandler(async (req, res) => {
  try {
    const { category } = req.body; // 'all', 'sso', 'smtp', 'security'

    // Security check - admin user only
    if (req.user.username !== 'admin') {
      throw new CustomError(req.t('settings.only_admin_can_reset'), 403);
    }

    let resetKeys = [];

    switch (category) {
      case 'sso':
        resetKeys = [
          'sso_enabled', 'sso_provider', 'sso_client_id', 'sso_client_secret',
          'sso_authority_url', 'sso_redirect_uri', 'sso_scopes'
        ];
        break;
      case 'security':
        resetKeys = [
          'jwt_expiry', 'session_timeout', 'webhook_signature_validation'
        ];
        break;
      case 'all':
        // All settings need to be deleted and reinitialized
        throw new CustomError(req.t('settings.full_reset_not_supported'), 400);
      default:
        throw new CustomError(req.t('validation.invalid_category'), 400);
    }

    const results = [];
    for (const key of resetKeys) {
      const deleted = await settingsService.deleteSetting(key);
      results.push({ key, reset: deleted });
    }

    res.json({
      success: true,
      data: { message: req.t('settings.category_reset', { category }), results }
    });
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    console.error('Reset settings error:', error);
    throw new CustomError(req.t('settings.reset_failed'), 500);
  }
});

/**
 * Validation rules
 */
const settingValidation = [
  body('value').notEmpty().withMessage('Value is required'),
  body('type').optional().isIn(['string', 'number', 'boolean', 'json']).withMessage('Invalid type'),
  body('isSensitive').optional().isBoolean().withMessage('isSensitive must be a boolean value')
];

const updateSettingsValidation = [
  body('settings').isObject().withMessage('Settings object is required')
];

module.exports = {
  getSettings,
  getSetting,
  setSetting,
  updateSettings,
  deleteSetting,
  validateSSO,
  getSSOConfig,
  handleSSOCallback,
  resetToDefaults,
  settingValidation,
  updateSettingsValidation
};