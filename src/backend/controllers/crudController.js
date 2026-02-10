const { body, param, validationResult } = require('express-validator');
const database = require('../config/database');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');

/**
 * Generic CRUD controller for sources, targets, and routes
 */

// Validation rules for sources
const sourceValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .isIn(['synology', 'proxmox', 'proxmox_backup', 'gitlab', 'docker_updater', 'media-webhook', 'uptime-kuma', 'generic'])
    .withMessage('Type must be one of: synology, proxmox, proxmox_backup, gitlab, docker_updater, media-webhook, uptime-kuma, generic'),

  body('secret_key')
    .optional()
    .isLength({ min: 8, max: 255 })
    .withMessage('Secret key must be between 8 and 255 characters'),

  body('visibility')
    .optional()
    .isIn(['personal', 'team'])
    .withMessage('Visibility must be personal or team'),

  body('team_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Team ID must be a positive integer')
];

// Validation rules for targets
const targetValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .isIn(['mattermost', 'rocketchat', 'webhook'])
    .withMessage('Type must be one of: mattermost, rocketchat, webhook'),

  body('webhook_url')
    .isURL()
    .withMessage('Webhook URL must be a valid URL'),

  body('visibility')
    .optional()
    .isIn(['personal', 'team'])
    .withMessage('Visibility must be personal or team'),

  body('team_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Team ID must be a positive integer')
];

// Validation rules for routes
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
    .withMessage('Message template must not exceed 2000 characters'),

  body('visibility')
    .optional()
    .isIn(['personal', 'team'])
    .withMessage('Visibility must be personal or team'),

  body('team_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Team ID must be a positive integer')
];

// ID parameter validation
const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
];

/**
 * SOURCES CRUD
 */

// GET /api/sources
const getSources = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const sources = await database.query(
    `SELECT s.id, s.name, s.type, s.secret_key, s.webhook_secret, s.visibility, s.team_id, s.created_by_user_id, s.created_at
     FROM sources s
     WHERE s.created_by_user_id = ?
        OR (s.visibility = 'team' AND s.team_id IN (
          SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
        ))
     ORDER BY s.created_at DESC`,
    [userId, userId]
  );

  res.json({
    success: true,
    data: sources
  });
});

// GET /api/sources/:id
const getSource = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  const sources = await database.query(
    `SELECT id, name, type, secret_key, webhook_secret, visibility, team_id, created_by_user_id, created_at
     FROM sources
     WHERE id = ? AND (created_by_user_id = ? OR (visibility = 'team' AND team_id IN (
       SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
     )))`,
    [id, userId, userId]
  );

  if (sources.length === 0) {
    throw new CustomError('Source not found', 404);
  }

  res.json({
    success: true,
    data: sources[0]
  });
});

// POST /api/sources
const createSource = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name, type, secret_key, webhook_secret, visibility = 'personal', team_id } = req.body;
  const userId = req.user.id;

  // Generate secret key if not provided
  const finalSecretKey = secret_key || require('crypto').randomBytes(32).toString('hex');

  const result = await database.query(
    `INSERT INTO sources (name, type, secret_key, webhook_secret, visibility, team_id, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [name, type, finalSecretKey, webhook_secret || null, visibility, team_id || null, userId]
  );

  const createdSource = await database.query(
    'SELECT id, name, type, secret_key, webhook_secret, visibility, team_id, created_by_user_id, created_at FROM sources WHERE id = ?',
    [result.insertId]
  );

  res.status(201).json({
    success: true,
    data: createdSource[0]
  });
});

// PUT /api/sources/:id
const updateSource = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { name, type, secret_key, webhook_secret, visibility, team_id } = req.body;
  const userId = req.user.id;

  // Check if source exists and user has permission
  const sources = await database.query(
    'SELECT id FROM sources WHERE id = ? AND created_by_user_id = ?',
    [id, userId]
  );

  if (sources.length === 0) {
    throw new CustomError('Source not found or access denied', 404);
  }

  await database.query(
    `UPDATE sources
     SET name = ?, type = ?, secret_key = ?, webhook_secret = ?, visibility = ?, team_id = ?
     WHERE id = ?`,
    [name, type, secret_key, webhook_secret || null, visibility || 'personal', team_id || null, id]
  );

  const updatedSource = await database.query(
    'SELECT id, name, type, secret_key, webhook_secret, visibility, team_id, created_by_user_id, created_at FROM sources WHERE id = ?',
    [id]
  );

  res.json({
    success: true,
    data: updatedSource[0]
  });
});

// DELETE /api/sources/:id
const deleteSource = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  // Check if source exists and user has permission
  const sources = await database.query(
    'SELECT id FROM sources WHERE id = ? AND created_by_user_id = ?',
    [id, userId]
  );

  if (sources.length === 0) {
    throw new CustomError('Source not found or access denied', 404);
  }

  // Check if source is used in any routes
  const routes = await database.query(
    `SELECT r.id, r.message_template, t.name as target_name, t.type as target_type
     FROM routes r
     JOIN targets t ON r.target_id = t.id
     WHERE r.source_id = ?`,
    [id]
  );

  if (routes.length > 0) {
    const error = new CustomError('Cannot delete source - it is used in existing routes', 400);
    error.details = {
      connectedRoutes: routes.map(route => ({
        id: route.id,
        targetName: route.target_name,
        targetType: route.target_type,
        messageTemplate: route.message_template
      }))
    };
    throw error;
  }

  await database.query('DELETE FROM sources WHERE id = ?', [id]);

  res.json({
    success: true,
    data: { message: 'Source deleted successfully' }
  });
});

/**
 * Check if source can be deleted and return connected routes
 */
const checkSourceDeletion = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  // Check if source exists and user has access
  const sources = await database.query(
    'SELECT id, name FROM sources WHERE id = ? AND created_by_user_id = ?',
    [id, userId]
  );

  if (sources.length === 0) {
    throw new CustomError('Source not found or access denied', 404);
  }

  const source = sources[0];

  // Get connected routes with detailed information
  const routes = await database.query(
    `SELECT r.id, r.message_template, t.name as target_name, t.type as target_type
     FROM routes r
     JOIN targets t ON r.target_id = t.id
     WHERE r.source_id = ?`,
    [id]
  );

  res.json({
    success: true,
    data: {
      canDelete: routes.length === 0,
      source: source,
      connectedRoutes: routes.map(route => ({
        id: route.id,
        targetName: route.target_name,
        targetType: route.target_type,
        messageTemplate: route.message_template
      }))
    }
  });
});

/**
 * TARGETS CRUD
 */

// GET /api/targets
const getTargets = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const targets = await database.query(
    `SELECT id, name, type, webhook_url, visibility, team_id, created_by_user_id, created_at
     FROM targets
     WHERE created_by_user_id = ?
        OR (visibility = 'team' AND team_id IN (
          SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
        ))
     ORDER BY created_at DESC`,
    [userId, userId]
  );

  res.json({
    success: true,
    data: targets
  });
});

// GET /api/targets/:id
const getTarget = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  const targets = await database.query(
    `SELECT id, name, type, webhook_url, visibility, team_id, created_by_user_id, created_at
     FROM targets
     WHERE id = ? AND (created_by_user_id = ? OR (visibility = 'team' AND team_id IN (
       SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
     )))`,
    [id, userId, userId]
  );

  if (targets.length === 0) {
    throw new CustomError('Target not found', 404);
  }

  res.json({
    success: true,
    data: targets[0]
  });
});

// POST /api/targets
const createTarget = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name, type, webhook_url, visibility = 'personal', team_id } = req.body;
  const userId = req.user.id;

  const result = await database.query(
    `INSERT INTO targets (name, type, webhook_url, visibility, team_id, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [name, type, webhook_url, visibility, team_id || null, userId]
  );

  const createdTarget = await database.query(
    'SELECT id, name, type, webhook_url, visibility, team_id, created_by_user_id, created_at FROM targets WHERE id = ?',
    [result.insertId]
  );

  res.status(201).json({
    success: true,
    data: createdTarget[0]
  });
});

// PUT /api/targets/:id
const updateTarget = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { name, type, webhook_url, visibility, team_id } = req.body;
  const userId = req.user.id;

  // Check if target exists and user has permission
  const targets = await database.query(
    'SELECT id FROM targets WHERE id = ? AND created_by_user_id = ?',
    [id, userId]
  );

  if (targets.length === 0) {
    throw new CustomError('Target not found or access denied', 404);
  }

  await database.query(
    `UPDATE targets
     SET name = ?, type = ?, webhook_url = ?, visibility = ?, team_id = ?
     WHERE id = ?`,
    [name, type, webhook_url, visibility || 'personal', team_id || null, id]
  );

  const updatedTarget = await database.query(
    'SELECT id, name, type, webhook_url, visibility, team_id, created_by_user_id, created_at FROM targets WHERE id = ?',
    [id]
  );

  res.json({
    success: true,
    data: updatedTarget[0]
  });
});

// DELETE /api/targets/:id
const deleteTarget = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  // Check if target exists and user has permission
  const targets = await database.query(
    'SELECT id FROM targets WHERE id = ? AND created_by_user_id = ?',
    [id, userId]
  );

  if (targets.length === 0) {
    throw new CustomError('Target not found or access denied', 404);
  }

  // Check if target is used in any routes
  const routes = await database.query(
    'SELECT id FROM routes WHERE target_id = ?',
    [id]
  );

  if (routes.length > 0) {
    throw new CustomError('Cannot delete target - it is used in existing routes', 400);
  }

  await database.query('DELETE FROM targets WHERE id = ?', [id]);

  res.json({
    success: true,
    data: { message: 'Target deleted successfully' }
  });
});

/**
 * ROUTES CRUD
 */

// GET /api/routes
const getRoutes = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const routes = await database.query(
    `SELECT r.id, r.source_id, r.target_id, r.message_template, r.visibility, r.team_id,
            r.created_by_user_id, r.created_at,
            s.name as source_name, s.type as source_type,
            t.name as target_name, t.type as target_type
     FROM routes r
     JOIN sources s ON r.source_id = s.id
     JOIN targets t ON r.target_id = t.id
     WHERE r.created_by_user_id = ?
        OR (r.visibility = 'team' AND r.team_id IN (
          SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
        ))
     ORDER BY r.created_at DESC`,
    [userId, userId]
  );

  res.json({
    success: true,
    data: routes
  });
});

// GET /api/routes/:id
const getRoute = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  const routes = await database.query(
    `SELECT r.id, r.source_id, r.target_id, r.message_template, r.visibility, r.team_id,
            r.created_by_user_id, r.created_at,
            s.name as source_name, s.type as source_type,
            t.name as target_name, t.type as target_type
     FROM routes r
     JOIN sources s ON r.source_id = s.id
     JOIN targets t ON r.target_id = t.id
     WHERE r.id = ? AND (r.created_by_user_id = ? OR (r.visibility = 'team' AND r.team_id IN (
       SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
     )))`,
    [id, userId, userId]
  );

  if (routes.length === 0) {
    throw new CustomError('Route not found', 404);
  }

  res.json({
    success: true,
    data: routes[0]
  });
});

// POST /api/routes
const createRoute = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { source_id, target_id, message_template, visibility = 'personal', team_id } = req.body;
  const userId = req.user.id;

  // Verify source and target exist and user has access
  const sources = await database.query(
    `SELECT id FROM sources WHERE id = ? AND (created_by_user_id = ? OR (visibility = 'team' AND team_id IN (
       SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
     )))`,
    [source_id, userId, userId]
  );

  const targets = await database.query(
    `SELECT id FROM targets WHERE id = ? AND (created_by_user_id = ? OR (visibility = 'team' AND team_id IN (
       SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
     )))`,
    [target_id, userId, userId]
  );

  if (sources.length === 0) {
    throw new CustomError('Source not found or access denied', 400);
  }

  if (targets.length === 0) {
    throw new CustomError('Target not found or access denied', 400);
  }

  const result = await database.query(
    `INSERT INTO routes (source_id, target_id, message_template, visibility, team_id, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [source_id, target_id, message_template || null, visibility, team_id || null, userId]
  );

  const createdRoute = await database.query(
    `SELECT r.id, r.source_id, r.target_id, r.message_template, r.visibility, r.team_id,
            r.created_by_user_id, r.created_at,
            s.name as source_name, s.type as source_type,
            t.name as target_name, t.type as target_type
     FROM routes r
     JOIN sources s ON r.source_id = s.id
     JOIN targets t ON r.target_id = t.id
     WHERE r.id = ?`,
    [result.insertId]
  );

  res.status(201).json({
    success: true,
    data: createdRoute[0]
  });
});

// PUT /api/routes/:id
const updateRoute = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { source_id, target_id, message_template, visibility, team_id } = req.body;
  const userId = req.user.id;

  // Check if route exists and user has permission
  const routes = await database.query(
    'SELECT id FROM routes WHERE id = ? AND created_by_user_id = ?',
    [id, userId]
  );

  if (routes.length === 0) {
    throw new CustomError('Route not found or access denied', 404);
  }

  // Verify source and target exist and user has access
  const sources = await database.query(
    `SELECT id FROM sources WHERE id = ? AND (created_by_user_id = ? OR (visibility = 'team' AND team_id IN (
       SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
     )))`,
    [source_id, userId, userId]
  );

  const targets = await database.query(
    `SELECT id FROM targets WHERE id = ? AND (created_by_user_id = ? OR (visibility = 'team' AND team_id IN (
       SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = TRUE
     )))`,
    [target_id, userId, userId]
  );

  if (sources.length === 0) {
    throw new CustomError('Source not found or access denied', 400);
  }

  if (targets.length === 0) {
    throw new CustomError('Target not found or access denied', 400);
  }

  await database.query(
    `UPDATE routes
     SET source_id = ?, target_id = ?, message_template = ?, visibility = ?, team_id = ?
     WHERE id = ?`,
    [source_id, target_id, message_template || null, visibility || 'personal', team_id || null, id]
  );

  const updatedRoute = await database.query(
    `SELECT r.id, r.source_id, r.target_id, r.message_template, r.visibility, r.team_id,
            r.created_by_user_id, r.created_at,
            s.name as source_name, s.type as source_type,
            t.name as target_name, t.type as target_type
     FROM routes r
     JOIN sources s ON r.source_id = s.id
     JOIN targets t ON r.target_id = t.id
     WHERE r.id = ?`,
    [id]
  );

  res.json({
    success: true,
    data: updatedRoute[0]
  });
});

// DELETE /api/routes/:id
const deleteRoute = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const userId = req.user.id;

  // Check if route exists and user has permission
  const routes = await database.query(
    'SELECT id FROM routes WHERE id = ? AND created_by_user_id = ?',
    [id, userId]
  );

  if (routes.length === 0) {
    throw new CustomError('Route not found or access denied', 404);
  }

  await database.query('DELETE FROM routes WHERE id = ?', [id]);

  res.json({
    success: true,
    data: { message: 'Route deleted successfully' }
  });
});

module.exports = {
  // Sources
  getSources,
  getSource,
  createSource,
  updateSource,
  deleteSource,
  checkSourceDeletion,

  // Targets
  getTargets,
  getTarget,
  createTarget,
  updateTarget,
  deleteTarget,

  // Routes
  getRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute,

  // Validation rules
  sourceValidation,
  targetValidation,
  routeValidation,
  idValidation
};