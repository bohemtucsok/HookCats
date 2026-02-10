/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and returns consistent JSON responses
 */
const errorHandler = (error, req, res, next) => {
  // SECURITY: Sanitize error logging - don't log sensitive data in production
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Production: Log minimal information (no stack traces)
    console.error('Error occurred:', {
      message: error.message,
      statusCode: error.statusCode || 500,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
      // Stack trace intentionally omitted in production
    });
  } else {
    // Development: Log full error details including stack trace
    console.error('Error occurred:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }

  // Default error response
  let statusCode = 500;
  let message = 'Internal server error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = error.message;
  } else if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Resource not found';
  } else if (error.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Duplicate entry - resource already exists';
  } else if (error.code && error.code.startsWith('ER_')) {
    // SECURITY: Sanitize database errors (don't expose schema info)
    statusCode = 400;
    message = isProduction ? 'Database operation failed' : `Database error: ${error.message}`;
  } else if (error.statusCode) {
    statusCode = error.statusCode;
    message = error.message;
  }

  // SECURITY: Don't expose internal error details in production
  if (isProduction && statusCode === 500) {
    message = 'Internal server error';
  }

  // SECURITY: Never include stack traces in API response
  const errorResponse = {
    success: false,
    error: message
  };

  // Development only: Add stack trace to response
  if (!isProduction && statusCode === 500) {
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Async error wrapper - wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create custom error with status code
 */
class CustomError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'CustomError';
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  CustomError
};