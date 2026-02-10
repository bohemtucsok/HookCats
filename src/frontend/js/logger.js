/**
 * Frontend Logger - Production-Safe Logging
 *
 * SECURITY: Automatically suppresses debug logs in production environment
 * This prevents API endpoints, token info, and user data from being exposed!
 */

(function() {
    // Detect environment (production domain check)
    const isProduction = window.location.hostname !== 'localhost'
                      && window.location.hostname !== '127.0.0.1'
                      && !window.location.hostname.startsWith('192.168.');

    // Save original console methods
    const originalLog = console.log;
    const originalInfo = console.info;

    if (isProduction) {
        // PRODUCTION: Override console.log, console.info, console.debug
        // Only console.warn and console.error remain visible

        console.log = function() {
            // Suppress ALL console.log in production (information leak prevention)
            // API calls, tokens, usernames, etc. will NOT appear in browser console
            return;
        };

        console.info = function() {
            // Suppress console.info in production
            return;
        };

        console.debug = function() {
            // Suppress console.debug in production
            return;
        };

        // Log that we're in production mode (using console.warn which is NOT suppressed)
        console.warn('[SECURITY] Production mode - debug logging disabled (information leak prevention)');

    } else {
        // DEVELOPMENT: Full logging enabled
        console.log('[LOGGER] Development mode - full logging enabled');
    }

    // Expose logger utility for explicit logging
    window.logger = {
        isProduction: isProduction,

        // These methods respect production mode
        debug: isProduction ? () => {} : originalLog,
        info: isProduction ? () => {} : originalInfo,

        // These are ALWAYS visible
        warn: console.warn,
        error: console.error,

        // Security logs (always visible, prefixed)
        security: (...args) => console.warn('[SECURITY]', ...args)
    };
})();
