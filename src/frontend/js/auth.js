/**
 * Authentication module for JWT token management
 */
class Auth {
    constructor() {
        this.tokenKey = 'webhook_admin_token';
        this.userKey = 'webhook_admin_user';
        this.token = this.getStoredToken();
        this.user = this.getStoredUser();
    }

    /**
     * Get token from localStorage
     */
    getStoredToken() {
        try {
            return localStorage.getItem(this.tokenKey);
        } catch (error) {
            console.error('Error getting stored token:', error);
            return null;
        }
    }

    /**
     * Get user info from localStorage
     */
    getStoredUser() {
        try {
            const userStr = localStorage.getItem(this.userKey);
            return userStr ? JSON.parse(userStr) : null;
        } catch (error) {
            console.error('Error getting stored user:', error);
            return null;
        }
    }

    /**
     * Store token and user info
     */
    setAuth(token, user) {
        try {
            this.token = token;
            this.user = user;
            localStorage.setItem(this.tokenKey, token);
            localStorage.setItem(this.userKey, JSON.stringify(user));
            return true;
        } catch (error) {
            console.error('Error storing auth data:', error);
            return false;
        }
    }

    /**
     * Set token only (for SSO scenarios where we get token first)
     */
    setToken(token) {
        try {
            console.log('[AUTH] setToken called, token length:', token ? token.length : 0);
            this.token = token;
            localStorage.setItem(this.tokenKey, token);
            console.log('[AUTH] Token stored in localStorage');

            // Try to extract user info from JWT token
            const payload = this.parseJWT(token);
            // JWT payload contains sensitive data (fp fingerprint etc.) - DO NOT log it!
            if (payload && payload.username) {
                const user = {
                    id: payload.userId,
                    username: payload.username,
                    role: payload.role || 'user'  // Include role from JWT
                };
                this.user = user;
                localStorage.setItem(this.userKey, JSON.stringify(user));
                console.log('[AUTH] User info stored:', user.username, 'role:', user.role);
            }

            console.log('[AUTH] Token set successfully, this.token exists:', !!this.token);
            return true;
        } catch (error) {
            console.error('Error storing token:', error);
            return false;
        }
    }

    /**
     * Clear authentication data
     */
    clearAuth() {
        try {
            console.error('[AUTH] ⚠️ clearAuth() CALLED! Stack trace:');
            console.trace();
            this.token = null;
            this.user = null;
            localStorage.removeItem(this.tokenKey);
            localStorage.removeItem(this.userKey);
            return true;
        } catch (error) {
            console.error('Error clearing auth data:', error);
            return false;
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        if (!this.token) {
            return false;
        }

        try {
            // Check if token is expired
            const payload = this.parseJWT(this.token);
            if (!payload) {
                return false;
            }

            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now) {
                this.clearAuth();
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error checking authentication:', error);
            this.clearAuth();
            return false;
        }
    }

    /**
     * Parse JWT token (simple base64 decode, no verification)
     */
    parseJWT(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }

            const payload = parts[1];
            const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decoded);
        } catch (error) {
            console.error('Error parsing JWT:', error);
            return null;
        }
    }

    /**
     * Get current user info
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Get current token
     */
    getToken() {
        return this.token;
    }

    /**
     * Get authorization header
     */
    getAuthHeader() {
        console.log('[AUTH] getAuthHeader called, this.token exists:', !!this.token, 'length:', this.token ? this.token.length : 0);
        return this.token ? `Bearer ${this.token}` : null;
    }

    /**
     * Login with username and password
     */
    async login(username, password) {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            if (!data.success || !data.data.token) {
                throw new Error('Invalid login response');
            }

            // Store authentication data
            const { token, user } = data.data;
            if (!this.setAuth(token, user)) {
                throw new Error('Failed to store authentication data');
            }

            return {
                success: true,
                user: user
            };

        } catch (error) {
            console.error('Login error:', error);
            this.clearAuth();
            return {
                success: false,
                error: error.message || 'Login failed'
            };
        }
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            // Optional: call logout endpoint to invalidate token on server
            if (this.token) {
                try {
                    await fetch('/api/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': this.getAuthHeader(),
                            'Content-Type': 'application/json'
                        }
                    });
                } catch (error) {
                    // Ignore logout endpoint errors
                    console.warn('Logout endpoint error:', error);
                }
            }

            this.clearAuth();
            return true;
        } catch (error) {
            console.error('Logout error:', error);
            this.clearAuth();
            return false;
        }
    }

    /**
     * Refresh token if needed
     */
    async refreshToken() {
        if (!this.token) {
            return false;
        }

        try {
            const response = await fetch('/api/refresh', {
                method: 'POST',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            const data = await response.json();
            if (data.success && data.data.token) {
                this.setAuth(data.data.token, data.data.user || this.user);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearAuth();
            return false;
        }
    }

    /**
     * Check token expiration and refresh if needed
     */
    async ensureValidToken() {
        if (!this.token) {
            return false;
        }

        try {
            const payload = this.parseJWT(this.token);
            if (!payload) {
                this.clearAuth();
                return false;
            }

            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = payload.exp - now;

            // Refresh token if it expires in less than 5 minutes
            if (timeUntilExpiry < 300) {
                return await this.refreshToken();
            }

            return true;
        } catch (error) {
            console.error('Error ensuring valid token:', error);
            this.clearAuth();
            return false;
        }
    }

    /**
     * Handle authentication errors from API calls
     */
    handleAuthError(response) {
        if (response.status === 401) {
            this.clearAuth();
            this.redirectToLogin();
            return true;
        }
        // 403 = authenticated but not authorized - don't logout, just show error
        return false;
    }

    /**
     * Redirect to login screen
     */
    redirectToLogin() {
        if (window.app && typeof window.app.showLoginScreen === 'function') {
            window.app.showLoginScreen();
        } else {
            // Fallback: reload page to show login
            window.location.reload();
        }
    }

    /**
     * Initialize authentication state
     */
    init() {
        // Check if token is valid on page load
        if (this.token && !this.isAuthenticated()) {
            this.clearAuth();
        }

        // Set up periodic token refresh check
        setInterval(() => {
            if (this.isAuthenticated()) {
                this.ensureValidToken();
            }
        }, 60000); // Check every minute
    }
}

// Create global auth instance
window.auth = new Auth();

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.auth.init();
    });
} else {
    window.auth.init();
}