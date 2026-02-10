const express = require('express');
const router = express.Router();

const { requireAdmin, auditLog } = require('../../middleware/rbac');
const settingsController = require('../../controllers/settingsController');
const { body } = require('express-validator');

router.get('/settings', requireAdmin(), auditLog('view_settings', 'system_settings'), settingsController.getSettings);
router.get('/settings/:key', requireAdmin(), settingsController.getSetting);

router.put('/settings/:key', [
  requireAdmin(),
  ...settingsController.settingValidation,
  auditLog('update_setting', 'system_settings')
], settingsController.setSetting);

router.put('/settings', [
  requireAdmin(),
  ...settingsController.updateSettingsValidation,
  auditLog('update_multiple_settings', 'system_settings')
], settingsController.updateSettings);

router.delete('/settings/:key', [
  requireAdmin(),
  auditLog('delete_setting', 'system_settings')
], settingsController.deleteSetting);

router.post('/settings/validate/sso', requireAdmin(), settingsController.validateSSO);

router.post('/settings/reset', [
  requireAdmin(),
  body('category').isIn(['sso', 'security']).withMessage('Invalid category'),
  auditLog('reset_settings', 'system_settings')
], settingsController.resetToDefaults);

module.exports = router;
