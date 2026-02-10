/**
 * Scope Management System for Personal/Team resource separation
 * Handles context switching between personal and team scopes
 */

/**
 * ScopeManager - Manages Personal and Team scope switching
 */
class ScopeManager {
    constructor() {
        this.currentScope = 'personal'; // Default to personal scope
        this.activeTeamId = null;
        this.userTeams = [];
        this.eventListeners = [];

        this.initializeFromStorage();
    }

    /**
     * Initialize scope from localStorage
     */
    initializeFromStorage() {
        const storedScope = localStorage.getItem('currentScope');
        const storedTeamId = localStorage.getItem('activeTeamId');

        if (storedScope) {
            this.currentScope = storedScope;
        }

        if (storedTeamId && storedScope === 'team') {
            this.activeTeamId = parseInt(storedTeamId);
        }
    }

    /**
     * Get current scope (personal/team)
     * @returns {string} - Current scope
     */
    getCurrentScope() {
        console.log('🔍 getCurrentScope:', this.currentScope);
        return this.currentScope;
    }

    /**
     * Get active team ID
     * @returns {number|null} - Active team ID or null for personal scope
     */
    getActiveTeamId() {
        console.log('🔍 getActiveTeamId:', this.activeTeamId);
        return this.activeTeamId;
    }

    /**
     * Check if current scope is personal
     * @returns {boolean}
     */
    isPersonalScope() {
        return this.currentScope === 'personal';
    }

    /**
     * Check if current scope is team
     * @returns {boolean}
     */
    isTeamScope() {
        return this.currentScope === 'team';
    }

    /**
     * Switch to personal scope
     */
    switchToPersonal() {
        this.currentScope = 'personal';
        this.activeTeamId = null;
        this.saveToStorage();
        this.notifyListeners('scope-changed', { scope: 'personal', teamId: null });
    }

    /**
     * Switch to team scope
     * @param {number} teamId - Team ID to switch to
     */
    switchToTeam(teamId) {
        if (!teamId || !this.isUserTeamMember(teamId)) {
            throw new Error('Invalid team ID or user is not a member');
        }

        this.currentScope = 'team';
        this.activeTeamId = teamId;
        this.saveToStorage();
        this.notifyListeners('scope-changed', { scope: 'team', teamId: teamId });
    }

    /**
     * Set user teams
     * @param {Array} teams - Array of team objects
     */
    setUserTeams(teams) {
        console.log('👥 setUserTeams:', teams);
        this.userTeams = teams || [];

        // Check if current active team is still valid
        if (this.activeTeamId && !this.isUserTeamMember(this.activeTeamId)) {
            console.log(i18n.t('scope.scope_init_error'));
            this.switchToPersonal();
        }
    }

    /**
     * Get user teams
     * @returns {Array} - Array of team objects
     */
    getUserTeams() {
        return this.userTeams;
    }

    /**
     * Check if user is member of specific team
     * @param {number} teamId - Team ID to check
     * @returns {boolean}
     */
    isUserTeamMember(teamId) {
        return this.userTeams.some(team => team.id === teamId);
    }

    /**
     * Get active team object
     * @returns {Object|null} - Active team object or null
     */
    getActiveTeam() {
        if (!this.activeTeamId) return null;
        return this.userTeams.find(team => team.id === this.activeTeamId) || null;
    }

    /**
     * Save current scope to localStorage
     */
    saveToStorage() {
        localStorage.setItem('currentScope', this.currentScope);
        if (this.activeTeamId) {
            localStorage.setItem('activeTeamId', this.activeTeamId.toString());
        } else {
            localStorage.removeItem('activeTeamId');
        }
    }

    /**
     * Add event listener for scope changes
     * @param {string} event - Event type ('scope-changed')
     * @param {Function} callback - Callback function
     */
    addEventListener(event, callback) {
        this.eventListeners.push({ event, callback });
    }

    /**
     * Remove event listener
     * @param {string} event - Event type
     * @param {Function} callback - Callback function
     */
    removeEventListener(event, callback) {
        this.eventListeners = this.eventListeners.filter(
            listener => !(listener.event === event && listener.callback === callback)
        );
    }

    /**
     * Notify all listeners of an event
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    notifyListeners(event, data) {
        this.eventListeners
            .filter(listener => listener.event === event)
            .forEach(listener => listener.callback(data));
    }

    /**
     * Build API endpoint for current scope
     * @param {string} resource - Resource type (sources, targets, routes, events, deliveries)
     * @returns {string} - Scoped API endpoint
     */
    buildApiEndpoint(resource) {
        if (this.currentScope === 'personal') {
            return `/personal/${resource}`;
        } else if (this.currentScope === 'team' && this.activeTeamId) {
            return `/team/${this.activeTeamId}/${resource}`;
        } else {
            throw new Error('Invalid scope or missing team ID');
        }
    }

    /**
     * Get scope display name for UI
     * @returns {string} - Display name for current scope
     */
    getScopeDisplayName() {
        if (this.currentScope === 'personal') {
            return i18n.t('scope.personal');
        } else if (this.currentScope === 'team') {
            const activeTeam = this.getActiveTeam();
            return activeTeam ? i18n.t('scope.team_label', { name: activeTeam.name }) : i18n.t('scope.team');
        }
        return i18n.t('common.unknown');
    }
}

/**
 * TeamContextManager - Manages team context and UI updates
 */
class TeamContextManager {
    constructor(scopeManager, api) {
        this.scopeManager = scopeManager;
        this.api = api;
        this.isInitialized = false;

        // Setup scope change listener
        this.scopeManager.addEventListener('scope-changed', (data) => {
            this.onScopeChanged(data);
        });
    }

    /**
     * Initialize team context
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Load user teams
            await this.loadUserTeams();

            // Update UI
            this.updateNavigationUI();
            this.updateScopeSelectors();

            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize team context:', error);
            // Fallback to personal scope
            this.scopeManager.switchToPersonal();
        }
    }

    /**
     * Load user teams from API
     */
    async loadUserTeams() {
        const response = await this.api.get('/user/teams');
        if (response.success) {
            this.scopeManager.setUserTeams(response.data || []);
        } else {
            console.error('Failed to load user teams:', response.error);
            this.scopeManager.setUserTeams([]);
        }
    }

    /**
     * Handle scope change events
     * @param {Object} data - Scope change data
     */
    onScopeChanged(_data) {
        this.updateNavigationUI();
        this.updateScopeSelectors();
        this.updatePageContent();

        // Trigger data refresh for current page
        if (window.app && window.app.refreshCurrentPage) {
            window.app.refreshCurrentPage();
        }
    }

    /**
     * Update navigation UI based on current scope
     */
    updateNavigationUI() {
        const navigation = document.querySelector('.sidebar .nav-menu');
        if (!navigation) return;

        // Remove existing scope sections
        const existingSections = navigation.querySelectorAll('.scope-section');
        existingSections.forEach(section => section.remove());

        // Create Personal section
        const personalSection = this.createNavigationSection('personal', i18n.t('scope.nav.personal'), [
            { id: 'personal-sources', icon: 'fa-code-branch', text: i18n.t('scope.nav.sources'), page: 'sources' },
            { id: 'personal-targets', icon: 'fa-bullseye', text: i18n.t('scope.nav.targets'), page: 'targets' },
            { id: 'personal-routes', icon: 'fa-route', text: i18n.t('scope.nav.routes'), page: 'routes' },
            { id: 'personal-events', icon: 'fa-list', text: i18n.t('scope.nav.events'), page: 'events' },
            { id: 'personal-deliveries', icon: 'fa-paper-plane', text: i18n.t('scope.nav.deliveries'), page: 'deliveries' }
        ]);

        // Create Team section - always show, even if no teams
        const userTeams = this.scopeManager.getUserTeams();
        console.log('🔍 User teams for navigation:', userTeams);

        let teamSection = null;

        // Always create team selector (will show "Select team" if empty)
        const teamSelector = this.createTeamSelector(userTeams);

        teamSection = this.createNavigationSection('team', i18n.t('scope.nav.team'), [
            { id: 'team-sources', icon: 'fa-code-branch', text: i18n.t('scope.nav.sources'), page: 'sources' },
            { id: 'team-targets', icon: 'fa-bullseye', text: i18n.t('scope.nav.targets'), page: 'targets' },
            { id: 'team-routes', icon: 'fa-route', text: i18n.t('scope.nav.routes'), page: 'routes' },
            { id: 'team-events', icon: 'fa-list', text: i18n.t('scope.nav.events'), page: 'events' },
            { id: 'team-deliveries', icon: 'fa-paper-plane', text: i18n.t('scope.nav.deliveries'), page: 'deliveries' }
        ], teamSelector);

        // Find insertion point (after dashboard, before admin sections)
        const dashboardItem = navigation.querySelector('.nav-link[data-page="dashboard"]')?.closest('.nav-item');

        // Insert sections
        if (dashboardItem) {
            dashboardItem.after(personalSection);
            if (teamSection) {
                personalSection.after(teamSection);
            }
        }

        // Update active states
        this.updateNavigationActiveStates();
    }

    /**
     * Create navigation section (Personal or Team)
     * @param {string} scope - Scope type
     * @param {string} title - Section title
     * @param {Array} items - Navigation items
     * @param {HTMLElement} teamSelector - Team selector element
     * @returns {HTMLElement} - Section element
     */
    createNavigationSection(scope, title, items, teamSelector = null) {
        const section = document.createElement('li');
        section.className = 'scope-section';
        section.setAttribute('data-scope', scope);

        // Create header
        const header = document.createElement('div');
        header.className = 'scope-header';
        if (scope === 'team') {
            header.id = 'teamScopeHeader'; // Debug ID
        }

        const titleElement = document.createElement('h4');
        titleElement.className = 'scope-title';
        titleElement.textContent = title;
        header.appendChild(titleElement);

        // Add team selector if provided
        if (scope === 'team' && teamSelector) {
            console.log('✅ Adding team selector to header:', teamSelector);
            console.log('📍 Header before append:', header);
            header.appendChild(teamSelector);
            console.log('📍 Header after append:', header);
            console.log('📍 Header children count:', header.children.length);
        } else if (scope === 'team') {
            console.warn('⚠️ Team scope but no selector provided!');
        }

        section.appendChild(header);

        // Double check after section append
        if (scope === 'team') {
            console.log('🔍 Section after header append:', section);
            console.log('🔍 Header in DOM:', document.getElementById('teamScopeHeader'));
        }

        // Create navigation items
        const navList = document.createElement('ul');
        navList.className = 'scope-nav';

        items.forEach(item => {
            const isActive = this.isNavigationItemActive(scope, item.page);
            const navItem = document.createElement('li');
            navItem.className = 'nav-item scope-item';
            navItem.innerHTML = `
                <a href="#" class="nav-link ${isActive ? 'active' : ''}"
                   data-page="${item.page}" data-scope="${scope}">
                    <i class="fas ${item.icon}"></i>
                    ${item.text}
                </a>
            `;
            navList.appendChild(navItem);
        });

        section.appendChild(navList);

        // Add event listeners for scope navigation
        section.addEventListener('click', (e) => {
            const navLink = e.target.closest('.nav-link');
            if (navLink && navLink.dataset.scope && navLink.dataset.page) {
                e.preventDefault();
                this.handleScopeNavigation(navLink.dataset.scope, navLink.dataset.page);
            }
        });

        return section;
    }

    /**
     * Create team selector dropdown
     * @param {Array} teams - User teams
     * @returns {HTMLElement} - Team selector element
     */
    createTeamSelector(teams = []) {
        const selector = document.createElement('div');
        selector.className = 'team-selector';

        const activeTeamId = this.scopeManager.getActiveTeamId();

        // Create select element
        const selectElement = document.createElement('select');
        selectElement.className = 'form-control team-select';
        selectElement.id = 'navTeamSelector';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = teams.length > 0 ? i18n.t('scope.select_team') : i18n.t('scope.no_teams');
        selectElement.appendChild(defaultOption);

        // Add team options
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            if (team.id === activeTeamId) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });

        selector.appendChild(selectElement);

        // Add change event listener
        selectElement.addEventListener('change', (e) => {
            const teamId = parseInt(e.target.value);
            if (teamId) {
                this.scopeManager.switchToTeam(teamId);
            } else {
                this.scopeManager.switchToPersonal();
            }
        });

        return selector;
    }

    /**
     * Handle scope navigation clicks
     * @param {string} scope - Target scope
     * @param {string} page - Target page
     */
    handleScopeNavigation(scope, page) {
        // Switch scope if needed
        if (scope === 'personal' && !this.scopeManager.isPersonalScope()) {
            this.scopeManager.switchToPersonal();
        } else if (scope === 'team' && !this.scopeManager.isTeamScope()) {
            // For team scope, we need an active team
            const activeTeamId = this.scopeManager.getActiveTeamId();
            if (activeTeamId) {
                this.scopeManager.switchToTeam(activeTeamId);
            } else {
                // Prompt to select team
                this.promptTeamSelection();
                return;
            }
        }

        // Navigate to page
        if (window.app && window.app.showPage) {
            window.app.showPage(page);
        }
    }

    /**
     * Prompt user to select a team
     */
    promptTeamSelection() {
        const teams = this.scopeManager.getUserTeams();
        if (teams.length === 0) {
            if (window.app && window.app.showToast) {
                window.app.showToast('warning', i18n.t('scope.toast.no_team_title'), i18n.t('scope.toast.no_team_message'));
            }
            return;
        }

        if (teams.length === 1) {
            // Auto-select if only one team
            this.scopeManager.switchToTeam(teams[0].id);
        } else {
            // Show team selection modal or use the selector
            if (window.app && window.app.showToast) {
                window.app.showToast('info', i18n.t('scope.toast.select_team_title'), i18n.t('scope.toast.select_team_message'));
            }

            // Focus on team selector dropdown
            setTimeout(() => {
                const teamSelector = document.getElementById('navTeamSelector');
                if (teamSelector) {
                    teamSelector.focus();
                    // Open dropdown if browser supports it
                    teamSelector.click();
                }
            }, 100);
        }
    }

    /**
     * Check if navigation item should be active
     * @param {string} scope - Scope
     * @param {string} page - Page
     * @returns {boolean}
     */
    isNavigationItemActive(scope, page) {
        if (!window.app) return false;

        const currentPage = window.app.currentPage;
        const currentScope = this.scopeManager.getCurrentScope();

        return currentPage === page && currentScope === scope;
    }

    /**
     * Update navigation active states
     */
    updateNavigationActiveStates() {
        // Remove all active states from scope items
        const scopeLinks = document.querySelectorAll('.scope-item .nav-link');
        scopeLinks.forEach(link => link.classList.remove('active'));

        // Add active state to current scope/page
        if (window.app && window.app.currentPage) {
            const currentScope = this.scopeManager.getCurrentScope();
            const currentPage = window.app.currentPage;

            const activeLink = document.querySelector(
                `.scope-item .nav-link[data-scope="${currentScope}"][data-page="${currentPage}"]`
            );

            if (activeLink) {
                activeLink.classList.add('active');
            }
        }
    }

    /**
     * Update scope selectors on pages
     */
    updateScopeSelectors() {
        const scopeSelectors = document.querySelectorAll('.scope-select');
        const teamSelectors = document.querySelectorAll('.team-select');

        const currentScope = this.scopeManager.getCurrentScope();
        const activeTeamId = this.scopeManager.getActiveTeamId();
        const userTeams = this.scopeManager.getUserTeams();

        scopeSelectors.forEach(selector => {
            // Update scope selector value
            selector.value = currentScope;

            // Enable/disable team option based on team availability
            const teamOption = selector.querySelector('option[value="team"]');
            if (teamOption) {
                teamOption.disabled = userTeams.length === 0;
                teamOption.textContent = userTeams.length === 0
                    ? i18n.t('scope.selector.no_team')
                    : i18n.t('scope.selector.team');
            }
        });

        teamSelectors.forEach(selector => {
            // Skip navigation team selector - it should always be visible
            if (selector.id === 'navTeamSelector') {
                return;
            }

            // Update team options
            selector.innerHTML = `<option value="">${i18n.t('scope.selector.select_team')}</option>`;
            userTeams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                option.selected = team.id === activeTeamId;
                selector.appendChild(option);
            });

            // Show/hide team selector based on scope
            selector.style.display = currentScope === 'team' ? 'block' : 'none';
        });
    }

    /**
     * Update page content based on current scope
     */
    updatePageContent() {
        // Update page titles with scope context
        const pageHeaders = document.querySelectorAll('.page-header h2');
        pageHeaders.forEach(header => {
            const originalText = header.textContent.split(' - ')[0]; // Remove existing scope
            const scopeText = this.scopeManager.getScopeDisplayName();
            header.textContent = `${originalText} - ${scopeText}`;
        });

        // Update scope indicators
        this.updateScopeIndicators();
    }

    /**
     * Update scope indicators throughout the UI
     */
    updateScopeIndicators() {
        const indicators = document.querySelectorAll('.scope-indicator');
        const currentScope = this.scopeManager.getCurrentScope();
        const scopeText = this.scopeManager.getScopeDisplayName();

        indicators.forEach(indicator => {
            indicator.textContent = scopeText;
            indicator.className = `scope-indicator scope-${currentScope}`;
        });
    }

    /**
     * Get scope context for API calls
     * @returns {Object} - Scope context object
     */
    getScopeContext() {
        return {
            scope: this.scopeManager.getCurrentScope(),
            teamId: this.scopeManager.getActiveTeamId()
        };
    }

    /**
     * Refresh team data
     */
    async refreshTeams() {
        await this.loadUserTeams();
        this.updateNavigationUI();
        this.updateScopeSelectors();
    }
}

// Global instances (will be initialized by main app)
window.TeamContextManager = TeamContextManager;
window.scopeManager = new ScopeManager();
window.teamContextManager = null; // Will be initialized with API instance