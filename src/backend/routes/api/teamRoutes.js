const express = require('express');
const router = express.Router();

const { requireAdmin, requireUser, auditLog } = require('../../middleware/rbac');
const teamController = require('../../controllers/teamController');
const { body, param } = require('express-validator');

/**
 * Admin Team Management Routes
 */
router.get('/admin/teams', [
  requireAdmin(),
  ...teamController.queryValidation,
  auditLog('view_all_teams', 'teams')
], teamController.getAllTeams);

router.post('/admin/teams', [
  requireAdmin(),
  ...teamController.teamValidation,
  auditLog('create_team', 'teams')
], teamController.createTeam);

router.get('/admin/teams/:id', [
  requireAdmin(),
  ...teamController.idValidation,
  auditLog('view_team_details', 'teams')
], teamController.getTeamDetails);

router.put('/admin/teams/:id', [
  requireAdmin(),
  ...teamController.idValidation,
  ...teamController.teamValidation,
  auditLog('update_team', 'teams')
], teamController.updateTeam);

router.delete('/admin/teams/:id', [
  requireAdmin(),
  ...teamController.idValidation,
  auditLog('delete_team', 'teams')
], teamController.deleteTeam);

router.get('/admin/teams/:id/check-deletion', [
  requireAdmin(),
  ...teamController.idValidation
], teamController.checkTeamDeletion);

router.get('/admin/teams/:id/members', [
  requireAdmin(),
  ...teamController.idValidation,
  ...teamController.queryValidation,
  auditLog('view_team_members', 'team_members')
], teamController.getTeamMembers);

router.post('/admin/teams/:id/members', [
  requireAdmin(),
  ...teamController.idValidation,
  body('user_id').isInt({ min: 1 }).withMessage('Valid user ID is required'),
  body('role').optional().isIn(['member', 'admin', 'owner']).withMessage('Role must be member, admin, or owner'),
  auditLog('add_team_member', 'team_members')
], teamController.addTeamMember);

router.delete('/admin/teams/:id/members/:userId', [
  requireAdmin(),
  ...teamController.idValidation,
  param('userId').isInt({ min: 1 }).withMessage('Valid user ID is required'),
  auditLog('remove_team_member', 'team_members')
], teamController.removeTeamMember);

router.put('/admin/teams/:id/members/:userId', [
  requireAdmin(),
  ...teamController.idValidation,
  param('userId').isInt({ min: 1 }).withMessage('Valid user ID is required'),
  body('role').isIn(['member', 'admin', 'owner']).withMessage('Role must be member, admin, or owner'),
  auditLog('update_team_member_role', 'team_members')
], teamController.updateTeamMemberRole);

router.get('/admin/teams/:id/statistics', [
  requireAdmin(),
  ...teamController.idValidation
], teamController.getTeamStatistics);

/**
 * User Team Routes
 */
router.get('/teams/my', requireUser(), teamController.getMyTeams);

router.get('/teams/:id', [
  requireUser(),
  ...teamController.idValidation
], teamController.getMyTeamDetails);

router.get('/teams/:id/members', [
  requireUser(),
  ...teamController.idValidation
], teamController.getMyTeamMembers);

router.post('/teams/:id/leave', [
  requireUser(),
  ...teamController.idValidation,
  auditLog('leave_team', 'team_members')
], teamController.leaveTeam);

router.get('/teams/check-name/:name', [
  requireUser(),
  param('name').isLength({ min: 2, max: 255 }).withMessage('Team name must be 2-255 characters')
], teamController.checkTeamNameAvailability);

module.exports = router;
