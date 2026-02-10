const express = require('express');
const router = express.Router();

const { query, param, body } = require('express-validator');
const database = require('../../config/database');

// GET /api/deliveries
router.get('/deliveries', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  query('status').optional().isIn(['pending', 'sent', 'failed']).withMessage('Status must be pending, sent, or failed')
], async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    const userId = req.user.id;

    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
    const offsetNum = Math.max(0, parseInt(offset) || 0);

    let whereClause = 'WHERE d.created_by_user_id = ?';
    const params = [userId];

    if (status) {
      whereClause += ' AND d.status = ?';
      params.push(status);
    }

    const deliveries = await database.query(
      `SELECT d.id, d.event_id, d.target_id, d.status, d.attempts, d.last_error,
              d.visibility, d.team_id, d.created_by_user_id, d.sent_at,
              t.name as target_name, t.type as target_type,
              e.event_type, s.name as source_name
       FROM deliveries d
       JOIN targets t ON d.target_id = t.id
       JOIN events e ON d.event_id = e.id
       JOIN sources s ON e.source_id = s.id
       ${whereClause}
       ORDER BY d.sent_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    res.json({ success: true, data: deliveries });
  } catch (error) {
    next(error);
  }
});

// POST /api/test-delivery/:targetId
router.post('/test-delivery/:targetId', [
  body('message').optional().isString().withMessage('Message must be a string'),
  body('event_type').optional().isString().withMessage('Event type must be a string')
], async (req, res, next) => {
  try {
    const { targetId } = req.params;
    const { message = 'Test message from webhook server', event_type = 'test' } = req.body;
    const userId = req.user.id;

    const targets = await database.query(
      'SELECT id, name, type, webhook_url FROM targets WHERE id = ? AND (created_by_user_id = ? OR (visibility = "team" AND team_id IS NOT NULL))',
      [targetId, userId]
    );

    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Target not found or access denied' });
    }

    const target = targets[0];
    const testPayload = { message, event_type, timestamp: new Date().toISOString(), test: true };
    const axios = require('axios');

    try {
      let payload;
      if (target.type === 'mattermost') {
        payload = { text: message, username: 'Webhook Test Bot' };
      } else if (target.type === 'rocketchat') {
        payload = { text: message, alias: 'Webhook Test Bot' };
      } else {
        payload = testPayload;
      }

      const response = await axios.post(target.webhook_url, payload, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'HookCats-Test/1.0' }
      });

      res.json({
        success: true,
        data: {
          message: 'Test delivery sent successfully',
          target: { id: target.id, name: target.name, type: target.type },
          response: { status: response.status, statusText: response.statusText }
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Test delivery failed',
        details: { message: error.message, status: error.response?.status, statusText: error.response?.statusText }
      });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/deliveries/:id
router.get('/deliveries/:id', [
  param('id').isInt({ min: 1 }).withMessage('Delivery ID must be a positive integer')
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deliveries = await database.query(`
      SELECT d.id, d.event_id, d.target_id, d.status, d.attempts, d.last_error,
             d.visibility, d.team_id, d.created_by_user_id, d.sent_at, d.created_at,
             t.name as target_name, t.type as target_type, t.webhook_url,
             e.event_type, e.payload_json, s.name as source_name
      FROM deliveries d
      JOIN targets t ON d.target_id = t.id
      JOIN events e ON d.event_id = e.id
      JOIN sources s ON e.source_id = s.id
      WHERE d.id = ? AND d.created_by_user_id = ?
    `, [id, userId]);

    if (deliveries.length === 0) {
      return res.status(404).json({ success: false, error: 'Delivery not found or access denied' });
    }

    const delivery = deliveries[0];
    try { delivery.payload_json = JSON.parse(delivery.payload_json); } catch (_e) { /* keep as string */ }

    res.json({ success: true, data: delivery });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/deliveries/:id
router.delete('/deliveries/:id', [
  param('id').isInt({ min: 1 }).withMessage('Delivery ID must be a positive integer')
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deliveries = await database.query(
      'SELECT id, created_by_user_id FROM deliveries WHERE id = ? AND created_by_user_id = ?',
      [id, userId]
    );

    if (deliveries.length === 0) {
      return res.status(404).json({ success: false, error: 'Delivery not found or access denied' });
    }

    await database.query('DELETE FROM deliveries WHERE id = ?', [id]);

    res.json({ success: true, data: { message: 'Delivery deleted successfully', id: parseInt(id) } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
