const express = require('express');
const router = express.Router();

const database = require('../../config/database');

// GET /api/health/database
router.get('/health/database', async (req, res, next) => {
  try {
    const isHealthy = await database.healthCheck();
    res.json({
      success: true,
      data: { database: isHealthy ? 'connected' : 'disconnected', timestamp: new Date().toISOString() }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/stats
router.get('/dashboard/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [sourcesCount] = await database.query(
      'SELECT COUNT(*) as count FROM sources WHERE created_by_user_id = ? OR (visibility = "team" AND team_id IS NOT NULL)',
      [userId]
    );
    const [targetsCount] = await database.query(
      'SELECT COUNT(*) as count FROM targets WHERE created_by_user_id = ? OR (visibility = "team" AND team_id IS NOT NULL)',
      [userId]
    );
    const [routesCount] = await database.query(
      'SELECT COUNT(*) as count FROM routes WHERE created_by_user_id = ? OR (visibility = "team" AND team_id IS NOT NULL)',
      [userId]
    );
    const [eventsCount] = await database.query(
      'SELECT COUNT(*) as count FROM events WHERE created_by_user_id = ? OR (visibility = "team" AND team_id IS NOT NULL)',
      [userId]
    );
    const [deliveriesCount] = await database.query(
      'SELECT COUNT(*) as count FROM deliveries WHERE created_by_user_id = ? OR (visibility = "team" AND team_id IS NOT NULL)',
      [userId]
    );
    const [deliveryStats] = await database.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM deliveries
       WHERE created_by_user_id = ? OR (visibility = "team" AND team_id IS NOT NULL)`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        sources: sourcesCount.count || 0,
        targets: targetsCount.count || 0,
        routes: routesCount.count || 0,
        events: eventsCount.count || 0,
        deliveries: deliveriesCount.count || 0,
        deliveryStats: {
          total: deliveryStats.total || 0,
          successful: deliveryStats.successful || 0,
          failed: deliveryStats.failed || 0,
          successRate: deliveryStats.total > 0 ?
            Math.round((deliveryStats.successful / deliveryStats.total) * 100) : 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/recent-events
router.get('/dashboard/recent-events', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limitNum = Math.max(1, Math.min(50, parseInt(req.query.limit) || 10));

    const eventCount = await database.query('SELECT COUNT(*) as count FROM events');
    if (eventCount[0].count === 0) {
      return res.json({ success: true, data: [] });
    }

    const events = await database.query(
      `SELECT
        e.id, e.event_type, e.received_at, e.processed_at,
        s.name as source_name, s.type as source_type
       FROM events e
       LEFT JOIN sources s ON e.source_id = s.id
       WHERE e.created_by_user_id = ? OR (e.visibility = "team" AND e.team_id IS NOT NULL)
       ORDER BY e.received_at DESC
       LIMIT ${limitNum}`,
      [userId]
    );

    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
