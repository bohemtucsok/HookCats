const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const i18nMiddleware = require('../middleware/i18nMiddleware');

// Route modules
const { publicRouter, protectedRouter } = require('./api/authRoutes');
const adminRoutes = require('./api/adminRoutes');
const crudRoutes = require('./api/crudRoutes');
const eventRoutes = require('./api/eventRoutes');
const deliveryRoutes = require('./api/deliveryRoutes');
const dashboardRoutes = require('./api/dashboardRoutes');
const settingsRoutes = require('./api/settingsRoutes');
const teamRoutes = require('./api/teamRoutes');
const userContextRoutes = require('./api/userContextRoutes');
const scopePersonalRoutes = require('./api/scopePersonalRoutes');
const scopeTeamRoutes = require('./api/scopeTeamRoutes');

// Public routes (no authentication required)
router.use(publicRouter);

// Authentication middleware - all routes below require valid JWT
router.use(authenticateToken);

// i18n middleware - attaches req.lang and req.t() after auth
router.use(i18nMiddleware);

// Protected routes
router.use(protectedRouter);
router.use(adminRoutes);
router.use(crudRoutes);
router.use(eventRoutes);
router.use(deliveryRoutes);
router.use(dashboardRoutes);
router.use(settingsRoutes);
router.use(teamRoutes);
router.use(userContextRoutes);
router.use(scopePersonalRoutes);
router.use(scopeTeamRoutes);

module.exports = router;
