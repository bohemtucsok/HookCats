/**
 * Express middleware for i18n support
 * Attaches req.lang and req.t() to every request
 */

const i18n = require('../i18n/i18n');

const SUPPORTED_LANGS = ['en', 'hu'];

const i18nMiddleware = (req, _res, next) => {
    // Language detection priority:
    // 1. X-Language header (sent by frontend)
    // 2. User preference from JWT (set by authenticateToken)
    // 3. Accept-Language header
    // 4. Default: 'en'
    const headerLang = req.headers['x-language'];
    const userLang = req.user && req.user.preferred_language;
    const acceptLang = req.acceptsLanguages(...SUPPORTED_LANGS);

    const detected = headerLang || userLang || acceptLang || 'en';
    req.lang = SUPPORTED_LANGS.includes(detected) ? detected : 'en';

    // Attach translation helper
    req.t = (key, params = {}) => i18n.t(req.lang, key, params);

    next();
};

module.exports = i18nMiddleware;
