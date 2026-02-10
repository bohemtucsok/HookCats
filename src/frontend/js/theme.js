/**
 * Theme Management - Dark/Light Mode Toggle
 */

const ThemeManager = {
    STORAGE_KEY: 'webhook-admin-theme',
    DARK_MODE_CLASS: 'dark-mode',

    /**
     * Initialize theme on page load
     */
    init() {
        console.log('🌙 ThemeManager initializing...');
        
        // Load saved theme or use system preference
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        console.log('💾 Saved theme:', savedTheme);
        console.log('🖥️ System prefers dark:', prefersDark);

        // Explicit theme setting - always set either light or dark
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            this.enableDarkMode();
        } else {
            // Explicitly enable light mode to ensure clean state
            this.enableLightMode();
        }

        // Set up toggle button
        this.setupToggleButton();

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            // Only follow system preference if user hasn't explicitly set a theme
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                e.matches ? this.enableDarkMode() : this.enableLightMode();
            }
        });
    },

    /**
     * Set up theme toggle button event listener
     */
    setupToggleButton() {
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            console.log('🔘 Theme toggle button found, setting up listener');
            toggleBtn.addEventListener('click', () => this.toggle());
        } else {
            console.warn('⚠️ Theme toggle button not found!');
        }
    },

    /**
     * Toggle between dark and light mode
     */
    toggle() {
        console.log('🔄 Toggling theme...');
        const currentTheme = this.getCurrentTheme();
        console.log('📊 Current theme:', currentTheme);
        
        if (currentTheme === 'dark') {
            console.log('☀️ Switching to light mode');
            this.enableLightMode();
        } else {
            console.log('🌙 Switching to dark mode');
            this.enableDarkMode();
        }
    },

    /**
     * Enable dark mode
     */
    enableDarkMode() {
        console.log('🌙 Enabling dark mode');
        document.body.classList.add(this.DARK_MODE_CLASS);
        this.updateToggleIcon(true);
        localStorage.setItem(this.STORAGE_KEY, 'dark');
        
        // Show toast notification if app is available
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('info', window.i18n ? window.i18n.t('theme.changed') : 'Theme changed', window.i18n ? window.i18n.t('theme.dark_activated') : 'Dark mode activated');
        }
    },

    /**
     * Enable light mode
     */
    enableLightMode() {
        console.log('☀️ Enabling light mode');
        document.body.classList.remove(this.DARK_MODE_CLASS);
        this.updateToggleIcon(false);
        localStorage.setItem(this.STORAGE_KEY, 'light');
        
        // Show toast notification if app is available
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('info', window.i18n ? window.i18n.t('theme.changed') : 'Theme changed', window.i18n ? window.i18n.t('theme.light_activated') : 'Light mode activated');
        }
    },

    /**
     * Update toggle button icon
     */
    updateToggleIcon(isDark) {
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
                console.log('🎨 Updated icon to:', icon.className);
            }
            toggleBtn.title = isDark ? (window.i18n ? window.i18n.t('theme.light_mode') : 'Light mode') : (window.i18n ? window.i18n.t('theme.dark_mode') : 'Dark mode');
        }
    },

    /**
     * Get current theme
     */
    getCurrentTheme() {
        const hasDarkClass = document.body.classList.contains(this.DARK_MODE_CLASS);
        const theme = hasDarkClass ? 'dark' : 'light';
        console.log('📊 getCurrentTheme:', theme, 'hasClass:', hasDarkClass);
        return theme;
    },

    /**
     * Debug function to check current state
     */
    debug() {
        console.log('🔍 ThemeManager Debug:');
        console.log('- Current theme:', this.getCurrentTheme());
        console.log('- Dark class on body:', document.body.classList.contains(this.DARK_MODE_CLASS));
        console.log('- LocalStorage value:', localStorage.getItem(this.STORAGE_KEY));
        console.log('- Toggle button exists:', !!document.getElementById('themeToggle'));
        
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            console.log('- Toggle button icon:', icon?.className);
            console.log('- Toggle button title:', toggleBtn.title);
        }
    }
};

// Make ThemeManager globally available for debugging
window.ThemeManager = ThemeManager;

// Initialize theme when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
    ThemeManager.init();
}
