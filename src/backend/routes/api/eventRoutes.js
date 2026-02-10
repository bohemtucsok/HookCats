const express = require('express');
const router = express.Router();

const { query, param } = require('express-validator');
const database = require('../../config/database');

// GET /api/events
router.get('/events', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  query('source_id').optional().isInt({ min: 1 }).withMessage('Source ID must be positive')
], async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, source_id } = req.query;
    const userId = req.user.id;

    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
    const offsetNum = Math.max(0, parseInt(offset) || 0);

    let whereClause = 'WHERE e.created_by_user_id = ?';
    const params = [userId];

    if (source_id && !isNaN(parseInt(source_id))) {
      whereClause += ' AND e.source_id = ?';
      params.push(parseInt(source_id));
    }

    const events = await database.query(
      `SELECT e.id, e.source_id, e.event_type, e.payload_json, e.visibility, e.team_id,
              e.created_by_user_id, e.received_at, e.processed_at,
              s.name as source_name, s.type as source_type
       FROM events e
       LEFT JOIN sources s ON e.source_id = s.id
       ${whereClause}
       ORDER BY e.received_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
});

// GET /api/events/stats
router.get('/events/stats', [
  query('range').optional().isIn(['24h', '7d', '30d']).withMessage('Range must be 24h, 7d, or 30d')
], async (req, res, next) => {
  try {
    const { range = '7d' } = req.query;
    const userId = req.user.id;

    let dateInterval, groupByFormat, dateFormat;
    switch (range) {
      case '24h':
        dateInterval = 'INTERVAL 24 HOUR';
        groupByFormat = '%Y-%m-%d %H:00:00';
        dateFormat = '%H:00';
        break;
      case '30d':
        dateInterval = 'INTERVAL 30 DAY';
        groupByFormat = '%Y-%m-%d';
        dateFormat = '%m-%d';
        break;
      case '7d':
      default:
        dateInterval = 'INTERVAL 7 DAY';
        groupByFormat = '%Y-%m-%d';
        dateFormat = '%m-%d';
    }

    const stats = await database.query(
      `SELECT
        DATE_FORMAT(received_at, '${groupByFormat}') as period,
        DATE_FORMAT(received_at, '${dateFormat}') as label,
        COUNT(*) as count
       FROM events
       WHERE created_by_user_id = ?
         AND received_at >= DATE_SUB(NOW(), ${dateInterval})
       GROUP BY period, label
       ORDER BY period ASC`,
      [userId]
    );

    const statusStats = await database.query(
      `SELECT
        DATE_FORMAT(e.received_at, '${groupByFormat}') as period,
        DATE_FORMAT(e.received_at, '${dateFormat}') as label,
        COUNT(CASE WHEN d.status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN d.status = 'failed' THEN 1 END) as failed_count
       FROM events e
       LEFT JOIN deliveries d ON e.id = d.event_id
       WHERE e.created_by_user_id = ?
         AND e.received_at >= DATE_SUB(NOW(), ${dateInterval})
       GROUP BY period, label
       ORDER BY period ASC`,
      [userId]
    );

    res.json({ success: true, data: { range, events: stats, deliveries: statusStats } });
  } catch (error) {
    next(error);
  }
});

// GET /api/events/:id
router.get('/events/:id', [
  param('id').isInt({ min: 1 }).withMessage('Event ID must be a positive integer')
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const events = await database.query(`
      SELECT e.id, e.source_id, e.event_type, e.payload_json, e.visibility, e.team_id,
             e.created_by_user_id, e.received_at, e.processed_at,
             s.name as source_name, s.type as source_type
      FROM events e
      LEFT JOIN sources s ON e.source_id = s.id
      WHERE e.id = ? AND e.created_by_user_id = ?
    `, [id, userId]);

    if (events.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found or access denied' });
    }

    const event = events[0];
    try { event.payload_json = JSON.parse(event.payload_json); } catch (_e) { /* keep as string */ }

    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/events/:id
router.delete('/events/:id', [
  param('id').isInt({ min: 1 }).withMessage('Event ID must be a positive integer')
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const events = await database.query(
      'SELECT id, created_by_user_id FROM events WHERE id = ? AND created_by_user_id = ?',
      [id, userId]
    );

    if (events.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found or access denied' });
    }

    await database.query('DELETE FROM events WHERE id = ?', [id]);

    res.json({ success: true, data: { message: 'Event deleted successfully', id: parseInt(id) } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
