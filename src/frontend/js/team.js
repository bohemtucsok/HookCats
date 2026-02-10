/**
 * Team management functionality for Webhook Admin UI
 */
class TeamManager {
    constructor() {
        this.teams = [];
        this.currentTeam = null;
        this.userTeams = [];
        this.teamMembers = {};
        this.teamStats = {};
        this.currentScope = 'personal';
        this.selectedTeamId = null;
    }

    /**
     * Initialize team management
     */
    async init() {
        try {
            // Only load all teams if user is admin
            const currentUser = window.auth?.getCurrentUser();
            if (currentUser && currentUser.role === 'admin') {
                await this.loadTeams();
            } else {
                // Non-admin users: only load their own teams
                this.teams = [];
            }

            await this.loadUserTeams();
            this.setupEventListeners();
            this.updateTeamSelectors();
        } catch (error) {
            console.error('Failed to initialize team manager:', error);
        }
    }

    /**
     * Setup event listeners for team management
     */
    setupEventListeners() {
        // Team page events
        this.setupTeamPageEvents();

        // Scope selector events
        this.setupScopeSelectorEvents();

        // Team modal events
        this.setupTeamModalEvents();
    }

    /**
     * Setup team page specific events
     */
    setupTeamPageEvents() {
        // Add team button
        const addTeamBtn = document.getElementById('addTeamBtn');
        if (addTeamBtn) {
            addTeamBtn.addEventListener('click', () => this.showCreateTeamModal());
        }

        // Team table events are handled dynamically in renderTeamsTable
    }

    /**
     * Setup scope selector events for all resource pages
     */
    setupScopeSelectorEvents() {
        const scopes = ['sources', 'targets', 'routes'];

        scopes.forEach(scope => {
            const scopeSelect = document.getElementById(`${scope}Scope`);
            const teamSelect = document.getElementById(`${scope}TeamSelect`);

            if (scopeSelect) {
                scopeSelect.addEventListener('change', (e) => {
                    this.handleScopeChange(scope, e.target.value, teamSelect);
                });
            }

            if (teamSelect) {
                teamSelect.addEventListener('change', (e) => {
                    this.handleTeamSelectionChange(scope, e.target.value);
                });
            }
        });
    }

    /**
     * Setup team modal events
     */
    setupTeamModalEvents() {
        // Events are set up when modals are created
    }

    /**
     * Handle scope change for resource pages
     */
    async handleScopeChange(resource, scope, teamSelect) {
        this.currentScope = scope;

        if (scope === 'team') {
            // Always show team dropdown when team scope is selected
            teamSelect.style.display = 'inline-block';
            teamSelect.required = true;

            // If there's only one team, auto-select it
            if (this.userTeams.length === 1) {
                teamSelect.value = this.userTeams[0].id;
                this.selectedTeamId = this.userTeams[0].id;
            }
        } else {
            teamSelect.style.display = 'none';
            teamSelect.required = false;
            this.selectedTeamId = null;
        }

        // Reload the resource data with new scope
        if (window.app && typeof window.app[`load${resource.charAt(0).toUpperCase() + resource.slice(1)}`] === 'function') {
            await window.app[`load${resource.charAt(0).toUpperCase() + resource.slice(1)}`]();
        }
    }

    /**
     * Handle team selection change
     */
    async handleTeamSelectionChange(resource, teamId) {
        this.selectedTeamId = teamId || null;

        // Update the team dropdown label
        const scopeSelect = document.getElementById(`${resource}Scope`);
        if (scopeSelect) {
            const teamOption = scopeSelect.querySelector('option[value="team"]');
            if (teamOption) {
                if (teamId) {
                    const team = this.teams.find(t => t.id === parseInt(teamId));
                    teamOption.textContent = team ? i18n.t('scope.team_label', { name: team.name }) : i18n.t('scope.selector.no_team');
                    teamOption.disabled = false;
                } else {
                    teamOption.textContent = i18n.t('scope.selector.no_team');
                    teamOption.disabled = true;
                }
            }
        }

        // Reload the resource data with selected team
        if (window.app && typeof window.app[`load${resource.charAt(0).toUpperCase() + resource.slice(1)}`] === 'function') {
            await window.app[`load${resource.charAt(0).toUpperCase() + resource.slice(1)}`]();
        }
    }

    /**
     * Get current filtering parameters for API calls
     */
    getCurrentScopeFilter() {
        return {
            visibility: this.currentScope,
            team_id: this.selectedTeamId
        };
    }

    /**
     * Load all teams (admin only)
     */
    async loadTeams() {
        try {
            const response = await window.api.getTeams();
            this.teams = response || [];

            // Map resource counts from backend response
            for (const team of this.teams) {
                team.resource_counts = {
                    sources: team.sources_count || 0,
                    targets: team.targets_count || 0,
                    routes: team.routes_count || 0
                };
            }

            this.updateTeamStats();
        } catch (error) {
            console.error('Failed to load teams:', error);
            this.teams = [];
        }
    }

    /**
     * Load user's teams
     */
    async loadUserTeams() {
        try {
            const response = await window.api.getUserTeams();
            this.userTeams = response || [];
            this.updateTeamSelectors();
        } catch (error) {
            console.error('Failed to load user teams:', error);
            this.userTeams = [];
        }
    }

    /**
     * Update team statistics
     */
    updateTeamStats() {
        const totalTeams = this.teams.length;
        const totalMembers = this.teams.reduce((sum, team) => sum + (team.member_count || 0), 0);
        const myTeams = this.userTeams.length;
        const teamResources = this.teams.reduce((sum, team) => sum + (team.resource_count || 0), 0);

        // Update DOM elements
        this.updateStatElement('teamsCount', totalTeams);
        this.updateStatElement('totalMembersCount', totalMembers);
        this.updateStatElement('myTeamsCount', myTeams);
        this.updateStatElement('teamResourcesCount', teamResources);
    }

    /**
     * Update statistics element
     */
    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    /**
     * Update team selectors in resource pages
     */
    updateTeamSelectors() {
        const scopes = ['sources', 'targets', 'routes'];

        scopes.forEach(scope => {
            const teamSelect = document.getElementById(`${scope}TeamSelect`);
            if (teamSelect) {
                // Clear existing options except the first one
                while (teamSelect.children.length > 1) {
                    teamSelect.removeChild(teamSelect.lastChild);
                }

                // Add teams that user has access to
                this.userTeams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = team.name;
                    teamSelect.appendChild(option);
                });

                // Enable/disable team option in scope selector
                const scopeSelect = document.getElementById(`${scope}Scope`);
                if (scopeSelect) {
                    const teamOption = scopeSelect.querySelector('option[value="team"]');
                    if (teamOption) {
                        // Always enable team option, but show appropriate text
                        teamOption.disabled = false;
                        teamOption.textContent = i18n.t('scope.selector.team');

                        // Always show team select dropdown for visibility
                        if (this.userTeams.length > 0) {
                            teamSelect.style.display = 'inline-block';
                        }
                    }
                }
            }
        });
    }

    /**
     * Render teams table
     */
    renderTeamsTable() {
        const tableBody = document.getElementById('teamsTable');
        if (!tableBody) return;

        if (this.teams.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="no-data">' + i18n.t('teams.empty') + '</td></tr>';
            return;
        }

        tableBody.innerHTML = this.teams.map(team => `
            <tr>
                <td>${team.id}</td>
                <td>
                    <div class="team-info">
                        <strong>${window.api.escapeHtml(team.name)}</strong>
                        ${team.description ? `<br><small class="text-muted">${window.api.escapeHtml(team.description)}</small>` : ''}
                    </div>
                </td>
                <td>
                    <div class="user-info">
                        <i class="fas fa-user"></i>
                        ${window.api.escapeHtml(team.created_by_username || i18n.t('common.unknown'))}
                    </div>
                </td>
                <td>
                    <span class="member-count-badge">
                        <i class="fas fa-users"></i>
                        ${team.member_count || 0}
                    </span>
                </td>
                <td>
                    <div class="resource-counts">
                        <span class="resource-badge sources" title="${i18n.t('nav.sources')}">
                            <i class="fas fa-code-branch"></i>
                            ${team.resource_counts?.sources || 0}
                        </span>
                        <span class="resource-badge targets" title="${i18n.t('nav.targets')}">
                            <i class="fas fa-bullseye"></i>
                            ${team.resource_counts?.targets || 0}
                        </span>
                        <span class="resource-badge routes" title="${i18n.t('nav.routes')}">
                            <i class="fas fa-route"></i>
                            ${team.resource_counts?.routes || 0}
                        </span>
                    </div>
                </td>
                <td>${window.api.formatDate(team.created_at)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick="teamManager.viewTeamDetails(${team.id})" title="${i18n.t('common.details')}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="teamManager.manageTeamMembers(${team.id})" title="${i18n.t('actions.manage_members')}">
                            <i class="fas fa-users"></i>
                        </button>
                        ${this.canEditTeam(team) ? `
                            <button class="btn btn-sm btn-warning" onclick="teamManager.editTeam(${team.id})" title="${i18n.t('common.edit')}">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${this.canDeleteTeam(team) ? `
                            <button class="btn btn-sm btn-danger" onclick="teamManager.deleteTeam(${team.id})" title="${i18n.t('common.delete')}">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Check if user can edit team
     */
    canEditTeam(team) {
        if (!window.app) return false;

        // Admin can edit any team
        if (window.app.isAdmin()) return true;

        // Team owner can edit
        if (team.created_by_user_id === window.app.currentUser?.id) return true;

        // Team admin can edit
        const userMembership = this.getUserTeamRole(team.id);
        return userMembership && ['owner', 'admin'].includes(userMembership.role);
    }

    /**
     * Check if user can delete team
     */
    canDeleteTeam(team) {
        if (!window.app) return false;

        // Admin can delete any team
        if (window.app.isAdmin()) return true;

        // Team owner can delete
        return team.created_by_user_id === window.app.currentUser?.id;
    }

    /**
     * Get user's role in a specific team
     */
    getUserTeamRole(teamId) {
        return this.userTeams.find(team => team.id === teamId);
    }

    /**
     * Show create team modal
     */
    showCreateTeamModal() {
        const modalContent = `
            <form id="createTeamForm" class="team-form">
                <div class="form-group">
                    <label for="teamName">${i18n.t('teams.form.name')} <span class="required">*</span></label>
                    <input type="text" id="teamName" name="name" class="form-control" required
                           placeholder="${i18n.t('teams.form.name_placeholder')}">
                </div>
                <div class="form-group">
                    <label for="teamDescription">${i18n.t('teams.form.description')}</label>
                    <textarea id="teamDescription" name="description" class="form-control" rows="3"
                              placeholder="${i18n.t('teams.form.description_placeholder')}"></textarea>
                </div>
            </form>
        `;

        const modalFooter = `
            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.cancel')}</button>
            <button type="button" class="btn btn-primary" onclick="teamManager.createTeam()">
                <i class="fas fa-plus"></i>
                ${i18n.t('teams.new')}
            </button>
        `;

        window.app.showModal(i18n.t('teams.new'), modalContent, modalFooter);
    }

    /**
     * Create new team
     */
    async createTeam() {
        const form = document.getElementById('createTeamForm');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const teamData = {
            name: formData.get('name'),
            description: formData.get('description') || null
        };

        try {
            await window.api.createTeam(teamData);
            window.app.showToast('success', i18n.t('common.success'), i18n.t('teams.created'));
            window.app.closeModal();
            await this.loadTeams();
            await this.loadUserTeams();
            this.renderTeamsTable();

            // Update team selectors to show the new team
            this.updateTeamSelectors();

            // Refresh TeamContextManager navigation UI
            if (window.teamContextManager) {
                await window.teamContextManager.refreshTeams();
            }
        } catch (error) {
            window.app.showToast('error', i18n.t('common.error'), error.message);
        }
    }

    /**
     * View team details
     */
    async viewTeamDetails(teamId) {
        try {
            const team = await window.api.getTeam(teamId);
            const members = await window.api.getTeamMembers(teamId);

            const modalContent = `
                <div class="team-details">
                    <div class="team-info-section">
                        <h4>${i18n.t('teams.section.basic_info')}</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <label>${i18n.t('teams.field.name')}:</label>
                                <span>${window.api.escapeHtml(team.name)}</span>
                            </div>
                            <div class="info-item">
                                <label>${i18n.t('teams.field.description')}:</label>
                                <span>${team.description ? window.api.escapeHtml(team.description) : i18n.t('teams.no_description')}</span>
                            </div>
                            <div class="info-item">
                                <label>${i18n.t('teams.field.owner')}:</label>
                                <span>${window.api.escapeHtml(team.created_by_username || i18n.t('common.unknown'))}</span>
                            </div>
                            <div class="info-item">
                                <label>${i18n.t('teams.field.created')}:</label>
                                <span>${window.api.formatDate(team.created_at)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="team-members-section">
                        <h4>${i18n.t('teams.members.current', { count: members.length })}</h4>
                        <div class="members-list">
                            ${members.map(member => `
                                <div class="member-item">
                                    <div class="member-info">
                                        <i class="fas fa-user"></i>
                                        <span class="member-name">${window.api.escapeHtml(member.username)}</span>
                                        <span class="member-role role-${member.role}">${this.translateRole(member.role)}</span>
                                    </div>
                                    <small class="member-joined">${i18n.t('teams.members.joined', { date: window.api.formatDate(member.joined_at) })}</small>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="team-resources-section">
                        <h4>${i18n.t('teams.section.resources')}</h4>
                        <div class="resource-summary">
                            <div class="resource-item">
                                <i class="fas fa-code-branch"></i>
                                <span>${i18n.t('teams.section.resources_sources', { count: team.resource_counts?.sources || 0 })}</span>
                            </div>
                            <div class="resource-item">
                                <i class="fas fa-bullseye"></i>
                                <span>${i18n.t('teams.section.resources_targets', { count: team.resource_counts?.targets || 0 })}</span>
                            </div>
                            <div class="resource-item">
                                <i class="fas fa-route"></i>
                                <span>${i18n.t('teams.section.resources_routes', { count: team.resource_counts?.routes || 0 })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const modalFooter = `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.close')}</button>
                ${this.canEditTeam(team) ? `
                    <button type="button" class="btn btn-warning" onclick="teamManager.editTeam(${teamId})">
                        <i class="fas fa-edit"></i>
                        ${i18n.t('common.edit')}
                    </button>
                ` : ''}
                <button type="button" class="btn btn-primary" onclick="teamManager.manageTeamMembers(${teamId})">
                    <i class="fas fa-users"></i>
                    ${i18n.t('actions.manage_members')}
                </button>
            `;

            window.app.showModal(i18n.t('teams.details_title', { name: team.name }), modalContent, modalFooter);

        } catch (error) {
            window.app.showToast('error', i18n.t('common.error'), error.message);
        }
    }

    /**
     * Edit team
     */
    async editTeam(teamId) {
        try {
            const team = await window.api.getTeam(teamId);

            const modalContent = `
                <form id="editTeamForm" class="team-form">
                    <div class="form-group">
                        <label for="editTeamName">${i18n.t('teams.form.name')} <span class="required">*</span></label>
                        <input type="text" id="editTeamName" name="name" class="form-control" required
                               value="${window.api.escapeHtml(team.name)}" placeholder="${i18n.t('teams.form.name_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="editTeamDescription">${i18n.t('teams.form.description')}</label>
                        <textarea id="editTeamDescription" name="description" class="form-control" rows="3"
                                  placeholder="${i18n.t('teams.form.description_placeholder')}">${team.description ? window.api.escapeHtml(team.description) : ''}</textarea>
                    </div>
                </form>
            `;

            const modalFooter = `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.cancel')}</button>
                <button type="button" class="btn btn-primary" onclick="teamManager.updateTeam(${teamId})">
                    <i class="fas fa-save"></i>
                    ${i18n.t('common.save')}
                </button>
            `;

            window.app.showModal(i18n.t('teams.edit_title', { name: team.name }), modalContent, modalFooter);

        } catch (error) {
            window.app.showToast('error', i18n.t('common.error'), error.message);
        }
    }

    /**
     * Update team
     */
    async updateTeam(teamId) {
        const form = document.getElementById('editTeamForm');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const teamData = {
            name: formData.get('name'),
            description: formData.get('description') || null
        };

        try {
            await window.api.updateTeam(teamId, teamData);
            window.app.showToast('success', i18n.t('common.success'), i18n.t('teams.updated'));
            window.app.closeModal();
            await this.loadTeams();
            await this.loadUserTeams();
            this.renderTeamsTable();
        } catch (error) {
            window.app.showToast('error', i18n.t('common.error'), error.message);
        }
    }

    /**
     * Delete team
     */
    async deleteTeam(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;

        const confirmed = await window.app.showConfirmDialog(
            i18n.t('common.delete'),
            i18n.t('teams.confirm_delete', { name: team.name }),
            'danger'
        );

        if (confirmed) {
            try {
                await window.api.deleteTeam(teamId);
                window.app.showToast('success', i18n.t('common.success'), i18n.t('teams.deleted'));
                await this.loadTeams();
                await this.loadUserTeams();
                this.renderTeamsTable();
            } catch (error) {
                window.app.showToast('error', i18n.t('common.error'), error.message);
            }
        }
    }

    /**
     * Manage team members
     */
    async manageTeamMembers(teamId) {
        try {
            const team = await window.api.getTeam(teamId);
            const members = await window.api.getTeamMembers(teamId);

            const modalContent = `
                <div class="team-members-management">
                    <div class="members-section">
                        <div class="section-header">
                            <h4>${i18n.t('teams.members.current', { count: members.length })}</h4>
                            ${this.canManageTeamMembers(team) ? `
                                <button type="button" class="btn btn-sm btn-primary" onclick="teamManager.showAddMemberForm(${teamId})">
                                    <i class="fas fa-user-plus"></i>
                                    ${i18n.t('teams.members.add_button')}
                                </button>
                            ` : ''}
                        </div>
                        <div class="members-list" id="teamMembersList">
                            ${this.renderMembersList(members, team)}
                        </div>
                    </div>

                    ${this.canManageTeamMembers(team) ? `
                        <div class="add-member-section" id="addMemberSection" style="display: none;">
                            <h4>${i18n.t('teams.members.add_title')}</h4>
                            <form id="addMemberForm" class="add-member-form">
                                <div class="form-group">
                                    <label for="memberUsername">${i18n.t('teams.members.username_label')} <span class="required">*</span></label>
                                    <input type="text" id="memberUsername" name="username" class="form-control" required
                                           placeholder="${i18n.t('teams.members.username_placeholder')}">
                                </div>
                                <div class="form-group">
                                    <label for="memberRole">${i18n.t('teams.members.role_label')} <span class="required">*</span></label>
                                    <select id="memberRole" name="role" class="form-control" required>
                                        <option value="">${i18n.t('teams.members.select_role')}</option>
                                        <option value="member">${i18n.t('roles.member')}</option>
                                        <option value="admin">${i18n.t('roles.admin')}</option>
                                        ${team.created_by_user_id === window.app.currentUser?.id ? '<option value="owner">' + i18n.t('roles.owner') + '</option>' : ''}
                                    </select>
                                </div>
                                <div class="form-actions">
                                    <button type="button" class="btn btn-secondary" onclick="teamManager.hideAddMemberForm()">${i18n.t('common.cancel')}</button>
                                    <button type="button" class="btn btn-primary" onclick="teamManager.addTeamMember(${teamId})">
                                        <i class="fas fa-plus"></i>
                                        ${i18n.t('users.add')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ` : ''}
                </div>
            `;

            const modalFooter = `
                <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.close')}</button>
            `;

            window.app.showModal(i18n.t('teams.members_title', { name: team.name }), modalContent, modalFooter, 'large');

        } catch (error) {
            window.app.showToast('error', i18n.t('common.error'), error.message);
        }
    }

    /**
     * Render members list
     */
    renderMembersList(members, team) {
        return members.map(member => `
            <div class="member-item">
                <div class="member-info">
                    <i class="fas fa-user"></i>
                    <span class="member-name">${window.api.escapeHtml(member.username)}</span>
                    <span class="member-role role-${member.role}">${this.translateRole(member.role)}</span>
                </div>
                <div class="member-actions">
                    <small class="member-joined">${i18n.t('teams.members.joined', { date: window.api.formatDate(member.joined_at) })}</small>
                    ${this.canManageTeamMembers(team) && member.user_id !== window.app.currentUser?.id ? `
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-warning" onclick="teamManager.changeUserRole(${team.id}, ${member.user_id}, '${member.role}')" title="${i18n.t('teams.members.change_role_title')}">
                                <i class="fas fa-user-cog"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="teamManager.removeTeamMember(${team.id}, ${member.user_id}, '${member.username}')" title="${i18n.t('teams.members.remove_title')}">
                                <i class="fas fa-user-minus"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    /**
     * Check if user can manage team members
     */
    canManageTeamMembers(team) {
        if (!window.app) return false;

        // Admin can manage any team
        if (window.app.isAdmin()) return true;

        // Team owner can manage
        if (team.created_by_user_id === window.app.currentUser?.id) return true;

        // Team admin can manage
        const userMembership = this.getUserTeamRole(team.id);
        return userMembership && ['owner', 'admin'].includes(userMembership.role);
    }

    /**
     * Show add member form
     */
    showAddMemberForm(_teamId) {
        const addMemberSection = document.getElementById('addMemberSection');
        if (addMemberSection) {
            addMemberSection.style.display = 'block';
            document.getElementById('memberUsername')?.focus();
        }
    }

    /**
     * Hide add member form
     */
    hideAddMemberForm() {
        const addMemberSection = document.getElementById('addMemberSection');
        if (addMemberSection) {
            addMemberSection.style.display = 'none';
            document.getElementById('addMemberForm')?.reset();
        }
    }

    /**
     * Add team member
     */
    async addTeamMember(teamId) {
        const form = document.getElementById('addMemberForm');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const memberData = {
            username: formData.get('username'),
            role: formData.get('role')
        };

        try {
            await window.api.addTeamMember(teamId, memberData);
            window.app.showToast('success', i18n.t('common.success'), i18n.t('teams.member_added'));

            // Refresh the members list
            const members = await window.api.getTeamMembers(teamId);
            const team = await window.api.getTeam(teamId);
            const membersList = document.getElementById('teamMembersList');
            if (membersList) {
                membersList.innerHTML = this.renderMembersList(members, team);
            }

            this.hideAddMemberForm();
            await this.loadTeams();
            await this.loadUserTeams();

        } catch (error) {
            window.app.showToast('error', i18n.t('common.error'), error.message);
        }
    }

    /**
     * Remove team member
     */
    async removeTeamMember(teamId, userId, username) {
        const confirmed = await window.app.showConfirmDialog(
            i18n.t('teams.members.remove_title'),
            i18n.t('teams.members.remove_confirm', { username }),
            'danger'
        );

        if (confirmed) {
            try {
                await window.api.removeTeamMember(teamId, userId);
                window.app.showToast('success', i18n.t('common.success'), i18n.t('teams.member_removed'));

                // Refresh the members list
                const members = await window.api.getTeamMembers(teamId);
                const team = await window.api.getTeam(teamId);
                const membersList = document.getElementById('teamMembersList');
                if (membersList) {
                    membersList.innerHTML = this.renderMembersList(members, team);
                }

                await this.loadTeams();
                await this.loadUserTeams();

            } catch (error) {
                window.app.showToast('error', i18n.t('common.error'), error.message);
            }
        }
    }

    /**
     * Change user role in team
     */
    async changeUserRole(teamId, userId, currentRole) {
        const modalContent = `
            <form id="changeRoleForm" class="role-form">
                <div class="form-group">
                    <label for="newRole">${i18n.t('teams.members.new_role')} <span class="required">*</span></label>
                    <select id="newRole" name="role" class="form-control" required>
                        <option value="">${i18n.t('teams.members.select_role')}</option>
                        <option value="member" ${currentRole === 'member' ? 'selected' : ''}>${i18n.t('roles.member')}</option>
                        <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>${i18n.t('roles.admin')}</option>
                        <option value="owner" ${currentRole === 'owner' ? 'selected' : ''}>${i18n.t('roles.owner')}</option>
                    </select>
                </div>
            </form>
        `;

        const modalFooter = `
            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">${i18n.t('common.cancel')}</button>
            <button type="button" class="btn btn-primary" onclick="teamManager.updateUserRole(${teamId}, ${userId})">
                <i class="fas fa-save"></i>
                ${i18n.t('common.save')}
            </button>
        `;

        window.app.showModal(i18n.t('teams.members.change_role_title'), modalContent, modalFooter);
    }

    /**
     * Update user role in team
     */
    async updateUserRole(teamId, userId) {
        const form = document.getElementById('changeRoleForm');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const newRole = formData.get('role');

        try {
            await window.api.updateTeamMemberRole(teamId, userId, newRole);
            window.app.showToast('success', i18n.t('common.success'), i18n.t('teams.role_changed'));
            window.app.closeModal();

            // Refresh the members list
            const members = await window.api.getTeamMembers(teamId);
            const team = await window.api.getTeam(teamId);
            const membersList = document.getElementById('teamMembersList');
            if (membersList) {
                membersList.innerHTML = this.renderMembersList(members, team);
            }

            await this.loadTeams();
            await this.loadUserTeams();

        } catch (error) {
            window.app.showToast('error', i18n.t('common.error'), error.message);
        }
    }

    /**
     * Translate role
     */
    translateRole(role) {
        return i18n.t('roles.' + role) || role;
    }

    /**
     * Get role badge class
     */
    getRoleBadgeClass(role) {
        const classes = {
            'owner': 'role-owner',
            'admin': 'role-admin',
            'member': 'role-member'
        };
        return classes[role] || 'role-member';
    }
}

// Create global team manager instance
window.teamManager = new TeamManager();