/**
 * Lightweight i18n module for HookCats backend
 * Loads JSON locale files and provides translation function
 */

const fs = require('fs');
const path = require('path');

class I18n {
    constructor() {
        this.translations = {};
        this.defaultLang = 'en';
        this.supportedLangs = ['en', 'hu'];
        this.loadLocales();
    }

    /**
     * Load all locale files from locales directory
     */
    loadLocales() {
        const localesDir = path.join(__dirname, 'locales');
        for (const lang of this.supportedLangs) {
            const filePath = path.join(localesDir, `${lang}.json`);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                this.translations[lang] = JSON.parse(content);
            } catch (e) {
                console.warn(`[i18n] Failed to load locale: ${lang}`, e.message);
                this.translations[lang] = {};
            }
        }
    }

    /**
     * Translate a key for a given language
     * @param {string} lang - Language code ('en' or 'hu')
     * @param {string} key - Dot-notation key (e.g. 'auth.invalid_credentials')
     * @param {Object} params - Template parameters (e.g. { minutes: 30 })
     * @returns {string} Translated string or key if not found
     */
    t(lang, key, params = {}) {
        const effectiveLang = this.supportedLangs.includes(lang) ? lang : this.defaultLang;
        let text = this._resolve(this.translations[effectiveLang], key)
                || this._resolve(this.translations[this.defaultLang], key)
                || key;

        // Template interpolation: replace {{param}} with value
        for (const [param, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{\\{${param}\\}\\}`, 'g'), value);
        }
        return text;
    }

    /**
     * Resolve dot-notation path in object
     */
    _resolve(obj, dotPath) {
        if (!obj || !dotPath) return null;
        return dotPath.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
    }
}

module.exports = new I18n();
