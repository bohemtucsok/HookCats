/**
 * API communication layer with error handling and authentication
 */
class API {
    constructor() {
        this.baseUrl = '/api';
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
    }

    getHeaders(customHeaders = {}) {
        const headers = { ...this.defaultHeaders, ...customHeaders };
        if (window.auth && window.auth.getAuthHeader()) {
            headers['Authorization'] = window.auth.getAuthHeader();
        }
        if (window.i18n) {
            headers['X-Language'] = window.i18n.getLanguage();
        }
        return headers;
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        try {
            if (window.auth && window.auth.isAuthenticated()) {
                await window.auth.ensureValidToken();
            }

            const config = {
                ...options,
                headers: this.getHeaders(options.headers),
                credentials: 'include'
            };

            const response = await fetch(url, config);

            if (window.auth && window.auth.handleAuthError(response)) {
                throw new Error('Authentication required');
            }

            let data;
            const contentType = response.headers.get('Content-Type');

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error(data.error || (window.i18n ? window.i18n.t('auth.no_permission') : 'Access denied'));
                }
                throw new Error(data.error || data.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return {
                success: true,
                data: data.data || data,
                response
            };

        } catch (error) {
            console.error('API request error:', error);
            return {
                success: false,
                error: error.message || 'Request failed',
                response: null
            };
        }
    }

    async get(endpoint, params = {}) {
        const url = new URL(endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });
        return this.request(url.href, { method: 'GET' });
    }

    async post(endpoint, data = {}) {
        return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) });
    }

    async put(endpoint, data = {}) {
        return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    async patch(endpoint, data = {}) {
        return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(data) });
    }

    // === Private scope helpers ===

    _buildScopeEndpoint(resource, scope, teamId) {
        const s = scope || window.scopeManager?.getCurrentScope() || 'personal';
        const tid = teamId || window.scopeManager?.getActiveTeamId();
        return (s === 'team' && tid) ? `/team/${tid}/${resource}` : `/personal/${resource}`;
    }

    _scopedList(resource, filters = {}, scope, teamId) {
        return this.get(this._buildScopeEndpoint(resource, scope, teamId), filters);
    }

    _scopedGet(resource, id, scope, teamId, suffix = '') {
        return this.get(`${this._buildScopeEndpoint(resource, scope, teamId)}/${id}${suffix}`);
    }

    _scopedCreate(resource, data, scope, teamId) {
        return this.post(this._buildScopeEndpoint(resource, scope, teamId), data);
    }

    _scopedUpdate(resource, id, data, scope, teamId) {
        return this.put(`${this._buildScopeEndpoint(resource, scope, teamId)}/${id}`, data);
    }

    _scopedDelete(resource, id, scope, teamId) {
        return this.delete(`${this._buildScopeEndpoint(resource, scope, teamId)}/${id}`);
    }

    _scopedAction(resource, id, action, scope, teamId) {
        return this.post(`${this._buildScopeEndpoint(resource, scope, teamId)}/${id}${action ? '/' + action : ''}`);
    }

    // === Authentication API ===

    async login(username, password) { return this.post('/login', { username, password }); }
    async logout() { return this.post('/logout'); }
    async refreshToken() { return this.post('/refresh'); }

    // === Dashboard API ===

    async getDashboardStats() { return this.get('/dashboard/stats'); }
    async getRecentEvents(limit = 10) { return this.get('/dashboard/recent-events', { limit }); }

    // === Auto-scope CRUD methods (use current scopeManager context) ===

    // Sources
    async getSource(id) { return this._scopedGet('sources', id); }
    async createSource(sourceData) { return this._scopedCreate('sources', sourceData); }
    async updateSource(id, sourceData) { return this._scopedUpdate('sources', id, sourceData); }
    async checkSourceDeletion(id) { return this._scopedGet('sources', id, null, null, '/delete-check'); }
    async deleteSource(id) { return this._scopedDelete('sources', id); }

    // Targets
    async getTarget(id) { return this._scopedGet('targets', id); }
    async createTarget(targetData) { return this._scopedCreate('targets', targetData); }
    async updateTarget(id, targetData) { return this._scopedUpdate('targets', id, targetData); }
    async deleteTarget(id) { return this._scopedDelete('targets', id); }
    async testTarget(id) { return this._scopedAction('test-delivery', id); }

    // Routes
    async getRoute(id) { return this._scopedGet('routes', id); }
    async createRoute(routeData) { return this._scopedCreate('routes', routeData); }
    async updateRoute(id, routeData) { return this._scopedUpdate('routes', id, routeData); }
    async deleteRoute(id) { return this._scopedDelete('routes', id); }

    // Events
    async getEvent(id) { return this._scopedGet('events', id); }
    async deleteEvent(id) { return this._scopedDelete('events', id); }
    async reprocessEvent(id) { return this.post(`/events/${id}/reprocess`); }

    // Deliveries
    async getDelivery(id) { return this._scopedGet('deliveries', id); }
    async retryDelivery(id) { return this._scopedAction('deliveries', id, 'retry'); }
    async deleteDelivery(id) { return this._scopedDelete('deliveries', id); }

    // === Legacy methods (non-scoped, kept for compatibility) ===

    async getSourcesLegacy() { return this.get('/sources'); }
    async getTargetsLegacy() { return this.get('/targets'); }
    async getRoutesLegacy() { return this.get('/routes'); }
    async getEventsLegacy(filters = {}) { return this.get('/events', filters); }
    async getDeliveriesLegacy(filters = {}) { return this.get('/deliveries', filters); }
    async getSources(filters = {}) { return this.get('/sources', filters); }
    async getTargets(filters = {}) { return this.get('/targets', filters); }
    async getRoutes(filters = {}) { return this.get('/routes', filters); }
    async getEvents(filters = {}) { return this.get('/events', filters); }
    async getDeliveries(filters = {}) { return this.get('/deliveries', filters); }

    // === Personal scope methods ===

    async getPersonalSources(filters = {}) { return this._scopedList('sources', filters, 'personal'); }
    async createPersonalSource(sourceData) { return this._scopedCreate('sources', sourceData, 'personal'); }
    async updatePersonalSource(id, sourceData) { return this._scopedUpdate('sources', id, sourceData, 'personal'); }
    async deletePersonalSource(id) { return this._scopedDelete('sources', id, 'personal'); }

    async getPersonalTargets(filters = {}) { return this._scopedList('targets', filters, 'personal'); }
    async createPersonalTarget(targetData) { return this._scopedCreate('targets', targetData, 'personal'); }
    async updatePersonalTarget(id, targetData) { return this._scopedUpdate('targets', id, targetData, 'personal'); }
    async deletePersonalTarget(id) { return this._scopedDelete('targets', id, 'personal'); }

    async getPersonalRoutes(filters = {}) { return this._scopedList('routes', filters, 'personal'); }
    async createPersonalRoute(routeData) { return this._scopedCreate('routes', routeData, 'personal'); }
    async updatePersonalRoute(id, routeData) { return this._scopedUpdate('routes', id, routeData, 'personal'); }
    async deletePersonalRoute(id) { return this._scopedDelete('routes', id, 'personal'); }

    async getPersonalEvents(filters = {}) { return this._scopedList('events', filters, 'personal'); }
    async getPersonalDeliveries(filters = {}) { return this._scopedList('deliveries', filters, 'personal'); }
    async deletePersonalEvent(id) { return this._scopedDelete('events', id, 'personal'); }
    async deletePersonalDelivery(id) { return this._scopedDelete('deliveries', id, 'personal'); }
    async retryPersonalDelivery(id) { return this._scopedAction('deliveries', id, 'retry', 'personal'); }

    // === Team scope methods ===

    async getTeamSources(teamId, filters = {}) { return this._scopedList('sources', filters, 'team', teamId); }
    async createTeamSource(teamId, sourceData) { return this._scopedCreate('sources', sourceData, 'team', teamId); }
    async updateTeamSource(teamId, id, sourceData) { return this._scopedUpdate('sources', id, sourceData, 'team', teamId); }
    async deleteTeamSource(teamId, id) { return this._scopedDelete('sources', id, 'team', teamId); }

    async getTeamTargets(teamId, filters = {}) { return this._scopedList('targets', filters, 'team', teamId); }
    async createTeamTarget(teamId, targetData) { return this._scopedCreate('targets', targetData, 'team', teamId); }
    async updateTeamTarget(teamId, id, targetData) { return this._scopedUpdate('targets', id, targetData, 'team', teamId); }
    async deleteTeamTarget(teamId, id) { return this._scopedDelete('targets', id, 'team', teamId); }

    async getTeamRoutes(teamId, filters = {}) { return this._scopedList('routes', filters, 'team', teamId); }
    async createTeamRoute(teamId, routeData) { return this._scopedCreate('routes', routeData, 'team', teamId); }
    async updateTeamRoute(teamId, id, routeData) { return this._scopedUpdate('routes', id, routeData, 'team', teamId); }
    async deleteTeamRoute(teamId, id) { return this._scopedDelete('routes', id, 'team', teamId); }

    async getTeamEvents(teamId, filters = {}) { return this._scopedList('events', filters, 'team', teamId); }
    async getTeamDeliveries(teamId, filters = {}) { return this._scopedList('deliveries', filters, 'team', teamId); }
    async deleteTeamEvent(teamId, id) { return this._scopedDelete('events', id, 'team', teamId); }
    async deleteTeamDelivery(teamId, id) { return this._scopedDelete('deliveries', id, 'team', teamId); }
    async retryTeamDelivery(teamId, id) { return this._scopedAction('deliveries', id, 'retry', 'team', teamId); }

    // === Generic scope-based methods ===

    async getScopeBasedSources(scope, teamId = null, filters = {}) { return this._scopedList('sources', filters, scope, teamId); }
    async getScopeBasedTargets(scope, teamId = null, filters = {}) { return this._scopedList('targets', filters, scope, teamId); }
    async getScopeBasedRoutes(scope, teamId = null, filters = {}) { return this._scopedList('routes', filters, scope, teamId); }
    async getScopeBasedEvents(scope, teamId = null, filters = {}) { return this._scopedList('events', filters, scope, teamId); }
    async getScopeBasedDeliveries(scope, teamId = null, filters = {}) { return this._scopedList('deliveries', filters, scope, teamId); }

    async getScopeBasedResources(resourceType, scope, teamId = null, filters = {}) {
        const validTypes = ['sources', 'targets', 'routes', 'events', 'deliveries'];
        if (!validTypes.includes(resourceType)) {
            throw new Error(window.i18n ? window.i18n.t('validation.invalid_resource_type', { type: resourceType }) : `Invalid resource type: ${resourceType}`);
        }
        const result = await this._scopedList(resourceType, filters, scope, teamId);
        return result.data || result;
    }

    async createScopeBasedResource(resourceType, scope, teamId = null, resourceData) {
        const validTypes = ['sources', 'targets', 'routes'];
        if (!validTypes.includes(resourceType)) {
            throw new Error(window.i18n ? window.i18n.t('validation.invalid_resource_type', { type: resourceType }) : `Invalid resource type: ${resourceType}`);
        }
        return this._scopedCreate(resourceType, resourceData, scope, teamId);
    }

    async updateScopeBasedResource(resourceType, scope, teamId = null, resourceId, resourceData) {
        const validTypes = ['sources', 'targets', 'routes'];
        if (!validTypes.includes(resourceType)) {
            throw new Error(window.i18n ? window.i18n.t('validation.invalid_resource_type', { type: resourceType }) : `Invalid resource type: ${resourceType}`);
        }
        return this._scopedUpdate(resourceType, resourceId, resourceData, scope, teamId);
    }

    async deleteScopeBasedResource(resourceType, scope, teamId = null, resourceId) {
        const validTypes = ['sources', 'targets', 'routes', 'events', 'deliveries'];
        if (!validTypes.includes(resourceType)) {
            throw new Error(window.i18n ? window.i18n.t('validation.invalid_resource_type', { type: resourceType }) : `Invalid resource type: ${resourceType}`);
        }
        return this._scopedDelete(resourceType, resourceId, scope, teamId);
    }

    async retryScopeBasedDelivery(scope, teamId = null, deliveryId) {
        return this._scopedAction('deliveries', deliveryId, 'retry', scope, teamId);
    }

    // === Scope management ===

    async getUserContext() { return this.get('/user/context'); }
    async getUserTeamsForScope() { return this.get('/user/teams'); }
    async setActiveTeam(teamId) { return this.put('/user/active-team', { teamId }); }

    // === User management API (admin) ===

    async getUsers() {
        const response = await this.get('/admin/users');
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to fetch users');
    }

    async createUser(userData) {
        const response = await this.post('/users', userData);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to create user');
    }

    async deleteUser(userId) {
        const response = await this.delete(`/users/${userId}`);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to delete user');
    }

    async updateUserRole(userId, role) {
        const response = await this.put(`/admin/users/${userId}/role`, { role });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to update user role');
    }

    async updateUserStatus(userId, active) {
        const response = await this.put(`/admin/users/${userId}/active`, { is_active: active });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to update user status');
    }

    // === Profile API ===

    async getProfile() {
        const response = await this.get('/profile');
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to fetch profile');
    }

    async changeUsername(newUsername) {
        const response = await this.put('/profile/username', { newUsername });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to change username');
    }

    async changePassword(currentPassword, newPassword, confirmPassword) {
        const response = await this.put('/profile/password', { currentPassword, newPassword, confirmPassword });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to change password');
    }

    async changeLanguage(language) {
        const response = await this.put('/profile/language', { language });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to change language');
    }

    // === API Keys ===

    async getApiKeys() {
        const response = await this.get('/profile/api-keys');
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to fetch API keys');
    }

    async createApiKey(name) {
        const response = await this.post('/profile/api-keys', { name });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to create API key');
    }

    async deleteApiKey(id) {
        const response = await this.delete(`/profile/api-keys/${id}`);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to delete API key');
    }

    // === Settings API ===

    async getSettings() {
        const response = await this.get('/settings');
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to fetch settings');
    }

    async updateSettings(settings) {
        const response = await this.put('/settings', { settings });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to update settings');
    }

    async validateSSO(ssoSettings) {
        const response = await this.post('/settings/validate/sso', ssoSettings);
        if (response.success) return response.data;
        throw new Error(response.error || 'SSO validation failed');
    }

    async resetSettings(category) {
        const response = await this.post('/settings/reset', { category });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to reset settings');
    }

    // === Teams API (admin) ===

    async getTeams() {
        const response = await this.get('/admin/teams');
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to fetch teams');
    }

    async getUserTeams() {
        const response = await this.get('/teams/my');
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to fetch user teams');
    }

    async getTeam(teamId) {
        const response = await this.get(`/admin/teams/${teamId}`);
        if (response.success) return response.data.team;
        throw new Error(response.error || 'Failed to fetch team');
    }

    async createTeam(teamData) {
        const response = await this.post('/admin/teams', teamData);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to create team');
    }

    async updateTeam(teamId, teamData) {
        const response = await this.put(`/admin/teams/${teamId}`, teamData);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to update team');
    }

    async deleteTeam(teamId) {
        const response = await this.delete(`/admin/teams/${teamId}`);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to delete team');
    }

    async getTeamMembers(teamId) {
        const response = await this.get(`/admin/teams/${teamId}`);
        if (response.success) return response.data.members;
        throw new Error(response.error || 'Failed to fetch team members');
    }

    async addTeamMember(teamId, memberData) {
        const userData = { ...memberData };
        if (memberData.username && !memberData.user_id) {
            const users = await this.getUsers();
            const user = users.find(u => u.username === memberData.username);
            if (!user) throw new Error(window.i18n ? window.i18n.t('users.not_found') : `User not found: ${memberData.username}`);
            userData.user_id = user.id;
            delete userData.username;
        }
        const response = await this.post(`/admin/teams/${teamId}/members`, userData);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to add team member');
    }

    async removeTeamMember(teamId, userId) {
        const response = await this.delete(`/admin/teams/${teamId}/members/${userId}`);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to remove team member');
    }

    async updateTeamMemberRole(teamId, userId, role) {
        const response = await this.put(`/admin/teams/${teamId}/members/${userId}`, { role });
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to update team member role');
    }

    async getTeamStats(teamId) {
        const response = await this.get(`/admin/teams/${teamId}/statistics`);
        if (response.success) return response.data;
        throw new Error(response.error || 'Failed to fetch team statistics');
    }

    async getTeamResources(teamId, resourceType) {
        const response = await this.get(`/teams/${teamId}/resources/${resourceType}`);
        if (response.success) return response.data;
        throw new Error(response.error || `Failed to fetch team ${resourceType}`);
    }

    // === Utility Methods ===

    handleResponse(response, successMessage = null) {
        if (response.success) {
            if (successMessage && window.app && window.app.showToast) {
                window.app.showToast('success', window.i18n ? window.i18n.t('common.success') : 'Success', successMessage);
            }
            return response.data;
        } else {
            if (window.app && window.app.showToast) {
                window.app.showToast('error', window.i18n ? window.i18n.t('common.error') : 'Error', response.error);
            }
            throw new Error(response.error);
        }
    }

    handleError(error, defaultMessage = null) {
        console.error('API Error:', error);
        if (window.app && window.app.showToast) {
            window.app.showToast('error', window.i18n ? window.i18n.t('common.error') : 'Error', error.message || defaultMessage || (window.i18n ? window.i18n.t('validation.operation_error', { message: '' }) : 'An error occurred'));
        }
        throw error;
    }

    showLoading(element, text = null) {
        if (element) {
            const loadingText = text || (window.i18n ? window.i18n.t('common.loading') : 'Loading...');
            element.innerHTML = `<div class="loading">${loadingText}</div>`;
        }
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            return date.toLocaleString(window.i18n ? window.i18n.getLocale() : 'en-US', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (_e) {
            return dateString;
        }
    }

    formatRelativeTime(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 1) return window.i18n ? window.i18n.t('time.now') : 'Just now';
            if (diffMins < 60) return window.i18n ? window.i18n.t('time.minutes_ago', { count: diffMins }) : `${diffMins} minutes ago`;
            if (diffHours < 24) return window.i18n ? window.i18n.t('time.hours_ago', { count: diffHours }) : `${diffHours} hours ago`;
            if (diffDays < 7) return window.i18n ? window.i18n.t('time.days_ago', { count: diffDays }) : `${diffDays} days ago`;
            return this.formatDate(dateString);
        } catch (_e) {
            return dateString;
        }
    }

    truncate(text, maxLength = 50) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateActionButtons(item, type) {
        const buttons = [];

        buttons.push(`
            <button class="btn btn-sm btn-secondary" onclick="app.edit${type}(${item.id})" title="${window.i18n ? window.i18n.t('actions.edit') : 'Edit'}">
                <i class="fas fa-edit"></i>
            </button>
        `);

        if (type === 'Target') {
            buttons.push(`
                <button class="btn btn-sm btn-warning" onclick="app.testTarget(${item.id})" title="${window.i18n ? window.i18n.t('actions.test') : 'Test'}">
                    <i class="fas fa-vial"></i>
                </button>
            `);
        }

        if (type === 'Event') {
            buttons.push(`
                <button class="btn btn-sm btn-warning" onclick="app.reprocessEvent(${item.id})" title="${window.i18n ? window.i18n.t('actions.reprocess') : 'Reprocess'}">
                    <i class="fas fa-redo"></i>
                </button>
            `);
        }

        if (type === 'Delivery') {
            buttons.push(`
                <button class="btn btn-sm btn-warning" onclick="app.retryDelivery(${item.id})" title="${window.i18n ? window.i18n.t('actions.retry') : 'Retry'}">
                    <i class="fas fa-retry"></i>
                </button>
            `);
        }

        buttons.push(`
            <button class="btn btn-sm btn-danger" onclick="app.delete${type}(${item.id})" title="${window.i18n ? window.i18n.t('actions.delete') : 'Delete'}">
                <i class="fas fa-trash"></i>
            </button>
        `);

        return `<div class="action-buttons">${buttons.join('')}</div>`;
    }

    generateStatusBadge(status) {
        const statusClasses = {
            'success': 'status-success', 'completed': 'status-success', 'delivered': 'status-success',
            'error': 'status-error', 'failed': 'status-error',
            'pending': 'status-pending', 'processing': 'status-processing', 'sent': 'status-processing'
        };

        const statusIcons = {
            'success': 'fas fa-check', 'completed': 'fas fa-check', 'delivered': 'fas fa-check',
            'error': 'fas fa-exclamation-triangle', 'failed': 'fas fa-times',
            'pending': 'fas fa-clock', 'processing': 'fas fa-spinner fa-spin', 'sent': 'fas fa-paper-plane'
        };

        const cssClass = statusClasses[status] || 'status-pending';
        const icon = statusIcons[status] || 'fas fa-question';

        return `
            <span class="status-badge ${cssClass}">
                <i class="${icon}"></i>
                ${status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        `;
    }
}

// Create global API instance
window.api = new API();
