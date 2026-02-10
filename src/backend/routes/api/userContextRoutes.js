const express = require('express');
const router = express.Router();

const { requireUser, auditLog } = require('../../middleware/rbac');
const userContextController = require('../../controllers/userContextController');

router.get('/user/teams', requireUser(), userContextController.getUserTeams);
router.get('/user/context', requireUser(), userContextController.getUserContext);

router.put('/user/active-team', [
  requireUser(),
  ...userContextController.setActiveTeamValidation,
  auditLog('set_active_team', 'users')
], userContextController.setActiveTeam);

router.put('/user/team-preferences', [
  requireUser(),
  ...userContextController.updateTeamPreferencesValidation,
  auditLog('update_team_preferences', 'users')
], userContextController.updateTeamPreferences);

router.get('/user/scope-navigation', requireUser(), userContextController.getScopeNavigation);

module.exports = router;
