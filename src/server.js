const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// express-mongo-sanitize removed - irrelevant for MySQL project, could corrupt webhook payloads
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Override console.log based on LOG_LEVEL (must be first!)
require('./config/consoleOverride');

// Validate environment variables BEFORE starting the server
const { validateEnv } = require('./config/validateEnv');
validateEnv();

const apiRoutes = require('./backend/routes/api');
const webhookRoutes = require('./backend/routes/webhook');

const { errorHandler } = require('./backend/middleware/errorHandler');
const database = require('./backend/config/database');
const settingsService = require('./backend/services/settingsService');

const app = express();
const PORT = process.env.PORT || 6688;

// Trust proxy - CRITICAL for nginx proxy manager
// Use number of proxies instead of 'true' for better security with rate limiting
// 1 = trust the first proxy (nginx proxy manager)
app.set('trust proxy', 1);

// SECURITY: HTTPS Redirect Middleware (production only)
// Force HTTPS in production environment (Nginx proxy sends X-Forwarded-Proto header)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Check if request is HTTPS (via Nginx proxy header)
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;

    if (!isHttps) {
      // Redirect HTTP → HTTPS
      const httpsUrl = `https://${req.headers.host}${req.url}`;

      // Only log non-health-check redirects to avoid log spam
      if (req.url !== '/health') {
        console.warn(`[SECURITY] HTTP request detected, redirecting to HTTPS: ${req.url}`);
      }

      return res.redirect(301, httpsUrl); // 301 Permanent Redirect
    }

    next();
  });
}

// Security middleware - Helmet with enhanced security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", // Needed for inline scripts (SSO callback, auth check)
        "https://cdnjs.cloudflare.com", // Font Awesome
        "https://cdn.jsdelivr.net" // ApexCharts
      ],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc)
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"], // Font Awesome CSS from CDN
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "chrome-extension:"], // Allow Chrome extensions and source maps
      fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"], // Font Awesome fonts from CDN
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  // Additional security headers
  referrerPolicy: { policy: 'no-referrer' }, // Prevent referrer leakage (SSO URL protection)
  dnsPrefetchControl: { allow: false }, // Disable DNS prefetching for privacy
  permittedCrossDomainPolicies: { permittedPolicies: 'none' } // Block Adobe Flash/PDF cross-domain
}));

// CORS configuration with whitelist
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting - API general (Role-based limits for DoS protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes

  // SECURITY: Role-based rate limits (DoS protection)
  max: (req) => {
    // Admin role: 5000 requests / 15 min (monitoring, bulk operations)
    if (req.user && req.user.role === 'admin') {
      return 5000;
    }

    // Authenticated user: 2000 requests / 15 min (normal API usage)
    if (req.user && req.user.role === 'user') {
      return 2000;
    }

    // Unauthenticated: 500 requests / 15 min (public endpoints, login)
    return 500;
  },

  standardHeaders: true,
  legacyHeaders: false,

  // Validate that trust proxy is correctly configured
  validate: {
    trustProxy: false // Disable the strict validation since we use numeric value
  },

  // Dynamic message based on user role
  message: (req) => {
    const userType = req.user
      ? (req.user.role === 'admin' ? 'admin user' : 'authenticated user')
      : 'unauthenticated user';

    return {
      success: false,
      error: `Too many requests (${userType}). Please try again later.`,
      userType: userType
    };
  }
});

// Rate limiting - Login endpoint (stricter)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false // Disable the strict validation
  },
  message: {
    success: false,
    error: 'Too many failed login attempts. Please try again in 15 minutes.'
  }
});

// Webhook routes BEFORE body parsing middleware
// This is critical for HMAC validation which needs raw body
// Available webhook endpoints:
// - /webhook/h7k9m2x/synology (legacy)
// - /webhook/n4p8w6z/proxmox (legacy)
// - /webhook/:secretKey (dynamic)
app.use('/webhook', webhookRoutes);

// Body parsing middleware (after webhook routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' })); // For Watchtower/Shoutrrr

// Cookie parser middleware
app.use(cookieParser());

// NoSQL sanitization removed - MySQL project uses parameterized queries for SQL injection protection

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    const dbHealthy = await database.healthCheck();

    const healthData = {
      status: dbHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        api: 'OK',
        webhooks: 'OK',
        database: dbHealthy ? 'OK' : 'ERROR'
      },
      endpoints: {
        api: '/api/*',
        webhooks: [
          '/webhook/{secret_key} (dynamic)'
        ]
      }
    };

    // Return 503 if database is not healthy
    const statusCode = dbHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: dbHealthy,
      data: healthData
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({
      success: false,
      data: {
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          api: 'OK',
          webhooks: 'OK',
          database: 'ERROR'
        },
        error: 'Health check failed'
      }
    });
  }
});

// API routes with rate limiting
app.use('/api', apiLimiter, apiRoutes);

// Apply stricter rate limiting to login endpoint
const applyLoginLimiter = (req, res, next) => {
  if (req.path === '/login' || req.path.endsWith('/login')) {
    return loginLimiter(req, res, next);
  }
  next();
};
app.use('/api', applyLoginLimiter);

// Serve static frontend files
app.use(express.static('src/frontend'));

// Serve public files (docs, images, etc.)
app.use(express.static('public'));

// Login page route
app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: 'src/frontend' });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhook/') || req.path.startsWith('/health')) {
    return res.status(404).json({
      success: false,
      error: 'Route not found',
      availableRoutes: [
        '/health',
        '/api/*',
        '/webhook/{secret_key}'
      ]
    });
  }

  // For all other routes (like /dashboard), serve the SPA
  res.sendFile('index.html', { root: 'src/frontend' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  try {
    if (database.pool) await database.pool.end();
  } catch (err) {
    console.error('Error closing database pool:', err.message);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  try {
    if (database.pool) await database.pool.end();
  } catch (err) {
    console.error('Error closing database pool:', err.message);
  }
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  console.log(`✅ Webhook server listening on :${PORT}`);

  // Initialize SettingsService
  try {
    await settingsService.initialize();
  } catch (error) {
    console.error(`❌ SettingsService init failed:`, error.message);
  }
});

module.exports = app;