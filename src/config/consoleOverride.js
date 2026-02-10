/**
 * Console Override for Production
 * Silences debug console.log based on LOG_LEVEL
 */

const originalConsoleLog = console.log;
const originalConsoleDebug = console.debug;

// Determine if we should suppress console output
const shouldSuppress = () => {
  const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const nodeEnv = process.env.NODE_ENV || 'development';

  // In development, never suppress
  if (nodeEnv === 'development') {
    return false;
  }

  // In production with info or higher, suppress console.log
  return logLevel === 'info' || logLevel === 'warn' || logLevel === 'error';
};

// Override console.log to respect LOG_LEVEL
console.log = function(...args) {
  // Check if this is a tagged log (starts with [TAG])
  const firstArg = args[0];
  const isTaggedLog = typeof firstArg === 'string' && firstArg.match(/^\[.+\]/);

  // Suppress tagged debug logs in production info mode
  if (shouldSuppress() && isTaggedLog) {
    // Only show important tags
    const importantTags = ['[ERROR]', '[SECURITY]'];
    const hasImportantTag = importantTags.some(tag => firstArg.includes(tag));

    if (!hasImportantTag) {
      return; // Suppress
    }
  }

  // Pass through to original console.log
  originalConsoleLog.apply(console, args);
};

// Override console.debug - always suppress in production
console.debug = function(...args) {
  if (process.env.LOG_LEVEL === 'debug') {
    originalConsoleDebug.apply(console, args);
  }
};

module.exports = {
  restore: () => {
    console.log = originalConsoleLog;
    console.debug = originalConsoleDebug;
  }
};
