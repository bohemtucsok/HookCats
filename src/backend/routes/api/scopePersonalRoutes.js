const express = require('express');
const router = express.Router();

const { requireUser, requirePersonalAccess, auditLog } = require('../../middleware/rbac');
const scopeController = require('../../controllers/scopeController');
const crudController = require('../../controllers/crudController');

// Sources - Personal
router.get('/personal/sources', [requireUser(), requirePersonalAccess()], scopeController.getPersonalSources);
router.get('/personal/sources/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation], scopeController.getScopedResource('sources'));
router.post('/personal/sources', [requireUser(), requirePersonalAccess(), ...scopeController.sourceValidationNoScope, auditLog('create_personal_source', 'sources')], scopeController.createScopedResource('sources'));
router.put('/personal/sources/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, ...scopeController.sourceValidationNoScope, auditLog('update_personal_source', 'sources')], scopeController.updateScopedResource('sources'));
router.get('/personal/sources/:id/delete-check', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation], crudController.checkSourceDeletion);
router.delete('/personal/sources/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, auditLog('delete_personal_source', 'sources')], scopeController.deleteScopedResource('sources'));

// Targets - Personal
router.get('/personal/targets', [requireUser(), requirePersonalAccess()], scopeController.getPersonalTargets);
router.get('/personal/targets/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation], scopeController.getScopedResource('targets'));
router.post('/personal/targets', [requireUser(), requirePersonalAccess(), ...scopeController.targetValidationNoScope, auditLog('create_personal_target', 'targets')], scopeController.createScopedResource('targets'));
router.put('/personal/targets/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, ...scopeController.targetValidationNoScope, auditLog('update_personal_target', 'targets')], scopeController.updateScopedResource('targets'));
router.delete('/personal/targets/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, auditLog('delete_personal_target', 'targets')], scopeController.deleteScopedResource('targets'));

// Routes - Personal
router.get('/personal/routes', [requireUser(), requirePersonalAccess()], scopeController.getPersonalRoutes);
router.get('/personal/routes/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation], scopeController.getScopedResource('routes'));
router.post('/personal/routes', [requireUser(), requirePersonalAccess(), ...scopeController.routeValidationNoScope, auditLog('create_personal_route', 'routes')], scopeController.createScopedResource('routes'));
router.put('/personal/routes/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, ...scopeController.routeValidationNoScope, auditLog('update_personal_route', 'routes')], scopeController.updateScopedResource('routes'));
router.delete('/personal/routes/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, auditLog('delete_personal_route', 'routes')], scopeController.deleteScopedResource('routes'));

// Events - Personal
router.get('/personal/events', [requireUser(), requirePersonalAccess(), ...scopeController.eventValidationNoScope], scopeController.getPersonalEvents);
router.get('/personal/events/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation], scopeController.getScopedResource('events'));
router.delete('/personal/events/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, auditLog('delete_personal_event', 'events')], scopeController.deleteScopedResource('events'));

// Deliveries - Personal
router.get('/personal/deliveries', [requireUser(), requirePersonalAccess(), ...scopeController.deliveryValidationNoScope], scopeController.getPersonalDeliveries);
router.get('/personal/deliveries/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation], scopeController.getScopedResource('deliveries'));
router.post('/personal/deliveries/:id/retry', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, auditLog('retry_personal_delivery', 'deliveries')], scopeController.retryScopedDelivery);
router.delete('/personal/deliveries/:id', [requireUser(), requirePersonalAccess(), ...scopeController.idValidation, auditLog('delete_personal_delivery', 'deliveries')], scopeController.deleteScopedResource('deliveries'));

module.exports = router;
