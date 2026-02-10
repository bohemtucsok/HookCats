const { body, param, query, validationResult } = require('express-validator');
const database = require('../config/database');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');

/**
 * Scope-aware CRUD controller for sources, targets, routes, events, and deliveries
 * Handles both personal and team scoped resources with proper access control
 */

// Whitelist for allowed resource table names (SQL injection prevention)
const ALLOWED_RESOURCE_TYPES = ['sources', 'targets', 'routes', 'events', 'deliveries'];

const validateResourceType = (resourceType) => {
  if (!ALLOWED_RESOURCE_TYPES.includes(resourceType)) {
    throw new CustomError(`Invalid resource type: ${resourceType}`, 400);
  }
};

// Validation rules for scope-based resources
const scopeValidation = [
  body('scope')
    .isIn(['personal', 'team'])
    .withMessage('Scope must be personal or team'),

  body('team_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Team ID must be a positive integer')
    .custom((value, { req }) => {
      if (req.body.scope === 'team' && !value) {
        throw new Error('Team ID is required for team scope');
      }
      if (req.body.scope === 'personal' && value) {
        throw new Error('Team ID should not be provided for personal scope');
      }
      return true;
    })
];

// Validation rules for sources (without scope validation)
const sourceValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .isIn(['synology', 'proxmox', 'proxmox_backup', 'gitlab', 'docker_updater', 'media-webhook', 'uptime-kuma', 'generic'])
    .withMessage('Type must be synology, proxmox, proxmox_backup, gitlab, docker_updater, media-webhook, uptime-kuma or generic'),

  body('secret_key')
    .optional()
    .isLength({ min: 8, max: 255 })
    .withMessage('Secret key must be between 8 and 255 characters'),

  ...scopeValidation
];

// Validation rules for sources (without scope - for team/personal endpoints)
const sourceValidationNoScope = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .isIn(['synology', 'proxmox', 'proxmox_backup', 'gitlab', 'docker_updater', 'media-webhook', 'uptime-kuma', 'generic'])
    .withMessage('Type must be synology, proxmox, proxmox_backup, gitlab, docker_updater, media-webhook, uptime-kuma or generic'),

  body('secret_key')
    .optional()
    .isLength({ min: 8, max: 255 })
    .withMessage('Secret key must be between 8 and 255 characters')
];

// Validation rules for targets (without scope validation)
const targetValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .isIn(['mattermost', 'rocketchat', 'webhook'])
    .withMessage('Type must be mattermost, rocketchat or webhook'),

  body('webhook_url')
    .isURL()
    .withMessage('Webhook URL format is invalid'),

  ...scopeValidation
];

// Validation rules for targets (without scope - for team/personal endpoints)
const targetValidationNoScope = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .isIn(['mattermost', 'rocketchat', 'webhook'])
    .withMessage('Type must be mattermost, rocketchat or webhook'),

  body('webhook_url')
    .isURL()
    .withMessage('Webhook URL format is invalid')
];

// Validation rules for routes (without scope validation)
const routeValidation = [
  body('source_id')
    .isInt({ min: 1 })
    .withMessage('Source ID must be a positive integer'),

  body('target_id')
    .isInt({ min: 1 })
    .withMessage('Target ID must be a positive integer'),

  body('message_template')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Message template can be maximum 2000 characters'),

  ...scopeValidation
];

// Validation rules for routes (without scope - for team/personal endpoints)
const routeValidationNoScope = [
  body('source_id')
    .isInt({ min: 1 })
    .withMessage('Source ID must be a positive integer'),

  body('target_id')
    .isInt({ min: 1 })
    .withMessage('Target ID must be a positive integer'),

  body('message_template')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Message template can be maximum 2000 characters')
];

// Validation rules for events (without scope - for team/personal endpoints)
const eventValidationNoScope = [
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset cannot be negative'),
  query('source_id').optional().isInt({ min: 1 }).withMessage('Source ID must be a positive integer'),
  query('event_type').optional().isString().withMessage('Event type must be a string')
];

// Validation rules for deliveries (without scope - for team/personal endpoints)
const deliveryValidationNoScope = [
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset cannot be negative'),
  query('status').optional().isIn(['pending', 'sent', 'failed']).withMessage('Status must be pending, sent or failed'),
  query('target_id').optional().isInt({ min: 1 }).withMessage('Target ID must be a positive integer')
];

// ID parameter validation
const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
];

/**
 * Build WHERE clause for scope-based queries
 * @param {string} scope - 'personal' or 'team'
 * @param {number} userId - User ID
 * @param {number|null} teamId - Team ID for team scope
 * @param {string} tableAlias - Table alias (optional)
 * @returns {Object} - {whereClause, params}
 */
const buildScopeWhereClause = (scope, userId, teamId = null, tableAlias = '') => {
  const prefix = tableAlias ? `${tableAlias}.` : '';

  if (scope === 'personal') {
    return {
      whereClause: `${prefix}created_by_user_id = ? AND ${prefix}visibility = 'personal'`,
      params: [userId]
    };
  } else if (scope === 'team' && teamId) {
    return {
      whereClause: `${prefix}team_id = ? AND ${prefix}visibility = 'team'`,
      params: [teamId]
    };
  } else {
    throw new CustomError('Invalid scope or missing team ID', 400);
  }
};

/**
 * PERSONAL SCOPE CONTROLLERS
 */

// GET /api/personal/sources
const getPersonalSources = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { whereClause, params } = buildScopeWhereClause('personal', userId);

  const sources = await database.query(
    `SELECT id, name, type, secret_key, webhook_secret, visibility, team_id, created_by_user_id, created_at
     FROM sources
     WHERE ${whereClause}
     ORDER BY created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: sources,
    meta: {
      scope: 'personal',
      total: sources.length
    }
  });
});

// GET /api/personal/targets
const getPersonalTargets = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { whereClause, params } = buildScopeWhereClause('personal', userId);

  const targets = await database.query(
    `SELECT id, name, type, webhook_url, visibility, team_id, created_by_user_id, created_at
     FROM targets
     WHERE ${whereClause}
     ORDER BY created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: targets,
    meta: {
      scope: 'personal',
      total: targets.length
    }
  });
});

// GET /api/personal/routes
const getPersonalRoutes = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { whereClause, params } = buildScopeWhereClause('personal', userId, null, 'r');

  const routes = await database.query(
    `SELECT r.id, r.source_id, r.target_id, r.message_template, r.visibility, r.team_id,
            r.created_by_user_id, r.created_at,
            s.name as source_name, s.type as source_type,
            t.name as target_name, t.type as target_type
     FROM routes r
     JOIN sources s ON r.source_id = s.id
     JOIN targets t ON r.target_id = t.id
     WHERE ${whereClause}
     ORDER BY r.created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: routes,
    meta: {
      scope: 'personal',
      total: routes.length
    }
  });
});

// GET /api/personal/events
const getPersonalEvents = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, source_id } = req.query;

  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
  const offsetNum = Math.max(0, parseInt(offset) || 0);

  const { whereClause: baseWhereE, params } = buildScopeWhereClause('personal', userId, null, 'e');
  let whereClause = baseWhereE;

  if (source_id && !isNaN(parseInt(source_id))) {
    whereClause += ' AND e.source_id = ?';
    params.push(parseInt(source_id));
  }

  const events = await database.query(
    `SELECT e.id, e.source_id, e.event_type, e.payload_json, e.visibility, e.team_id,
            e.created_by_user_id, e.received_at, e.processed_at,
            s.name as source_name, s.type as source_type
     FROM events e
     LEFT JOIN sources s ON e.source_id = s.id
     WHERE ${whereClause}
     ORDER BY e.received_at DESC
     LIMIT ${limitNum} OFFSET ${offsetNum}`,
    params
  );

  res.json({
    success: true,
    data: events,
    meta: {
      scope: 'personal',
      total: events.length,
      limit: limitNum,
      offset: offsetNum
    }
  });
});

// GET /api/personal/deliveries
const getPersonalDeliveries = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, status } = req.query;

  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
  const offsetNum = Math.max(0, parseInt(offset) || 0);

  const { whereClause: baseWhereD, params } = buildScopeWhereClause('personal', userId, null, 'd');
  let whereClause = baseWhereD;

  if (status && ['pending', 'sent', 'failed'].includes(status)) {
    whereClause += ' AND d.status = ?';
    params.push(status);
  }

  const deliveries = await database.query(
    `SELECT d.id, d.event_id, d.target_id, d.status, d.attempts, d.last_error,
            d.visibility, d.team_id, d.created_by_user_id, d.sent_at, d.created_at,
            t.name as target_name, t.type as target_type,
            e.event_type, s.name as source_name
     FROM deliveries d
     JOIN targets t ON d.target_id = t.id
     JOIN events e ON d.event_id = e.id
     JOIN sources s ON e.source_id = s.id
     WHERE ${whereClause}
     ORDER BY d.sent_at DESC
     LIMIT ${limitNum} OFFSET ${offsetNum}`,
    params
  );

  res.json({
    success: true,
    data: deliveries,
    meta: {
      scope: 'personal',
      total: deliveries.length,
      limit: limitNum,
      offset: offsetNum
    }
  });
});

/**
 * TEAM SCOPE CONTROLLERS
 */

// GET /api/team/:teamId/sources
const getTeamSources = asyncHandler(async (req, res) => {
  const teamId = parseInt(req.params.teamId);

  const { whereClause, params } = buildScopeWhereClause('team', null, teamId);

  const sources = await database.query(
    `SELECT id, name, type, secret_key, webhook_secret, visibility, team_id, created_by_user_id, created_at
     FROM sources
     WHERE ${whereClause}
     ORDER BY created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: sources,
    meta: {
      scope: 'team',
      team_id: teamId,
      total: sources.length
    }
  });
});

// GET /api/team/:teamId/targets
const getTeamTargets = asyncHandler(async (req, res) => {
  const teamId = parseInt(req.params.teamId);

  const { whereClause, params } = buildScopeWhereClause('team', null, teamId);

  const targets = await database.query(
    `SELECT id, name, type, webhook_url, visibility, team_id, created_by_user_id, created_at
     FROM targets
     WHERE ${whereClause}
     ORDER BY created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: targets,
    meta: {
      scope: 'team',
      team_id: teamId,
      total: targets.length
    }
  });
});

// GET /api/team/:teamId/routes
const getTeamRoutes = asyncHandler(async (req, res) => {
  const teamId = parseInt(req.params.teamId);

  const { whereClause, params } = buildScopeWhereClause('team', null, teamId, 'r');

  const routes = await database.query(
    `SELECT r.id, r.source_id, r.target_id, r.message_template, r.visibility, r.team_id,
            r.created_by_user_id, r.created_at,
            s.name as source_name, s.type as source_type,
            t.name as target_name, t.type as target_type
     FROM routes r
     JOIN sources s ON r.source_id = s.id
     JOIN targets t ON r.target_id = t.id
     WHERE ${whereClause}
     ORDER BY r.created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: routes,
    meta: {
      scope: 'team',
      team_id: teamId,
      total: routes.length
    }
  });
});

// GET /api/team/:teamId/events
const getTeamEvents = asyncHandler(async (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const { limit = 50, offset = 0, source_id } = req.query;

  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
  const offsetNum = Math.max(0, parseInt(offset) || 0);

  const { whereClause: baseWhereTE, params } = buildScopeWhereClause('team', null, teamId, 'e');
  let whereClause = baseWhereTE;

  if (source_id && !isNaN(parseInt(source_id))) {
    whereClause += ' AND e.source_id = ?';
    params.push(parseInt(source_id));
  }

  const events = await database.query(
    `SELECT e.id, e.source_id, e.event_type, e.payload_json, e.visibility, e.team_id,
            e.created_by_user_id, e.received_at, e.processed_at,
            s.name as source_name, s.type as source_type
     FROM events e
     LEFT JOIN sources s ON e.source_id = s.id
     WHERE ${whereClause}
     ORDER BY e.received_at DESC
     LIMIT ${limitNum} OFFSET ${offsetNum}`,
    params
  );

  res.json({
    success: true,
    data: events,
    meta: {
      scope: 'team',
      team_id: teamId,
      total: events.length,
      limit: limitNum,
      offset: offsetNum
    }
  });
});

// GET /api/team/:teamId/deliveries
const getTeamDeliveries = asyncHandler(async (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const { limit = 50, offset = 0, status } = req.query;

  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
  const offsetNum = Math.max(0, parseInt(offset) || 0);

  const { whereClause: baseWhereTD, params } = buildScopeWhereClause('team', null, teamId, 'd');
  let whereClause = baseWhereTD;

  if (status && ['pending', 'sent', 'failed'].includes(status)) {
    whereClause += ' AND d.status = ?';
    params.push(status);
  }

  const deliveries = await database.query(
    `SELECT d.id, d.event_id, d.target_id, d.status, d.attempts, d.last_error,
            d.visibility, d.team_id, d.created_by_user_id, d.sent_at, d.created_at,
            t.name as target_name, t.type as target_type,
            e.event_type, s.name as source_name
     FROM deliveries d
     JOIN targets t ON d.target_id = t.id
     JOIN events e ON d.event_id = e.id
     JOIN sources s ON e.source_id = s.id
     WHERE ${whereClause}
     ORDER BY d.sent_at DESC
     LIMIT ${limitNum} OFFSET ${offsetNum}`,
    params
  );

  res.json({
    success: true,
    data: deliveries,
    meta: {
      scope: 'team',
      team_id: teamId,
      total: deliveries.length,
      limit: limitNum,
      offset: offsetNum
    }
  });
});

/**
 * GENERIC SCOPE-AWARE CRUD OPERATIONS
 */

// CREATE resource with scope validation
const createScopedResource = (resourceType) => {
  validateResourceType(resourceType);
  return asyncHandler(async (req, res) => {
    // Automatically set scope and team_id based on URL
    if (req.route.path.includes('/team/:teamId/')) {
      req.body.scope = 'team';
      req.body.team_id = parseInt(req.params.teamId);
    } else if (req.route.path.includes('/personal/')) {
      req.body.scope = 'personal';
      req.body.team_id = null;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: req.t('validation.failed'),
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { scope, team_id, ...resourceData } = req.body;

    const insertData = {
      ...resourceData,
      visibility: scope,
      team_id: scope === 'team' ? team_id : null,
      created_by_user_id: userId
    };

    // Generate secret key for sources if not provided
    if (resourceType === 'sources' && !insertData.secret_key) {
      insertData.secret_key = require('crypto').randomBytes(32).toString('hex');
    }

    // Build insert query dynamically
    const columns = Object.keys(insertData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(insertData);

    const result = await database.query(
      `INSERT INTO ${resourceType} (${columns.join(', ')}, created_at)
       VALUES (${placeholders}, NOW())`,
      values
    );

    // Fetch the created resource
    const created = await database.query(
      `SELECT * FROM ${resourceType} WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: created[0],
      meta: {
        scope: scope,
        team_id: scope === 'team' ? team_id : null
      }
    });
  });
};

// GET single resource with scope validation
const getScopedResource = (resourceType) => {
  validateResourceType(resourceType);
  return asyncHandler(async (req, res) => {
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
    const userRole = req.user.role;

    // Admin access or scope-based access
    let whereClause, params;

    if (userRole === 'admin') {
      whereClause = 'id = ?';
      params = [id];
    } else {
      // Build access check for user's personal and team resources
      const userTeams = await database.query(
        'SELECT team_id FROM team_members WHERE user_id = ? AND is_active = TRUE',
        [userId]
      );
      const teamIds = userTeams.map(t => t.team_id);

      if (teamIds.length > 0) {
        const teamPlaceholders = teamIds.map(() => '?').join(', ');
        whereClause = `id = ? AND (
          (created_by_user_id = ? AND visibility = 'personal') OR
          (team_id IN (${teamPlaceholders}) AND visibility = 'team')
        )`;
        params = [id, userId, ...teamIds];
      } else {
        whereClause = 'id = ? AND created_by_user_id = ? AND visibility = "personal"';
        params = [id, userId];
      }
    }

    const resources = await database.query(
      `SELECT * FROM ${resourceType} WHERE ${whereClause}`,
      params
    );

    if (resources.length === 0) {
      throw new CustomError(req.t('scope.resource_not_found_or_no_access'), 404);
    }

    res.json({
      success: true,
      data: resources[0]
    });
  });
};

// UPDATE resource with scope validation
const updateScopedResource = (resourceType) => {
  validateResourceType(resourceType);
  return asyncHandler(async (req, res) => {
    // Automatically set scope and team_id based on URL
    if (req.route.path.includes('/team/:teamId/')) {
      req.body.scope = 'team';
      req.body.team_id = parseInt(req.params.teamId);
    } else if (req.route.path.includes('/personal/')) {
      req.body.scope = 'personal';
      req.body.team_id = null;
    }

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
    const { scope, team_id, ...resourceData } = req.body;

    // Check if resource exists and user has access
    const existing = await database.query(
      `SELECT id, created_by_user_id, visibility, team_id FROM ${resourceType} WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      throw new CustomError(req.t('scope.resource_not_found'), 404);
    }

    const resource = existing[0];

    // Only owner can update (or admin)
    if (req.user.role !== 'admin' && resource.created_by_user_id !== userId) {
      throw new CustomError(req.t('scope.only_owner_can_modify'), 403);
    }

    const updateData = {
      ...resourceData,
      visibility: scope,
      team_id: scope === 'team' ? team_id : null
    };

    // Build update query dynamically
    const updates = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updateData), id];

    await database.query(
      `UPDATE ${resourceType} SET ${updates} WHERE id = ?`,
      values
    );

    // Fetch updated resource
    const updated = await database.query(
      `SELECT * FROM ${resourceType} WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updated[0],
      meta: {
        scope: scope,
        team_id: scope === 'team' ? team_id : null
      }
    });
  });
};

// DELETE resource with scope validation
const deleteScopedResource = (resourceType) => {
  validateResourceType(resourceType);
  return asyncHandler(async (req, res) => {
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

    // Check if resource exists and user has access
    const existing = await database.query(
      `SELECT id, created_by_user_id, visibility, team_id FROM ${resourceType} WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      throw new CustomError(req.t('scope.resource_not_found'), 404);
    }

    const resource = existing[0];

    // Only owner can delete (or admin)
    if (req.user.role !== 'admin' && resource.created_by_user_id !== userId) {
      throw new CustomError(req.t('scope.only_owner_can_delete'), 403);
    }

    // Check for dependencies before deletion
    if (resourceType === 'sources') {
      const routes = await database.query(
        'SELECT COUNT(*) as count FROM routes WHERE source_id = ?',
        [id]
      );
      if (routes[0].count > 0) {
        throw new CustomError(req.t('scope.routes_in_use'), 400);
      }
    } else if (resourceType === 'targets') {
      const routes = await database.query(
        'SELECT COUNT(*) as count FROM routes WHERE target_id = ?',
        [id]
      );
      if (routes[0].count > 0) {
        throw new CustomError(req.t('scope.routes_in_use'), 400);
      }
    }

    await database.query(`DELETE FROM ${resourceType} WHERE id = ?`, [id]);

    res.json({
      success: true,
      data: {
        message: req.t('scope.resource_deleted'),
        id: parseInt(id)
      }
    });
  });
};

// RETRY delivery with scope validation
const retryScopedDelivery = asyncHandler(async (req, res) => {
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
  const isTeamScope = req.route.path.includes('/team/:teamId/');
  const teamId = isTeamScope ? parseInt(req.params.teamId) : null;

  // Check if delivery exists and user has access
  let whereClause, params;

  if (isTeamScope && teamId) {
    whereClause = 'WHERE d.id = ? AND d.team_id = ? AND d.visibility = "team"';
    params = [id, teamId];
  } else {
    whereClause = 'WHERE d.id = ? AND d.created_by_user_id = ? AND d.visibility = "personal"';
    params = [id, userId];
  }

  const deliveries = await database.query(`
    SELECT d.*, t.webhook_url, t.type as target_type, e.payload_json, e.event_type
    FROM deliveries d
    JOIN targets t ON d.target_id = t.id
    JOIN events e ON d.event_id = e.id
    ${whereClause}
  `, params);

  if (deliveries.length === 0) {
    throw new CustomError(req.t('deliveries.not_found_or_no_access'), 404);
  }

  const delivery = deliveries[0];

  // Check if delivery can be retried
  if (delivery.status === 'sent') {
    throw new CustomError(req.t('deliveries.cannot_retry_sent'), 400);
  }

  if (delivery.attempts >= 3) {
    throw new CustomError(req.t('deliveries.max_retries_reached'), 400);
  }

  try {
    const axios = require('axios');
    let payload;

    // Parse original payload
    try {
      payload = JSON.parse(delivery.payload_json);
    } catch (_e) {
      payload = { message: delivery.payload_json };
    }

    // Format payload based on target type
    if (delivery.target_type === 'mattermost') {
      payload = {
        text: payload.message || JSON.stringify(payload),
        username: 'HookCats Bot'
      };
    } else if (delivery.target_type === 'rocketchat') {
      payload = {
        text: payload.message || JSON.stringify(payload),
        alias: 'HookCats Bot'
      };
    }

    // Attempt delivery
    const response = await axios.post(delivery.webhook_url, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HookCats/1.0'
      }
    });

    // Update delivery status - successful
    await database.query(`
      UPDATE deliveries
      SET status = 'sent', attempts = attempts + 1, last_error = NULL, sent_at = NOW()
      WHERE id = ?
    `, [id]);

    res.json({
      success: true,
      data: {
        message: req.t('deliveries.resent'),
        id: parseInt(id),
        status: 'sent',
        attempts: delivery.attempts + 1,
        response_status: response.status
      }
    });

  } catch (error) {
    // Update delivery status - failed
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';

    await database.query(`
      UPDATE deliveries
      SET status = 'failed', attempts = attempts + 1, last_error = ?, sent_at = NOW()
      WHERE id = ?
    `, [errorMessage, id]);

    res.status(400).json({
      success: false,
      error: req.t('deliveries.resend_failed'),
      details: {
        id: parseInt(id),
        status: 'failed',
        attempts: delivery.attempts + 1,
        error: errorMessage,
        response_status: error.response?.status
      }
    });
  }
});

module.exports = {
  // Personal scope controllers
  getPersonalSources,
  getPersonalTargets,
  getPersonalRoutes,
  getPersonalEvents,
  getPersonalDeliveries,

  // Team scope controllers
  getTeamSources,
  getTeamTargets,
  getTeamRoutes,
  getTeamEvents,
  getTeamDeliveries,

  // Generic scope-aware CRUD
  createScopedResource,
  getScopedResource,
  updateScopedResource,
  deleteScopedResource,
  retryScopedDelivery,

  // Validation rules
  sourceValidation,
  targetValidation,
  routeValidation,
  sourceValidationNoScope,
  targetValidationNoScope,
  routeValidationNoScope,
  eventValidationNoScope,
  deliveryValidationNoScope,
  idValidation,
  scopeValidation,

  // Utility functions
  buildScopeWhereClause
};