const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const database = require('../config/database');

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and adds user info to request object
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Token lookup: 1. Authorization header, 2. HttpOnly cookie (SSO login)
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    // If no Authorization header, try from cookie
    if (!token && req.cookies && req.cookies.jwt_token) {
      token = req.cookies.jwt_token;
      console.log('[AUTH] Token found in HttpOnly cookie (SSO login)');
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // SECURITY: Verify session fingerprint if present in token
    if (decoded.fp) {
      const currentFingerprint = generateFingerprint(req);

      if (decoded.fp !== currentFingerprint) {
        // Session fingerprint mismatch - potential session hijacking
        // SECURITY: Sensitive data redaction in production logs
        const logData = process.env.NODE_ENV === 'production'
          ? {
              userId: `user_${decoded.userId}`, // Redacted: ID only
              role: decoded.role,
              tokenFp: decoded.fp.substring(0, 8) + '...', // Redacted: first 8 characters only
              currentFp: currentFingerprint.substring(0, 8) + '...', // Redacted
              ipMasked: req.ip?.split('.').slice(0, 3).join('.') + '.***', // Redacted: last octet
              timestamp: new Date().toISOString()
            }
          : {
              // Development: full log
              username: decoded.username,
              userId: decoded.userId,
              role: decoded.role,
              tokenFingerprint: decoded.fp,
              currentFingerprint: currentFingerprint,
              ip: req.ip,
              userAgent: req.get('user-agent')?.substring(0, 50),
              timestamp: new Date().toISOString()
            };

        console.warn('[SECURITY] Session fingerprint mismatch detected:', logData);

        // SECURITY: Strict fingerprint validation policy
        // STRICT_FINGERPRINT_MODE environment variable:
        // - 'admin' (default): strict for admin users only
        // - 'all': strict for all users (max security)
        // - 'none': no strict mode (log only) - NOT RECOMMENDED!
        const strictMode = process.env.STRICT_FINGERPRINT_MODE || 'admin';

        let shouldReject = false;
        let reason = '';

        if (strictMode === 'all') {
          // STRICT mode for all users
          shouldReject = true;
          reason = 'all users (STRICT_FINGERPRINT_MODE=all)';
        } else if (strictMode === 'admin' && decoded.role === 'admin') {
          // STRICT mode for admin users only (default)
          shouldReject = true;
          reason = 'admin users (STRICT_FINGERPRINT_MODE=admin)';
        }
        // strictMode === 'none' or non-admin user -> log only, allow

        if (shouldReject) {
          console.error(`[SECURITY] Session fingerprint mismatch - REJECTING for ${reason}`);
          return res.status(401).json({
            success: false,
            error: 'Session validation failed - please login again'
          });
        }

        // Fingerprint mismatch allowed (due to VPN/network change)
        // SECURITY: Sensitive data redaction in production
        const userInfo = process.env.NODE_ENV === 'production'
          ? `user_${decoded.userId}` // Redacted username
          : decoded.username; // Full username in development

        console.warn(`[SECURITY] Fingerprint mismatch allowed for ${userInfo} (role: ${decoded.role}, mode: ${strictMode})`);
      }
    }

    // Check if user still exists in database and get role information
    const users = await database.query(
      'SELECT id, username, role, is_active, created_at FROM users WHERE id = ? AND username = ?',
      [decoded.userId, decoded.username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token - user not found'
      });
    }

    const user = users[0];

    // Check if user is active
    if (user.is_active === false) {
      return res.status(401).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    // Add user info to request object including role
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role || 'user', // Default to 'user' if role is null
      is_active: user.is_active,
      created_at: user.created_at
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication service error'
    });
  }
};

/**
 * Generate session fingerprint from IP and User-Agent
 * @param {Object} req - Express request object
 * @returns {string} - Hashed fingerprint (first 16 chars)
 */
const generateFingerprint = (req) => {
  const ip = req.ip || req.connection.remoteAddress || '';
  const userAgent = req.get('user-agent') || '';

  // Hash the combination for privacy (don't store raw IP/UA in token)
  return crypto
    .createHash('sha256')
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .substring(0, 16);
};

/**
 * Generate JWT token for user with role information and session fingerprint
 * @param {Object} user - User object with id, username, role
 * @param {Object} req - Express request object (optional)
 * @returns {string} - JWT token
 */
const generateToken = (user, req = null) => {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role || 'user' // Include role in JWT payload
  };

  // Add session fingerprint if request object provided
  if (req) {
    payload.fp = generateFingerprint(req); // Session fingerprint
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '24h',
    issuer: 'hookcats'
  });
};

/**
 * Optional authentication middleware - allows both authenticated and anonymous access
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const users = await database.query(
        'SELECT id, username, role, is_active, created_at FROM users WHERE id = ? AND username = ?',
        [decoded.userId, decoded.username]
      );

      if (users.length > 0 && users[0].is_active !== false) {
        req.user = {
          id: users[0].id,
          username: users[0].username,
          role: users[0].role || 'user',
          is_active: users[0].is_active,
          created_at: users[0].created_at
        };
      }
    }

    next();
  } catch (_error) {
    // Continue without authentication if token is invalid
    next();
  }
};

module.exports = {
  authenticateToken,
  generateToken,
  generateFingerprint,
  optionalAuth
};