/**
 * Main application logic for Webhook Admin UI
 */
class WebhookApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.currentUser = null;
        this.userRole = null;
        this.data = {
            sources: [],
            targets: [],
            routes: [],
            events: [],
            deliveries: [],
            users: []
        };
        this.modal = null;
        this.toastContainer = null;
        this.refreshIntervals = {};
    }

    // === RBAC Helper Functions ===

    /**
     * Get current user role from localStorage or currentUser
     */
    getUserRole() {
        if (this.userRole) {
            return this.userRole;
        }

        if (this.currentUser && this.currentUser.role) {
            this.userRole = this.currentUser.role;
            return this.userRole;
        }

        // Try to get from localStorage
        const storedRole = localStorage.getItem('userRole');
        if (storedRole) {
            this.userRole = storedRole;
            return storedRole;
        }

        return 'user'; // default role
    }

    /**
     * Check if current user is admin
     */
    isAdmin() {
        return this.getUserRole() === 'admin';
    }

    /**
     * Check if current user is regular user
     */
    isUser() {
        return this.getUserRole() === 'user';
    }

    /**
     * Set user role and update UI visibility
     */
    setUserRole(role) {
        this.userRole = role;
        localStorage.setItem('userRole', role);
        this.updateUIBasedOnRole();
    }

    /**
     * Update UI elements based on user role
     */
    updateUIBasedOnRole() {
        const role = this.getUserRole();

        // Hide/show navigation items based on role
        this.updateNavigationVisibility(role);

        // Update header role badge
        this.updateRoleBadge(role);

        // Update buttons visibility
        this.updateButtonsVisibility(role);
    }

    /**
     * Update navigation menu visibility based on role
     */
    updateNavigationVisibility(role) {
        // Elements that should only be visible to admins
        const adminOnlyElements = [
            document.querySelector('.nav-link[data-page="teams"]'),
            document.querySelector('.nav-link[data-page="users"]'),
            document.querySelector('.nav-link[data-page="settings"]')
        ];

        adminOnlyElements.forEach(element => {
            if (element) {
                const listItem = element.closest('.nav-item');
                if (listItem) {
                    listItem.style.display = role === 'admin' ? 'block' : 'none';
                }
            }
        });
    }

    /**
     * Update role badge in header
     */
    updateRoleBadge(role) {
        const userInfo = document.querySelector('.user-info');
        if (!userInfo) return;

        // Remove existing role badge
        const existingBadge = userInfo.querySelector('.role-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        // Add new role badge
        const roleBadge = document.createElement('span');
        roleBadge.className = `role-badge role-${role}`;
        roleBadge.innerHTML = `<i class="fas ${role === 'admin' ? 'fa-crown' : 'fa-user'}"></i> ${role === 'admin' ? i18n.t('users.roles.admin') : i18n.t('users.roles.user')}`;

        // Insert before username
        const currentUserSpan = document.getElementById('currentUser');
        if (currentUserSpan) {
            userInfo.insertBefore(roleBadge, currentUserSpan);
        }
    }

    /**
     * Update buttons visibility based on role
     */
    updateButtonsVisibility(role) {
        if (role !== 'admin') {
            // Disable admin-only buttons
            const adminButtons = document.querySelectorAll('.btn-admin-only');
            adminButtons.forEach(btn => {
                btn.style.display = 'none';
            });
        }
    }

    /**
     * Check if user has permission for action
     */
    hasPermission(action) {
        const role = this.getUserRole();

        // Admin has all permissions
        if (role === 'admin') {
            return true;
        }

        // Define user permissions
        const userPermissions = [
            'view_dashboard',
            'view_sources',
            'view_targets',
            'view_routes',
            'view_events',
            'view_deliveries',
            'view_profile',
            'edit_profile'
        ];

        return userPermissions.includes(action);
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('[INIT] Starting app initialization...');
        console.log('[INIT] Current URL:', window.location.href);

        // Cache DOM elements
        this.cacheElements();

        // Set up event listeners
        this.setupEventListeners();

        // Check for SSO token in sessionStorage (secure handoff from backend)
        // Backend HTML redirect stores token in sessionStorage, URL always stays clean!
        const ssoTokenFromSession = sessionStorage.getItem('sso_token_transfer');

        // Check for SSO errors in URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const ssoError = urlParams.get('sso_error');

        console.log('[INIT] SSO token from sessionStorage:', ssoTokenFromSession ? 'YES (length:' + ssoTokenFromSession.length + ')' : 'NO');
        console.log('[INIT] URL params - sso_error:', ssoError || 'NO');

        // Handle SSO callback from sessionStorage (clean URL, token is never visible!)
        if (ssoTokenFromSession) {
            console.log('[SSO] Token received from sessionStorage (URL is clean!)');

            // Store the SSO token in localStorage
            window.auth.setToken(ssoTokenFromSession);

            // Immediately remove from sessionStorage (single use)
            sessionStorage.removeItem('sso_token_transfer');
            console.log('[SECURITY] Token moved from sessionStorage to localStorage, sessionStorage cleared');

            // Show main app
            this.currentUser = window.auth.getCurrentUser();
            await this.showMainApp();

            // Show success message
            this.showToast('success', i18n.t('auth.login_success'), i18n.t('auth.sso_success'));

            return;
        }

        // Handle SSO errors
        if (ssoError) {
            console.error('SSO authentication error:', ssoError);

            // Remove error from URL
            window.history.replaceState({}, document.title, window.location.pathname);

            // Redirect to login page with error
            window.location.href = '/login?error=' + encodeURIComponent(ssoError);
            return;
        }

        // Check authentication and show appropriate screen
        console.log('[INIT] Checking authentication...');
        console.log('[INIT] isAuthenticated:', window.auth.isAuthenticated());
        
        // Check if we just came from login validation (check BEFORE removing!)
        const loginValidated = sessionStorage.getItem('login_validated');
        console.log('[INIT] Login validated flag:', loginValidated);
        
        if (window.auth.isAuthenticated()) {
            console.log('[INIT] User is authenticated, showing main app');
            
            // Clear the flag after successful validation
            if (loginValidated) {
                console.log('[INIT] Clearing login_validated flag');
                sessionStorage.removeItem('login_validated');
            }
            
            this.currentUser = window.auth.getCurrentUser();
            await this.showMainApp();
        } else {
            console.log('[INIT] User not authenticated');
            
            // Only redirect if we're not in a loop
            if (!loginValidated) {
                console.log('[INIT] Redirecting to login page');
                window.location.href = '/login';
            } else {
                console.error('[INIT] Login loop detected! User authenticated but token invalid.');
                // Clear everything and redirect
                sessionStorage.removeItem('login_validated');
                localStorage.clear();
                window.location.href = '/login';
            }
        }
    }

    /**
     * Cache frequently used DOM elements
     */
    cacheElements() {
        this.elements = {
            mainApp: document.getElementById('mainApp'),
            currentUser: document.getElementById('currentUser'),
            logoutBtn: document.getElementById('logoutBtn'),
            navLinks: document.querySelectorAll('.nav-link'),
            pages: document.querySelectorAll('.page'),
            modal: document.getElementById('modal'),
            modalTitle: document.getElementById('modalTitle'),
            modalBody: document.getElementById('modalBody'),
            modalFooter: document.getElementById('modalFooter'),
            modalClose: document.getElementById('modalClose'),
            toastContainer: document.getElementById('toastContainer')
        };

        this.modal = this.elements.modal;
        this.toastContainer = this.elements.toastContainer;
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Logout button
        this.elements.logoutBtn.addEventListener('click', this.handleLogout.bind(this));

        // Navigation
        this.elements.navLinks.forEach(link => {
            link.addEventListener('click', this.handleNavigation.bind(this));
        });

        // Modal close
        this.elements.modalClose.addEventListener('click', this.closeModal.bind(this));
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        // User management buttons
        this.setupUserManagementButtons();

        // Profile form handlers
        this.setupProfileHandlers();

        // CRUD buttons
        this.setupCRUDButtons();

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard.bind(this));

        // Re-render role badge on language change
        window.addEventListener('language-changed', () => {
            const role = this.getUserRole();
            if (role) this.updateRoleBadge(role);
        });
    }

    /**
     * Set up CRUD operation buttons
     */
    setupCRUDButtons() {
        // Add buttons
        const addButtons = {
            'addSourceBtn': () => this.showSourceModal(),
            'addTargetBtn': () => this.showTargetModal(),
            'addRouteBtn': () => this.showRouteModal()
        };

        Object.keys(addButtons).forEach(id => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', addButtons[id]);
            }
        });

        // Refresh buttons
        const refreshButtons = {
            'refreshEventsBtn': () => this.loadEvents(),
            'refreshDeliveriesBtn': () => this.loadDeliveries()
        };

        Object.keys(refreshButtons).forEach(id => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', refreshButtons[id]);
            }
        });

        // Source filter
        const sourceFilter = document.getElementById('sourceFilter');
        if (sourceFilter) {
            sourceFilter.addEventListener('change', () => this.loadEvents());
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(e) {
        // Escape key closes modal
        if (e.key === 'Escape' && this.modal.style.display !== 'none') {
            this.closeModal();
        }
    }

    // === Authentication ===

    /**
     * Handle logout
     */
    async handleLogout() {
        try {
            await window.auth.logout();
            this.currentUser = null;
            this.clearRefreshIntervals();
            // Redirect to login page
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('auth.logout_error'));
        }
    }

    /**
     * Show main application
     */
    async showMainApp() {
        // Show main app (no need to hide login screen as it's a separate page)
        if (this.elements.mainApp) {
            this.elements.mainApp.style.display = 'grid';
        }
        
        // CRITICAL: Show body content now that auth is confirmed
        document.body.classList.add('auth-confirmed');

        // Update user info
        if (this.currentUser && this.elements.currentUser) {
            this.elements.currentUser.textContent = this.currentUser.username;
        }

        // CRITICAL: Set user role if available from currentUser
        if (this.currentUser && this.currentUser.role) {
            console.log('[INIT] Setting user role from currentUser:', this.currentUser.role);
            this.setUserRole(this.currentUser.role);
        } else {
            // Fallback: Try to get from localStorage
            const storedUser = localStorage.getItem('webhook_admin_user');
            if (storedUser) {
                try {
                    const userData = JSON.parse(storedUser);
                    if (userData.role) {
                        console.log('[INIT] Setting user role from localStorage:', userData.role);
                        this.currentUser = userData;
                        this.setUserRole(userData.role);
                    }
                } catch (error) {
                    console.error('[INIT] Error parsing stored user:', error);
                }
            }
        }

        console.log('[INIT] Current user role after setup:', this.getUserRole());

        // Update UI based on role
        this.updateUIBasedOnRole();

        // Initialize scope management
        await this.initializeScopeManagement();

        // Initialize team manager
        if (window.teamManager) {
            await window.teamManager.init();
        }

        // Load initial data
        await this.loadDashboard();
        this.setupRefreshIntervals();
    }

    /**
     * Initialize scope management system
     */
    async initializeScopeManagement() {
        console.log('🚀 Initializing scope management...');
        try {
            // Initialize TeamContextManager if not already initialized
            if (!window.teamContextManager && window.scopeManager) {
                console.log('📦 Creating TeamContextManager...');
                window.teamContextManager = new TeamContextManager(window.scopeManager, window.api);
            }

            // Initialize team context
            if (window.teamContextManager) {
                console.log('🔧 Initializing team context...');
                await window.teamContextManager.initialize();
                console.log('✅ Team context initialized');

                // Setup scope change listeners
                window.scopeManager.addEventListener('scope-changed', () => {
                    this.onScopeChanged();
                });
            } else {
                console.warn('⚠️ teamContextManager not available!');
            }

            // Setup scope selector event listeners on existing pages
            this.setupScopeSelectors();

        } catch (error) {
            console.error('❌ Failed to initialize scope management:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('scope.scope_init_error'));
        }
    }

    /**
     * Handle scope change events
     */
    onScopeChanged() {
        // Refresh current page data if needed
        if (this.currentPage && ['sources', 'targets', 'routes', 'events', 'deliveries'].includes(this.currentPage)) {
            this.refreshCurrentPage();
        }
    }

    /**
     * Setup scope selector event listeners
     */
    setupScopeSelectors() {
        // Handle scope select changes
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('scope-select')) {
                this.handleScopeSelectChange(e.target);
            }

            if (e.target.classList.contains('team-select')) {
                this.handleTeamSelectChange(e.target);
            }
        });
    }

    /**
     * Handle scope selector changes
     */
    handleScopeSelectChange(selector) {
        const scope = selector.value;
        const pagePrefix = selector.id.replace('Scope', ''); // e.g., 'sources' from 'sourcesScope'

        if (scope === 'personal') {
            window.scopeManager.switchToPersonal();
        } else if (scope === 'team') {
            // Show team selector
            const teamSelector = document.getElementById(`${pagePrefix}TeamSelect`);
            if (teamSelector) {
                teamSelector.style.display = 'block';

                // If a team is already selected, switch to it
                if (teamSelector.value) {
                    window.scopeManager.switchToTeam(parseInt(teamSelector.value));
                }
            }
        }
    }

    /**
     * Handle team selector changes
     */
    handleTeamSelectChange(selector) {
        const teamId = parseInt(selector.value);
        if (teamId && window.scopeManager) {
            window.scopeManager.switchToTeam(teamId);
        }
    }

    /**
     * Refresh current page data
     */
    async refreshCurrentPage() {
        if (this.currentPage) {
            await this.loadPageData(this.currentPage);
        }
    }

    // === Navigation ===

    /**
     * Handle navigation between pages
     */
    async handleNavigation(e) {
        e.preventDefault();

        const link = e.currentTarget;
        const page = link.dataset.page;

        if (!page || page === this.currentPage) {
            return;
        }

        // Check permissions for admin-only pages
        const adminOnlyPages = ['teams', 'users', 'settings'];
        if (adminOnlyPages.includes(page) && !this.isAdmin()) {
            this.showToast('error', i18n.t('auth.access_denied'), i18n.t('auth.no_permission'));
            return;
        }

        // Update active navigation
        this.elements.navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Hide all pages
        this.elements.pages.forEach(p => p.classList.remove('active'));

        // Show target page
        const targetPage = document.getElementById(`${page}Page`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = page;

            // Load page data
            await this.loadPageData(page);
        }
    }

    /**
     * Show specific page (used by scope navigation)
     * @param {string} page - Page to show
     */
    async showPage(page) {
        if (!page || page === this.currentPage) {
            return;
        }

        // Check permissions for admin-only pages
        const adminOnlyPages = ['teams', 'users', 'settings'];
        if (adminOnlyPages.includes(page) && !this.isAdmin()) {
            this.showToast('error', i18n.t('auth.access_denied'), i18n.t('auth.no_permission'));
            return;
        }

        // Update navigation active states (scope navigation will be handled separately)
        this.elements.navLinks.forEach(l => {
            if (l.dataset.page === page) {
                l.classList.add('active');
            } else {
                l.classList.remove('active');
            }
        });

        // Hide all pages
        this.elements.pages.forEach(p => p.classList.remove('active'));

        // Show target page
        const targetPage = document.getElementById(`${page}Page`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = page;

            // Load page data with current scope
            await this.loadPageData(page);

            // Update scope navigation active states
            if (window.teamContextManager) {
                window.teamContextManager.updateNavigationActiveStates();
            }
        }
    }

    /**
     * Load data for current page
     */
    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'sources':
                await this.loadSources();
                break;
            case 'targets':
                await this.loadTargets();
                break;
            case 'routes':
                await this.loadRoutes();
                break;
            case 'events':
                await this.loadEvents();
                break;
            case 'deliveries':
                await this.loadDeliveries();
                break;
            case 'teams':
                await this.loadTeams();
                break;
            case 'users':
                await this.loadUsers();
                // Ensure user management buttons are set up when users page is loaded
                this.setupUserManagementButtons();
                break;
            case 'settings':
                await this.loadSettings();
                break;
            case 'profile':
                await this.loadProfile();
                break;
            case 'docs':
                await this.loadDocs();
                break;
        }
    }

    // === Dashboard ===

    /**
     * Load dashboard data
     */
    async loadDashboard() {
        try {
            // Load stats
            const statsResponse = await window.api.getDashboardStats();
            if (statsResponse.success) {
                this.updateDashboardStats(statsResponse.data);
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }

        // Initialize chart manager - separate try-catch so it doesn't block other functionality
        try {
            if (window.chartManager) {
                await window.chartManager.init();
            }
        } catch (error) {
            console.error('Error initializing chart:', error);
            // Chart error should not block the rest of the dashboard
        }
    }

    /**
     * Update dashboard statistics
     */
    updateDashboardStats(stats) {
        const elements = {
            sourcesCount: document.getElementById('sourcesCount'),
            targetsCount: document.getElementById('targetsCount'),
            routesCount: document.getElementById('routesCount'),
            eventsCount: document.getElementById('eventsCount')
        };

        Object.keys(elements).forEach(key => {
            if (elements[key]) {
                const count = stats[key.replace('Count', '')] || 0;
                elements[key].textContent = count.toLocaleString();
            }
        });
    }

    /**
     * Update recent events list
     */
    updateRecentEvents(events) {
        const container = document.getElementById('recentEvents');
        if (!container) return;

        if (!events || events.length === 0) {
            container.innerHTML = `<div class="text-center" style="padding: 20px; color: #666;">${i18n.t('dashboard.no_events')}</div>`;
            return;
        }

        const eventsHtml = events.map(event => `
            <div class="event-item">
                <div class="event-icon">
                    <i class="fas fa-bell"></i>
                </div>
                <div class="event-info">
                    <h4>${window.api.escapeHtml(event.event_type || i18n.t('dashboard.unknown_event'))}</h4>
                    <p>${i18n.t('events.labels.source')}: ${window.api.escapeHtml(event.source_name || i18n.t('common.not_available'))}</p>
                </div>
                <div class="event-time">
                    ${window.api.formatRelativeTime(event.received_at)}
                </div>
            </div>
        `).join('');

        container.innerHTML = eventsHtml;
    }

    // === Sources Management ===

    /**
     * Load sources data
     */
    async loadSources() {
        try {
            window.api.showLoading(document.getElementById('sourcesTable'), i18n.t('sources.loading'));

            // Use scope-based API call
            const scope = window.scopeManager.getCurrentScope();
            const teamId = window.scopeManager.getActiveTeamId();

            const response = await window.api.getScopeBasedSources(scope, teamId);
            if (response.success) {
                this.data.sources = response.data;
                this.renderSourcesTable();
            }

        } catch (error) {
            console.error('Error loading sources:', error);
            document.getElementById('sourcesTable').innerHTML = `<tr><td colspan="5" class="text-center">${i18n.t('sources.load_error')}</td></tr>`;
        }
    }

    /**
     * Render sources table
     */
    renderSourcesTable() {
        const tbody = document.getElementById('sourcesTable');
        if (!tbody) return;

        if (this.data.sources.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">${i18n.t('sources.empty')}</td></tr>`;
            return;
        }

        const rowsHtml = this.data.sources.map(source => {
            // Generate dynamic webhook URL
            const webhookUrl = `${window.location.protocol}//${window.location.host}/webhook/${source.secret_key}`;

            return `
                <tr>
                    <td>${window.api.escapeHtml(source.name)}</td>
                    <td><span class="badge badge-secondary">${window.api.escapeHtml(source.type)}</span></td>
                    <td>
                        <div class="webhook-url-container">
                            <code class="webhook-url" title="${window.api.escapeHtml(webhookUrl)}">${window.api.truncate(webhookUrl, 50)}</code>
                            <button class="btn btn-sm btn-outline-secondary copy-btn" onclick="app.copyToClipboard('${window.api.escapeHtml(webhookUrl)}')" title="${i18n.t('sources.copy_url')}">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </td>
                    <td>${window.api.formatDate(source.created_at)}</td>
                    <td>${window.api.generateActionButtons(source, 'Source')}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
    }

    /**
     * Show source modal for create/edit
     */
    showSourceModal(sourceId = null) {
        const isEdit = sourceId !== null;
        const source = isEdit ? this.data.sources.find(s => s.id === sourceId) : null;

        // Get current scope and user teams for scope selection
        const currentScope = window.scopeManager.getCurrentScope();
        const userTeams = window.scopeManager.getUserTeams();
        const activeTeamId = window.scopeManager.getActiveTeamId();

        // Build scope selection HTML
        let scopeHtml = '';
        if (!isEdit) { // Only show scope selection for new sources
            scopeHtml = `
                <div class="scope-form-section">
                    <h4>${i18n.t('sources.scope_selection')}</h4>
                    <div class="scope-radio-group">
                        <div class="scope-radio-option ${currentScope === 'personal' ? 'selected' : ''}">
                            <input type="radio" id="scopePersonal" name="scope" value="personal"
                                   ${currentScope === 'personal' ? 'checked' : ''}>
                            <label for="scopePersonal">
                                ${i18n.t('scope.personal')}
                                <div class="scope-description">${i18n.t('scope.personal_help')}</div>
                            </label>
                        </div>
                        <div class="scope-radio-option ${currentScope === 'team' ? 'selected' : ''}">
                            <input type="radio" id="scopeTeam" name="scope" value="team"
                                   ${currentScope === 'team' ? 'checked' : ''}
                                   ${userTeams.length === 0 ? 'disabled' : ''}>
                            <label for="scopeTeam">
                                ${i18n.t('scope.team')}
                                <div class="scope-description">${userTeams.length === 0 ? i18n.t('scope.no_teams') : i18n.t('scope.team_help')}</div>
                            </label>
                        </div>
                    </div>
                    ${userTeams.length > 0 ? `
                        <select id="sourceTeamId" name="team_id" class="team-form-select"
                                style="display: ${currentScope === 'team' ? 'block' : 'none'};"
                                ${currentScope === 'team' ? 'required' : ''}>
                            <option value="">${i18n.t('scope.selector.select_team')}</option>
                            ${userTeams.map(team => `
                                <option value="${team.id}" ${team.id === activeTeamId ? 'selected' : ''}>
                                    ${team.name}
                                </option>
                            `).join('')}
                        </select>
                    ` : ''}
                </div>
            `;
        }

        this.showModal(
            isEdit ? i18n.t('sources.edit_title') : i18n.t('sources.new_title'),
            `
                <form id="sourceForm">
                    ${scopeHtml}
                    <div class="form-group">
                        <label for="sourceName">${i18n.t('sources.form_name')} *</label>
                        <input type="text" id="sourceName" name="name" class="form-control" required
                               value="${source ? window.api.escapeHtml(source.name) : ''}"
                               placeholder="${i18n.t('sources.name_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="sourceType">${i18n.t('sources.form_type')} *</label>
                        <select id="sourceType" name="type" class="form-control" required>
                            <option value="">${i18n.t('sources.form_select_type')}</option>
                            <option value="synology" ${source && source.type === 'synology' ? 'selected' : ''}>${i18n.t('sources.types.synology')}</option>
                            <option value="proxmox" ${source && source.type === 'proxmox' ? 'selected' : ''}>${i18n.t('sources.types.proxmox')}</option>
                            <option value="proxmox_backup" ${source && source.type === 'proxmox_backup' ? 'selected' : ''}>${i18n.t('sources.types.proxmox_backup')}</option>
                            <option value="gitlab" ${source && source.type === 'gitlab' ? 'selected' : ''}>${i18n.t('sources.types.gitlab')}</option>
                            <option value="docker_updater" ${source && source.type === 'docker_updater' ? 'selected' : ''}>${i18n.t('sources.types.docker_updater')}</option>
                            <option value="media-webhook" ${source && source.type === 'media-webhook' ? 'selected' : ''}>${i18n.t('sources.types.media_webhook')}</option>
                            <option value="uptime-kuma" ${source && source.type === 'uptime-kuma' ? 'selected' : ''}>${i18n.t('sources.types.uptime_kuma')}</option>
                            <option value="generic" ${source && source.type === 'generic' ? 'selected' : ''}>${i18n.t('sources.types.generic')}</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="sourceSecret">${i18n.t('sources.form_secret')} ${isEdit ? '' : '*'}</label>
                        <input type="text" id="sourceSecret" name="secret_key" class="form-control"
                               ${isEdit ? '' : 'required'}
                               value="${source && source.secret_key ? source.secret_key : ''}"
                               placeholder="${isEdit ? i18n.t('sources.form_secret_edit_placeholder') : i18n.t('sources.form_secret_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="sourceWebhookSecret">${i18n.t('sources.form_webhook_secret')}</label>
                        <input type="text" id="sourceWebhookSecret" name="webhook_secret" class="form-control"
                               value="${source && source.webhook_secret ? source.webhook_secret : ''}"
                               placeholder="${isEdit ? i18n.t('sources.form_secret_edit_placeholder') : i18n.t('sources.form_webhook_secret_placeholder')}">
                        <small class="form-text text-muted">
                            ${source && source.webhook_secret ? `<i class="fas fa-check-circle" style="color: green;"></i> ${i18n.t('sources.form_webhook_secret_set')} ` : ''}
                            ${i18n.t('sources.form_webhook_secret_help')}
                        </small>
                    </div>
                </form>
            `,
            `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.cancel')}</button>
                <button type="button" class="btn btn-primary" onclick="app.saveSource(${sourceId})">
                    ${isEdit ? i18n.t('common.save') : i18n.t('common.create')}
                </button>
            `
        );

        // Setup scope selection event listeners for new sources
        if (!isEdit) {
            setTimeout(() => {
                this.setupScopeSelectionListeners();
                this.setupModalFormSubmit('sourceForm', 'saveSource', sourceId);
            }, 100);
        } else {
            setTimeout(() => {
                this.setupModalFormSubmit('sourceForm', 'saveSource', sourceId);
            }, 100);
        }

        // Focus first input
        setTimeout(() => document.getElementById('sourceName').focus(), 100);
    }

    /**
     * Setup scope selection event listeners in modals
     */
    setupScopeSelectionListeners() {
        const scopeRadios = document.querySelectorAll('input[name="scope"]');
        const teamSelect = document.getElementById('sourceTeamId') ||
                           document.getElementById('targetTeamId') ||
                           document.getElementById('routeTeamId');
        const teamContainer = document.querySelector('.team-selector-container');

        scopeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // Update visual selection
                document.querySelectorAll('.scope-radio-option').forEach(option => {
                    option.classList.remove('selected');
                });
                e.target.closest('.scope-radio-option').classList.add('selected');

                // Show/hide team selector container
                if (teamContainer) {
                    if (e.target.value === 'team') {
                        teamContainer.style.display = 'block';
                        if (teamSelect) {
                            teamSelect.required = true;
                        }
                    } else {
                        teamContainer.style.display = 'none';
                        if (teamSelect) {
                            teamSelect.required = false;
                            teamSelect.value = '';
                        }
                    }
                }
            });
        });
    }

    /**
     * Setup modal form submit handler as fallback
     * @param {string} formId - Form element ID
     * @param {string} methodName - Method name to call
     * @param {*} param - Parameter to pass to the method
     */
    setupModalFormSubmit(formId, methodName, param = null) {
        console.log(`🔧 setupModalFormSubmit beállítása:`, { formId, methodName, param });

        const form = document.getElementById(formId);
        if (!form) {
            console.error(`❌ Form nem található: ${formId}`);
            return;
        }

        // Remove existing listeners to avoid duplicates
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        console.log(`🔄 Form újra klónozva: ${formId}`);

        // Add submit event listener
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log(`📤 Form submit esemény aktiválva: ${formId} -> ${methodName}`);

            try {
                if (typeof this[methodName] === 'function') {
                    console.log(`🚀 Metódus hívása: ${methodName}(${param})`);
                    await this[methodName](param);
                } else {
                    console.error(`❌ Metódus nem létezik: ${methodName}`);
                    this.showToast('error', i18n.t('common.error'), i18n.t('validation.method_not_found', { name: methodName }));
                }
            } catch (error) {
                console.error(`❌ Hiba ${methodName} metódusban:`, error);
                this.showToast('error', i18n.t('common.error'), i18n.t('validation.operation_error', { message: error.message }));
            }
        });

        // Add button click handler as backup
        const submitButton = newForm.querySelector('button[type="submit"], .btn-primary');
        if (submitButton) {
            submitButton.addEventListener('click', async (e) => {
                // Only prevent default if this is NOT a form submit button
                if (submitButton.type !== 'submit') {
                    e.preventDefault();
                }
                console.log(`🔘 Submit gomb kattintás: ${formId} -> ${methodName}`);

                try {
                    if (typeof this[methodName] === 'function') {
                        console.log(`🚀 Metódus hívása gomb kattintásra: ${methodName}(${param})`);
                        await this[methodName](param);
                    } else {
                        console.error(`❌ Metódus nem létezik: ${methodName}`);
                        this.showToast('error', i18n.t('common.error'), i18n.t('validation.method_not_found', { name: methodName }));
                    }
                } catch (error) {
                    console.error(`❌ Hiba ${methodName} metódusban (gomb kattintás):`, error);
                    this.showToast('error', i18n.t('common.error'), i18n.t('validation.operation_error', { message: error.message }));
                }
            });
        }

        // Add Enter key support
        newForm.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const target = e.target;
                if (target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    console.log(`⌨️ Enter billentyű aktiválva: ${formId} -> ${methodName}`);

                    try {
                        if (typeof this[methodName] === 'function') {
                            await this[methodName](param);
                        } else {
                            console.error(`❌ Metódus nem létezik: ${methodName}`);
                        }
                    } catch (error) {
                        console.error(`❌ Hiba ${methodName} metódusban (Enter):`, error);
                        this.showToast('error', i18n.t('common.error'), i18n.t('validation.operation_error', { message: error.message }));
                    }
                }
            }
        });

        console.log(`✅ Modal form submit sikeresen beállítva: ${formId}`);
    }

    /**
     * Save source (create or update)
     */
    async saveSource(sourceId = null) {
        console.log('🚀 saveSource kezdése:', { sourceId });

        // Get submit button and set loading state
        const submitButton = document.querySelector('.btn-primary');
        const originalButtonText = submitButton?.textContent || i18n.t('common.create');

        try {
            // Set loading state
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${i18n.t('common.saving')}`;
            }

            const form = document.getElementById('sourceForm');
            if (!form) {
                console.error('❌ sourceForm nem található!');
                this.showToast('error', i18n.t('common.error'), i18n.t('validation.form_not_found'));
                return;
            }

            const formData = new FormData(form);
            console.log('📋 Form adatok:', {
                name: formData.get('name'),
                type: formData.get('type'),
                secret_key: formData.get('secret_key'),
                webhook_secret: formData.get('webhook_secret'),
                scope: formData.get('scope'),
                team_id: formData.get('team_id')
            });

            const data = {
                name: formData.get('name'),
                type: formData.get('type'),
                secret_key: formData.get('secret_key'),
                webhook_secret: formData.get('webhook_secret')
            };

            // Validate required fields
            if (!data.name || !data.type) {
                console.error('❌ Kötelező mezők hiányoznak:', data);
                this.showToast('error', i18n.t('common.error'), i18n.t('sources.required_fields'));
                return;
            }

            // Remove empty secret_key for updates
            if (sourceId && !data.secret_key) {
                delete data.secret_key;
            }

            // Remove empty webhook_secret for updates
            if (sourceId && !data.webhook_secret) {
                delete data.webhook_secret;
            }

            let response;
            if (sourceId) {
                console.log('✏️ Forrás frissítése:', { sourceId, data });
                // For updates, use existing API methods (scope is fixed)
                response = await window.api.updateSource(sourceId, data);
            } else {
                // For new sources, get scope information
                const scope = formData.get('scope') || window.scopeManager.getCurrentScope();
                const teamId = formData.get('team_id') ? parseInt(formData.get('team_id')) : window.scopeManager.getActiveTeamId();

                console.log('➕ Új forrás létrehozása:', { scope, teamId, data });

                // Validate scope and teamId for team scope
                if (scope === 'team' && !teamId) {
                    console.error('❌ Team scope esetén team_id kötelező!');
                    this.showToast('error', i18n.t('common.error'), i18n.t('sources.team_required'));
                    return;
                }

                // Use scope-based creation
                response = await window.api.createScopeBasedResource('sources', scope, teamId, data);
            }

            console.log('📡 API válasz:', response);

            if (response && response.success) {
                console.log('✅ Forrás sikeresen mentve');
                this.closeModal();
                await this.loadSources();
                this.showToast('success', i18n.t('common.success'), sourceId ? i18n.t('sources.updated') : i18n.t('sources.created'));
            } else {
                console.error('❌ API hiba:', response?.error || 'Ismeretlen hiba');
                this.showToast('error', i18n.t('common.error'), response?.error || i18n.t('sources.save_error'));
            }

        } catch (error) {
            console.error('❌ Exception saveSource-ban:', error);
            this.showToast('error', i18n.t('common.error'), `${i18n.t('sources.save_error')}: ${error.message}`);
        } finally {
            // Reset button state
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        }
    }

    /**
     * Edit source
     */
    editSource(sourceId) {
        this.showSourceModal(sourceId);
    }

    /**
     * Delete source
     */
    async deleteSource(sourceId) {
        const source = this.data.sources.find(s => s.id === sourceId);
        if (!source) return;

        try {
            // First check if source can be deleted
            const checkResponse = await window.api.checkSourceDeletion(sourceId);
            if (!checkResponse.success) {
                this.showToast('error', i18n.t('common.error'), i18n.t('sources.check_error'));
                return;
            }

            const { canDelete, connectedRoutes } = checkResponse.data;

            if (!canDelete && connectedRoutes.length > 0) {
                // Show detailed warning with connected routes
                this.showModal(
                    `⚠️ ${i18n.t('sources.delete_blocked_title')}`,
                    `
                        <div class="alert alert-warning">
                            <h5><i class="fas fa-exclamation-triangle"></i> ${i18n.t('sources.delete_blocked_message', { name: source.name })}</h5>
                            <p>${i18n.t('sources.delete_blocked_routes', { count: connectedRoutes.length })}</p>
                            <ul class="list-unstyled mt-3">
                                ${connectedRoutes.map(route => `
                                    <li class="mb-2">
                                        <div class="d-flex align-items-center">
                                            <i class="fas fa-arrow-right text-primary me-2"></i>
                                            <strong>${route.targetName}</strong>
                                            <span class="badge badge-secondary ms-2">${route.targetType}</span>
                                        </div>
                                        ${route.messageTemplate ?
                                            `<small class="text-muted ms-4">Sablon: ${window.api.truncate(route.messageTemplate, 50)}</small>`
                                            : ''
                                        }
                                    </li>
                                `).join('')}
                            </ul>
                            <div class="mt-4 p-3 bg-light rounded">
                                <h6><i class="fas fa-info-circle"></i> ${i18n.t('sources.delete_blocked_info_title')}</h6>
                                <p class="mb-2">${i18n.t('sources.delete_blocked_info')}</p>
                                <ol class="mb-0">
                                    <li>${i18n.t('sources.delete_blocked_step1')}</li>
                                    <li>${i18n.t('sources.delete_blocked_step2')}</li>
                                    <li>${i18n.t('sources.delete_blocked_step3')}</li>
                                    <li>${i18n.t('sources.delete_blocked_step4')}</li>
                                </ol>
                            </div>
                        </div>
                    `,
                    `
                        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('sources.delete_blocked_understood')}</button>
                        <button type="button" class="btn btn-primary" onclick="app.closeModal(); app.handleNavigation({preventDefault: () => {}, currentTarget: {dataset: {page: 'routes'}}})">
                            <i class="fas fa-route"></i> ${i18n.t('sources.delete_blocked_manage_routes')}
                        </button>
                    `
                );
                return;
            }

            // If can delete, show normal confirmation
            if (!confirm(i18n.t('sources.delete_confirm', { name: source.name }))) {
                return;
            }

            const response = await window.api.deleteSource(sourceId);
            if (response.success) {
                await this.loadSources();
                this.showToast('success', i18n.t('common.success'), i18n.t('sources.deleted'));
            }

        } catch (error) {
            console.error('Error deleting source:', error);

            // Enhanced error handling with details from backend
            let errorMessage = i18n.t('sources.delete_error');
            if (error.response && error.response.data && error.response.data.details) {
                const routes = error.response.data.details.connectedRoutes;
                if (routes && routes.length > 0) {
                    errorMessage = i18n.t('sources.delete_active_routes', { count: routes.length });
                }
            }

            this.showToast('error', i18n.t('common.error'), errorMessage);
        }
    }

    // === Targets Management ===

    /**
     * Load targets data
     */
    async loadTargets() {
        try {
            window.api.showLoading(document.getElementById('targetsTable'), i18n.t('targets.loading'));

            // Use scope-based API call
            const scope = window.scopeManager.getCurrentScope();
            const teamId = window.scopeManager.getActiveTeamId();

            const response = await window.api.getScopeBasedTargets(scope, teamId);
            if (response.success) {
                this.data.targets = response.data;
                this.renderTargetsTable();
            }

        } catch (error) {
            console.error('Error loading targets:', error);
            document.getElementById('targetsTable').innerHTML = `<tr><td colspan="5" class="text-center">${i18n.t('targets.load_error')}</td></tr>`;
        }
    }

    /**
     * Render targets table
     */
    renderTargetsTable() {
        const tbody = document.getElementById('targetsTable');
        if (!tbody) return;

        if (this.data.targets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">${i18n.t('targets.empty')}</td></tr>`;
            return;
        }

        const rowsHtml = this.data.targets.map(target => `
            <tr>
                <td>${window.api.escapeHtml(target.name)}</td>
                <td><span class="badge badge-secondary">${window.api.escapeHtml(target.type)}</span></td>
                <td><code>${window.api.truncate(target.webhook_url, 50)}</code></td>
                <td>${window.api.formatDate(target.created_at)}</td>
                <td>${window.api.generateActionButtons(target, 'Target')}</td>
            </tr>
        `).join('');

        tbody.innerHTML = rowsHtml;
    }

    /**
     * Show target modal for create/edit
     */
    showTargetModal(targetId = null) {
        const isEdit = targetId !== null;
        const target = isEdit ? this.data.targets.find(t => t.id === targetId) : null;

        // Get current scope and user teams for scope selection
        const currentScope = window.scopeManager.getCurrentScope();
        const userTeams = window.scopeManager.getUserTeams();
        const activeTeamId = window.scopeManager.getActiveTeamId();

        // Build scope selection HTML
        let scopeHtml = '';
        if (!isEdit) { // Only show scope selection for new targets
            scopeHtml = `
                <div class="scope-form-section">
                    <h4>${i18n.t('sources.scope_selection')}</h4>
                    <div class="scope-radio-group">
                        <div class="scope-radio-option ${currentScope === 'personal' ? 'selected' : ''}">
                            <input type="radio" id="targetScopePersonal" name="scope" value="personal"
                                   ${currentScope === 'personal' ? 'checked' : ''}>
                            <label for="targetScopePersonal">
                                ${i18n.t('scope.personal')}
                                <span class="scope-description">${i18n.t('scope.personal_help')}</span>
                            </label>
                        </div>
                        <div class="scope-radio-option ${currentScope === 'team' ? 'selected' : ''} ${userTeams.length === 0 ? 'disabled' : ''}">
                            <input type="radio" id="targetScopeTeam" name="scope" value="team"
                                   ${currentScope === 'team' ? 'checked' : ''}
                                   ${userTeams.length === 0 ? 'disabled' : ''}>
                            <label for="targetScopeTeam">
                                ${i18n.t('scope.team')}
                                <span class="scope-description">${userTeams.length === 0 ? i18n.t('scope.no_teams') : i18n.t('scope.team_help')}</span>
                            </label>
                        </div>
                    </div>
                    <div class="team-selector-container" style="display: ${currentScope === 'team' ? 'block' : 'none'};">
                        <label for="targetTeamId">${i18n.t('scope.select_team_label')}</label>
                        <select id="targetTeamId" name="team_id" class="form-control">
                            <option value="">${i18n.t('scope.selector.select_team')}</option>
                            ${userTeams.map(team =>
                                `<option value="${team.id}" ${team.id === activeTeamId ? 'selected' : ''}>
                                    ${team.name}
                                </option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
            `;
        }

        this.showModal(
            isEdit ? i18n.t('targets.edit_title') : i18n.t('targets.new_title'),
            `
                <form id="targetForm">
                    ${scopeHtml}
                    <div class="form-group">
                        <label for="targetName">${i18n.t('targets.form_name')} *</label>
                        <input type="text" id="targetName" name="name" class="form-control" required
                               value="${target ? window.api.escapeHtml(target.name) : ''}"
                               placeholder="${i18n.t('targets.name_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="targetType">${i18n.t('targets.form_type')} *</label>
                        <select id="targetType" name="type" class="form-control" required>
                            <option value="">${i18n.t('targets.form_select_type')}</option>
                            <option value="mattermost" ${target && target.type === 'mattermost' ? 'selected' : ''}>${i18n.t('targets.types.mattermost')}</option>
                            <option value="rocketchat" ${target && target.type === 'rocketchat' ? 'selected' : ''}>${i18n.t('targets.types.rocketchat')}</option>
                            <option value="slack" ${target && target.type === 'slack' ? 'selected' : ''}>${i18n.t('targets.types.slack')}</option>
                            <option value="discord" ${target && target.type === 'discord' ? 'selected' : ''}>${i18n.t('targets.types.discord')}</option>
                            <option value="teams" ${target && target.type === 'teams' ? 'selected' : ''}>${i18n.t('targets.types.teams')}</option>
                            <option value="webhook" ${target && target.type === 'webhook' ? 'selected' : ''}>${i18n.t('targets.types.webhook')}</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="targetWebhookUrl">${i18n.t('targets.form_webhook_url')} *</label>
                        <input type="url" id="targetWebhookUrl" name="webhook_url" class="form-control" required
                               value="${target ? window.api.escapeHtml(target.webhook_url) : ''}"
                               placeholder="${i18n.t('targets.url_placeholder')}">
                    </div>
                </form>
            `,
            `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.cancel')}</button>
                <button type="button" class="btn btn-primary" onclick="app.saveTarget(${targetId})">
                    ${isEdit ? i18n.t('common.save') : i18n.t('common.create')}
                </button>
            `
        );

        // Setup scope selection event listeners for new targets
        if (!isEdit) {
            setTimeout(() => {
                this.setupScopeSelectionListeners();
                this.setupModalFormSubmit('targetForm', 'saveTarget', targetId);
            }, 100);
        } else {
            setTimeout(() => {
                this.setupModalFormSubmit('targetForm', 'saveTarget', targetId);
            }, 100);
        }

        // Focus first input
        setTimeout(() => document.getElementById('targetName').focus(), 100);
    }

    /**
     * Save target (create or update)
     */
    async saveTarget(targetId = null) {
        console.log('🚀 saveTarget kezdése:', { targetId });

        // Get submit button and set loading state
        const submitButton = document.querySelector('.btn-primary');
        const originalButtonText = submitButton?.textContent || i18n.t('common.create');

        try {
            // Set loading state
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${i18n.t('common.saving')}`;
            }

            const form = document.getElementById('targetForm');
            if (!form) {
                console.error('❌ targetForm nem található!');
                this.showToast('error', i18n.t('common.error'), i18n.t('validation.form_not_found'));
                return;
            }

            const formData = new FormData(form);
            console.log('📋 Form adatok:', {
                name: formData.get('name'),
                type: formData.get('type'),
                webhook_url: formData.get('webhook_url'),
                scope: formData.get('scope'),
                team_id: formData.get('team_id')
            });

            const data = {
                name: formData.get('name'),
                type: formData.get('type'),
                webhook_url: formData.get('webhook_url')
            };

            // Validate required fields
            if (!data.name || !data.type || !data.webhook_url) {
                console.error('❌ Kötelező mezők hiányoznak:', data);
                this.showToast('error', i18n.t('common.error'), i18n.t('targets.required_fields'));
                return;
            }

            let response;
            if (targetId) {
                console.log('✏️ Célpont frissítése:', { targetId, data });
                // For updates, use existing API methods (scope is fixed)
                response = await window.api.updateTarget(targetId, data);
            } else {
                // For new targets, get scope information
                const scope = formData.get('scope') || window.scopeManager.getCurrentScope();
                const teamId = formData.get('team_id') ? parseInt(formData.get('team_id')) : window.scopeManager.getActiveTeamId();

                console.log('➕ Új célpont létrehozása:', { scope, teamId, data });

                // Validate scope and teamId for team scope
                if (scope === 'team' && !teamId) {
                    console.error('❌ Team scope esetén team_id kötelező!');
                    this.showToast('error', i18n.t('common.error'), i18n.t('targets.team_required'));
                    return;
                }

                // Use scope-based creation
                response = await window.api.createScopeBasedResource('targets', scope, teamId, data);
            }

            console.log('📡 API válasz:', response);

            if (response && response.success) {
                console.log('✅ Célpont sikeresen mentve');
                this.closeModal();
                await this.loadTargets();
                this.showToast('success', i18n.t('common.success'), targetId ? i18n.t('targets.updated') : i18n.t('targets.created'));
            } else {
                console.error('❌ API hiba:', response?.error || 'Ismeretlen hiba');
                this.showToast('error', i18n.t('common.error'), response?.error || i18n.t('targets.save_error'));
            }

        } catch (error) {
            console.error('❌ Exception saveTarget-ban:', error);
            this.showToast('error', i18n.t('common.error'), `${i18n.t('targets.save_error')}: ${error.message}`);
        } finally {
            // Reset button state
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        }
    }

    /**
     * Edit target
     */
    editTarget(targetId) {
        this.showTargetModal(targetId);
    }

    /**
     * Test target webhook
     */
    async testTarget(targetId) {
        try {
            const response = await window.api.testTarget(targetId);
            if (response.success) {
                this.showToast('success', i18n.t('targets.test_success_title'), i18n.t('targets.test_sent'));
            }

        } catch (error) {
            console.error('Error testing target:', error);
            this.showToast('error', i18n.t('targets.test_error_title'), i18n.t('targets.test_error'));
        }
    }

    /**
     * Delete target
     */
    async deleteTarget(targetId) {
        const target = this.data.targets.find(t => t.id === targetId);
        if (!target) return;

        if (!confirm(i18n.t('targets.delete_confirm', { name: target.name }))) {
            return;
        }

        try {
            const response = await window.api.deleteTarget(targetId);
            if (response.success) {
                await this.loadTargets();
                this.showToast('success', i18n.t('common.success'), i18n.t('targets.deleted'));
            }

        } catch (error) {
            console.error('Error deleting target:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('targets.delete_error'));
        }
    }

    // === Routes Management ===

    /**
     * Load routes data
     */
    async loadRoutes() {
        try {
            window.api.showLoading(document.getElementById('routesTable'), i18n.t('routes.loading'));

            // Use scope-based API calls
            const scope = window.scopeManager.getCurrentScope();
            const teamId = window.scopeManager.getActiveTeamId();

            // Load routes along with sources and targets for the dropdown
            const [routesResponse, sourcesResponse, targetsResponse] = await Promise.all([
                window.api.getScopeBasedRoutes(scope, teamId),
                window.api.getScopeBasedSources(scope, teamId),
                window.api.getScopeBasedTargets(scope, teamId)
            ]);

            if (routesResponse.success) {
                this.data.routes = routesResponse.data;
            }
            if (sourcesResponse.success) {
                this.data.sources = sourcesResponse.data;
            }
            if (targetsResponse.success) {
                this.data.targets = targetsResponse.data;
            }

            this.renderRoutesTable();

        } catch (error) {
            console.error('Error loading routes:', error);
            document.getElementById('routesTable').innerHTML = `<tr><td colspan="5" class="text-center">${i18n.t('routes.load_error')}</td></tr>`;
        }
    }

    /**
     * Render routes table
     */
    renderRoutesTable() {
        const tbody = document.getElementById('routesTable');
        if (!tbody) return;

        if (this.data.routes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">${i18n.t('routes.empty')}</td></tr>`;
            return;
        }

        const rowsHtml = this.data.routes.map(route => {
            const source = this.data.sources.find(s => s.id === route.source_id);
            const target = this.data.targets.find(t => t.id === route.target_id);

            return `
                <tr>
                    <td>${source ? window.api.escapeHtml(source.name) : 'N/A'}</td>
                    <td>${target ? window.api.escapeHtml(target.name) : 'N/A'}</td>
                    <td><code>${window.api.truncate(route.message_template || i18n.t('routes.template_default'), 50)}</code></td>
                    <td>${window.api.formatDate(route.created_at)}</td>
                    <td>${window.api.generateActionButtons(route, 'Route')}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
    }

    /**
     * Show route modal for create/edit
     */
    showRouteModal(routeId = null) {
        const isEdit = routeId !== null;
        const route = isEdit ? this.data.routes.find(r => r.id === routeId) : null;

        const sourcesOptions = this.data.sources.map(source =>
            `<option value="${source.id}" ${route && route.source_id === source.id ? 'selected' : ''}>
                ${window.api.escapeHtml(source.name)}
            </option>`
        ).join('');

        const targetsOptions = this.data.targets.map(target =>
            `<option value="${target.id}" ${route && route.target_id === target.id ? 'selected' : ''}>
                ${window.api.escapeHtml(target.name)}
            </option>`
        ).join('');

        this.showModal(
            isEdit ? i18n.t('routes.edit_title') : i18n.t('routes.new_title'),
            `
                <form id="routeForm">
                    <div class="form-group">
                        <label for="routeSource">${i18n.t('routes.form_source')} *</label>
                        <select id="routeSource" name="source_id" class="form-control" required>
                            <option value="">${i18n.t('routes.select_source')}</option>
                            ${sourcesOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="routeTarget">${i18n.t('routes.form_target')} *</label>
                        <select id="routeTarget" name="target_id" class="form-control" required>
                            <option value="">${i18n.t('routes.select_target')}</option>
                            ${targetsOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="routeTemplate">${i18n.t('routes.form_template')}</label>
                        <textarea id="routeTemplate" name="message_template" class="form-control" rows="4"
                                  placeholder="${i18n.t('routes.form_template_placeholder')}">${route ? window.api.escapeHtml(route.message_template || '') : ''}</textarea>
                        <small class="form-text text-muted">
                            ${i18n.t('routes.form_template_help')}
                        </small>
                    </div>
                </form>
            `,
            `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.cancel')}</button>
                <button type="button" class="btn btn-primary" onclick="app.saveRoute(${routeId})">
                    ${isEdit ? i18n.t('common.save') : i18n.t('common.create')}
                </button>
            `
        );

        // Focus first select
        setTimeout(() => document.getElementById('routeSource').focus(), 100);
    }

    /**
     * Detect scope of a resource by ID
     * @param {string} resourceType - 'sources', 'targets', 'routes'
     * @param {number} resourceId - Resource ID
     * @returns {Promise<{scope: string, teamId: number|null}>}
     */
    async detectResourceScope(resourceType, resourceId) {
        console.log('🔍 Scope detection indítása:', { resourceType, resourceId });

        try {
            // Try in personal scope
            console.log('🔍 Personal scope ellenőrzése...');
            const personalResources = await window.api.getScopeBasedResources(resourceType, 'personal');
            const personalResource = personalResources.find(r => r.id === resourceId);

            if (personalResource) {
                console.log('✅ Erőforrás megtalálva personal scope-ban:', personalResource);
                return { scope: 'personal', teamId: null };
            }

            // Try in team scope with the active team
            const activeTeamId = window.scopeManager?.getActiveTeamId();
            if (activeTeamId) {
                console.log('🔍 Team scope ellenőrzése, activeTeamId:', activeTeamId);
                const teamResources = await window.api.getScopeBasedResources(resourceType, 'team', activeTeamId);
                const teamResource = teamResources.find(r => r.id === resourceId);

                if (teamResource) {
                    console.log('✅ Erőforrás megtalálva team scope-ban:', teamResource);
                    return { scope: 'team', teamId: activeTeamId };
                }
            }

            // If not found, try in all available teams
            const user = await window.api.me();
            if (user.success && user.data.teams) {
                console.log('🔍 Összes team ellenőrzése:', user.data.teams);

                for (const team of user.data.teams) {
                    try {
                        const teamResources = await window.api.getScopeBasedResources(resourceType, 'team', team.id);
                        const teamResource = teamResources.find(r => r.id === resourceId);

                        if (teamResource) {
                            console.log('✅ Erőforrás megtalálva team scope-ban (team):', { team: team.id, resource: teamResource });
                            return { scope: 'team', teamId: team.id };
                        }
                    } catch (e) {
                        console.log('⚠️ Team hozzáférés hiba:', team.id, e.message);
                    }
                }
            }

            throw new Error(i18n.t('routes.resource_not_found', { type: resourceType, id: resourceId }));
        } catch (error) {
            console.error('❌ Scope detection hiba:', error);
            throw error;
        }
    }

    /**
     * Save route (create or update) - Scope-aware version
     */
    async saveRoute(routeId = null) {
        try {
            const form = document.getElementById('routeForm');
            const formData = new FormData(form);

            const data = {
                source_id: parseInt(formData.get('source_id')),
                target_id: parseInt(formData.get('target_id')),
                message_template: formData.get('message_template') || null
            };

            console.log('💾 Route mentés kezdete:', { routeId, data });

            let response;
            if (routeId) {
                // For updates, use the existing route's scope
                const routeScope = await this.detectResourceScope('routes', routeId);
                console.log('📝 Update - detektált route scope:', routeScope);

                if (routeScope.scope === 'personal') {
                    response = await window.api.updatePersonalRoute(routeId, data);
                } else if (routeScope.scope === 'team') {
                    response = await window.api.updateTeamRoute(routeScope.teamId, routeId, data);
                }
            } else {
                // For creation, determine scope from the source and target
                console.log('🆕 Create - scope detection...');

                const sourceScope = await this.detectResourceScope('sources', data.source_id);
                const targetScope = await this.detectResourceScope('targets', data.target_id);

                console.log('🔍 Scope detection eredmények:', { sourceScope, targetScope });

                // Scope compatibility check
                if (sourceScope.scope !== targetScope.scope) {
                    this.showToast('error', i18n.t('common.error'), i18n.t('routes.scope_mismatch'));
                    return;
                }

                if (sourceScope.scope === 'team' && sourceScope.teamId !== targetScope.teamId) {
                    this.showToast('error', i18n.t('common.error'), i18n.t('routes.team_mismatch'));
                    return;
                }

                // Create route in the appropriate scope
                const scope = sourceScope.scope;
                const teamId = sourceScope.teamId;

                console.log('✅ Compatible scope, creating route:', { scope, teamId });

                response = await window.api.createScopeBasedResource('routes', scope, teamId, data);
            }

            if (response.success) {
                this.closeModal();
                await this.loadRoutes();
                this.showToast('success', i18n.t('common.success'), routeId ? i18n.t('routes.updated') : i18n.t('routes.created'));
                console.log('✅ Route mentés sikeres');
            } else {
                console.error('❌ Route mentés sikertelen:', response);
                this.showToast('error', i18n.t('common.error'), response.error || i18n.t('routes.save_error'));
            }

        } catch (error) {
            console.error('❌ Error saving route:', error);

            let errorMessage = i18n.t('routes.save_error');
            if (error.message.includes('not found')) {
                errorMessage = i18n.t('routes.not_found');
            } else if (error.message.includes('scope')) {
                errorMessage = error.message;
            }

            this.showToast('error', i18n.t('common.error'), errorMessage);
        }
    }

    /**
     * Edit route
     */
    editRoute(routeId) {
        this.showRouteModal(routeId);
    }

    /**
     * Delete route
     */
    async deleteRoute(routeId) {
        if (!confirm(i18n.t('routes.delete_confirm'))) {
            return;
        }

        try {
            const response = await window.api.deleteRoute(routeId);
            if (response.success) {
                await this.loadRoutes();
                this.showToast('success', i18n.t('common.success'), i18n.t('routes.deleted'));
            }

        } catch (error) {
            console.error('Error deleting route:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('routes.delete_error'));
        }
    }

    // === Events Management ===

    /**
     * Load events data
     */
    async loadEvents() {
        try {
            window.api.showLoading(document.getElementById('eventsTable'), i18n.t('events.loading'));

            // Get filter values
            const sourceFilter = document.getElementById('sourceFilter');
            const filters = {};

            if (sourceFilter && sourceFilter.value) {
                filters.source_id = sourceFilter.value;
            }

            // Use scope-based API call
            const scope = window.scopeManager.getCurrentScope();
            const teamId = window.scopeManager.getActiveTeamId();

            const response = await window.api.getScopeBasedEvents(scope, teamId, filters);
            if (response.success) {
                this.data.events = response.data;
                this.renderEventsTable();
                this.updateSourceFilter();
            }

        } catch (error) {
            console.error('Error loading events:', error);
            document.getElementById('eventsTable').innerHTML = `<tr><td colspan="6" class="text-center">${i18n.t('events.load_error')}</td></tr>`;
        }
    }

    /**
     * Update source filter dropdown
     */
    updateSourceFilter() {
        const sourceFilter = document.getElementById('sourceFilter');
        if (!sourceFilter || !this.data.sources) return;

        // Keep current selection
        const currentValue = sourceFilter.value;

        // Clear and rebuild options
        sourceFilter.innerHTML = `<option value="">${i18n.t('filters.all_sources')}</option>`;

        this.data.sources.forEach(source => {
            const option = document.createElement('option');
            option.value = source.id;
            option.textContent = source.name;
            if (source.id.toString() === currentValue) {
                option.selected = true;
            }
            sourceFilter.appendChild(option);
        });
    }

    /**
     * Render events table
     */
    renderEventsTable() {
        const tbody = document.getElementById('eventsTable');
        if (!tbody) return;

        if (this.data.events.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">${i18n.t('events.empty')}</td></tr>`;
            return;
        }

        const rowsHtml = this.data.events.map(event => {
            const source = this.data.sources.find(s => s.id === event.source_id);
            const status = event.processed_at ? 'completed' : 'pending';

            return `
                <tr>
                    <td>${source ? window.api.escapeHtml(source.name) : 'N/A'}</td>
                    <td>${window.api.escapeHtml(event.event_type || 'N/A')}</td>
                    <td>${window.api.formatDate(event.received_at)}</td>
                    <td>${window.api.formatDate(event.processed_at)}</td>
                    <td>${window.api.generateStatusBadge(status)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-secondary" onclick="app.viewEvent(${event.id})" title="${i18n.t('actions.view_details')}">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${!event.processed_at ? `
                                <button class="btn btn-sm btn-warning" onclick="app.reprocessEvent(${event.id})" title="${i18n.t('actions.reprocess')}">
                                    <i class="fas fa-redo"></i>
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-danger" onclick="app.deleteEvent(${event.id})" title="${i18n.t('actions.delete')}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
    }

    /**
     * View event details
     */
    async viewEvent(eventId) {
        try {
            const response = await window.api.getEvent(eventId);
            if (response.success) {
                const event = response.data;
                const source = this.data.sources.find(s => s.id === event.source_id);

                this.showModal(
                    i18n.t('events.details_title'),
                    `
                        <div class="form-group">
                            <label>${i18n.t('events.labels.id')}</label>
                            <div class="form-control">${event.id}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('events.labels.source')}</label>
                            <div class="form-control">${source ? source.name : i18n.t('common.not_available')}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('events.labels.type')}</label>
                            <div class="form-control">${event.event_type || i18n.t('common.not_available')}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('events.labels.received')}</label>
                            <div class="form-control">${window.api.formatDate(event.received_at)}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('events.labels.processed')}</label>
                            <div class="form-control">${window.api.formatDate(event.processed_at)}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('events.labels.payload')}</label>
                            <div class="code-block">${JSON.stringify(event.payload_json, null, 2)}</div>
                        </div>
                    `,
                    `
                        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.close')}</button>
                    `
                );
            }

        } catch (error) {
            console.error('Error viewing event:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('events.details_error'));
        }
    }

    /**
     * Reprocess event
     */
    async reprocessEvent(eventId) {
        try {
            const response = await window.api.reprocessEvent(eventId);
            if (response.success) {
                await this.loadEvents();
                this.showToast('success', i18n.t('common.success'), i18n.t('events.reprocess_started'));
            }

        } catch (error) {
            console.error('Error reprocessing event:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('events.reprocess_error'));
        }
    }

    /**
     * Delete event
     */
    async deleteEvent(eventId) {
        if (!confirm(i18n.t('events.delete_confirm'))) {
            return;
        }

        try {
            const response = await window.api.deleteEvent(eventId);
            if (response.success) {
                await this.loadEvents();
                this.showToast('success', i18n.t('common.success'), i18n.t('events.deleted'));
            }

        } catch (error) {
            console.error('Error deleting event:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('events.delete_error'));
        }
    }

    // === Deliveries Management ===

    /**
     * Load deliveries data
     */
    async loadDeliveries() {
        try {
            window.api.showLoading(document.getElementById('deliveriesTable'), i18n.t('deliveries.loading'));

            // Use scope-based API call
            const scope = window.scopeManager.getCurrentScope();
            const teamId = window.scopeManager.getActiveTeamId();

            const response = await window.api.getScopeBasedDeliveries(scope, teamId);
            if (response.success) {
                this.data.deliveries = response.data;
                this.renderDeliveriesTable();
            }

        } catch (error) {
            console.error('Error loading deliveries:', error);
            document.getElementById('deliveriesTable').innerHTML = `<tr><td colspan="7" class="text-center">${i18n.t('deliveries.load_error')}</td></tr>`;
        }
    }

    /**
     * Render deliveries table
     */
    renderDeliveriesTable() {
        const tbody = document.getElementById('deliveriesTable');
        if (!tbody) return;

        if (this.data.deliveries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center">${i18n.t('deliveries.empty')}</td></tr>`;
            return;
        }

        const rowsHtml = this.data.deliveries.map(delivery => {
            const target = this.data.targets.find(t => t.id === delivery.target_id);

            return `
                <tr>
                    <td>${delivery.event_id}</td>
                    <td>${target ? window.api.escapeHtml(target.name) : 'N/A'}</td>
                    <td>${window.api.generateStatusBadge(delivery.status)}</td>
                    <td>${delivery.attempts || 0}</td>
                    <td>${delivery.last_error ? window.api.truncate(delivery.last_error, 50) : '-'}</td>
                    <td>${window.api.formatDate(delivery.sent_at)}</td>
                    <td>
                        <div class="action-buttons">
                            ${delivery.status === 'failed' ? `
                                <button class="btn btn-sm btn-warning" onclick="app.retryDelivery(${delivery.id})" title="${i18n.t('actions.retry')}">
                                    <i class="fas fa-redo"></i>
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-secondary" onclick="app.viewDelivery(${delivery.id})" title="${i18n.t('common.details')}">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="app.deleteDelivery(${delivery.id})" title="${i18n.t('common.delete')}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
    }

    /**
     * View delivery details
     */
    async viewDelivery(deliveryId) {
        try {
            const response = await window.api.getDelivery(deliveryId);
            if (response.success) {
                const delivery = response.data;
                const target = this.data.targets.find(t => t.id === delivery.target_id);

                this.showModal(
                    i18n.t('deliveries.details_title'),
                    `
                        <div class="form-group">
                            <label>${i18n.t('deliveries.labels.id')}</label>
                            <div class="form-control">${delivery.id}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('deliveries.labels.event_id')}</label>
                            <div class="form-control">${delivery.event_id}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('deliveries.labels.target')}</label>
                            <div class="form-control">${target ? target.name : 'N/A'}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('deliveries.labels.status')}</label>
                            <div class="form-control">${window.api.generateStatusBadge(delivery.status)}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('deliveries.labels.attempts')}</label>
                            <div class="form-control">${delivery.attempts || 0}</div>
                        </div>
                        <div class="form-group">
                            <label>${i18n.t('deliveries.labels.sent')}</label>
                            <div class="form-control">${window.api.formatDate(delivery.sent_at)}</div>
                        </div>
                        ${delivery.last_error ? `
                            <div class="form-group">
                                <label>${i18n.t('deliveries.labels.last_error')}</label>
                                <div class="code-block">${window.api.escapeHtml(delivery.last_error)}</div>
                            </div>
                        ` : ''}
                    `,
                    `
                        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.close')}</button>
                        ${delivery.status === 'failed' ? `
                            <button type="button" class="btn btn-warning" onclick="app.retryDelivery(${delivery.id}); app.closeModal();">
                                <i class="fas fa-redo"></i> ${i18n.t('deliveries.retry')}
                            </button>
                        ` : ''}
                    `
                );
            }

        } catch (error) {
            console.error('Error viewing delivery:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('deliveries.details_error'));
        }
    }

    /**
     * Retry delivery
     */
    async retryDelivery(deliveryId) {
        try {
            const response = await window.api.retryDelivery(deliveryId);
            if (response.success) {
                await this.loadDeliveries();
                this.showToast('success', i18n.t('common.success'), i18n.t('deliveries.retry_started'));
            }

        } catch (error) {
            console.error('Error retrying delivery:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('deliveries.retry_error'));
        }
    }

    /**
     * Delete delivery
     */
    async deleteDelivery(deliveryId) {
        if (!confirm(i18n.t('deliveries.delete_confirm'))) {
            return;
        }

        try {
            const response = await window.api.deleteDelivery(deliveryId);
            if (response.success) {
                await this.loadDeliveries();
                this.showToast('success', i18n.t('common.success'), i18n.t('deliveries.deleted'));
            }

        } catch (error) {
            console.error('Error deleting delivery:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('deliveries.delete_error'));
        }
    }

    // === Modal Management ===

    /**
     * Show modal dialog
     */
    showModal(title, body, footer = '', size = 'normal') {
        this.elements.modalTitle.textContent = title;
        this.elements.modalBody.innerHTML = body;
        this.elements.modalFooter.innerHTML = footer;

        // Apply modal size
        const modalContent = this.modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.className = `modal-content ${size === 'large' ? 'modal-large' : ''}`;
        }

        this.modal.style.display = 'flex';

        // Focus management
        setTimeout(() => {
            const firstInput = this.modal.querySelector('input, select, textarea');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }

    /**
     * Close modal dialog
     */
    closeModal() {
        this.modal.style.display = 'none';
        this.elements.modalBody.innerHTML = '';
        this.elements.modalFooter.innerHTML = '';
    }

    /**
     * Show confirmation dialog
     */
    showConfirmDialog(title, message, type = 'default') {
        return new Promise((resolve) => {
            const typeClass = type === 'danger' ? 'btn-danger' : 'btn-primary';
            const actionText = type === 'danger' ? i18n.t('common.delete') : i18n.t('common.ok');

            const modalContent = `
                <div class="confirm-dialog">
                    <p>${message}</p>
                </div>
            `;

            const modalFooter = `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal(); window.currentConfirmResolve(false);">${i18n.t('common.cancel')}</button>
                <button type="button" class="btn ${typeClass}" onclick="app.closeModal(); window.currentConfirmResolve(true);">
                    ${actionText}
                </button>
            `;

            // Store resolve function globally to access from onclick handlers
            window.currentConfirmResolve = resolve;

            this.showModal(title, modalContent, modalFooter);
        });
    }

    // === Toast Notifications ===

    /**
     * Show toast notification
     */
    showToast(type, title, message, duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="${iconMap[type] || iconMap.info}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${window.api.escapeHtml(title)}</div>
                <div class="toast-message">${window.api.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.toastContainer.appendChild(toast);

        // Show animation
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.parentElement.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    // === Utility Methods ===

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('success', i18n.t('common.copied'), i18n.t('actions.url_copied'));
        } catch (error) {
            console.error('Error copying to clipboard:', error);

            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                document.execCommand('copy');
                this.showToast('success', i18n.t('common.copied'), i18n.t('actions.url_copied'));
            } catch (_fallbackError) {
                this.showToast('error', i18n.t('common.error'), i18n.t('actions.copy_failed'));
            }

            document.body.removeChild(textArea);
        }
    }

    // === Auto-refresh ===

    /**
     * Set up auto-refresh intervals
     */
    setupRefreshIntervals() {
        // Refresh dashboard every 30 seconds
        this.refreshIntervals.dashboard = setInterval(() => {
            if (this.currentPage === 'dashboard') {
                this.loadDashboard();
            }
        }, 30000);

        // Refresh events every 60 seconds
        this.refreshIntervals.events = setInterval(() => {
            if (this.currentPage === 'events') {
                this.loadEvents();
            }
        }, 60000);

        // Refresh deliveries every 60 seconds
        this.refreshIntervals.deliveries = setInterval(() => {
            if (this.currentPage === 'deliveries') {
                this.loadDeliveries();
            }
        }, 60000);
    }

    /**
     * Clear all refresh intervals
     */
    clearRefreshIntervals() {
        Object.values(this.refreshIntervals).forEach(interval => {
            if (interval) {
                clearInterval(interval);
            }
        });
        this.refreshIntervals = {};
    }

    /**
     * Load users list
     */
    /**
     * Load teams page data
     */
    async loadTeams() {
        if (window.teamManager) {
            try {
                await window.teamManager.loadTeams();
                await window.teamManager.loadUserTeams();
                window.teamManager.renderTeamsTable();
                window.teamManager.updateTeamStats();
            } catch (error) {
                console.error('Error loading teams:', error);
                this.showToast('error', i18n.t('common.error'), error.message || i18n.t('teams.load_error'));
            }
        }
    }

    async loadUsers() {
        console.log('Loading users...');
        try {
            const tbody = document.getElementById('usersTable');
            if (tbody) {
                window.api.showLoading(tbody, i18n.t('users.loading'));
            }

            console.log('Calling API to get users...');
            const users = await window.api.getUsers();
            console.log('Received users:', users);

            this.data.users = users;
            this.renderUsersTable(users);
            console.log('Users table rendered successfully');
        } catch (error) {
            console.error('Error loading users:', error);

            // Show error in table if tbody exists
            const tbody = document.getElementById('usersTable');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center error">${i18n.t('users.load_error')}</td></tr>`;
            }

            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('users.load_error'));
        }
    }

    /**
     * Render users table
     */
    renderUsersTable(users) {
        const tbody = document.getElementById('usersTable');
        if (!tbody) return;

        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">${i18n.t('users.empty')}</td>
                </tr>
            `;
            return;
        }

        const currentUserId = this.currentUser ? this.currentUser.id : null;
        const isCurrentUserAdmin = this.isAdmin();

        tbody.innerHTML = users.map(user => {
            const isCurrentUser = user.id === currentUserId;
            const isLastAdmin = user.role === 'admin' && users.filter(u => u.role === 'admin').length === 1;

            return `
                <tr>
                    <td>${user.id}</td>
                    <td>${window.api.escapeHtml(user.username)}</td>
                    <td>
                        <span class="role-badge role-${user.role}">
                            <i class="fas ${user.role === 'admin' ? 'fa-crown' : 'fa-user'}"></i>
                            ${i18n.t('users.badge.' + user.role)}
                        </span>
                    </td>
                    <td>
                        <span class="group-badge ${user.role === 'admin' ? 'group-admin' : 'group-user'}">
                            <i class="fas ${user.role === 'admin' ? 'fa-shield-alt' : 'fa-users'}"></i>
                            ${i18n.t('users.groups.' + (user.role === 'admin' ? 'admin' : 'users'))}
                        </span>
                    </td>
                    <td>${window.api.formatDate(user.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            ${!isCurrentUser && isCurrentUserAdmin ? `
                                <button class="btn btn-sm btn-secondary" onclick="app.toggleUserRole(${user.id}, '${user.role}')"
                                        ${isLastAdmin ? `disabled title="${i18n.t('users.last_admin_role')}"` : ''}>
                                    <i class="fas fa-user-cog"></i>
                                    ${user.role === 'admin' ? i18n.t('users.actions.demote') : i18n.t('users.actions.promote')}
                                </button>
                            ` : ''}
                            ${!isCurrentUser && isCurrentUserAdmin ? `
                                <button class="btn btn-sm btn-warning" onclick="app.toggleUserStatus(${user.id}, ${user.active})">
                                    <i class="fas ${user.active ? 'fa-pause' : 'fa-play'}"></i>
                                    ${user.active ? i18n.t('users.actions.disable') : i18n.t('users.actions.enable')}
                                </button>
                            ` : ''}
                            ${!isCurrentUser && isCurrentUserAdmin ? `
                                <button class="btn btn-sm btn-danger" onclick="app.deleteUser(${user.id}, '${window.api.escapeHtml(user.username)}')"
                                        ${isLastAdmin ? `disabled title="${i18n.t('users.last_admin_delete')}"` : ''}>
                                    <i class="fas fa-trash"></i>
                                    ${i18n.t('common.delete')}
                                </button>
                            ` : ''}
                            ${isCurrentUser ? `
                                <span class="text-muted">
                                    <i class="fas fa-info-circle"></i>
                                    ${i18n.t('common.own_account')}
                                </span>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Show add user modal
     */
    showAddUserModal() {
        console.log('Opening add user modal...');
        this.showModal(
            i18n.t('users.add_title'),
            `
                <form id="addUserForm">
                    <div class="form-group">
                        <label for="newUserUsername">${i18n.t('users.form.username')}</label>
                        <input type="text" id="newUserUsername" name="username" class="form-control" required
                               pattern="[a-zA-Z0-9_-]+"
                               title="${i18n.t('users.form.username_pattern')}"
                               placeholder="${i18n.t('users.form.username_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="newUserPassword">${i18n.t('users.form.password')}</label>
                        <input type="password" id="newUserPassword" name="password" class="form-control" required minlength="6"
                               placeholder="${i18n.t('users.form.password_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="newUserRole">${i18n.t('users.form.role')}</label>
                        <select id="newUserRole" name="role" class="form-control" required>
                            <option value="user">${i18n.t('users.roles.user')}</option>
                            <option value="admin">${i18n.t('users.roles.admin')}</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="newUserEmail">${i18n.t('users.form.email')}</label>
                        <input type="email" id="newUserEmail" name="email" class="form-control"
                               placeholder="${i18n.t('users.form.email_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="newUserFullName">${i18n.t('users.form.full_name')}</label>
                        <input type="text" id="newUserFullName" name="full_name" class="form-control"
                               placeholder="${i18n.t('users.form.full_name_placeholder')}">
                    </div>
                </form>
            `,
            `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.cancel')}</button>
                <button type="button" class="btn btn-primary" onclick="app.handleAddUser()">
                    <i class="fas fa-user-plus"></i>
                    ${i18n.t('users.add')}
                </button>
            `
        );

        // Focus first input
        setTimeout(() => {
            const firstInput = document.getElementById('newUserUsername');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }

    /**
     * Toggle user role between admin and user
     */
    async toggleUserRole(userId, currentRole) {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        const user = this.data.users.find(u => u.id === userId);

        if (!user) {
            this.showToast('error', i18n.t('common.error'), i18n.t('users.not_found'));
            return;
        }

        if (!confirm(i18n.t('users.confirm_role_change', {username: user.username, role: newRole === 'admin' ? i18n.t('users.roles.admin') : i18n.t('users.roles.user')}))) {
            return;
        }

        try {
            await window.api.updateUserRole(userId, newRole);
            this.showToast('success', i18n.t('common.success'), i18n.t('users.role_changed'));
            await this.loadUsers();
        } catch (error) {
            console.error('Error toggling user role:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('users.change_role_error'));
        }
    }

    /**
     * Toggle user active status
     */
    async toggleUserStatus(userId, currentStatus) {
        const newStatus = !currentStatus;
        const user = this.data.users.find(u => u.id === userId);

        if (!user) {
            this.showToast('error', i18n.t('common.error'), i18n.t('users.not_found'));
            return;
        }

        const action = newStatus ? i18n.t('users.actions.enable') : i18n.t('users.actions.disable');
        if (!confirm(i18n.t('users.confirm_toggle_status', {action: action, username: user.username}))) {
            return;
        }

        try {
            await window.api.updateUserStatus(userId, newStatus);
            this.showToast('success', i18n.t('common.success'), i18n.t('users.status_changed', {status: newStatus ? i18n.t('users.enabled') : i18n.t('users.disabled')}));
            await this.loadUsers();
        } catch (error) {
            console.error('Error toggling user status:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('users.change_status_error'));
        }
    }

    /**
     * Handle add user form submission
     */
    async handleAddUser() {
        const form = document.getElementById('addUserForm');
        if (!form) {
            this.showToast('error', i18n.t('common.error'), i18n.t('validation.form_not_found'));
            return;
        }

        const formData = new FormData(form);
        const username = formData.get('username');
        const password = formData.get('password');
        const role = formData.get('role');
        const email = formData.get('email');
        const fullName = formData.get('full_name');

        if (!username || !password || !role) {
            this.showToast('error', i18n.t('common.error'), i18n.t('users.required_fields'));
            return;
        }

        if (password.length < 6) {
            this.showToast('error', i18n.t('common.error'), i18n.t('users.password_length'));
            return;
        }

        try {
            const userData = {
                username: username.trim(),
                password: password,
                role: role
            };

            if (email && email.trim()) {
                userData.email = email.trim();
            }

            if (fullName && fullName.trim()) {
                userData.full_name = fullName.trim();
            }

            await window.api.createUser(userData);

            this.closeModal();
            this.showToast('success', i18n.t('common.success'), i18n.t('users.created'));
            await this.loadUsers();
        } catch (error) {
            console.error('Error creating user:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('users.create_error'));
        }
    }

    /**
     * Delete user with confirmation
     */
    async deleteUser(userId, username) {
        if (userId === this.currentUser.id) {
            this.showToast('error', i18n.t('common.error'), i18n.t('users.cannot_delete_self'));
            return;
        }

        if (!confirm(i18n.t('users.confirm_delete', {username: username}))) {
            return;
        }

        try {
            await window.api.deleteUser(userId);
            this.showToast('success', i18n.t('common.success'), i18n.t('users.deleted'));
            await this.loadUsers();
        } catch (error) {
            console.error('Error deleting user:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('users.delete_error'));
        }
    }

    /**
     * Load user profile
     */
    async loadProfile() {
        try {
            const profile = await window.api.getProfile();
            this.renderProfile(profile);
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('profile.errors.load'));
        }
    }

    /**
     * Render user profile
     */
    renderProfile(profile) {
        const user = profile.user;

        // Update profile info
        const profileUsername = document.getElementById('profileUsername');
        const profileCreatedAt = document.getElementById('profileCreatedAt');
        const profileUserId = document.getElementById('profileUserId');
        const profileRole = document.getElementById('profileRole');
        const profileEmail = document.getElementById('profileEmail');
        const profileFullName = document.getElementById('profileFullName');
        const newUsername = document.getElementById('newUsername');

        if (profileUsername) profileUsername.textContent = user.username;
        if (profileCreatedAt) profileCreatedAt.textContent = window.api.formatDate(user.created_at);
        if (profileUserId) profileUserId.textContent = user.id;
        if (newUsername) newUsername.value = user.username;

        // Set role badge
        if (profileRole) {
            const role = user.role || 'user';
            profileRole.innerHTML = `
                <span class="role-badge role-${role}">
                    <i class="fas ${role === 'admin' ? 'fa-crown' : 'fa-user'}"></i>
                    ${i18n.t('users.badge.' + role)}
                </span>
            `;
        }

        // Set email and full name
        if (profileEmail) {
            profileEmail.textContent = user.email || i18n.t('profile.not_provided');
        }

        if (profileFullName) {
            profileFullName.textContent = user.full_name || i18n.t('profile.not_provided');
        }
    }

    /**
     * Setup profile form handlers
     */
    setupProfileHandlers() {
        // Use setTimeout to ensure DOM elements are available
        setTimeout(() => {
            // Username change form
            const usernameForm = document.getElementById('changeUsernameForm');
            if (usernameForm) {
                usernameForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await this.handleUsernameChange();
                });
                console.log('Username form handler set up successfully');
            }

            // Password change form
            const passwordForm = document.getElementById('changePasswordForm');
            if (passwordForm) {
                passwordForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await this.handlePasswordChange();
                });
                console.log('Password form handler set up successfully');
            }
        }, 100);
    }

    /**
     * Setup user management buttons
     */
    setupUserManagementButtons() {
        // Use a more robust DOM ready check
        const setupButtons = () => {
            const addUserBtn = document.getElementById('addUserBtn');
            if (addUserBtn && !addUserBtn.hasAttribute('data-setup')) {
                addUserBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showAddUserModal();
                });
                addUserBtn.setAttribute('data-setup', 'true');
                console.log('User management buttons set up successfully');
            } else if (!addUserBtn) {
                console.warn('addUserBtn not found in DOM, retrying...');
                // Retry after a short delay if button not found
                setTimeout(setupButtons, 200);
            }
        };

        // Try immediately and also after a delay
        setupButtons();
        setTimeout(setupButtons, 100);
    }

    /**
     * Handle username change
     */
    async handleUsernameChange() {
        const newUsername = document.getElementById('newUsername').value.trim();

        if (!newUsername) {
            this.showToast('error', i18n.t('common.error'), i18n.t('profile.validation.username_required'));
            return;
        }

        if (newUsername === this.currentUser.username) {
            this.showToast('warning', i18n.t('common.warning'), i18n.t('profile.validation.username_same'));
            return;
        }

        try {
            const result = await window.api.changeUsername(newUsername);

            // Update current user info
            this.currentUser.username = result.user.username;
            document.getElementById('currentUser').textContent = this.currentUser.username;

            this.showToast('success', i18n.t('common.success'), i18n.t('profile.success.username_changed'));
            await this.loadProfile();
        } catch (error) {
            console.error('Error changing username:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('profile.errors.change_username'));
        }
    }

    /**
     * Handle password change
     */
    async handlePasswordChange() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            this.showToast('error', i18n.t('common.error'), i18n.t('profile.validation.all_required'));
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showToast('error', i18n.t('common.error'), i18n.t('profile.validation.password_mismatch'));
            return;
        }

        if (newPassword.length < 6) {
            this.showToast('error', i18n.t('common.error'), i18n.t('profile.validation.password_length'));
            return;
        }

        try {
            await window.api.changePassword(currentPassword, newPassword, confirmPassword);

            // Clear form
            document.getElementById('changePasswordForm').reset();

            this.showToast('success', i18n.t('common.success'), i18n.t('profile.success.password_changed'));
        } catch (error) {
            console.error('Error changing password:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('profile.errors.change_password'));
        }
    }

    // === Settings Management ===

    /**
     * Load settings page
     */
    async loadSettings() {
        try {
            // Setup settings tab navigation
            this.setupSettingsNavigation();

            // Load settings data
            const settings = await window.api.getSettings();
            this.currentSettings = settings;

            // Populate forms with current settings
            this.populateSettingsForms(settings);

            // Setup form handlers
            this.setupSettingsFormHandlers();

        } catch (error) {
            console.error('Error loading settings:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('settings.load_error'));
        }
    }

    /**
     * Setup settings tab navigation
     */
    setupSettingsNavigation() {
        const settingsTabs = document.querySelectorAll('.settings-tab');
        const settingsContents = document.querySelectorAll('.settings-tab-content');

        settingsTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;

                // Remove active class from all tabs and contents
                settingsTabs.forEach(t => t.classList.remove('active'));
                settingsContents.forEach(c => c.classList.remove('active'));

                // Add active class to clicked tab and corresponding content
                e.currentTarget.classList.add('active');
                document.getElementById(`${targetTab}Settings`).classList.add('active');
            });
        });
    }

    /**
     * Setup settings form handlers
     */
    setupSettingsFormHandlers() {
        // SSO form
        const ssoForm = document.getElementById('ssoForm');
        if (ssoForm) {
            ssoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveSettings('sso');
            });
        }

        // Security form
        const securityForm = document.getElementById('securityForm');
        if (securityForm) {
            securityForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveSettings('security');
            });
        }

        // System form
        const systemForm = document.getElementById('systemForm');
        if (systemForm) {
            systemForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveSettings('system');
            });
        }

        // Setup conditional field enablement
        this.setupConditionalFields();
    }

    /**
     * Setup conditional fields (enable/disable based on checkboxes)
     */
    setupConditionalFields() {
        // SSO fields
        const ssoEnabled = document.getElementById('ssoEnabled');
        if (ssoEnabled) {
            ssoEnabled.addEventListener('change', (e) => {
                this.toggleSSOFields(e.target.checked);
            });
            this.toggleSSOFields(ssoEnabled.checked);
        }

        // SMTP fields
        const smtpEnabled = document.getElementById('smtpEnabled');
        if (smtpEnabled) {
            smtpEnabled.addEventListener('change', (e) => {
                this.toggleSMTPFields(e.target.checked);
            });
            this.toggleSMTPFields(smtpEnabled.checked);
        }
    }

    /**
     * Toggle SSO fields based on enabled state
     */
    toggleSSOFields(enabled) {
        const ssoFields = [
            'ssoProvider', 'ssoClientId', 'ssoClientSecret',
            'ssoAuthorityUrl', 'ssoRedirectUri', 'ssoScopes'
        ];

        ssoFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.disabled = !enabled;
            }
        });
    }

    /**
     * Toggle SMTP fields based on enabled state
     */
    toggleSMTPFields(enabled) {
        const smtpFields = [
            'smtpHost', 'smtpPort', 'smtpUsername',
            'smtpPassword', 'smtpSecure'
        ];

        smtpFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.disabled = !enabled;
            }
        });
    }

    /**
     * Populate settings forms with current values
     */
    populateSettingsForms(settings) {
        // Extract values from backend response format {key: {value: x, type: y}}
        const getValue = (key, defaultValue = '') => {
            const setting = settings[key];
            return setting && setting.value !== undefined ? setting.value : defaultValue;
        };

        // SSO settings
        this.setFormValues('ssoForm', {
            sso_enabled: getValue('sso_enabled', false),
            sso_only: getValue('sso_only', false),
            sso_provider: getValue('sso_provider', ''),
            sso_client_id: getValue('sso_client_id', ''),
            sso_client_secret: getValue('sso_client_secret', ''),
            sso_authority_url: getValue('sso_authority_url', ''),
            sso_redirect_uri: getValue('sso_redirect_uri', ''),
            sso_scopes: getValue('sso_scopes', 'openid profile email')
        });

        // Security settings
        this.setFormValues('securityForm', {
            jwt_token_lifetime: getValue('jwt_expiry', '24h'),
            session_timeout: getValue('session_timeout', 1440),
            webhook_signature_validation: getValue('webhook_signature_validation', true),
            require_https: getValue('require_https', false)
        });

        // System settings
        this.setFormValues('systemForm', {
            app_name: getValue('app_name', 'Webhook Admin'),
            webhook_retry_attempts: getValue('webhook_retry_attempts', 3),
            timezone: getValue('timezone', 'Europe/Budapest'),
            log_level: getValue('log_level', 'info'),
            maintenance_mode: getValue('maintenance_mode', false)
        });
    }

    /**
     * Set form values helper
     */
    setFormValues(formId, values) {
        const form = document.getElementById(formId);
        if (!form) return;

        Object.keys(values).forEach(key => {
            const field = form.querySelector(`[name="${key}"]`);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = Boolean(values[key]);
                } else {
                    field.value = values[key];
                }
            }
        });
    }

    /**
     * Save settings for a specific category
     */
    async saveSettings(category) {
        try {
            let formId, settingsData;

            switch (category) {
                case 'sso':
                    formId = 'ssoForm';
                    settingsData = this.getFormData(formId);
                    break;
                case 'security':
                    formId = 'securityForm';
                    settingsData = this.getFormData(formId);
                    break;
                case 'system':
                    formId = 'systemForm';
                    settingsData = this.getFormData(formId);
                    break;
                default:
                    throw new Error('Unknown settings category');
            }

            // Validate settings before saving
            const validationResult = this.validateSettings(category, settingsData);
            if (!validationResult.valid) {
                this.showToast('error', i18n.t('settings.validation_error'), validationResult.message);
                return;
            }

            // Save settings
            await window.api.updateSettings(settingsData);

            // Update current settings cache
            this.currentSettings = { ...this.currentSettings, ...settingsData };

            this.showToast('success', i18n.t('common.success'), i18n.t('settings.saved', {category: this.getCategoryDisplayName(category)}));

        } catch (error) {
            console.error('Error saving settings:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('settings.save_error'));
        }
    }

    /**
     * Get form data as object
     */
    getFormData(formId) {
        const form = document.getElementById(formId);
        if (!form) return {};

        const formData = new FormData(form);
        const data = {};

        for (const [key, value] of formData.entries()) {
            const field = form.querySelector(`[name="${key}"]`);
            if (field && field.type === 'checkbox') {
                data[key] = field.checked;
            } else if (field && field.type === 'number') {
                data[key] = parseInt(value, 10);
            } else {
                data[key] = value;
            }
        }

        return data;
    }

    /**
     * Validate settings before saving
     */
    validateSettings(category, data) {
        switch (category) {
            case 'sso':
                if (data.sso_enabled) {
                    if (!data.sso_provider) {
                        return { valid: false, message: i18n.t('validation.sso_provider_required') };
                    }
                    if (!data.sso_client_id) {
                        return { valid: false, message: i18n.t('validation.sso_client_id_required') };
                    }
                    if (!data.sso_client_secret) {
                        return { valid: false, message: i18n.t('validation.sso_client_secret_required') };
                    }
                    if (!data.sso_authority_url) {
                        return { valid: false, message: i18n.t('validation.sso_authority_url_required') };
                    }
                    if (!data.sso_redirect_uri) {
                        return { valid: false, message: i18n.t('validation.sso_redirect_uri_required') };
                    }
                }
                break;

            case 'smtp':
                if (data.smtp_enabled) {
                    if (!data.smtp_host) {
                        return { valid: false, message: i18n.t('validation.smtp_host_required') };
                    }
                    if (!data.smtp_port || data.smtp_port < 1 || data.smtp_port > 65535) {
                        return { valid: false, message: i18n.t('validation.smtp_port_required') };
                    }
                    if (!data.smtp_username) {
                        return { valid: false, message: i18n.t('validation.smtp_username_required') };
                    }
                    if (!data.smtp_password) {
                        return { valid: false, message: i18n.t('validation.smtp_password_required') };
                    }
                }
                break;

            case 'security':
                if (data.session_timeout < 5 || data.session_timeout > 43200) {
                    return { valid: false, message: i18n.t('settings.security.session_timeout_range') };
                }
                if (!data.jwt_token_lifetime.match(/^\d+[hdm]$/)) {
                    return { valid: false, message: i18n.t('settings.security.jwt_format_error') };
                }
                break;

            case 'system':
                if (!data.app_name || data.app_name.trim().length === 0) {
                    return { valid: false, message: i18n.t('settings.system.app_name_empty') };
                }
                if (data.webhook_retry_attempts < 1 || data.webhook_retry_attempts > 10) {
                    return { valid: false, message: i18n.t('settings.system.retry_range') };
                }
                break;
        }

        return { valid: true };
    }

    /**
     * Get category display name
     */
    getCategoryDisplayName(category) {
        const names = {
            'sso': i18n.t('settings.category_names.sso'),
            'smtp': i18n.t('settings.category_names.smtp'),
            'security': i18n.t('settings.category_names.security'),
            'system': i18n.t('settings.category_names.system')
        };
        return names[category] || category;
    }

    /**
     * Validate SSO configuration
     */
    async validateSSO() {
        try {
            const ssoData = this.getFormData('ssoForm');

            if (!ssoData.sso_enabled) {
                this.showToast('warning', i18n.t('common.warning'), i18n.t('settings.sso.not_enabled'));
                return;
            }

            // Show loading state
            const validateBtn = document.querySelector('button[onclick="app.validateSSO()"]');
            validateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + i18n.t('settings.sso.validating');
            validateBtn.disabled = true;

            await window.api.validateSSO(ssoData);

            this.showToast('success', i18n.t('settings.sso.validation_success'), i18n.t('settings.sso.validation_success_message'));

        } catch (error) {
            console.error('SSO validation error:', error);
            this.showToast('error', i18n.t('settings.sso.validation_failed'), error.message || i18n.t('settings.sso.validation_failed_message'));
        } finally {
            // Restore button state
            const validateBtn = document.querySelector('button[onclick="app.validateSSO()"]');
            if (validateBtn) {
                validateBtn.innerHTML = '<i class="fas fa-check"></i> ' + i18n.t('settings.sso.validate');
                validateBtn.disabled = false;
            }
        }
    }

    /**
     * Reset SSO settings to defaults
     */
    async resetSSOSettings() {
        if (!confirm(i18n.t('settings.sso.reset_confirm'))) {
            return;
        }

        try {
            await window.api.resetSettings('sso');
            await this.loadSettings();
            this.showToast('success', i18n.t('common.success'), i18n.t('settings.sso.reset_success'));
        } catch (error) {
            console.error('Error resetting SSO settings:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('settings.sso.reset_error'));
        }
    }

    /**
     * Reset Security settings to defaults
     */
    async resetSecuritySettings() {
        if (!confirm(i18n.t('settings.security.reset_confirm'))) {
            return;
        }

        try {
            await window.api.resetSettings('security');
            await this.loadSettings();
            this.showToast('success', i18n.t('common.success'), i18n.t('settings.security.reset_success'));
        } catch (error) {
            console.error('Error resetting security settings:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('settings.security.reset_error'));
        }
    }

    /**
     * Reset System settings to defaults
     */
    async resetSystemSettings() {
        if (!confirm(i18n.t('settings.system.reset_confirm'))) {
            return;
        }

        try {
            await window.api.resetSettings('system');
            await this.loadSettings();
            this.showToast('success', i18n.t('common.success'), i18n.t('settings.system.reset_success'));
        } catch (error) {
            console.error('Error resetting system settings:', error);
            this.showToast('error', i18n.t('common.error'), i18n.t('settings.system.reset_error'));
        }
    }

    // === Documentation ===

    /**
     * Load documentation page - Content list view
     */
    async loadDocs() {
        const docsContent = document.getElementById('docsContent');
        if (!docsContent) return;

        // Reset to list view
        docsContent.innerHTML = '<div class="loading">' + i18n.t('docs.loading') + '</div>';

        const docs = [
            {
                id: 'synology',
                title: i18n.t('docs.synology.title'),
                icon: 'fa-database',
                description: i18n.t('docs.synology.description'),
                file: '/docs/synology.md'
            },
            {
                id: 'proxmox',
                title: i18n.t('docs.proxmox.title'),
                icon: 'fa-server',
                description: i18n.t('docs.proxmox.description'),
                file: '/docs/proxmox.md'
            },
            {
                id: 'proxmox_backup',
                title: i18n.t('docs.proxmox_backup.title'),
                icon: 'fa-hdd',
                description: i18n.t('docs.proxmox_backup.description'),
                type: 'config', // Special type for configuration pages
                action: () => this.showProxmoxBackupConfig()
            },
            {
                id: 'watchtower',
                title: i18n.t('docs.watchtower.title'),
                icon: 'fa-docker',
                description: i18n.t('docs.watchtower.description'),
                type: 'config', // Special type for configuration pages
                action: () => this.showWatchtowerConfig()
            },
            {
                id: 'general',
                title: i18n.t('docs.general.title'),
                icon: 'fa-cog',
                description: i18n.t('docs.general.description'),
                file: '/docs/general.md'
            }
        ];

        // Render documentation list (cards)
        docsContent.innerHTML = '';
        docsContent.className = 'docs-grid';

        for (const doc of docs) {
            this.renderDocListCard(docsContent, doc);
        }
    }

    /**
     * Render documentation list card (clickable preview)
     */
    renderDocListCard(container, doc) {
        const card = document.createElement('div');
        card.className = 'doc-list-card';
        card.style.cursor = 'pointer';

        // Different button text based on type
        const buttonText = doc.type === 'config' ?
            '<i class="fas fa-cogs"></i> ' + i18n.t('docs.open_settings') :
            '<i class="fas fa-book-open"></i> ' + i18n.t('docs.open_guide');

        card.innerHTML = `
            <div class="doc-header">
                <i class="fas ${doc.icon} fa-3x"></i>
            </div>
            <h3>${doc.title}</h3>
            <p class="doc-description">${doc.description}</p>
            <button class="btn btn-primary" style="margin-top: auto;">
                ${buttonText}
            </button>
        `;

        // Click handler - load documentation or config page
        card.addEventListener('click', () => {
            if (doc.type === 'config' && doc.action) {
                doc.action();
            } else {
                this.loadDocDetail(doc);
            }
        });

        container.appendChild(card);
    }

    /**
     * Load detailed documentation view
     */
    async loadDocDetail(doc) {
        const docsContent = document.getElementById('docsContent');
        if (!docsContent) return;

        // Show loading
        docsContent.innerHTML = '<div class="loading">' + i18n.t('docs.loading') + '</div>';
        docsContent.className = 'doc-detail-view';

        // Language-aware file path: /docs/synology.md (en) or /docs/synology.hu.md (hu)
        const lang = i18n.getLanguage();
        const filePath = lang !== 'en' ? doc.file.replace('.md', `.${lang}.md`) : doc.file;

        try {
            let response = await fetch(filePath);

            // Fallback to English if localized file not found
            if (!response.ok && lang !== 'en') {
                response = await fetch(doc.file);
            }

            let content = '';
            if (response.ok) {
                content = await response.text();
            } else {
                content = this.getDefaultDocContent(doc.id);
            }

            this.renderDocDetail(docsContent, doc, content);
        } catch (error) {
            console.error(`Error loading ${filePath}:`, error);
            const content = this.getDefaultDocContent(doc.id);
            this.renderDocDetail(docsContent, doc, content);
        }
    }

    /**
     * Render detailed documentation view
     */
    renderDocDetail(container, doc, content) {
        const htmlContent = this.markdownToHtml(content);

        container.innerHTML = `
            <div class="doc-detail-container">
                <div class="doc-detail-header">
                    <button class="btn btn-secondary" onclick="app.loadDocs()">
                        <i class="fas fa-arrow-left"></i> ${i18n.t('docs.back')}
                    </button>
                    <div class="doc-detail-title">
                        <i class="fas ${doc.icon}"></i>
                        <h2>${doc.title}</h2>
                    </div>
                </div>
                <div class="doc-detail-content">
                    ${htmlContent}
                </div>
            </div>
        `;
    }

    /**
     * Simple markdown to HTML converter
     */
    markdownToHtml(markdown) {
        if (!markdown) return '';

        let html = markdown;

        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // Headers
        html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
        html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Lists
        html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
        html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

        // Wrap lists in ul
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

        // Line breaks
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        // Wrap in paragraphs
        html = `<p>${html}</p>`;
        html = html.replace(/<p><\/p>/g, '');

        return html;
    }

    /**
     * Get default documentation content
     */
    getDefaultDocContent(docId) {
        const contents = {
            'synology': `# Synology NAS Webhook Integration

## Introduction
The Synology NAS webhook integration allows you to receive notifications about NAS device events.

## Steps

### 1. Create a Source
* Navigate to the **Sources** page
* Click the **New Source** button
* Enter the name: \`Synology NAS\`
* Select the type: \`synology\`
* Save and copy the generated **Secret Key**

### 2. Synology Configuration
1. Open the Synology DSM interface
2. Go to **Control Panel → Notification → Webhook**
3. Add the new webhook URL:
   \`\`\`
   https://your-hookcats-server.com/webhook/{secret_key}
   \`\`\`

### 3. Event Selection
Select which events you want to be notified about:
* System updates
* Storage status changes
* Security alerts
* Backup status

### 4. Test
Click the **Test** button and verify on the **Events** page.`,

            'proxmox': `# Proxmox VE Webhook Integration

## Introduction
The Proxmox VE webhook integration allows you to receive virtualization events.

## Steps

### 1. Create a Source
* Navigate to the **Sources** page
* Click the **New Source** button
* Enter the name: \`Proxmox VE\`
* Select the type: \`proxmox\`
* Save and copy the generated **Secret Key**

### 2. Proxmox Webhook Configuration
1. SSH into the Proxmox server
2. Edit the webhook configuration:
   \`\`\`bash
   nano /etc/pve/notifications/webhook.cfg
   \`\`\`

3. Add the webhook URL:
   \`\`\`
   webhook: hookcats
       url https://your-hookcats-server.com/webhook/{secret_key}
       method POST
   \`\`\`

### 3. Events
Supported events:
* VM start/stop
* Snapshot creation
* Backup events
* Storage changes

### 4. Test
Start or stop a VM and verify the events.`,

            'watchtower': `# Docker Updater (Watchtower) Webhook Integration

## Introduction
The Docker Updater webhook integration allows you to receive notifications about automatic Docker container updates from Watchtower.

## Steps

### 1. Create a Source
* Navigate to the **Sources** page
* Click the **New Source** button
* Enter the name: \`Docker Updater\`
* Select the type: \`docker_updater\`
* Save and copy the generated **Secret Key**

### 2. Watchtower Configuration
1. Add the following environment variables to the Watchtower container:
   \`\`\`yaml
   environment:
     - WATCHTOWER_NOTIFICATION_URL=https://your-hookcats-server.com/webhook/{secret_key}
     - WATCHTOWER_NOTIFICATIONS=shoutrrr
     - WATCHTOWER_NOTIFICATION_TEMPLATE={{range .}}{{.Message}}{{println}}{{end}}
   \`\`\`

2. Docker Compose example:
   \`\`\`yaml
   watchtower:
     image: containrrr/watchtower
     volumes:
       - /var/run/docker.sock:/var/run/docker.sock
     environment:
       - WATCHTOWER_NOTIFICATION_URL=generic+https://your-hookcats-server.com/webhook/{secret_key}
       - WATCHTOWER_NOTIFICATIONS=shoutrrr
       - WATCHTOWER_SCHEDULE=0 0 4 * * *
   \`\`\`

### 3. Message Format
The webhook automatically simplifies Watchtower messages:

**Before:**
\`\`\`
my-docker-server: Found new linuxserver/bazarr:latest image (ac3448e21b7f)
my-docker-server: Stopping /Bazarr (2759141e0492) with SIGTERM
my-docker-server: Creating /Bazarr
my-docker-server: Removing image 5c602d22aca6
\`\`\`

**After:**
\`\`\`
🐳 Docker Container Update

🖥️ Server: my-docker-server

✅ Bazarr - Success
✅ Prowlarr - Success

📅 2024-10-16T08:30:00.000Z
\`\`\`

### 4. Test
Run Watchtower manually for testing:
\`\`\`bash
docker run --rm containrrr/watchtower --run-once --cleanup
\`\`\`

### 5. Supported Events
* New image found
* Container update successful
* Container update failed
* Image cleanup

## Tips
* Use a nightly schedule: \`WATCHTOWER_SCHEDULE=0 0 4 * * *\`
* Enable cleanup: \`WATCHTOWER_CLEANUP=true\`
* Set monitor-only mode for testing: \`WATCHTOWER_MONITOR_ONLY=true\``,

            'general': `# General Webhook Configuration

## Webhook URL Format
\`\`\`
https://your-server.com/webhook/{secret_key}
\`\`\`

## HTTP Headers
\`\`\`
Content-Type: application/json
X-Webhook-Signature: HMAC-SHA256 signature (optional)
\`\`\`

## Payload Format
\`\`\`json
{
  "event": "event_type",
  "source": "source_name",
  "data": {
    // Custom event data
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
\`\`\`

## Routing Configuration

### 1. Create a Target
* Navigate to the **Targets** page
* Enter the Mattermost/Rocket.Chat webhook URL

### 2. Create a Route
* Navigate to the **Routes** page
* Select the source and target
* Optionally add a message template

## Message Template Example
\`\`\`
**{{event}}** event occurred on **{{source}}** source.
Details: {{data}}
\`\`\`

## Troubleshooting
* Check the **Events** page
* Review the **Deliveries** status
* Make sure the secret key is correct`
        };

        return contents[docId] || `# ${docId}\n\nDocumentation not yet available.`;
    }

    /**
     * Show Proxmox Backup configuration page within docs structure
     */
    showProxmoxBackupConfig() {
        const docsContent = document.getElementById('docsContent');
        if (!docsContent) return;

        // Show loading
        docsContent.innerHTML = '<div class="loading">' + i18n.t('docs.proxmox_backup.loading_config') + '</div>';
        docsContent.className = 'doc-detail-view';

        // Render Proxmox Backup config page
        setTimeout(() => {
            this.renderProxmoxBackupConfig(docsContent);
            // Setup form handlers after rendering
            this.setupProxmoxFormHandlers();
            // Load existing configuration
            this.loadProxmoxConfig();
        }, 100);
    }

    /**
     * Render Proxmox Backup configuration page
     */
    renderProxmoxBackupConfig(container) {
        container.innerHTML = `
            <div class="doc-detail-container">
                <div class="doc-detail-header">
                    <button class="btn btn-secondary" onclick="app.loadDocs()">
                        <i class="fas fa-arrow-left"></i> ${i18n.t('docs.back')}
                    </button>
                    <div class="doc-detail-title">
                        <i class="fas fa-hdd"></i>
                        <h2>${i18n.t('docs.proxmox_backup.title')}</h2>
                    </div>
                </div>
                <div class="doc-detail-content">
                    <div class="proxmox-container">
                        <div class="proxmox-section">
                            <h3>${i18n.t('docs.proxmox_backup.config_subtitle')}</h3>
                            <p>${i18n.t('docs.proxmox_backup.config_desc')}</p>

                            <div class="info-box">
                                <div class="info-icon">
                                    <i class="fas fa-info-circle"></i>
                                </div>
                                <div class="info-content">
                                    <h4>${i18n.t('docs.proxmox_backup.how_it_works_title')}</h4>
                                    <p>${i18n.t('docs.proxmox_backup.how_it_works_desc')}</p>
                                </div>
                            </div>

                            <div class="form-container">
                                <form id="proxmoxConfigForm" class="settings-form">
                                    <div class="form-group">
                                        <label for="proxmoxEnabled">
                                            <input type="checkbox" id="proxmoxEnabled" name="proxmox_enabled">
                                            ${i18n.t('docs.proxmox_backup.enable_processing')}
                                        </label>
                                    </div>

                                    <div class="form-group">
                                        <label for="proxmoxWebhookUrl">${i18n.t('docs.proxmox_backup.webhook_url_label')}</label>
                                        <input type="text" id="proxmoxWebhookUrl" class="form-control" readonly
                                               placeholder="${i18n.t('docs.proxmox_backup.webhook_url_placeholder')}">
                                        <small class="form-text text-muted">
                                            ${i18n.t('docs.proxmox_backup.webhook_url_help')}
                                        </small>
                                    </div>

                                    <div class="form-group">
                                        <label for="proxmoxNotifications">${i18n.t('docs.proxmox_backup.notifications_label')}</label>
                                        <div class="checkbox-group">
                                            <label>
                                                <input type="checkbox" name="notify_success" checked>
                                                ${i18n.t('docs.proxmox_backup.notify_success')}
                                            </label>
                                            <label>
                                                <input type="checkbox" name="notify_error" checked>
                                                ${i18n.t('docs.proxmox_backup.notify_error')}
                                            </label>
                                            <label>
                                                <input type="checkbox" name="notify_warning">
                                                ${i18n.t('docs.proxmox_backup.notify_warning')}
                                            </label>
                                        </div>
                                    </div>

                                    <div class="form-actions">
                                        <button type="button" class="btn btn-secondary" onclick="generateProxmoxWebhook()">
                                            <i class="fas fa-key"></i>
                                            ${i18n.t('docs.proxmox_backup.generate_url')}
                                        </button>
                                        <button type="submit" class="btn btn-primary">
                                            <i class="fas fa-save"></i>
                                            ${i18n.t('docs.save_settings')}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div class="setup-guide">
                                <h4>${i18n.t('docs.proxmox_backup.guide_title')}</h4>
                                <ol>
                                    <li>${i18n.t('docs.proxmox_backup.guide_step1')}</li>
                                    <li>${i18n.t('docs.proxmox_backup.guide_step2')}</li>
                                    <li>${i18n.t('docs.proxmox_backup.guide_step3')}</li>
                                    <li>${i18n.t('docs.proxmox_backup.guide_step4')}</li>
                                    <li>${i18n.t('docs.proxmox_backup.guide_step5')}</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Setup Proxmox form handlers
     */
    setupProxmoxFormHandlers() {
        const form = document.getElementById('proxmoxConfigForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveProxmoxConfig();
            });
        }
    }

    /**
     * Load existing Proxmox configuration
     */
    async loadProxmoxConfig() {
        try {
            // Check if there's an existing Proxmox source
            const scope = window.scopeManager ? window.scopeManager.getCurrentScope() : 'personal';
            const teamId = window.scopeManager ? window.scopeManager.getActiveTeamId() : null;
            
            const response = await window.api.getScopeBasedSources(scope, teamId);
            if (response.success) {
                const proxmoxSources = response.data.filter(source => 
                    source.type === 'proxmox_backup' || source.type === 'proxmox'
                );
                
                if (proxmoxSources.length > 0) {
                    const source = proxmoxSources[0];
                    
                    // Update form with existing data
                    const enabledCheckbox = document.getElementById('proxmoxEnabled');
                    const webhookUrlInput = document.getElementById('proxmoxWebhookUrl');
                    
                    if (enabledCheckbox) {
                        enabledCheckbox.checked = true;
                    }
                    
                    if (webhookUrlInput && source.secret_key) {
                        const webhookUrl = `${window.location.protocol}//${window.location.host}/webhook/${source.secret_key}`;
                        webhookUrlInput.value = webhookUrl;
                    }
                }
            }
        } catch (error) {
            console.error('Error loading Proxmox config:', error);
        }
    }

    /**
     * Save Proxmox configuration
     */
    async saveProxmoxConfig() {
        try {
            const form = document.getElementById('proxmoxConfigForm');
            const formData = new FormData(form);
            
            const enabled = formData.get('proxmox_enabled') === 'on';
            
            if (enabled) {
                // Create or update Proxmox source
                const sourceData = {
                    name: 'Proxmox Backup Server',
                    type: 'proxmox_backup',
                    secret_key: this.generateRandomString(32) // Generate new secret key
                };
                
                const scope = window.scopeManager ? window.scopeManager.getCurrentScope() : 'personal';
                const teamId = window.scopeManager ? window.scopeManager.getActiveTeamId() : null;
                
                const response = await window.api.createScopeBasedResource('sources', scope, teamId, sourceData);
                
                if (response && response.success) {
                    // Update webhook URL field
                    const webhookUrlInput = document.getElementById('proxmoxWebhookUrl');
                    if (webhookUrlInput) {
                        const webhookUrl = `${window.location.protocol}//${window.location.host}/webhook/${response.data.secret_key}`;
                        webhookUrlInput.value = webhookUrl;
                    }
                    
                    this.showToast('success', i18n.t('common.success'), i18n.t('docs.proxmox_backup.saved'));
                } else {
                    throw new Error(response?.error || i18n.t('docs.proxmox_backup.source_create_error'));
                }
            } else {
                this.showToast('info', i18n.t('common.info'), i18n.t('docs.proxmox_backup.disabled_msg'));
            }

        } catch (error) {
            console.error('Error saving Proxmox config:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('docs.proxmox_backup.save_error'));
        }
    }

    /**
     * Show Watchtower configuration page within docs structure
     */
    showWatchtowerConfig() {
        const docsContent = document.getElementById('docsContent');
        if (!docsContent) return;

        // Show loading
        docsContent.innerHTML = '<div class="loading">' + i18n.t('docs.watchtower.loading_config') + '</div>';
        docsContent.className = 'doc-detail-view';

        // Render Watchtower config page
        setTimeout(() => {
            this.renderWatchtowerConfig(docsContent);
            // Setup form handlers after rendering
            this.setupWatchtowerFormHandlers();
            // Load existing configuration
            this.loadWatchtowerConfig();
        }, 100);
    }

    /**
     * Render Watchtower configuration page
     */
    renderWatchtowerConfig(container) {
        container.innerHTML = `
            <div class="doc-detail-container">
                <div class="doc-detail-header">
                    <button class="btn btn-secondary" onclick="app.loadDocs()">
                        <i class="fas fa-arrow-left"></i> ${i18n.t('docs.back')}
                    </button>
                    <div class="doc-detail-title">
                        <i class="fas fa-docker"></i>
                        <h2>${i18n.t('docs.watchtower.title')}</h2>
                    </div>
                </div>
                <div class="doc-detail-content">
                    <div class="proxmox-container">
                        <div class="proxmox-section">
                            <h3>${i18n.t('docs.watchtower.config_subtitle')}</h3>
                            <p>${i18n.t('docs.watchtower.config_desc')}</p>

                            <div class="info-box">
                                <div class="info-icon">
                                    <i class="fas fa-info-circle"></i>
                                </div>
                                <div class="info-content">
                                    <h4>${i18n.t('docs.watchtower.how_it_works_title')}</h4>
                                    <p>${i18n.t('docs.watchtower.how_it_works_desc')}</p>
                                </div>
                            </div>

                            <div class="form-container">
                                <form id="watchtowerConfigForm" class="settings-form">
                                    <div class="form-group">
                                        <label for="watchtowerEnabled">
                                            <input type="checkbox" id="watchtowerEnabled" name="watchtower_enabled">
                                            ${i18n.t('docs.watchtower.enable_processing')}
                                        </label>
                                    </div>

                                    <div class="form-group">
                                        <label for="watchtowerHostname">${i18n.t('docs.watchtower.hostname_label')}</label>
                                        <input type="text" id="watchtowerHostname" class="form-control"
                                               placeholder="${i18n.t('docs.watchtower.hostname_placeholder')}"
                                               value="docker-server">
                                        <small class="form-text text-muted">
                                            ${i18n.t('docs.watchtower.hostname_help')}
                                        </small>
                                    </div>

                                    <div class="form-group">
                                        <label for="watchtowerWebhookUrl">${i18n.t('docs.watchtower.webhook_url_label')}</label>
                                        <div style="display: flex; gap: 10px;">
                                            <input type="text" id="watchtowerWebhookUrl" class="form-control" readonly
                                                   placeholder="${i18n.t('docs.watchtower.webhook_url_placeholder')}">
                                            <button type="button" class="btn btn-secondary" onclick="app.copyWatchtowerUrl()" title="${i18n.t('docs.watchtower.copy_url_title')}">
                                                <i class="fas fa-copy"></i>
                                            </button>
                                        </div>
                                        <small class="form-text text-muted">
                                            ${i18n.t('docs.watchtower.webhook_url_help')}
                                        </small>
                                    </div>

                                    <div class="form-group">
                                        <label for="watchtowerTemplate">${i18n.t('docs.watchtower.template_label')}</label>
                                        <textarea id="watchtowerTemplate" class="form-control" rows="4" readonly
                                                  placeholder="${i18n.t('docs.watchtower.template_placeholder')}"></textarea>
                                        <small class="form-text text-muted">
                                            ${i18n.t('docs.watchtower.template_help')}
                                        </small>
                                    </div>

                                    <div class="form-actions">
                                        <button type="button" class="btn btn-secondary" onclick="app.generateWatchtowerWebhook()">
                                            <i class="fas fa-key"></i>
                                            ${i18n.t('docs.watchtower.generate_url')}
                                        </button>
                                        <button type="submit" class="btn btn-primary">
                                            <i class="fas fa-save"></i>
                                            ${i18n.t('docs.save_settings')}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div class="setup-guide">
                                <h4>${i18n.t('docs.watchtower.guide_title')}</h4>
                                <div class="steps">
                                    <div class="step">
                                        <div class="step-number">1</div>
                                        <div class="step-content">
                                            <h5>${i18n.t('docs.watchtower.step1_title')}</h5>
                                            <p>${i18n.t('docs.watchtower.step1_desc')}</p>
                                        </div>
                                    </div>
                                    <div class="step">
                                        <div class="step-number">2</div>
                                        <div class="step-content">
                                            <h5>${i18n.t('docs.watchtower.step2_title')}</h5>
                                            <p>${i18n.t('docs.watchtower.step2_desc')}</p>
                                        </div>
                                    </div>
                                    <div class="step">
                                        <div class="step-number">3</div>
                                        <div class="step-content">
                                            <h5>${i18n.t('docs.watchtower.step3_title')}</h5>
                                            <p>${i18n.t('docs.watchtower.step3_desc')}</p>
                                            <pre><code>services:
  watchtower:
    image: containrrr/watchtower
    environment:
      - WATCHTOWER_NOTIFICATIONS=shoutrrr
      - WATCHTOWER_NOTIFICATION_URL=...
      - WATCHTOWER_NOTIFICATION_TEMPLATE=...
      - WATCHTOWER_SCHEDULE=0 0 11 * * *</code></pre>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="info-box warning">
                                <div class="info-icon">
                                    <i class="fas fa-exclamation-triangle"></i>
                                </div>
                                <div class="info-content">
                                    <h4>${i18n.t('docs.watchtower.notes_title')}</h4>
                                    <ul>
                                        <li>${i18n.t('docs.watchtower.note_secret')}</li>
                                        <li>${i18n.t('docs.watchtower.note_hostname')}</li>
                                        <li>${i18n.t('docs.watchtower.note_multiple')}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Setup Watchtower form handlers
     */
    setupWatchtowerFormHandlers() {
        const form = document.getElementById('watchtowerConfigForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveWatchtowerConfig();
        });

        const hostnameInput = document.getElementById('watchtowerHostname');
        if (hostnameInput) {
            hostnameInput.addEventListener('input', () => {
                this.updateWatchtowerTemplate();
            });
        }
    }

    /**
     * Load existing Watchtower configuration
     */
    async loadWatchtowerConfig() {
        try {
            const response = await window.api.get('/sources');
            
            if (response.success) {
                const watchtowerSources = response.data.filter(source => 
                    source.type === 'docker_updater'
                );

                if (watchtowerSources.length > 0) {
                    const source = watchtowerSources[0];
                    
                    const enabledCheckbox = document.getElementById('watchtowerEnabled');
                    if (enabledCheckbox) {
                        enabledCheckbox.checked = source.is_active;
                    }

                    const hostnameInput = document.getElementById('watchtowerHostname');
                    if (hostnameInput && source.name) {
                        hostnameInput.value = source.name;
                    }

                    const webhookUrlInput = document.getElementById('watchtowerWebhookUrl');
                    if (webhookUrlInput) {
                        const webhookUrl = `generic://${window.location.host}/webhook/${source.secret_key}`;
                        webhookUrlInput.value = webhookUrl;
                    }

                    this.updateWatchtowerTemplate();
                }
            }
        } catch (error) {
            console.error('Error loading Watchtower config:', error);
        }
    }

    /**
     * Update Watchtower template based on hostname
     */
    updateWatchtowerTemplate() {
        const hostnameInput = document.getElementById('watchtowerHostname');
        const templateTextarea = document.getElementById('watchtowerTemplate');
        
        if (hostnameInput && templateTextarea) {
            const hostname = hostnameInput.value || 'docker-server';
            const template = `{{range .Entries}}${hostname}: {{.Message}}{{println}}{{end}}`;
            templateTextarea.value = template;
        }
    }

    /**
     * Generate new Watchtower webhook
     */
    async generateWatchtowerWebhook() {
        const hostnameInput = document.getElementById('watchtowerHostname');
        const hostname = hostnameInput ? hostnameInput.value : 'docker-server';

        if (!hostname.trim()) {
            this.showToast('warning', i18n.t('common.warning'), i18n.t('docs.watchtower.hostname_required'));
            return;
        }

        try {
            const sourceData = {
                name: hostname,
                type: 'docker_updater',
                secret_key: this.generateRandomString(32)
            };

            const scope = window.scopeManager ? window.scopeManager.getCurrentScope() : 'personal';
            const teamId = window.scopeManager ? window.scopeManager.getActiveTeamId() : null;

            if (scope === 'team' && teamId) {
                sourceData.visibility = 'team';
                sourceData.team_id = teamId;
            }

            const response = await window.api.post('/sources', sourceData);

            if (response.success) {
                const webhookUrl = `generic://${window.location.host}/webhook/${response.data.secret_key}`;
                const webhookUrlInput = document.getElementById('watchtowerWebhookUrl');
                if (webhookUrlInput) {
                    webhookUrlInput.value = webhookUrl;
                }

                this.updateWatchtowerTemplate();
                this.showToast('success', i18n.t('common.success'), i18n.t('docs.watchtower.url_generated'));
            }
        } catch (error) {
            console.error('Error generating webhook:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('docs.watchtower.save_error'));
        }
    }

    /**
     * Copy Watchtower URL to clipboard
     */
    async copyWatchtowerUrl() {
        const webhookUrlInput = document.getElementById('watchtowerWebhookUrl');
        if (webhookUrlInput && webhookUrlInput.value) {
            try {
                await navigator.clipboard.writeText(webhookUrlInput.value);
                this.showToast('success', i18n.t('common.success'), i18n.t('docs.watchtower.url_copied'));
            } catch (error) {
                console.error('Error copying URL:', error);
                this.showToast('error', i18n.t('common.error'), i18n.t('docs.watchtower.copy_error'));
            }
        }
    }

    /**
     * Save Watchtower configuration
     */
    async saveWatchtowerConfig() {
        const enabledCheckbox = document.getElementById('watchtowerEnabled');
        const hostnameInput = document.getElementById('watchtowerHostname');
        
        const isEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        const hostname = hostnameInput ? hostnameInput.value : '';

        if (!hostname.trim()) {
            this.showToast('warning', i18n.t('common.warning'), i18n.t('docs.watchtower.hostname_required'));
            return;
        }

        try {
            if (isEnabled) {
                const sourcesResponse = await window.api.get('/sources');
                let existingSource = null;

                if (sourcesResponse.success) {
                    const watchtowerSources = sourcesResponse.data.filter(s => s.type === 'docker_updater');
                    existingSource = watchtowerSources[0];
                }

                if (existingSource) {
                    const updateData = { name: hostname, is_active: true };
                    const response = await window.api.put(`/sources/${existingSource.id}`, updateData);

                    if (response.success) {
                        const webhookUrlInput = document.getElementById('watchtowerWebhookUrl');
                        if (webhookUrlInput) {
                            const webhookUrl = `generic://${window.location.host}/webhook/${response.data.secret_key}`;
                            webhookUrlInput.value = webhookUrl;
                        }

                        this.updateWatchtowerTemplate();
                        this.showToast('success', i18n.t('common.success'), i18n.t('docs.watchtower.settings_updated'));
                    } else {
                        throw new Error(response?.error || i18n.t('docs.watchtower.source_update_error'));
                    }
                } else {
                    const sourceData = {
                        name: hostname,
                        type: 'docker_updater',
                        secret_key: this.generateRandomString(32)
                    };

                    const scope = window.scopeManager ? window.scopeManager.getCurrentScope() : 'personal';
                    const teamId = window.scopeManager ? window.scopeManager.getActiveTeamId() : null;

                    if (scope === 'team' && teamId) {
                        sourceData.visibility = 'team';
                        sourceData.team_id = teamId;
                    }

                    const response = await window.api.post('/sources', sourceData);

                    if (response.success) {
                        const webhookUrlInput = document.getElementById('watchtowerWebhookUrl');
                        if (webhookUrlInput) {
                            const webhookUrl = `generic://${window.location.host}/webhook/${response.data.secret_key}`;
                            webhookUrlInput.value = webhookUrl;
                        }

                        this.updateWatchtowerTemplate();
                        this.showToast('success', i18n.t('common.success'), i18n.t('docs.watchtower.settings_saved'));
                    } else {
                        throw new Error(response?.error || i18n.t('docs.watchtower.source_create_error'));
                    }
                }
            } else {
                this.showToast('info', i18n.t('common.info'), i18n.t('docs.watchtower.disabled_msg'));
            }

        } catch (error) {
            console.error('Error saving Watchtower config:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('docs.watchtower.save_error'));
        }
    }

    /**
     * Generate new Proxmox webhook URL
     */
    async generateProxmoxWebhookUrl() {
        try {
            const sourceData = {
                name: 'Proxmox Backup Server',
                type: 'proxmox_backup',
                secret_key: this.generateRandomString(32)
            };
            
            const scope = window.scopeManager ? window.scopeManager.getCurrentScope() : 'personal';
            const teamId = window.scopeManager ? window.scopeManager.getActiveTeamId() : null;
            
            const response = await window.api.createScopeBasedResource('sources', scope, teamId, sourceData);
            
            if (response && response.success) {
                const webhookUrl = `${window.location.protocol}//${window.location.host}/webhook/${response.data.secret_key}`;
                
                // Update URL field
                const webhookUrlInput = document.getElementById('proxmoxWebhookUrl');
                if (webhookUrlInput) {
                    webhookUrlInput.value = webhookUrl;
                }
                
                // Enable checkbox
                const enabledCheckbox = document.getElementById('proxmoxEnabled');
                if (enabledCheckbox) {
                    enabledCheckbox.checked = true;
                }
                
                this.showToast('success', i18n.t('common.success'), i18n.t('docs.proxmox_backup.url_generated'));
            } else {
                throw new Error(response?.error || i18n.t('docs.proxmox_backup.url_generate_error'));
            }

        } catch (error) {
            console.error('Error generating webhook URL:', error);
            this.showToast('error', i18n.t('common.error'), error.message || i18n.t('docs.proxmox_backup.url_generate_error'));
        }
    }
}

/**
 * Global function to generate new Proxmox webhook URL
 */
window.generateProxmoxWebhook = function() {
    if (window.app) {
        window.app.generateProxmoxWebhookUrl();
    }
};

// Initialize app when DOM is ready (wait for i18n to load first)
document.addEventListener('DOMContentLoaded', async () => {
    // Ensure i18n translations are loaded before app renders
    if (window.i18n && !window.i18n.loaded) {
        await window.i18n.init();
    }
    window.app = new WebhookApp();
    await window.app.init();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.clearRefreshIntervals();
    }
});