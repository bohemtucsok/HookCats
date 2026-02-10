const database = require('../config/database');
const { CustomError } = require('../middleware/errorHandler');
const { logAuditEvent } = require('../middleware/rbac');

/**
 * Team Service - Team management business logic
 * Contains all team-related operations
 */

/**
 * Create a team
 * @param {Object} teamData - Team data
 * @param {string} teamData.name - Team name
 * @param {string} teamData.description - Team description
 * @param {number} createdByUserId - ID of the user creating the team
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User Agent
 * @returns {Object} Created team data
 */
const createTeam = async (teamData, createdByUserId, ipAddress, userAgent) => {
  const { name, description } = teamData;

  // Check name uniqueness
  const existingTeams = await database.query(
    'SELECT id FROM teams WHERE name = ?',
    [name]
  );

  if (existingTeams.length > 0) {
    throw new CustomError('Team with this name already exists', 409);
  }

  // Validate name
  if (!name || name.trim().length < 2) {
    throw new CustomError('Team name must be at least 2 characters long', 400);
  }

  if (name.length > 255) {
    throw new CustomError('Team name cannot be longer than 255 characters', 400);
  }

  // Create team and add owner within a transaction
  const result = await database.transaction(async (connection) => {
    // Create team
    const [teamResult] = await connection.execute(
      `INSERT INTO teams (name, description, created_by_user_id, created_at)
       VALUES (?, ?, ?, NOW())`,
      [name.trim(), description || null, createdByUserId]
    );

    const teamId = teamResult.insertId;

    // Add creator with owner role
    await connection.execute(
      `INSERT INTO team_members (team_id, user_id, role, joined_at)
       VALUES (?, ?, 'owner', NOW())`,
      [teamId, createdByUserId]
    );

    return teamId;
  });

  // Audit log
  await logAuditEvent(
    createdByUserId,
    'create_team',
    'teams',
    result,
    {
      team_name: name,
      description: description
    },
    ipAddress,
    userAgent
  );

  // Fetch created team data
  const team = await getTeamById(result, createdByUserId);
  return team;
};

/**
 * Update a team
 * @param {number} teamId - Team ID
 * @param {Object} updateData - Data to update
 * @param {number} userId - User ID
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User Agent
 * @returns {Object} Updated team data
 */
const updateTeam = async (teamId, updateData, userId, ipAddress, userAgent) => {
  const { name, description, is_active } = updateData;

  // Check team existence and permissions
  const team = await getTeamById(teamId, userId);
  if (!team) {
    throw new CustomError('Team not found or no permission', 404);
  }

  // Only owner and admin can modify
  if (!['owner', 'admin'].includes(team.user_role)) {
    throw new CustomError('No permission to modify team', 403);
  }

  // Check name uniqueness (if changed)
  if (name && name !== team.name) {
    const existingTeams = await database.query(
      'SELECT id FROM teams WHERE name = ? AND id != ?',
      [name, teamId]
    );

    if (existingTeams.length > 0) {
      throw new CustomError('Team with this name already exists', 409);
    }
  }

  // Validate data
  if (name !== undefined) {
    if (!name || name.trim().length < 2) {
      throw new CustomError('Team name must be at least 2 characters long', 400);
    }
    if (name.length > 255) {
      throw new CustomError('Team name cannot be longer than 255 characters', 400);
    }
  }

  // Update
  const updateFields = [];
  const updateValues = [];

  if (name !== undefined) {
    updateFields.push('name = ?');
    updateValues.push(name.trim());
  }

  if (description !== undefined) {
    updateFields.push('description = ?');
    updateValues.push(description || null);
  }

  if (is_active !== undefined) {
    updateFields.push('is_active = ?');
    updateValues.push(is_active);
  }

  if (updateFields.length > 0) {
    updateFields.push('updated_at = NOW()');
    updateValues.push(teamId);

    await database.query(
      `UPDATE teams SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Audit log
    await logAuditEvent(
      userId,
      'update_team',
      'teams',
      teamId,
      {
        old_name: team.name,
        new_name: name,
        description: description,
        is_active: is_active
      },
      ipAddress,
      userAgent
    );
  }

  // Fetch updated team data
  const updatedTeam = await getTeamById(teamId, userId);
  return updatedTeam;
};

/**
 * Delete a team
 * @param {number} teamId - Team ID
 * @param {number} userId - User ID
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User Agent
 * @param {Object} options - Deletion options
 * @param {boolean} options.force - Force delete even with active resources
 */
const deleteTeam = async (teamId, userId, ipAddress, userAgent, options = {}) => {
  const { force = false } = options;

  // Check team existence and permissions
  const team = await getTeamById(teamId, userId);
  if (!team) {
    throw new CustomError('Team not found or no permission', 404);
  }

  // Only owner can delete
  if (team.user_role !== 'owner') {
    throw new CustomError('Only team owner can delete the team', 403);
  }

  // Check active resources
  const activeResources = await checkTeamActiveResources(teamId);
  if (activeResources.hasActiveResources && !force) {
    const error = new CustomError(`Cannot delete team - ${activeResources.total} active resources found. Sources: ${activeResources.sources}, Targets: ${activeResources.targets}, Routes: ${activeResources.routes}, Events: ${activeResources.events}, Deliveries: ${activeResources.deliveries}`, 400);
    error.details = activeResources;
    throw error;
  }

  // Delete within a transaction
  await database.transaction(async (connection) => {
    if (force && activeResources.hasActiveResources) {
      // Cascading delete for force deletion
      await deleteTeamResources(teamId, connection);
    }

    // First delete team members
    await connection.execute('DELETE FROM team_members WHERE team_id = ?', [teamId]);

    // Then the team
    await connection.execute('DELETE FROM teams WHERE id = ?', [teamId]);
  });

  // Audit log
  await logAuditEvent(
    userId,
    force ? 'force_delete_team' : 'delete_team',
    'teams',
    teamId,
    {
      team_name: team.name,
      member_count: team.member_count,
      force_delete: force,
      deleted_resources: activeResources
    },
    ipAddress,
    userAgent
  );
};

/**
 * Add a team member
 * @param {number} teamId - Team ID
 * @param {number} targetUserId - ID of the user to add
 * @param {string} role - Role (member, admin)
 * @param {number} currentUserId - Current user ID
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User Agent
 * @returns {Object} Created team member data
 */
const addTeamMember = async (teamId, targetUserId, role, currentUserId, ipAddress, userAgent) => {
  // Input validation
  if (!teamId || !Number.isInteger(teamId) || teamId < 1) {
    throw new CustomError('Valid team ID required', 400);
  }

  if (!targetUserId || !Number.isInteger(targetUserId) || targetUserId < 1) {
    throw new CustomError('Valid user ID required', 400);
  }

  if (!currentUserId || !Number.isInteger(currentUserId) || currentUserId < 1) {
    throw new CustomError('Valid current user ID required', 400);
  }

  // Check team existence and permissions
  const team = await getTeamById(teamId, currentUserId);
  if (!team) {
    throw new CustomError('Team not found or no permission', 404);
  }

  // Only owner and admin can add members
  if (!['owner', 'admin'].includes(team.user_role)) {
    throw new CustomError('No permission to add members', 403);
  }

  // Validate role
  const validRoles = ['member', 'admin'];
  if (!role || !validRoles.includes(role)) {
    throw new CustomError('Invalid role. Choose: member, admin', 400);
  }

  // Only owner can grant admin role
  if (role === 'admin' && team.user_role !== 'owner') {
    throw new CustomError('Only team owner can grant admin role', 403);
  }

  try {
    // Check if target user exists
    const targetUsers = await database.query(
      'SELECT id, username, email, is_active FROM users WHERE id = ?',
      [targetUserId]
    );

    if (targetUsers.length === 0) {
      throw new CustomError('User not found', 404);
    }

    const targetUser = targetUsers[0];

    if (!targetUser.is_active) {
      throw new CustomError('Cannot add inactive user to team', 400);
    }

    // Check existing membership
    const existingMembers = await database.query(
      'SELECT id, role, is_active FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, targetUserId]
    );

    if (existingMembers.length > 0) {
      const existingMember = existingMembers[0];
      if (existingMember.is_active) {
        throw new CustomError(`User (${targetUser.username}) is already a member of the team with ${existingMember.role} role`, 409);
      } else {
        // Reactivation
        await database.query(
          'UPDATE team_members SET role = ?, is_active = TRUE, updated_at = NOW() WHERE id = ?',
          [role, existingMember.id]
        );

        await logAuditEvent(
          currentUserId,
          'reactivate_team_member',
          'team_members',
          existingMember.id,
          {
            team_id: teamId,
            team_name: team.name,
            target_user_id: targetUserId,
            role: role,
            username: targetUser.username,
            old_role: existingMember.role
          },
          ipAddress,
          userAgent
        );

        return await getTeamMemberById(existingMember.id);
      }
    }

    // Add new member within a transaction
    const result = await database.transaction(async (connection) => {
      const [memberResult] = await connection.execute(
        `INSERT INTO team_members (team_id, user_id, role, joined_at)
         VALUES (?, ?, ?, NOW())`,
        [teamId, targetUserId, role]
      );

      return memberResult.insertId;
    });

    // Audit log
    await logAuditEvent(
      currentUserId,
      'add_team_member',
      'team_members',
      result,
      {
        team_id: teamId,
        team_name: team.name,
        target_user_id: targetUserId,
        role: role,
        username: targetUser.username,
        email: targetUser.email
      },
      ipAddress,
      userAgent
    );

    // Fetch created member data
    const member = await getTeamMemberById(result);
    return member;

  } catch (error) {
    // Handle database-specific errors
    if (error.code === 'ER_DUP_ENTRY') {
      throw new CustomError('User is already a member of the team', 409);
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      throw new CustomError('Invalid team or user identifier', 400);
    }

    // Re-throw CustomErrors
    if (error instanceof CustomError) {
      throw error;
    }

    // Other errors
    console.error('Team member addition error:', error);
    throw new CustomError('An error occurred while adding member. Please try again.', 500);
  }
};

/**
 * Remove a team member
 * @param {number} teamId - Team ID
 * @param {number} targetUserId - ID of the user to remove
 * @param {number} currentUserId - Current user ID
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User Agent
 */
const removeTeamMember = async (teamId, targetUserId, currentUserId, ipAddress, userAgent) => {
  // Check team existence and permissions
  const team = await getTeamById(teamId, currentUserId);
  if (!team) {
    throw new CustomError('Team not found or no permission', 404);
  }

  // Anyone can remove themselves, otherwise only owner and admin
  if (targetUserId !== currentUserId && !['owner', 'admin'].includes(team.user_role)) {
    throw new CustomError('No permission to remove members', 403);
  }

  // Check membership
  const members = await database.query(
    `SELECT tm.id, tm.role, u.username
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.is_active = TRUE`,
    [teamId, targetUserId]
  );

  if (members.length === 0) {
    throw new CustomError('User is not a member of the team', 404);
  }

  const member = members[0];

  // Owner cannot remove themselves if they are the only owner
  if (member.role === 'owner' && targetUserId === currentUserId) {
    const ownerCount = await database.query(
      'SELECT COUNT(*) as count FROM team_members WHERE team_id = ? AND role = "owner" AND is_active = TRUE',
      [teamId]
    );

    if (ownerCount[0].count <= 1) {
      throw new CustomError('The only owner cannot remove themselves from the team. First designate another owner.', 400);
    }
  }

  // Only owner can remove an admin
  if (member.role === 'admin' && targetUserId !== currentUserId && team.user_role !== 'owner') {
    throw new CustomError('Only team owner can remove admin members', 403);
  }

  // Remove member (soft delete)
  await database.query(
    'UPDATE team_members SET is_active = FALSE, updated_at = NOW() WHERE id = ?',
    [member.id]
  );

  // Audit log
  await logAuditEvent(
    currentUserId,
    'remove_team_member',
    'team_members',
    member.id,
    {
      team_id: teamId,
      target_user_id: targetUserId,
      target_role: member.role,
      username: member.username,
      self_removal: targetUserId === currentUserId
    },
    ipAddress,
    userAgent
  );
};

/**
 * Update team member role
 * @param {number} teamId - Team ID
 * @param {number} targetUserId - User ID
 * @param {string} newRole - New role
 * @param {number} currentUserId - Current user ID
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User Agent
 * @returns {Object} Updated member data
 */
const updateTeamMemberRole = async (teamId, targetUserId, newRole, currentUserId, ipAddress, userAgent) => {
  // Check team existence and permissions
  const team = await getTeamById(teamId, currentUserId);
  if (!team) {
    throw new CustomError('Team not found or no permission', 404);
  }

  // Only owner can modify roles
  if (team.user_role !== 'owner') {
    throw new CustomError('Only team owner can modify roles', 403);
  }

  // Validate role
  const validRoles = ['member', 'admin', 'owner'];
  if (!validRoles.includes(newRole)) {
    throw new CustomError('Invalid role. Choose: member, admin, owner', 400);
  }

  // Check membership
  const members = await database.query(
    `SELECT tm.id, tm.role, u.username
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.is_active = TRUE`,
    [teamId, targetUserId]
  );

  if (members.length === 0) {
    throw new CustomError('User is not a member of the team', 404);
  }

  const member = members[0];

  // Modifying own role requires special handling
  if (targetUserId === currentUserId && member.role === 'owner') {
    // Owner can only change their own role if there is another owner
    if (newRole !== 'owner') {
      const ownerCount = await database.query(
        'SELECT COUNT(*) as count FROM team_members WHERE team_id = ? AND role = "owner" AND is_active = TRUE',
        [teamId]
      );

      if (ownerCount[0].count <= 1) {
        throw new CustomError('The only owner cannot modify their own role. First designate another owner.', 400);
      }
    }
  }

  // If already the same role
  if (member.role === newRole) {
    throw new CustomError(`User already has ${newRole} role`, 400);
  }

  // Update role
  await database.query(
    'UPDATE team_members SET role = ?, updated_at = NOW() WHERE id = ?',
    [newRole, member.id]
  );

  // Audit log
  await logAuditEvent(
    currentUserId,
    'update_team_member_role',
    'team_members',
    member.id,
    {
      team_id: teamId,
      target_user_id: targetUserId,
      old_role: member.role,
      new_role: newRole,
      username: member.username
    },
    ipAddress,
    userAgent
  );

  // Fetch updated member data
  const updatedMember = await getTeamMemberById(member.id);
  return updatedMember;
};

/**
 * Get team by ID
 * @param {number} teamId - Team ID
 * @param {number} userId - User ID (for permission check)
 * @returns {Object} Team data
 */
const getTeamById = async (teamId, userId) => {
  const teams = await database.query(
    `SELECT t.id, t.name, t.description, t.created_by_user_id, t.is_active,
            t.created_at, t.updated_at,
            u.username as created_by_username,
            COUNT(tm.id) as member_count,
            tm_current.role as user_role
     FROM teams t
     LEFT JOIN users u ON t.created_by_user_id = u.id
     LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.is_active = TRUE
     LEFT JOIN team_members tm_current ON t.id = tm_current.team_id AND tm_current.user_id = ? AND tm_current.is_active = TRUE
     WHERE t.id = ? AND (t.created_by_user_id = ? OR tm_current.id IS NOT NULL)
     GROUP BY t.id, tm_current.role`,
    [userId, teamId, userId]
  );

  return teams.length > 0 ? teams[0] : null;
};

/**
 * Get team member by ID
 * @param {number} memberId - Team member ID
 * @returns {Object} Team member data
 */
const getTeamMemberById = async (memberId) => {
  const members = await database.query(
    `SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.is_active, tm.joined_at,
            u.username, u.email, u.full_name,
            t.name as team_name
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     JOIN teams t ON tm.team_id = t.id
     WHERE tm.id = ?`,
    [memberId]
  );

  return members.length > 0 ? members[0] : null;
};

/**
 * Get user's teams
 * @param {number} userId - User ID
 * @returns {Array} List of teams
 */
const getUserTeams = async (userId) => {
  const teams = await database.query(
    `SELECT t.id, t.name, t.description, t.is_active, t.created_at,
            tm.role, tm.joined_at,
            COUNT(tm_all.id) as member_count
     FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     LEFT JOIN team_members tm_all ON t.id = tm_all.team_id AND tm_all.is_active = TRUE
     WHERE tm.user_id = ? AND tm.is_active = TRUE AND t.is_active = TRUE
     GROUP BY t.id, tm.role, tm.joined_at
     ORDER BY tm.joined_at DESC`,
    [userId]
  );

  return teams;
};

/**
 * Get all teams (admin)
 * @param {Object} options - Query options
 * @param {number} options.limit - Limit
 * @param {number} options.offset - Offset
 * @param {boolean} options.includeInactive - Include inactive teams
 * @returns {Array} List of teams
 */
const getAllTeams = async (options = {}) => {
  const { limit = 50, offset = 0, includeInactive = false } = options;

  let whereClause = '';
  if (!includeInactive) {
    whereClause = 'WHERE t.is_active = TRUE';
  }

  const teams = await database.query(
    `SELECT t.id, t.name, t.description, t.created_by_user_id, t.is_active,
            t.created_at, t.updated_at,
            u.username as created_by_username,
            (SELECT COUNT(*) FROM team_members WHERE team_id = t.id AND is_active = TRUE) as member_count,
            (SELECT COUNT(*) FROM sources WHERE team_id = t.id AND visibility = 'team') as sources_count,
            (SELECT COUNT(*) FROM targets WHERE team_id = t.id AND visibility = 'team') as targets_count,
            (SELECT COUNT(*) FROM routes WHERE team_id = t.id AND visibility = 'team') as routes_count
     FROM teams t
     LEFT JOIN users u ON t.created_by_user_id = u.id
     ${whereClause}
     GROUP BY t.id
     ORDER BY t.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`
  );

  return teams;
};

/**
 * Get team members
 * @param {number} teamId - Team ID
 * @param {number} userId - User ID (for permission check)
 * @param {boolean} includeInactive - Include inactive members
 * @returns {Array} List of members
 */
const getTeamMembers = async (teamId, userId, includeInactive = false) => {
  // Check permissions
  const team = await getTeamById(teamId, userId);
  if (!team) {
    throw new CustomError('Team not found or no permission', 404);
  }

  let whereClause = 'WHERE tm.team_id = ?';
  const params = [teamId];

  if (!includeInactive) {
    whereClause += ' AND tm.is_active = TRUE';
  }

  const members = await database.query(
    `SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.is_active, tm.joined_at, tm.updated_at,
            u.username, u.email, u.full_name, u.is_active as user_active
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     ${whereClause}
     ORDER BY tm.role DESC, tm.joined_at ASC`,
    params
  );

  return members;
};

/**
 * Check team's active resources
 * @param {number} teamId - Team ID
 * @returns {Object} Active resources information
 */
const checkTeamActiveResources = async (teamId) => {
  const [counts] = await database.query(
    `SELECT
      (SELECT COUNT(*) FROM sources WHERE team_id = ? AND visibility = 'team') as sources_count,
      (SELECT COUNT(*) FROM targets WHERE team_id = ? AND visibility = 'team') as targets_count,
      (SELECT COUNT(*) FROM routes WHERE team_id = ? AND visibility = 'team') as routes_count,
      (SELECT COUNT(*) FROM events WHERE team_id = ? AND visibility = 'team') as events_count,
      (SELECT COUNT(*) FROM deliveries WHERE team_id = ? AND visibility = 'team') as deliveries_count`,
    [teamId, teamId, teamId, teamId, teamId]
  );

  const totalCount = counts.sources_count + counts.targets_count + counts.routes_count + counts.events_count + counts.deliveries_count;

  return {
    hasActiveResources: totalCount > 0,
    sources: counts.sources_count,
    targets: counts.targets_count,
    routes: counts.routes_count,
    events: counts.events_count,
    deliveries: counts.deliveries_count,
    total: totalCount
  };
};

/**
 * Get team statistics
 * @param {number} teamId - Team ID
 * @param {number} userId - User ID
 * @returns {Object} Statistics
 */
const getTeamStatistics = async (teamId, userId) => {
  // Check permissions
  const team = await getTeamById(teamId, userId);
  if (!team) {
    throw new CustomError('Team not found or no permission', 404);
  }

  const activeResources = await checkTeamActiveResources(teamId);

  // Delivery statistics
  const [deliveryStats] = await database.query(
    `SELECT
      COUNT(*) as total_deliveries,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful_deliveries,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_deliveries
     FROM deliveries
     WHERE team_id = ?`,
    [teamId]
  );

  return {
    team: {
      id: team.id,
      name: team.name,
      member_count: team.member_count
    },
    resources: activeResources,
    deliveries: {
      total: deliveryStats.total_deliveries || 0,
      successful: deliveryStats.successful_deliveries || 0,
      failed: deliveryStats.failed_deliveries || 0,
      success_rate: deliveryStats.total_deliveries > 0 ?
        Math.round((deliveryStats.successful_deliveries / deliveryStats.total_deliveries) * 100) : 0
    }
  };
};

/**
 * Delete team resources (for force delete)
 * @param {number} teamId - Team ID
 * @param {Object} connection - Database transaction connection
 */
const deleteTeamResources = async (teamId, connection) => {
  // Deletion order: deliveries -> events -> routes -> targets, sources
  // (Due to foreign key constraints)

  await connection.execute('DELETE FROM deliveries WHERE team_id = ? AND visibility = "team"', [teamId]);
  await connection.execute('DELETE FROM events WHERE team_id = ? AND visibility = "team"', [teamId]);
  await connection.execute('DELETE FROM routes WHERE team_id = ? AND visibility = "team"', [teamId]);
  await connection.execute('DELETE FROM targets WHERE team_id = ? AND visibility = "team"', [teamId]);
  await connection.execute('DELETE FROM sources WHERE team_id = ? AND visibility = "team"', [teamId]);
};

/**
 * Check team name availability
 * @param {string} name - Team name
 * @param {number} excludeTeamId - Team ID to exclude (when updating)
 * @returns {boolean} Whether the name is available
 */
const isTeamNameAvailable = async (name, excludeTeamId = null) => {
  let query = 'SELECT COUNT(*) as count FROM teams WHERE name = ?';
  const params = [name];

  if (excludeTeamId) {
    query += ' AND id != ?';
    params.push(excludeTeamId);
  }

  const [result] = await database.query(query, params);
  return result.count === 0;
};

module.exports = {
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  getTeamById,
  getTeamMemberById,
  getUserTeams,
  getAllTeams,
  getTeamMembers,
  checkTeamActiveResources,
  deleteTeamResources,
  getTeamStatistics,
  isTeamNameAvailable
};