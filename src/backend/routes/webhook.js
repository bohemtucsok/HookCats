const express = require('express');
const router = express.Router();

// Import middleware and controllers
const { validateSignature, validateWebhookSecret } = require('../middleware/hmacValidator');
const {
  validateWebhookRequest,
  getWebhookValidationRules
} = require('../controllers/webhookController');
const database = require('../config/database');

/**
 * Webhook Routes
 * Handles incoming webhooks from various sources with HMAC validation
 */

// Raw body capture middleware for HMAC validation
// This captures the raw body before JSON parsing
const captureRawBody = (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');

  req.on('data', chunk => {
    data += chunk;
  });

  req.on('end', () => {
    req.rawBody = data;
    // Parse based on content type
    const contentType = req.get('Content-Type') || '';
    
    if (contentType.includes('application/json')) {
      // Only try to parse if data looks like JSON (starts with { or [)
      const trimmedData = data.trim();
      if (trimmedData.startsWith('{') || trimmedData.startsWith('[')) {
        try {
          req.body = data ? JSON.parse(data) : {};
        } catch (error) {
          console.log('[WEBHOOK] JSON parse error:', error.message);
          req.body = {};
        }
      } else if (trimmedData.length > 0) {
        // Content-Type is JSON but data is not - treat as text
        console.log('[WEBHOOK] Content-Type is application/json but body is not valid JSON, treating as text');
        req.body = { text: data, _contentType: 'text' };
      } else {
        // Empty JSON body
        req.body = {};
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Parse form data
      const querystring = require('querystring');
      req.body = querystring.parse(data);
    } else if (contentType.includes('text/plain')) {
      // Watchtower/Shoutrrr sends text/plain - wrap in object for validation
      req.body = { text: data || '', _contentType: 'text/plain' };
    } else {
      // Unknown content type - try to parse as JSON, fallback to text wrapper
      if (data) {
        try {
          req.body = JSON.parse(data);
        } catch (_error) {
          // Not JSON, wrap as text
          req.body = { text: data, _contentType: contentType };
        }
      } else {
        req.body = {};
      }
    }
    next();
  });

  req.on('error', (error) => {
    console.error('[WEBHOOK] Stream error:', error);
    next(error);
  });
};

// Apply raw body capture to all webhook routes
// CRITICAL: This is required for HMAC signature validation
router.use(captureRawBody);
console.log('[WEBHOOK] Raw body capture middleware enabled for HMAC validation');

/**
 * Dynamic Webhook Endpoint
 * POST /webhook/:secretKey
 *
 * Receives webhooks from any configured source using their unique secret key
 * The secret key is used to identify the source from the database
 * Validates HMAC signature and processes events based on source type
 */
router.post('/:secretKey',
  // Debug middleware
  (req, res, next) => {
    console.log('[WEBHOOK ROUTE] Request received:', {
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      headers: Object.keys(req.headers),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      hasRawBody: !!req.rawBody,
      rawBodyLength: req.rawBody?.length,
      body: req.body
    });
    next();
  },

  // Source lookup middleware - MUST run before webhook secret validation
  async (req, res, next) => {
    try {
      const { secretKey } = req.params;
      console.log(`[WEBHOOK ROUTE] Looking up source with secret_key: ${secretKey}`);

      const sources = await database.query(
        'SELECT id, name, type, secret_key, webhook_secret, visibility, team_id, created_by_user_id FROM sources WHERE secret_key = ? AND is_active = TRUE',
        [secretKey]
      );

      if (sources.length === 0) {
        console.log(`[WEBHOOK ROUTE] Source not found for secret_key: ${secretKey}`);
        return res.status(404).json({
          success: false,
          error: 'Invalid webhook secret key'
        });
      }

      // Attach source to request for later middleware
      req.webhookSource = sources[0];
      console.log(`[WEBHOOK ROUTE] Source found: ${req.webhookSource.name} (ID: ${req.webhookSource.id})`);
      next();
    } catch (error) {
      console.error('[WEBHOOK ROUTE] Error looking up source:', error);
      next(error);
    }
  },

  // Validation middleware
  getWebhookValidationRules(),
  validateWebhookRequest,

  // Webhook secret validation (X-Webhook-Secret header)
  // CRITICAL: This provides source-specific secret protection
  validateWebhookSecret,

  // HMAC signature validation (legacy support)
  // OPTIONAL: If no signature present, skip validation
  validateSignature,

  // Process webhook dynamically
  require('../controllers/webhookController').handleDynamicWebhook
);

// Legacy endpoints removed - use dynamic /webhook/:secretKey instead

/**
 * Legacy Static Webhook Endpoints (for backward compatibility)
 * These redirect to the dynamic endpoint system
 */

// POST /webhook/h7k9m2x/synology - Legacy Synology webhook endpoint
router.post('/h7k9m2x/synology', (req, res, next) => {
  console.log('[WEBHOOK LEGACY] Synology legacy endpoint called - redirecting to dynamic handler');
  req.params.secretKey = 'h7k9m2x';
  req.sourceType = 'synology'; // Hint for the handler
  require('../controllers/webhookController').handleDynamicWebhook(req, res, next);
});

// POST /webhook/n4p8w6z/proxmox - Legacy Proxmox webhook endpoint
router.post('/n4p8w6z/proxmox', (req, res, next) => {
  console.log('[WEBHOOK LEGACY] Proxmox legacy endpoint called - redirecting to dynamic handler');
  req.params.secretKey = 'n4p8w6z';
  req.sourceType = 'proxmox'; // Hint for the handler
  require('../controllers/webhookController').handleDynamicWebhook(req, res, next);
});

/**
 * Health check endpoint for webhook service
 * GET /webhook/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'webhook',
      status: 'OK',
      timestamp: new Date().toISOString(),
      endpoints: [
        '/webhook/{secret_key} (dinamikus)',
        '/webhook/h7k9m2x/synology (legacy)',
        '/webhook/n4p8w6z/proxmox (legacy)'
      ]
    }
  });
});

/**
 * Test endpoint for webhook validation
 * POST /webhook/test
 *
 * Allows testing webhook processing without HMAC validation
 * Should only be enabled in development environments
 */
if (process.env.NODE_ENV === 'development') {
  router.post('/test', (req, res) => {
    console.log('[WEBHOOK TEST] Received test webhook:', {
      headers: req.headers,
      body: req.body,
      rawBody: req.rawBody?.substring(0, 200) + (req.rawBody?.length > 200 ? '...' : ''),
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      data: {
        message: 'Test webhook received',
        receivedPayload: req.body,
        timestamp: new Date().toISOString()
      }
    });
  });
}

/**
 * Catch-all handler for invalid webhook paths
 */
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Webhook endpoint not found',
    availableEndpoints: [
      '/webhook/{secret_key} (dinamikus)'
    ]
  });
});

module.exports = router;