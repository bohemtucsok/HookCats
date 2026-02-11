const { body, validationResult } = require('express-validator');
const database = require('../config/database');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const EventProcessor = require('../services/eventProcessor');

/**
 * Webhook Controller
 * Handles incoming webhook requests from various sources (Synology, Proxmox)
 */
class WebhookController {
  constructor() {
    this.eventProcessor = new EventProcessor();
  }

  /**
   * Process incoming webhook dynamically based on secret key
   * Endpoint: POST /webhook/:secretKey
   */
  handleDynamicWebhook = asyncHandler(async (req, res) => {
    // Source is already loaded by route middleware
    const source = req.webhookSource;
    if (!source) {
      throw new CustomError('Internal error: source not found', 500);
    }

    // Extract and validate payload
    const payload = this.extractPayload(req);

    // Determine event type based on source type and payload
    const eventType = this.determineEventType(payload, source.type);

    // Save event to database
    const eventId = await this.saveDynamicEvent(source, eventType, payload);

    // Process the event (forward to targets)
    await this.eventProcessor.processEvent(eventId, source, eventType, payload);

    return res.status(200).json({
      success: true,
      data: {
        eventId,
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.type,
        eventType,
        message: 'Webhook processed and forwarded successfully',
        timestamp: new Date().toISOString()
      }
    });
  });

  /**
   * Find source by secret key (database lookup)
   * @param {string} secretKey - Source secret key
   * @returns {Object|null} - Source record or null if not found
   */
  async findSourceBySecretKey(secretKey) {
    try {
      const sources = await database.query(
        'SELECT id, name, type, secret_key, visibility, team_id, created_by_user_id FROM sources WHERE secret_key = ?',
        [secretKey]
      );
      return sources.length > 0 ? sources[0] : null;
    } catch (error) {
      console.error('[WEBHOOK] Error finding source by secret key:', error);
      throw new CustomError('Database error while finding source', 500);
    }
  }

  /**
   * Save event to database (dynamic version)
   * @param {Object} source - Source database record
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {number} - Event ID
   */
  async saveDynamicEvent(source, eventType, payload) {
    try {
      const result = await database.query(
        `INSERT INTO events (source_id, event_type, payload_json, visibility, team_id, created_by_user_id, received_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [source.id, eventType, JSON.stringify(payload), source.visibility, source.team_id, source.created_by_user_id]
      );
      return result.insertId;
    } catch (error) {
      console.error('[WEBHOOK] Error saving dynamic event:', error);
      throw new CustomError('Database error while saving event', 500);
    }
  }

  /**
   * Extract payload from request based on content type
   * @param {Object} req - Express request object
   * @returns {Object} - Parsed payload
   */
  extractPayload(req) {
    const contentType = req.get('Content-Type') || '';

    // Check if query parameters exist (Synology sends ?text=...)
    const hasQueryParams = req.query && Object.keys(req.query).length > 0;
    const hasBody = req.body && (
      typeof req.body === 'string' && req.body.length > 0 ||
      typeof req.body === 'object' && Object.keys(req.body).length > 0
    );

    // Priority: body > query params
    if (hasBody) {
      // Body is already parsed by captureRawBody middleware
      if (typeof req.body === 'object') {
        return req.body;
      } else if (typeof req.body === 'string') {
        return { text: req.body, _contentType: contentType };
      } else {
        return {};
      }
    } else if (hasQueryParams) {
      return req.query;
    } else {
      // Empty payload
      return { text: 'Empty payload', timestamp: new Date().toISOString() };
    }
  }

  /**
   * Determine event type from payload
   * @param {Object} payload - Webhook payload
   * @param {string} sourceType - Source type
   * @returns {string} - Event type
   */
  determineEventType(payload, sourceType) {
    // Ensure payload is valid object
    if (!payload || typeof payload !== 'object') {
      return `${sourceType}_unknown`;
    }

    if (sourceType === 'synology') {
      if (payload.event_type) return payload.event_type;
      if (payload.type) return payload.type;
      if (payload.action) return payload.action;
      if (payload.event) return payload.event;
      return 'synology_event';
    } else if (sourceType === 'proxmox') {
      if (payload.type) return payload.type;
      if (payload.event) return payload.event;
      if (payload.status) return `status_${payload.status}`;
      return 'proxmox_event';
    } else if (sourceType === 'proxmox_backup') {
      if (payload.status) return `backup_${payload.status}`;
      if (payload.type) return payload.type;
      return 'proxmox_backup_event';
    } else if (sourceType === 'gitlab') {
      if (payload.object_kind) return payload.object_kind;
      if (payload.event_name) return payload.event_name;
      if (payload.event_type) return payload.event_type;
      return 'gitlab_event';
    } else if (sourceType === 'uptime-kuma') {
      if (payload.heartbeat && payload.heartbeat.status !== undefined) {
        return payload.heartbeat.status === 1 ? 'monitor_up' : 'monitor_down';
      }
      if (payload.msg) return 'uptime_alert';
      return 'uptime_event';
    } else if (sourceType === 'docker_updater') {
      if (payload.text) return 'container_update';
      if (payload.title) return 'container_update';
      return 'docker_event';
    } else if (sourceType === 'media-webhook') {
      if (payload.text) {
        const text = payload.text.toLowerCase();
        if (text.includes('grabbed') || text.includes('download')) return 'media_download';
        if (text.includes('imported') || text.includes('complete')) return 'media_imported';
        if (text.includes('upgraded')) return 'media_upgraded';
        if (text.includes('deleted')) return 'media_deleted';
        if (text.includes('renamed')) return 'media_renamed';
        if (text.includes('test')) return 'media_test';
      }
      if (payload.username) {
        const username = payload.username.toLowerCase();
        if (username.includes('sonarr')) return 'sonarr_event';
        if (username.includes('radarr')) return 'radarr_event';
        if (username.includes('bazarr')) return 'bazarr_event';
      }
      return 'media_event';
    } else if (sourceType === 'generic') {
      if (payload.event_type) return payload.event_type;
      if (payload.type) return payload.type;
      if (payload.event) return payload.event;
      if (payload.action) return payload.action;
      return 'generic_event';
    }

    return 'unknown_event';
  }

  /**
   * Get source by ID with scope information
   * @param {number} sourceId - Source ID
   * @returns {Object|null} - Source record with scope info
   */
  async getSourceById(sourceId) {
    try {
      const sources = await database.query(
        'SELECT id, name, type, secret_key, visibility, team_id, created_by_user_id FROM sources WHERE id = ?',
        [sourceId]
      );
      return sources.length > 0 ? sources[0] : null;
    } catch (error) {
      console.error('[WEBHOOK] Error finding source by ID:', error);
      throw new CustomError('Database error while finding source', 500);
    }
  }

  /**
   * Validation rules for webhook requests
   * Allow empty body for sources like Synology that send data via query params
   * Support text/plain (Watchtower), JSON, and form-urlencoded
   * RELAXED: Allow empty body (Watchtower sends empty body on initialization)
   */
  getValidationRules() {
    return [
      body().custom((_value, { req }) => {
        return true;
      })
    ];
  }

  /**
   * Validate webhook request
   */
  validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors.array()
      });
    }
    next();
  };
}

// Create singleton instance
const webhookController = new WebhookController();

module.exports = {
  webhookController,
  handleDynamicWebhook: webhookController.handleDynamicWebhook,
  validateWebhookRequest: webhookController.validateRequest,
  getWebhookValidationRules: webhookController.getValidationRules.bind(webhookController)
};
