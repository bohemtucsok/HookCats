/**
 * Lightweight i18n module for HookCats frontend
 * Supports dot-notation keys, template interpolation, DOM translation
 */
class I18n {
    constructor() {
        this.currentLang = 'en';
        this.fallbackLang = 'en';
        this.translations = {};
        this.supportedLangs = ['en', 'hu'];
        this.loaded = false;
    }

    /**
     * Initialize i18n: detect language, load locale file
     */
    async init() {
        this.currentLang = this.detectLanguage();
        await this.loadLocale(this.currentLang);
        if (this.currentLang !== this.fallbackLang) {
            await this.loadLocale(this.fallbackLang);
        }
        this.loaded = true;
        document.documentElement.lang = this.currentLang;
        this.translateDOM();
    }

    /**
     * Detect language from localStorage, user profile, or browser
     */
    detectLanguage() {
        // 1. localStorage preference
        const stored = localStorage.getItem('preferred_language');
        if (stored && this.supportedLangs.includes(stored)) {
            return stored;
        }

        // 2. Browser language
        const browserLang = (navigator.language || navigator.userLanguage || 'en').split('-')[0];
        if (this.supportedLangs.includes(browserLang)) {
            return browserLang;
        }

        return this.fallbackLang;
    }

    /**
     * Load locale JSON file
     */
    async loadLocale(lang) {
        if (this.translations[lang]) return;
        try {
            const response = await fetch(`/locales/${lang}.json`);
            if (response.ok) {
                this.translations[lang] = await response.json();
            }
        } catch (e) {
            console.warn(`[i18n] Failed to load locale: ${lang}`, e);
        }
    }

    /**
     * Translate a key with optional parameter interpolation
     * @param {string} key - Dot-notation key (e.g. 'common.save')
     * @param {Object} params - Template parameters (e.g. { name: 'John' })
     * @returns {string} Translated string or key if not found
     */
    t(key, params = {}) {
        let text = this._resolve(this.translations[this.currentLang], key)
                || this._resolve(this.translations[this.fallbackLang], key)
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
    _resolve(obj, path) {
        if (!obj || !path) return null;
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
    }

    /**
     * Get current language code
     */
    getLanguage() {
        return this.currentLang;
    }

    /**
     * Get locale string for Intl APIs (e.g. 'en-US', 'hu-HU')
     */
    getLocale() {
        return this.currentLang === 'hu' ? 'hu-HU' : 'en-US';
    }

    /**
     * Change language at runtime
     */
    async setLanguage(lang) {
        if (!this.supportedLangs.includes(lang)) return;
        if (lang === this.currentLang) return;

        this.currentLang = lang;
        localStorage.setItem('preferred_language', lang);
        document.documentElement.lang = lang;

        await this.loadLocale(lang);
        this.translateDOM();

        // Notify other modules
        window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang } }));

        // Sync to backend if authenticated
        if (window.api && window.auth && window.auth.isAuthenticated()) {
            try {
                await window.api.changeLanguage(lang);
            } catch (_e) {
                // Silent fail - localStorage already saved
            }
        }
    }

    /**
     * Translate all DOM elements with data-i18n attributes
     */
    translateDOM(container = document) {
        // Text content
        container.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = this.t(key);
        });
        // Placeholders
        container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.placeholder = this.t(key);
        });
        // Title attributes (tooltips)
        container.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) el.title = this.t(key);
        });
        // HTML content (for elements with embedded markup)
        container.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            if (key) el.innerHTML = this.t(key);
        });
    }
}

// Create global i18n instance
window.i18n = new I18n();
