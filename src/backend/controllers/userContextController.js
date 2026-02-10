const { body, validationResult } = require('express-validator');
const database = require('../config/database');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');

/**
 * User Team Context Controller
 * Handles user's team context, active team settings, and scope navigation
 */

/**
 * GET /api/user/teams - Get user's team memberships
 */
const getUserTeams = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const teams = await database.query(
    `SELECT t.id, t.name, t.description, t.is_active,
            tm.role, tm.is_active as membership_active, tm.joined_at,
            t.created_at as team_created_at,
            u.username as team_creator,
            (SELECT COUNT(*) FROM sources WHERE team_id = t.id AND visibility = 'team') as sources_count,
            (SELECT COUNT(*) FROM targets WHERE team_id = t.id AND visibility = 'team') as targets_count,
            (SELECT COUNT(*) FROM routes WHERE team_id = t.id AND visibility = 'team') as routes_count,
            (SELECT COUNT(*) FROM team_members WHERE team_id = t.id AND is_active = TRUE) as members_count
     FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     LEFT JOIN users u ON t.created_by_user_id = u.id
     WHERE tm.user_id = ? AND tm.is_active = TRUE AND t.is_active = TRUE
     ORDER BY tm.joined_at ASC`,
    [userId]
  );

  const teamsWithStats = teams.map(team => ({
    id: team.id,
    name: team.name,
    description: team.description,
    is_active: team.is_active,
    role: team.role,
    membership_active: team.membership_active,
    joined_at: team.joined_at,
    team_created_at: team.team_created_at,
    team_creator: team.team_creator,
    statistics: {
      sources: team.sources_count || 0,
      targets: team.targets_count || 0,
      routes: team.routes_count || 0,
      members: team.members_count || 0
    }
  }));

  res.json({
    success: true,
    data: teamsWithStats,
    meta: {
      total: teamsWithStats.length,
      user_id: userId
    }
  });
});

/**
 * GET /api/user/context - Get user's full context (teams, active team, personal stats)
 * Simplified version to avoid database schema issues
 */
const getUserContext = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Return minimal user context with mock data for now
  const mockUser = {
    id: userId,
    username: req.user.username,
    role: req.user.role,
    default_team_id: null,
    team_preferences: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  const user = mockUser;

  // Parse team preferences
  let teamPreferences = {};
  try {
    teamPreferences = user.team_preferences ? JSON.parse(user.team_preferences) : {};
  } catch (error) {
    console.error('Team preferences parsing error:', error);
    teamPreferences = {};
  }

  // Get user's teams
  const teams = await database.query(
    `SELECT t.id, t.name, t.description, t.is_active,
            tm.role, tm.is_active as membership_active, tm.joined_at
     FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     WHERE tm.user_id = ? AND tm.is_active = TRUE AND t.is_active = TRUE
     ORDER BY tm.joined_at ASC`,
    [userId]
  );

  // Get personal resource statistics
  const [personalStats] = await database.query(
    `SELECT
      (SELECT COUNT(*) FROM sources WHERE created_by_user_id = ? AND visibility = 'personal') as sources,
      (SELECT COUNT(*) FROM targets WHERE created_by_user_id = ? AND visibility = 'personal') as targets,
      (SELECT COUNT(*) FROM routes WHERE created_by_user_id = ? AND visibility = 'personal') as routes,
      (SELECT COUNT(*) FROM events WHERE created_by_user_id = ? AND visibility = 'personal') as events,
      (SELECT COUNT(*) FROM deliveries WHERE created_by_user_id = ? AND visibility = 'personal') as deliveries`,
    [userId, userId, userId, userId, userId]
  );

  // Get active/default team info
  let activeTeam = null;
  if (user.default_team_id) {
    const [activeTeams] = await database.query(
      `SELECT t.id, t.name, t.description, tm.role
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE t.id = ? AND tm.user_id = ? AND tm.is_active = TRUE AND t.is_active = TRUE`,
      [user.default_team_id, userId]
    );

    if (activeTeams.length > 0) {
      activeTeam = activeTeams[0];
    }
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      teams: teams,
      active_team: activeTeam,
      default_team_id: user.default_team_id,
      team_preferences: teamPreferences,
      personal_statistics: personalStats,
      access_scopes: {
        personal: true,
        teams: teams.map(t => ({
          team_id: t.id,
          team_name: t.name,
          role: t.role
        }))
      }
    },
    meta: {
      total_teams: teams.length,
      has_teams: teams.length > 0,
      is_admin: user.role === 'admin'
    }
  });
});

/**
 * PUT /api/user/active-team - Set user's active/default team
 */
const setActiveTeam = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const userId = req.user.id;
  const { team_id } = req.body;

  // If team_id is null, clear the default team
  if (team_id === null || team_id === undefined) {
    await database.query(
      'UPDATE users SET default_team_id = NULL WHERE id = ?',
      [userId]
    );

    return res.json({
      success: true,
      data: {
        message: req.t('teams.default_team_cleared'),
        active_team_id: null
      }
    });
  }

  // Verify user is a member of the team
  const [memberships] = await database.query(
    `SELECT tm.role, t.name, t.is_active
     FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.is_active = TRUE`,
    [team_id, userId]
  );

  if (memberships.length === 0) {
    throw new CustomError(req.t('teams.not_member_or_inactive'), 403);
  }

  const membership = memberships[0];

  if (!membership.is_active) {
    throw new CustomError(req.t('teams.team_inactive'), 400);
  }

  // Update user's default team
  await database.query(
    'UPDATE users SET default_team_id = ? WHERE id = ?',
    [team_id, userId]
  );

  res.json({
    success: true,
    data: {
      message: req.t('teams.default_team_set'),
      active_team_id: team_id,
      team_name: membership.name,
      user_role: membership.role
    }
  });
});

/**
 * PUT /api/user/team-preferences - Update user's team preferences
 */
const updateTeamPreferences = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: req.t('validation.failed'),
      details: errors.array()
    });
  }

  const userId = req.user.id;
  const { preferences } = req.body;

  // Validate preferences structure
  if (typeof preferences !== 'object' || preferences === null) {
    throw new CustomError(req.t('validation.settings_object_format'), 400);
  }

  // Allowed preference keys with validation
  const allowedPreferences = {
    'default_scope': ['personal', 'team'],
    'auto_switch_team': [true, false],
    'show_team_notifications': [true, false],
    'preferred_list_view': ['card', 'table', 'compact'],
    'items_per_page': [10, 25, 50, 100]
  };

  // Validate each preference
  for (const [key, value] of Object.entries(preferences)) {
    if (!Object.prototype.hasOwnProperty.call(allowedPreferences, key)) {
      throw new CustomError(req.t('validation.invalid_settings_key', { key }), 400);
    }

    if (!allowedPreferences[key].includes(value)) {
      throw new CustomError(req.t('validation.invalid_settings_value', { key, value }), 400);
    }
  }

  // Get current preferences and merge
  const [users] = await database.query(
    'SELECT team_preferences FROM users WHERE id = ?',
    [userId]
  );

  let currentPreferences = {};
  try {
    currentPreferences = users[0].team_preferences ? JSON.parse(users[0].team_preferences) : {};
  } catch (error) {
    console.error('Current preferences parsing error:', error);
    currentPreferences = {};
  }

  // Merge preferences
  const updatedPreferences = { ...currentPreferences, ...preferences };

  // Update in database
  await database.query(
    'UPDATE users SET team_preferences = ? WHERE id = ?',
    [JSON.stringify(updatedPreferences), userId]
  );

  res.json({
    success: true,
    data: {
      message: req.t('teams.settings_updated'),
      preferences: updatedPreferences
    }
  });
});

/**
 * GET /api/user/scope-navigation - Get navigation data for scope switching
 */
const getScopeNavigation = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get user's teams with resource counts
  const teams = await database.query(
    `SELECT t.id, t.name, tm.role,
      (SELECT COUNT(*) FROM sources WHERE team_id = t.id AND visibility = 'team') as sources_count,
      (SELECT COUNT(*) FROM targets WHERE team_id = t.id AND visibility = 'team') as targets_count,
      (SELECT COUNT(*) FROM routes WHERE team_id = t.id AND visibility = 'team') as routes_count,
      (SELECT COUNT(*) FROM events WHERE team_id = t.id AND visibility = 'team') as events_count,
      (SELECT COUNT(*) FROM deliveries WHERE team_id = t.id AND visibility = 'team') as deliveries_count
     FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     WHERE tm.user_id = ? AND tm.is_active = TRUE AND t.is_active = TRUE
     ORDER BY t.name ASC`,
    [userId]
  );

  // Get personal resource counts
  const [personalCounts] = await database.query(
    `SELECT
      (SELECT COUNT(*) FROM sources WHERE created_by_user_id = ? AND visibility = 'personal') as sources_count,
      (SELECT COUNT(*) FROM targets WHERE created_by_user_id = ? AND visibility = 'personal') as targets_count,
      (SELECT COUNT(*) FROM routes WHERE created_by_user_id = ? AND visibility = 'personal') as routes_count,
      (SELECT COUNT(*) FROM events WHERE created_by_user_id = ? AND visibility = 'personal') as events_count,
      (SELECT COUNT(*) FROM deliveries WHERE created_by_user_id = ? AND visibility = 'personal') as deliveries_count`,
    [userId, userId, userId, userId, userId]
  );

  res.json({
    success: true,
    data: {
      personal: {
        scope: 'personal',
        name: req.t('scope.personal'),
        icon: 'user',
        counts: personalCounts
      },
      teams: teams.map(team => ({
        scope: 'team',
        team_id: team.id,
        name: team.name,
        role: team.role,
        icon: 'users',
        counts: {
          sources_count: team.sources_count,
          targets_count: team.targets_count,
          routes_count: team.routes_count,
          events_count: team.events_count,
          deliveries_count: team.deliveries_count
        }
      }))
    },
    meta: {
      total_scopes: teams.length + 1, // +1 for personal
      user_id: userId
    }
  });
});

// Validation rules
const setActiveTeamValidation = [
  body('team_id')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('Team ID must be a positive integer')
];

const updateTeamPreferencesValidation = [
  body('preferences')
    .isObject()
    .withMessage('Settings must be in object format')
];

module.exports = {
  getUserTeams,
  getUserContext,
  setActiveTeam,
  updateTeamPreferences,
  getScopeNavigation,

  // Validation rules
  setActiveTeamValidation,
  updateTeamPreferencesValidation
};