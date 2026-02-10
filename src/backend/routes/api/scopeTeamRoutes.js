const express = require('express');
const router = express.Router();

const { requireUser, requireScopeTeamAccess, auditLog } = require('../../middleware/rbac');
const scopeController = require('../../controllers/scopeController');
const crudController = require('../../controllers/crudController');

// Sources - Team
router.get('/team/:teamId/sources', [requireUser(), requireScopeTeamAccess('member')], scopeController.getTeamSources);
router.get('/team/:teamId/sources/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation], scopeController.getScopedResource('sources'));
router.post('/team/:teamId/sources', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.sourceValidationNoScope, auditLog('create_team_source', 'sources')], scopeController.createScopedResource('sources'));
router.put('/team/:teamId/sources/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation, ...scopeController.sourceValidationNoScope, auditLog('update_team_source', 'sources')], scopeController.updateScopedResource('sources'));
router.get('/team/:teamId/sources/:id/delete-check', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation], crudController.checkSourceDeletion);
router.delete('/team/:teamId/sources/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation, auditLog('delete_team_source', 'sources')], scopeController.deleteScopedResource('sources'));

// Targets - Team
router.get('/team/:teamId/targets', [requireUser(), requireScopeTeamAccess('member')], scopeController.getTeamTargets);
router.get('/team/:teamId/targets/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation], scopeController.getScopedResource('targets'));
router.post('/team/:teamId/targets', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.targetValidationNoScope, auditLog('create_team_target', 'targets')], scopeController.createScopedResource('targets'));
router.put('/team/:teamId/targets/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation, ...scopeController.targetValidationNoScope, auditLog('update_team_target', 'targets')], scopeController.updateScopedResource('targets'));
router.delete('/team/:teamId/targets/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation, auditLog('delete_team_target', 'targets')], scopeController.deleteScopedResource('targets'));

// Routes - Team
router.get('/team/:teamId/routes', [requireUser(), requireScopeTeamAccess('member')], scopeController.getTeamRoutes);
router.get('/team/:teamId/routes/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation], scopeController.getScopedResource('routes'));
router.post('/team/:teamId/routes', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.routeValidationNoScope, auditLog('create_team_route', 'routes')], scopeController.createScopedResource('routes'));
router.put('/team/:teamId/routes/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation, ...scopeController.routeValidationNoScope, auditLog('update_team_route', 'routes')], scopeController.updateScopedResource('routes'));
router.delete('/team/:teamId/routes/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation, auditLog('delete_team_route', 'routes')], scopeController.deleteScopedResource('routes'));

// Events - Team
router.get('/team/:teamId/events', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.eventValidationNoScope], scopeController.getTeamEvents);
router.get('/team/:teamId/events/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation], scopeController.getScopedResource('events'));
router.delete('/team/:teamId/events/:id', [requireUser(), requireScopeTeamAccess('admin'), ...scopeController.idValidation, auditLog('delete_team_event', 'events')], scopeController.deleteScopedResource('events'));

// Deliveries - Team
router.get('/team/:teamId/deliveries', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.deliveryValidationNoScope], scopeController.getTeamDeliveries);
router.get('/team/:teamId/deliveries/:id', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation], scopeController.getScopedResource('deliveries'));
router.post('/team/:teamId/deliveries/:id/retry', [requireUser(), requireScopeTeamAccess('member'), ...scopeController.idValidation, auditLog('retry_team_delivery', 'deliveries')], scopeController.retryScopedDelivery);
router.delete('/team/:teamId/deliveries/:id', [requireUser(), requireScopeTeamAccess('admin'), ...scopeController.idValidation, auditLog('delete_team_delivery', 'deliveries')], scopeController.deleteScopedResource('deliveries'));

module.exports = router;
