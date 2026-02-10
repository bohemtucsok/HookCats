const express = require('express');
const publicRouter = express.Router();
const protectedRouter = express.Router();

const { authenticateToken } = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/rbac');
const authController = require('../../controllers/authController');
const settingsController = require('../../controllers/settingsController');

/**
 * Public routes (no auth required)
 */
publicRouter.post('/login', authController.loginValidation, authController.login);
publicRouter.post('/users', authController.createUserValidation, authController.createUser);
publicRouter.get('/sso/config', settingsController.getSSOConfig);
publicRouter.get('/sso/callback', settingsController.handleSSOCallback);

// Debug endpoint (has own auth middleware)
publicRouter.get('/debug-tables', authenticateToken, requireAdmin(), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: 'Endpoint not available in production' });
  }
  try {
    const database = require('../../config/database');
    const [tables] = await database.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('teams', 'team_members')
    `);
    const [sourceColumns] = await database.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sources'
      AND COLUMN_NAME IN ('visibility', 'team_id', 'shared_at')
    `);
    res.json({
      success: true,
      data: {
        team_tables_exist: tables.map(t => t.TABLE_NAME),
        source_visibility_columns: sourceColumns.map(c => c.COLUMN_NAME),
        team_tables_missing: ['teams', 'team_members'].filter(t =>
          !tables.some(existing => existing.TABLE_NAME === t)
        )
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Protected profile routes (require auth - applied by main router)
 */
protectedRouter.get('/me', authController.getCurrentUser);
protectedRouter.get('/users/me', authController.getCurrentUser);
protectedRouter.get('/profile', authController.getProfile);
protectedRouter.put('/profile/username', authController.changeUsernameValidation, authController.changeUsername);
protectedRouter.put('/profile/password', authController.changePasswordValidation, authController.changePassword);
protectedRouter.put('/profile/language', authController.changeLanguage);

module.exports = { publicRouter, protectedRouter };
