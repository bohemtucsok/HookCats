const crypto = require('crypto');
const { CustomError } = require('./errorHandler');

/**
 * Webhook Secret Validation Middleware
 * Validates X-Webhook-Secret header against source-specific webhook_secret
 * This provides an additional security layer beyond the URL secret_key
 */
class WebhookSecretValidator {
  constructor() {
    // Global fallback secret (optional)
    this.globalWebhookSecret = process.env.WEBHOOK_SECRET;
  }

  /**
   * Generate HMAC signature for payload (legacy HMAC support)
   * @param {string|Buffer} payload - The request body
   * @param {string} secret - Secret key for HMAC
   * @returns {string} - HMAC signature
   */
  generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
  }

  /**
   * Verify HMAC signature from request headers (legacy support)
   * @param {string} signature - Signature from header
   * @param {string|Buffer} payload - Request body
   * @param {string} secret - Secret key for HMAC
   * @returns {boolean} - Whether signature is valid
   */
  verifyHMACSignature(signature, payload, secret) {
    if (!signature || !payload || !secret) {
      return false;
    }

    const expectedSignature = this.generateSignature(payload, secret);

    // Handle different signature formats
    let receivedSignature = signature;

    // Remove 'sha256=' prefix if present (GitHub style)
    if (signature.startsWith('sha256=')) {
      receivedSignature = signature.substring(7);
    }

    // Use constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(receivedSignature, 'hex')
      );
    } catch (_error) {
      return false;
    }
  }

  /**
   * Middleware function to validate webhook secret
   * Checks X-Webhook-Secret header against source.webhook_secret
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  validateWebhookSecret = (req, res, next) => {
    try {
      const source = req.webhookSource; // Set by previous middleware

      if (!source) {
        console.log('[WEBHOOK SECRET] No source found in request');
        throw new CustomError('Internal error: source not found', 500);
      }

      // If source has webhook_secret configured, validate it
      if (source.webhook_secret) {
        // GitLab uses X-Gitlab-Token, others use X-Webhook-Secret
        let receivedSecret = req.get('X-Webhook-Secret');
        let headerName = 'X-Webhook-Secret';

        // If GitLab source type, check X-Gitlab-Token instead
        if (source.type === 'gitlab') {
          receivedSecret = req.get('X-Gitlab-Token');
          headerName = 'X-Gitlab-Token';
        }

        if (!receivedSecret) {
          console.log(`[WEBHOOK SECRET] Source "${source.name}" requires ${headerName} header, but none provided`);
          throw new CustomError(`${headerName} header required for this source`, 401);
        }

        // Use constant-time comparison to prevent timing attacks
        const expectedBuf = Buffer.from(source.webhook_secret);
        const receivedBuf = Buffer.from(receivedSecret);

        if (expectedBuf.length !== receivedBuf.length) {
          console.log(`[WEBHOOK SECRET] Invalid ${headerName} for source "${source.name}" (length mismatch)`);
          throw new CustomError(`Invalid ${headerName}`, 401);
        }

        const secretMatch = crypto.timingSafeEqual(expectedBuf, receivedBuf);

        if (!secretMatch) {
          console.log(`[WEBHOOK SECRET] Invalid ${headerName} for source "${source.name}"`);
          throw new CustomError(`Invalid ${headerName}`, 401);
        }

        console.log(`[WEBHOOK SECRET] Valid ${headerName} for source "${source.name}"`);
      } else {
        console.log(`[WEBHOOK SECRET] Source "${source.name}" has no webhook_secret configured - skipping validation`);
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Legacy HMAC validation middleware (kept for backward compatibility)
   * OPTIONAL: If no signature present, skip validation
   */
  validateSignature = (req, res, next) => {
    try {
      // Get signature from headers (support multiple formats)
      const signature = req.get('X-Signature') ||
                       req.get('X-Hub-Signature-256') ||
                       req.get('X-Hub-Signature');

      // OPTIONAL VALIDATION: If no signature is provided, skip validation
      if (!signature) {
        console.log('[HMAC] No signature header found - skipping HMAC validation');
        return next();
      }

      // Get raw body for signature verification
      const payload = req.rawBody || JSON.stringify(req.body);

      // Use global secret or source-specific secret
      const secret = req.webhookSource?.webhook_secret || this.globalWebhookSecret;

      if (!secret) {
        console.log('[HMAC] No secret available for HMAC validation');
        return next();
      }

      if (!this.verifyHMACSignature(signature, payload, secret)) {
        console.log('[HMAC] Signature validation FAILED');
        throw new CustomError('Invalid webhook signature', 401);
      }

      console.log('[HMAC] Signature validation SUCCESS');
      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Middleware to capture raw body for HMAC validation
   * Must be used before express.json() middleware
   */
  captureRawBody = (req, res, next) => {
    let data = '';

    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', () => {
      req.rawBody = data;
      next();
    });
  }
}

// Create singleton instance
const webhookSecretValidator = new WebhookSecretValidator();

module.exports = {
  webhookSecretValidator,
  validateWebhookSecret: webhookSecretValidator.validateWebhookSecret,
  validateSignature: webhookSecretValidator.validateSignature,
  captureRawBody: webhookSecretValidator.captureRawBody
};