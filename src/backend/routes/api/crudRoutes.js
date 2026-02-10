const express = require('express');
const router = express.Router();

const { requireUser, auditLog } = require('../../middleware/rbac');
const crudController = require('../../controllers/crudController');

// Sources CRUD
router.get('/sources', requireUser(), crudController.getSources);
router.get('/sources/:id', [requireUser(), ...crudController.idValidation], crudController.getSource);
router.get('/sources/:id/delete-check', [requireUser(), ...crudController.idValidation], crudController.checkSourceDeletion);
router.post('/sources', [requireUser(), ...crudController.sourceValidation, auditLog('create_source', 'sources')], crudController.createSource);
router.put('/sources/:id', [requireUser(), ...crudController.idValidation, ...crudController.sourceValidation, auditLog('update_source', 'sources')], crudController.updateSource);
router.delete('/sources/:id', [requireUser(), ...crudController.idValidation, auditLog('delete_source', 'sources')], crudController.deleteSource);

// Targets CRUD
router.get('/targets', requireUser(), crudController.getTargets);
router.get('/targets/:id', [requireUser(), ...crudController.idValidation], crudController.getTarget);
router.post('/targets', [requireUser(), ...crudController.targetValidation, auditLog('create_target', 'targets')], crudController.createTarget);
router.put('/targets/:id', [requireUser(), ...crudController.idValidation, ...crudController.targetValidation, auditLog('update_target', 'targets')], crudController.updateTarget);
router.delete('/targets/:id', [requireUser(), ...crudController.idValidation, auditLog('delete_target', 'targets')], crudController.deleteTarget);

// Routes CRUD
router.get('/routes', requireUser(), crudController.getRoutes);
router.get('/routes/:id', [requireUser(), ...crudController.idValidation], crudController.getRoute);
router.post('/routes', [requireUser(), ...crudController.routeValidation, auditLog('create_route', 'routes')], crudController.createRoute);
router.put('/routes/:id', [requireUser(), ...crudController.idValidation, ...crudController.routeValidation, auditLog('update_route', 'routes')], crudController.updateRoute);
router.delete('/routes/:id', [requireUser(), ...crudController.idValidation, auditLog('delete_route', 'routes')], crudController.deleteRoute);

module.exports = router;
