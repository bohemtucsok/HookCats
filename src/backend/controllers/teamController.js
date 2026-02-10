const { body, param, query, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const teamService = require('../services/teamService');

/**
 * Team Controller - Team management API endpoints
 * Contains all team-related HTTP endpoints
 */

/**
 * Validation rules
 */

// Team creation/update validation
const teamValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Team name must be between 2 and 255 characters')
    .matches(/^[a-zA-ZÀ-ÿ0-9\s\-_.áéíóöőúüű]+$/i)
    .withMessage('Team name can only contain letters, numbers and basic punctuation'),

  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description can be maximum 1000 characters'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active field must be a boolean value')
];

// Team member add/update validation
const teamMemberValidation = [
  body('role')
    .isIn(['member', 'admin', 'owner'])
    .withMessage('Role must be member, admin or owner'),

  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a valid positive integer')
];

// ID validation
const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a valid positive integer')
];

// Query parameter validation
const queryValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset cannot be negative'),

  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be a boolean value')
];

/**
 * ADMIN TEAM MANAGEMENT ENDPOINTS
 */

/**
 * GET /api/admin/teams - List all teams (admin)
 */
const getAllTeams = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { limit = 50, offset = 0, includeInactive = false } = req.query;

  const teams = await teamService.getAllTeams({
    limit: parseInt(limit),
    offset: parseInt(offset),
    includeInactive: includeInactive === 'true'
  });

  res.json({
    success: true,
    data: teams,
    meta: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      count: teams.length
    }
  });
});

/**
 * POST /api/admin/teams - Create a new team (admin)
 */
const createTeam = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { name, description } = req.body;
  const userId = req.user.id;

  // Check name uniqueness
  const isAvailable = await teamService.isTeamNameAvailable(name);
  if (!isAvailable) {
    return res.status(409).json({
      success: false,
      error: req.t('teams.name_already_exists')
    });
  }

  const team = await teamService.createTeam(
    { name, description },
    userId,
    req.ip,
    req.get('User-Agent')
  );

  res.status(201).json({
    success: true,
    data: team,
    message: req.t('teams.created')
  });
});

/**
 * PUT /api/admin/teams/:id - Update team (admin)
 */
const updateTeam = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { name, description, is_active } = req.body;
  const userId = req.user.id;

  // Check name uniqueness (if changed)
  if (name) {
    const isAvailable = await teamService.isTeamNameAvailable(name, parseInt(id));
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        error: req.t('teams.name_already_exists')
      });
    }
  }

  const team = await teamService.updateTeam(
    parseInt(id),
    { name, description, is_active },
    userId,
    req.ip,
    req.get('User-Agent')
  );

  res.json({
    success: true,
    data: team,
    message: req.t('teams.updated')
  });
});

/**
 * DELETE /api/admin/teams/:id - Delete team (admin)
 */
const deleteTeam = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { force = false } = req.query;
  const userId = req.user.id;

  try {
    await teamService.deleteTeam(
      parseInt(id),
      userId,
      req.ip,
      req.get('User-Agent'),
      { force: force === 'true' || force === true }
    );

    res.json({
      success: true,
      message: force ? req.t('teams.force_deleted') : req.t('teams.deleted')
    });
  } catch (error) {
    // If error is due to active resources, return detailed information
    if (error.statusCode === 400 && error.details) {
      return res.status(400).json({
        success: false,
        error: error.message,
        canForceDelete: true,
        activeResources: error.details,
        suggestion: req.t('teams.force_delete_suggestion')
      });
    }

    // Other errors
    throw error;
  }
});

/**
 * POST /api/admin/teams/:id/members - Add member (admin)
 */
const addTeamMember = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { user_id, role = 'member' } = req.body;
  const currentUserId = req.user.id;

  // Validate user_id
  if (!user_id || !Number.isInteger(parseInt(user_id)) || parseInt(user_id) < 1) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.valid_user_id_required')
    });
  }

  try {
    const member = await teamService.addTeamMember(
      parseInt(id),
      parseInt(user_id),
      role,
      currentUserId,
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json({
      success: true,
      data: member,
      message: req.t('teams.member_added')
    });
  } catch (error) {
    // Handle specific errors for better user experience
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        error: error.message,
        suggestion: req.t('teams.check_user_membership')
      });
    }

    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: error.message,
        suggestion: req.t('teams.check_user_id')
      });
    }

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        error: error.message,
        suggestion: req.t('teams.permission_add_member')
      });
    }

    // Other errors
    throw error;
  }
});

/**
 * DELETE /api/admin/teams/:id/members/:userId - Remove member (admin)
 */
const removeTeamMember = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id, userId } = req.params;
  const currentUserId = req.user.id;

  await teamService.removeTeamMember(
    parseInt(id),
    parseInt(userId),
    currentUserId,
    req.ip,
    req.get('User-Agent')
  );

  res.json({
    success: true,
    message: req.t('teams.member_removed')
  });
});

/**
 * PUT /api/admin/teams/:id/members/:userId - Update member role (admin)
 */
const updateTeamMemberRole = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id, userId } = req.params;
  const { role } = req.body;
  const currentUserId = req.user.id;

  const member = await teamService.updateTeamMemberRole(
    parseInt(id),
    parseInt(userId),
    role,
    currentUserId,
    req.ip,
    req.get('User-Agent')
  );

  res.json({
    success: true,
    data: member,
    message: req.t('teams.member_role_updated')
  });
});

/**
 * GET /api/admin/teams/:id - Detailed team information (admin)
 */
const getTeamDetails = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  // With admin permission, any team can be viewed
  const team = await teamService.getTeamById(parseInt(id), userId);

  if (!team) {
    return res.status(404).json({
      success: false,
      error: req.t('teams.not_found')
    });
  }

  // Query members
  const members = await teamService.getTeamMembers(parseInt(id), userId, true);

  // Statistics
  const statistics = await teamService.getTeamStatistics(parseInt(id), userId);

  res.json({
    success: true,
    data: {
      team,
      members,
      statistics
    }
  });
});

/**
 * GET /api/admin/teams/:id/members - List team members (admin)
 */
const getTeamMembers = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { includeInactive = false } = req.query;
  const userId = req.user.id;

  const members = await teamService.getTeamMembers(
    parseInt(id),
    userId,
    includeInactive === 'true'
  );

  res.json({
    success: true,
    data: members,
    meta: {
      teamId: parseInt(id),
      count: members.length,
      includeInactive: includeInactive === 'true'
    }
  });
});

/**
 * GET /api/admin/teams/:id/statistics - Team statistics (admin)
 */
const getTeamStatistics = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  const statistics = await teamService.getTeamStatistics(parseInt(id), userId);

  res.json({
    success: true,
    data: statistics
  });
});

/**
 * GET /api/admin/teams/:id/check-deletion - Check if team can be deleted (admin)
 */
const checkTeamDeletion = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  // Check if team exists
  const team = await teamService.getTeamById(parseInt(id), userId);
  if (!team) {
    return res.status(404).json({
      success: false,
      error: req.t('teams.not_found')
    });
  }

  // Check active resources
  const activeResources = await teamService.checkTeamActiveResources(parseInt(id));

  const response = {
    success: true,
    data: {
      canDelete: !activeResources.hasActiveResources,
      team: {
        id: team.id,
        name: team.name,
        user_role: team.user_role
      },
      activeResources,
      deleteOptions: {
        normal: {
          available: !activeResources.hasActiveResources,
          description: req.t('teams.normal_delete_description')
        },
        force: {
          available: activeResources.hasActiveResources,
          description: req.t('teams.force_delete_description'),
          warning: req.t('teams.force_delete_warning')
        }
      }
    }
  };

  if (activeResources.hasActiveResources) {
    response.data.message = req.t('teams.has_active_resources', { total: activeResources.total });
    response.data.resourceDetails = {
      sources: `${activeResources.sources} sources`,
      targets: `${activeResources.targets} targets`,
      routes: `${activeResources.routes} routes`,
      events: `${activeResources.events} events`,
      deliveries: `${activeResources.deliveries} deliveries`
    };
  } else {
    response.data.message = req.t('teams.safe_to_delete');
  }

  res.json(response);
});

/**
 * USER TEAM ENDPOINTS
 */

/**
 * GET /api/teams/my - List user's teams
 */
const getMyTeams = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const teams = await teamService.getUserTeams(userId);

  res.json({
    success: true,
    data: teams,
    meta: {
      userId,
      count: teams.length
    }
  });
});

/**
 * GET /api/teams/:id - Team details (if member)
 */
const getMyTeamDetails = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  const team = await teamService.getTeamById(parseInt(id), userId);

  if (!team) {
    return res.status(404).json({
      success: false,
      error: req.t('teams.not_found_or_no_access')
    });
  }

  // Query members (active only)
  const members = await teamService.getTeamMembers(parseInt(id), userId, false);

  res.json({
    success: true,
    data: {
      team,
      members
    }
  });
});

/**
 * POST /api/teams/:id/leave - Leave team
 */
const leaveTeam = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  await teamService.removeTeamMember(
    parseInt(id),
    userId,
    userId,
    req.ip,
    req.get('User-Agent')
  );

  res.json({
    success: true,
    message: req.t('teams.left_successfully')
  });
});

/**
 * GET /api/teams/:id/members - List team members (if member)
 */
const getMyTeamMembers = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  const members = await teamService.getTeamMembers(parseInt(id), userId, false);

  res.json({
    success: true,
    data: members,
    meta: {
      teamId: parseInt(id),
      count: members.length
    }
  });
});

/**
 * UTILITY ENDPOINTS
 */

/**
 * GET /api/teams/check-name/:name - Check team name availability
 */
const checkTeamNameAvailability = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { excludeId } = req.query;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.team_name_required')
    });
  }

  const isAvailable = await teamService.isTeamNameAvailable(
    name.trim(),
    excludeId ? parseInt(excludeId) : null
  );

  res.json({
    success: true,
    data: {
      name: name.trim(),
      available: isAvailable,
      message: isAvailable ? req.t('teams.name_available') : req.t('teams.name_taken')
    }
  });
});

module.exports = {
  // Admin endpoints
  getAllTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  getTeamDetails,
  getTeamMembers,
  getTeamStatistics,
  checkTeamDeletion,

  // User endpoints
  getMyTeams,
  getMyTeamDetails,
  leaveTeam,
  getMyTeamMembers,

  // Utility endpoints
  checkTeamNameAvailability,

  // Validation rules export
  teamValidation,
  teamMemberValidation,
  idValidation,
  queryValidation
};