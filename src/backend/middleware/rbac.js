const database = require('../config/database');
// errorHandler CustomError not needed - using direct res.status().json()

/**
 * Role-Based Access Control (RBAC) middleware
 * Role-Based Access Control middleware functions
 */

// Team role hierarchy (module-level constant)
const ROLE_HIERARCHY = { member: 1, admin: 2, owner: 3 };

/**
 * Checks whether the user has an admin role
 * @param {Object} user - User object
 * @returns {boolean} - True if admin, false otherwise
 */
const isAdmin = (user) => {
  return user && user.role === 'admin';
};

/**
 * Returns the user's role
 * @param {Object} user - User object
 * @returns {string} - The user's role ('admin' or 'user')
 */
const getUserRole = (user) => {
  return user && user.role ? user.role : 'user';
};

/**
 * Middleware: Checks whether the user has the required role
 * @param {string} requiredRole - Required role ('admin' or 'user')
 * @returns {Function} Express middleware function
 */
const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      // Check if the user is logged in
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: req.t('auth.authentication_required')
        });
      }

      const userId = req.user.id;

      // Query user role from the database
      const users = await database.query(
        'SELECT id, username, role, is_active FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          error: req.t('users.not_found')
        });
      }

      const user = users[0];

      // Check if the user is active
      if (user.is_active === false) {
        return res.status(403).json({
          success: false,
          error: req.t('auth.account_inactive')
        });
      }

      // Update role in the req.user object
      req.user.role = user.role;
      req.user.is_active = user.is_active;

      // Role verification
      if (requiredRole === 'admin' && user.role !== 'admin') {
        // Audit log for unauthorized access attempt
        await logAuditEvent(
          userId,
          'access_denied',
          'rbac_check',
          null,
          {
            required_role: requiredRole,
            user_role: user.role,
            endpoint: req.originalUrl,
            method: req.method
          },
          req.ip,
          req.get('User-Agent')
        );

        return res.status(403).json({
          success: false,
          error: req.t('auth.admin_permission_required')
        });
      }

      if (requiredRole === 'user' && !['admin', 'user'].includes(user.role)) {
        return res.status(403).json({
          success: false,
          error: req.t('auth.invalid_user_role')
        });
      }

      next();
    } catch (error) {
      console.error('RBAC role verification error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.access_control_error')
      });
    }
  };
};

/**
 * Middleware: Admin permission check
 * Convenience function instead of requireRole('admin')
 */
const requireAdmin = () => {
  return requireRole('admin');
};

/**
 * Middleware: User permission check (admin or user)
 * By default, every logged-in user has user-level permission
 */
const requireUser = () => {
  return requireRole('user');
};

/**
 * Checks whether the user can access the resource
 * @param {number} userId - Current user ID
 * @param {Object} resource - Resource object (with visibility and team_id fields)
 * @param {string} userRole - User's role
 * @param {Array} userTeams - User's team memberships (optional)
 * @returns {boolean} - True if accessible, false otherwise
 */
const canAccessResource = async (userId, resource, userRole, userTeams = null) => {
  // Admin has access to everything
  if (userRole === 'admin') {
    return true;
  }

  // Own resource
  if (resource.created_by_user_id === userId) {
    return true;
  }

  // Team resource access check
  if (resource.visibility === 'team' && resource.team_id) {
    // If userTeams parameter is not provided, query it
    if (userTeams === null) {
      userTeams = await getUserTeamMemberships(userId);
    }

    // Check if the user is a member of the team
    return userTeams.some(team =>
      team.team_id === resource.team_id &&
      team.is_active === true
    );
  }

  return false;
};

/**
 * Middleware: Resource-specific access check
 * @param {string} resourceType - Resource type ('sources', 'targets', 'routes', etc.)
 * @param {string} idParam - URL parameter name for the ID (usually 'id')
 */
const requireResourceAccess = (resourceType, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[idParam];
      const userId = req.user.id;
      const userRole = req.user.role;

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: req.t('validation.resource_id_missing')
        });
      }

      // SECURITY: Whitelist allowed resource types (SQL injection protection)
      const ALLOWED_RESOURCE_TYPES = ['sources', 'targets', 'routes', 'events', 'deliveries'];

      if (!ALLOWED_RESOURCE_TYPES.includes(resourceType)) {
        console.error(`[SECURITY] Invalid resource type attempted: ${resourceType}`);
        return res.status(400).json({
          success: false,
          error: req.t('validation.invalid_resource_type')
        });
      }

      // Admin has access to everything
      if (userRole === 'admin') {
        return next();
      }

      // Query resource (string interpolation is safe here due to whitelist above)
      const resources = await database.query(
        `SELECT id, created_by_user_id, visibility, team_id FROM ${resourceType} WHERE id = ?`,
        [resourceId]
      );

      if (resources.length === 0) {
        return res.status(404).json({
          success: false,
          error: req.t('scope.resource_not_found')
        });
      }

      const resource = resources[0];

      // Access check
      if (!(await canAccessResource(userId, resource, userRole))) {
        await logAuditEvent(
          userId,
          'access_denied',
          resourceType,
          resourceId,
          {
            resource_visibility: resource.visibility,
            resource_team_id: resource.team_id,
            resource_owner: resource.created_by_user_id
          },
          req.ip,
          req.get('User-Agent')
        );

        return res.status(403).json({
          success: false,
          error: req.t('scope.no_permission')
        });
      }

      next();
    } catch (error) {
      console.error('Resource access check error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.access_check_error')
      });
    }
  };
};

/**
 * Log audit event
 * @param {number} userId - User ID
 * @param {string} action - Action name
 * @param {string} resource - Resource type
 * @param {number|null} resourceId - Resource ID
 * @param {Object} details - Additional details
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User Agent
 */
const logAuditEvent = async (userId, action, resource, resourceId, details, ipAddress, userAgent) => {
  try {
    await database.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        action,
        resource,
        resourceId,
        JSON.stringify(details),
        ipAddress,
        userAgent
      ]
    );
  } catch (error) {
    console.error('Audit log write error:', error);
    // Do not stop the request due to audit log errors
  }
};

/**
 * Middleware: Automatic audit logging
 * @param {string} action - Action name
 * @param {string} resource - Resource type
 */
const auditLog = (action, resource) => {
  return async (req, res, next) => {
    try {
      const userId = req.user ? req.user.id : null;
      const resourceId = req.params.id || null;

      // Save original res.json
      const originalJson = res.json;

      // Override res.json with audit logging
      res.json = function(body) {
        // Audit logging only for successful operations
        if (body && body.success) {
          logAuditEvent(
            userId,
            action,
            resource,
            resourceId,
            {
              method: req.method,
              endpoint: req.originalUrl,
              body: req.method !== 'GET' ? req.body : undefined
            },
            req.ip,
            req.get('User-Agent')
          ).catch(error => {
            console.error('Audit log error:', error);
          });
        }

        // Call original res.json
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      console.error('Audit middleware error:', error);
      next(); // Do not stop the request
    }
  };
};

/**
 * Query user's team memberships
 * @param {number} userId - User ID
 * @returns {Array} List of team memberships
 */
const getUserTeamMemberships = async (userId) => {
  try {
    const memberships = await database.query(
      `SELECT team_id, role, is_active
       FROM team_members
       WHERE user_id = ? AND is_active = TRUE`,
      [userId]
    );
    return memberships;
  } catch (error) {
    console.error('Team memberships query error:', error);
    return [];
  }
};

/**
 * Middleware: Team access check
 * @param {number} teamId - Team ID (from URL parameter or body)
 * @param {string} requiredRole - Minimum role ('member', 'admin', 'owner')
 */
const requireTeamAccess = (requiredRole = 'member') => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const teamId = req.params.id || req.params.teamId || req.body.team_id;

      if (!teamId) {
        return res.status(400).json({
          success: false,
          error: req.t('validation.team_id_missing')
        });
      }

      // Admin has access to everything
      if (userRole === 'admin') {
        return next();
      }

      // Team membership check
      const memberships = await database.query(
        'SELECT role, is_active FROM team_members WHERE team_id = ? AND user_id = ? AND is_active = TRUE',
        [teamId, userId]
      );

      if (memberships.length === 0) {
        await logAuditEvent(
          userId,
          'team_access_denied',
          'teams',
          teamId,
          {
            required_role: requiredRole,
            reason: 'not_member'
          },
          req.ip,
          req.get('User-Agent')
        );

        return res.status(403).json({
          success: false,
          error: req.t('teams.no_permission')
        });
      }

      const membership = memberships[0];

      if (ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[requiredRole]) {
        await logAuditEvent(
          userId,
          'team_access_denied',
          'teams',
          teamId,
          {
            user_role: membership.role,
            required_role: requiredRole,
            reason: 'insufficient_role'
          },
          req.ip,
          req.get('User-Agent')
        );

        return res.status(403).json({
          success: false,
          error: req.t('teams.permission_required', { role: requiredRole })
        });
      }

      // Add team info to the request
      req.teamMembership = membership;
      next();

    } catch (error) {
      console.error('Team access check error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.team_access_check_error')
      });
    }
  };
};

/**
 * Middleware: Team role check
 * @param {string} role - Required role ('member', 'admin', 'owner')
 */
const requireTeamRole = (role) => {
  return requireTeamAccess(role);
};

/**
 * Middleware: Team resource access check
 * Checks whether the user can access a team resource
 */
const checkTeamResourceAccess = () => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      // Admin has access to everything
      if (userRole === 'admin') {
        return next();
      }

      // Query user's team memberships
      const userTeams = await getUserTeamMemberships(userId);

      // Add team memberships to the request for optimization
      req.userTeams = userTeams;

      next();
    } catch (error) {
      console.error('Team resource access check error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.team_resource_access_check_error')
      });
    }
  };
};

/**
 * Team ownership check
 * @param {number} userId - User ID
 * @param {number} teamId - Team ID
 * @returns {boolean} - True if owner
 */
const isTeamOwner = async (userId, teamId) => {
  try {
    const memberships = await database.query(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND is_active = TRUE AND role = "owner"',
      [teamId, userId]
    );
    return memberships.length > 0;
  } catch (error) {
    console.error('Team ownership check error:', error);
    return false;
  }
};

/**
 * Team admin check (owner or admin)
 * @param {number} userId - User ID
 * @param {number} teamId - Team ID
 * @returns {boolean} - True if admin or owner
 */
const isTeamAdmin = async (userId, teamId) => {
  try {
    const memberships = await database.query(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND is_active = TRUE AND role IN ("admin", "owner")',
      [teamId, userId]
    );
    return memberships.length > 0;
  } catch (error) {
    console.error('Team admin check error:', error);
    return false;
  }
};

/**
 * Team membership check
 * @param {number} userId - User ID
 * @param {number} teamId - Team ID
 * @returns {boolean} - True if member
 */
const isTeamMember = async (userId, teamId) => {
  try {
    const memberships = await database.query(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND is_active = TRUE',
      [teamId, userId]
    );
    return memberships.length > 0;
  } catch (error) {
    console.error('Team membership check error:', error);
    return false;
  }
};

/**
 * Middleware: Personal resource access check
 * Only allows access to the user's own resources
 */
const requirePersonalAccess = () => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;

      // Admin has access to everything (fallback)
      if (userRole === 'admin') {
        req.resourceScope = 'personal';
        req.accessibleTeamIds = [];
        return next();
      }

      // Set personal scope
      req.resourceScope = 'personal';
      req.accessibleTeamIds = [];

      next();
    } catch (error) {
      console.error('Personal access check error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.personal_access_check_error')
      });
    }
  };
};

/**
 * Middleware: Scope-aware team resource access check
 * Verifies team membership and sets the team scope
 * @param {string} requiredRole - Minimum role ('member', 'admin', 'owner')
 */
const requireScopeTeamAccess = (requiredRole = 'member') => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const teamId = req.params.teamId || req.params.id;

      if (!teamId) {
        return res.status(400).json({
          success: false,
          error: req.t('validation.team_id_missing_from_url')
        });
      }

      // Admin has access to everything
      if (userRole === 'admin') {
        req.resourceScope = 'team';
        req.currentTeamId = parseInt(teamId);
        req.accessibleTeamIds = [parseInt(teamId)];
        return next();
      }

      // Check if team exists
      const teams = await database.query(
        'SELECT id, name, is_active FROM teams WHERE id = ? AND is_active = TRUE',
        [teamId]
      );

      if (teams.length === 0) {
        return res.status(404).json({
          success: false,
          error: req.t('teams.not_found_or_inactive')
        });
      }

      // Team membership check
      const memberships = await database.query(
        'SELECT role, is_active FROM team_members WHERE team_id = ? AND user_id = ? AND is_active = TRUE',
        [teamId, userId]
      );

      if (memberships.length === 0) {
        await logAuditEvent(
          userId,
          'team_access_denied',
          'teams',
          teamId,
          {
            required_role: requiredRole,
            reason: 'not_member'
          },
          req.ip,
          req.get('User-Agent')
        );

        return res.status(403).json({
          success: false,
          error: req.t('teams.not_member')
        });
      }

      const membership = memberships[0];

      if (ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[requiredRole]) {
        await logAuditEvent(
          userId,
          'team_access_denied',
          'teams',
          teamId,
          {
            user_role: membership.role,
            required_role: requiredRole,
            reason: 'insufficient_role'
          },
          req.ip,
          req.get('User-Agent')
        );

        return res.status(403).json({
          success: false,
          error: req.t('teams.minimum_role_required', { role: requiredRole })
        });
      }

      // Set team scope
      req.resourceScope = 'team';
      req.currentTeamId = parseInt(teamId);
      req.accessibleTeamIds = [parseInt(teamId)];
      req.teamMembership = membership;

      next();

    } catch (error) {
      console.error('Team access check error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.team_access_check_error')
      });
    }
  };
};

/**
 * Middleware: Resource scope validation on creation
 * Checks whether the scope parameters are valid
 */
const validateResourceScope = () => {
  return async (req, res, next) => {
    try {
      const { scope, team_id } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Scope is required
      if (!scope || !['personal', 'team'].includes(scope)) {
        return res.status(400).json({
          success: false,
          error: req.t('validation.scope_required')
        });
      }

      // team_id must not be provided for personal scope
      if (scope === 'personal' && team_id) {
        return res.status(400).json({
          success: false,
          error: req.t('validation.no_team_id_for_personal')
        });
      }

      // team_id is required for team scope
      if (scope === 'team' && !team_id) {
        return res.status(400).json({
          success: false,
          error: req.t('validation.team_id_required_for_team')
        });
      }

      // Membership check for team scope
      if (scope === 'team' && team_id) {
        // Admin has access to everything
        if (userRole !== 'admin') {
          const memberships = await database.query(
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND is_active = TRUE',
            [team_id, userId]
          );

          if (memberships.length === 0) {
            return res.status(403).json({
              success: false,
              error: req.t('teams.not_member')
            });
          }

          // At least member permission is required for resource creation
          const membership = memberships[0];
          req.teamMembership = membership;
        }

        // Check if team exists
        const teams = await database.query(
          'SELECT id, name, is_active FROM teams WHERE id = ? AND is_active = TRUE',
          [team_id]
        );

        if (teams.length === 0) {
          return res.status(404).json({
            success: false,
            error: req.t('teams.not_found_or_inactive')
          });
        }
      }

      // Add scope information to the request
      req.resourceScope = scope;
      req.resourceTeamId = scope === 'team' ? parseInt(team_id) : null;

      next();

    } catch (error) {
      console.error('Scope validation error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.scope_validation_error')
      });
    }
  };
};

/**
 * Middleware: Query all user teams and set scope
 * Optimized access to all of the user's resources
 */
const loadUserContext = () => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      // Admin has access to everything
      if (userRole === 'admin') {
        req.userContext = {
          isAdmin: true,
          accessibleTeamIds: [], // No restriction for admin
          personalAccess: true
        };
        return next();
      }

      // Query user's team memberships
      const userTeams = await getUserTeamMemberships(userId);
      const accessibleTeamIds = userTeams.map(team => team.team_id);

      req.userContext = {
        isAdmin: false,
        accessibleTeamIds: accessibleTeamIds,
        personalAccess: true,
        teamMemberships: userTeams
      };

      next();

    } catch (error) {
      console.error('User context loading error:', error);
      return res.status(500).json({
        success: false,
        error: req.t('errors.user_context_load_error')
      });
    }
  };
};

module.exports = {
  isAdmin,
  getUserRole,
  requireRole,
  requireAdmin,
  requireUser,
  requireResourceAccess,
  canAccessResource,
  logAuditEvent,
  auditLog,

  // Team-related functions
  getUserTeamMemberships,
  requireTeamAccess,
  requireTeamRole,
  checkTeamResourceAccess,
  isTeamOwner,
  isTeamAdmin,
  isTeamMember,

  // Scope-based access control
  requirePersonalAccess,
  requireScopeTeamAccess,
  validateResourceScope,
  loadUserContext
};