const database = require('../config/database');
const { CustomError } = require('../middleware/errorHandler');
const axios = require('axios');
const ProxmoxBackupFormatter = require('./proxmoxBackupFormatter');
const GitLabFormatter = require('./gitlabFormatter');
const SynologyFormatter = require('./synologyFormatter');
const DockerUpdaterFormatter = require('./dockerUpdaterFormatter');

/**
 * Event Processor Service
 * Handles event processing, routing, and delivery queue management
 */
class EventProcessor {
  constructor() {
    // Configure retry settings
    this.maxRetries = 3;
    this.retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
    this.proxmoxBackupFormatter = new ProxmoxBackupFormatter();
    this.gitlabFormatter = new GitLabFormatter();
    this.synologyFormatter = new SynologyFormatter();
    this.dockerUpdaterFormatter = new DockerUpdaterFormatter();
  }

  /**
   * Process incoming event
   * @param {number} eventId - Event ID
   * @param {Object|number} source - Source object or source ID
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   */
  async processEvent(eventId, source, eventType, payload) {
    try {
      // Handle both source object and source ID
      const sourceId = typeof source === 'object' ? source.id : source;
      const createdByUserId = typeof source === 'object' ? source.created_by_user_id : 1; // fallback to admin user

      console.log(`[EVENT] Processing event ${eventId} from source ${sourceId}`);

      // Find active routes for this source
      const routes = await this.findActiveRoutes(sourceId);

      if (routes.length === 0) {
        console.log(`[EVENT] No active routes found for source ${sourceId}`);
        await this.markEventProcessed(eventId);
        return;
      }

      // Create delivery entries for each route
      const deliveries = [];
      for (const route of routes) {
        const deliveryId = await this.createDelivery(eventId, route.target_id, route, createdByUserId);
        deliveries.push({
          deliveryId,
          route,
          eventId,
          eventType,
          payload
        });
      }

      // Process deliveries asynchronously
      this.processDeliveries(deliveries);

      // Mark event as processed
      await this.markEventProcessed(eventId);

      console.log(`[EVENT] Created ${deliveries.length} deliveries for event ${eventId}`);

    } catch (error) {
      console.error(`[EVENT] Error processing event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Find active routes for a source with scope-aware logic
   * @param {number} sourceId - Source ID
   * @returns {Array} - Array of route objects with target info
   */
  async findActiveRoutes(sourceId) {
    try {
      // First, get the source's scope information
      const sourceResult = await database.query(
        'SELECT visibility, team_id FROM sources WHERE id = ?',
        [sourceId]
      );

      if (sourceResult.length === 0) {
        console.log(`[EVENT] Source ${sourceId} not found`);
        return [];
      }

      const source = sourceResult[0];
      console.log(`[EVENT] Finding routes for source ${sourceId} with scope: ${source.visibility}, team_id: ${source.team_id}`);

      let whereClause;
      let params;

      if (source.visibility === 'team') {
        // For team sources, find team routes with matching team_id
        whereClause = `
          WHERE r.source_id = ?
            AND r.is_active = TRUE
            AND r.visibility = 'team'
            AND r.team_id = ?
            AND t.visibility = 'team'
            AND t.team_id = r.team_id`;
        params = [sourceId, source.team_id];
      } else {
        // For personal sources, find personal routes
        whereClause = `
          WHERE r.source_id = ?
            AND r.is_active = TRUE
            AND r.visibility = 'personal'
            AND t.visibility = 'personal'`;
        params = [sourceId];
      }

      const rows = await database.query(`
        SELECT
          r.id as route_id,
          r.target_id,
          r.message_template,
          r.visibility,
          r.team_id,
          t.name as target_name,
          t.type as target_type,
          t.webhook_url,
          t.visibility as target_visibility,
          t.team_id as target_team_id
        FROM routes r
        INNER JOIN targets t ON r.target_id = t.id
        ${whereClause}
        ORDER BY r.id
      `, params);

      console.log(`[EVENT] Found ${rows.length} active routes for source ${sourceId}`);
      return rows;
    } catch (error) {
      console.error('[EVENT] Error finding routes:', error);
      throw new CustomError('Database error while finding routes', 500);
    }
  }

  /**
   * Create delivery record with proper scope inheritance
   * @param {number} eventId - Event ID
   * @param {number} targetId - Target ID
   * @param {Object} route - Route configuration
   * @param {number} createdByUserId - User ID who created the source
   * @returns {number} - Delivery ID
   */
  async createDelivery(eventId, targetId, _route, _createdByUserId) {
    try {
      // Get event scope information for proper inheritance
      const eventResult = await database.query(
        'SELECT visibility, team_id, created_by_user_id FROM events WHERE id = ?',
        [eventId]
      );

      if (eventResult.length === 0) {
        throw new CustomError('Event not found', 404);
      }

      const event = eventResult[0];

      // Delivery should inherit the event's scope
      const deliveryVisibility = event.visibility;
      const deliveryTeamId = event.team_id;
      const deliveryCreatedBy = event.created_by_user_id;

      console.log(`[EVENT] Creating delivery with inherited scope: visibility=${deliveryVisibility}, team_id=${deliveryTeamId}`);

      const result = await database.query(`
        INSERT INTO deliveries (
          event_id,
          target_id,
          status,
          attempts,
          visibility,
          team_id,
          created_by_user_id,
          created_at
        ) VALUES (?, ?, 'pending', 0, ?, ?, ?, NOW())
      `, [eventId, targetId, deliveryVisibility, deliveryTeamId, deliveryCreatedBy]);

      return result.insertId;
    } catch (error) {
      console.error('[EVENT] Error creating delivery:', error);
      throw new CustomError('Database error while creating delivery', 500);
    }
  }

  /**
   * Process deliveries asynchronously
   * @param {Array} deliveries - Array of delivery objects
   */
  async processDeliveries(deliveries) {
    // Process deliveries without blocking the webhook response
    setImmediate(async () => {
      for (const delivery of deliveries) {
        try {
          await this.executeDelivery(delivery);
        } catch (error) {
          console.error(`[DELIVERY] Error processing delivery ${delivery.deliveryId}:`, error);
        }
      }
    });
  }

  /**
   * Execute a single delivery
   * @param {Object} delivery - Delivery object
   */
  async executeDelivery(delivery) {
    const { deliveryId, route, eventId, eventType, payload } = delivery;

    try {
      console.log(`[DELIVERY] Executing delivery ${deliveryId} to ${route.target_name}`);

      // Get source info for proper formatting (including source name)
      const eventResult = await database.query(
        'SELECT e.source_id, s.type as source_type, s.name as source_name FROM events e INNER JOIN sources s ON e.source_id = s.id WHERE e.id = ?',
        [eventId]
      );
      const sourceType = eventResult.length > 0 ? eventResult[0].source_type : null;
      const sourceName = eventResult.length > 0 ? eventResult[0].source_name : null;

      // Transform payload using message template or formatter
      const transformedPayload = this.transformPayload(payload, route.message_template, eventType, sourceType, sourceName);

      // Send to target with retry logic
      await this.sendToTarget(route, transformedPayload, deliveryId);

      // Mark delivery as successful
      await this.updateDeliveryStatus(deliveryId, 'sent', null);

      console.log(`[DELIVERY] Successfully delivered ${deliveryId}`);

    } catch (error) {
      console.error(`[DELIVERY] Failed to deliver ${deliveryId}:`, error);
      await this.handleDeliveryFailure(deliveryId, error.message);
    }
  }

  /**
   * Transform payload using message template
   * @param {Object} payload - Original payload
   * @param {string} template - Message template
   * @param {string} eventType - Event type
   * @param {string} sourceType - Source type (synology, proxmox, proxmox_backup, generic)
   * @param {string} sourceName - Source name (optional, used as hostname for Watchtower)
   * @returns {Object} - Transformed payload
   */
  transformPayload(payload, template, eventType, sourceType, sourceName = null) {
    try {
      console.log('[TRANSFORM] Input payload:', JSON.stringify(payload));
      console.log('[TRANSFORM] Template:', template);
      console.log('[TRANSFORM] Event type:', eventType);
      console.log('[TRANSFORM] Source type:', sourceType);
      console.log('[TRANSFORM] Source name:', sourceName);

      // Special handling for Proxmox Backup - use dedicated formatter
      if (sourceType === 'proxmox_backup') {
        console.log('[TRANSFORM] Using Proxmox Backup formatter');
        return this.proxmoxBackupFormatter.createProxmoxBackupMessage(payload);
      }

      // Special handling for GitLab - use dedicated formatter
      if (sourceType === 'gitlab') {
        console.log('[TRANSFORM] Using GitLab formatter');
        return this.gitlabFormatter.createGitLabMessage(payload);
      }

      // Special handling for Synology DSM - use dedicated formatter
      if (sourceType === 'synology') {
        console.log('[TRANSFORM] Using Synology formatter');
        return this.synologyFormatter.createSynologyMessage(payload);
      }

      // Special handling for Docker Updater (Watchtower) - use dedicated formatter with source name
      if (sourceType === 'docker_updater') {
        console.log('[TRANSFORM] Using Docker Updater formatter with source name:', sourceName);
        return this.dockerUpdaterFormatter.createDockerUpdaterMessage(payload, sourceName);
      }

      // Special handling for Media-Webhook (Sonarr/Radarr/Bazarr) - Slack format
      if (sourceType === 'media-webhook') {
        console.log('[TRANSFORM] Using Media-Webhook formatter for Slack format');
        return this.createMediaWebhookMessage(payload, eventType);
      }

      // Special handling for Uptime Kuma - Slack format
      if (sourceType === 'uptime-kuma') {
        console.log('[TRANSFORM] Using Uptime Kuma formatter for Slack format');
        return this.createUptimeKumaMessage(payload, eventType);
      }

      if (!template) {
        // Default template - pass through with some metadata
        return {
          text: `Event: ${eventType}`,
          payload: payload,
          timestamp: new Date().toISOString()
        };
      }

      // Simple template substitution
      let message = template;

      // Replace placeholders
      message = message.replace(/\{\{eventType\}\}/g, eventType);
      message = message.replace(/\{\{timestamp\}\}/g, new Date().toISOString());

      // Replace payload fields
      const replacePayloadFields = (text, obj, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const placeholder = `{{${prefix}${key}}}`;
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            text = replacePayloadFields(text, value, `${prefix}${key}.`);
          } else {
            // Escape special regex characters except {}
            const escapedPlaceholder = placeholder.replace(/[.*+?^$()[\]\\]/g, '\\$&');
            text = text.replace(new RegExp(escapedPlaceholder, 'g'), String(value || ''));
          }
        }
        return text;
      };

      message = replacePayloadFields(message, payload);

      return {
        text: message,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[DELIVERY] Error transforming payload:', error);
      return {
        text: `Event: ${eventType} (template error)`,
        payload: payload,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Format payload for specific target type
   * @param {Object} payload - Transformed payload from formatter
   * @param {string} targetType - Target type (mattermost, slack, discord, etc.)
   * @returns {Object} - Formatted payload for target
   */
  formatPayloadForTarget(payload, targetType) {
    // If payload has attachments (Mattermost/Slack format), use it directly
    if (payload.attachments && Array.isArray(payload.attachments) && payload.attachments.length > 0) {
      console.log('[FORMAT] Using attachments format for', targetType);
      // Mattermost, Slack, and Rocket.Chat support attachments
      if (targetType === 'mattermost' || targetType === 'slack' || targetType === 'rocketchat') {
        return payload; // Return as-is with attachments
      }
      // For other platforms, extract text from attachments
      const texts = [];
      if (payload.text) texts.push(payload.text);
      payload.attachments.forEach(att => {
        if (att.pretext) texts.push(att.pretext);
        if (att.text) texts.push(att.text);
        if (att.fields) {
          att.fields.forEach(f => {
            texts.push(`**${f.title}**: ${f.value}`);
          });
        }
      });
      return { text: texts.join('\n') };
    }

    // If payload already has a formatted 'text' field from a formatter (e.g., Synology, GitLab),
    // use it directly instead of extracting from message/title fields
    if (payload.text && typeof payload.text === 'string' && payload.text.length > 0) {
      // Check if text appears to be pre-formatted (contains markdown, emojis, or newlines)
      const isPreFormatted = payload.text.includes('\n') ||
                             payload.text.includes('**') ||
                             payload.text.match(/[\u{1F000}-\u{1F9FF}]/u); // emoji detection

      if (isPreFormatted) {
        // Return pre-formatted text as-is for all target types
        return { text: payload.text };
      }
    }

    // If payload has formatter-specific fields (title, message, severity), format for target
    if (payload.message || payload.title) {
      const text = payload.message || payload.title || 'No message';

      switch (targetType) {
        case 'mattermost':
        case 'rocketchat':
        case 'slack':
          return { text };

        case 'discord':
          return {
            content: text,
            embeds: payload.title ? [{
              title: payload.title,
              description: payload.message || '',
              color: payload.severity === 'error' ? 15158332 : payload.severity === 'warning' ? 16776960 : 3447003
            }] : []
          };

        case 'teams':
          return {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": payload.title || 'Webhook Event',
            "text": text
          };

        default:
          return { text };
      }
    }

    // Fallback: return payload as-is
    return payload;
  }

  /**
   * Send payload to target with retry logic
   * @param {Object} route - Route configuration
   * @param {Object} payload - Transformed payload
   * @param {number} deliveryId - Delivery ID
   */
  async sendToTarget(route, payload, deliveryId) {
    let lastError = null;

    // Format payload for target type
    const formattedPayload = this.formatPayloadForTarget(payload, route.target_type);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`[DELIVERY] Attempt ${attempt + 1}/${this.maxRetries} for delivery ${deliveryId}`);

        // Increment attempt counter
        await this.incrementDeliveryAttempt(deliveryId);

        const response = await axios.post(route.webhook_url, formattedPayload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'HookCats/1.0'
          },
          timeout: 10000, // 10 second timeout
          validateStatus: (status) => status >= 200 && status < 300
        });

        // Success - no need to retry
        console.log(`[DELIVERY] Successfully sent to ${route.webhook_url}, status: ${response.status}`);
        return;

      } catch (error) {
        lastError = error;
        const errorMsg = error.response
          ? `HTTP ${error.response.status}: ${error.response.statusText}`
          : error.message;
        console.log(`[DELIVERY] Attempt ${attempt + 1} failed for delivery ${deliveryId}:`, errorMsg);

        // Wait before retrying (except on last attempt)
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelays[attempt]);
        }
      }
    }

    // All attempts failed
    throw lastError;
  }

  /**
   * Update delivery status
   * @param {number} deliveryId - Delivery ID
   * @param {string} status - New status
   * @param {string} error - Error message (if any)
   */
  async updateDeliveryStatus(deliveryId, status, error) {
    try {
      const sentAt = status === 'sent' ? 'NOW()' : 'sent_at';

      await database.query(`
        UPDATE deliveries
        SET status = ?, last_error = ?, sent_at = ${sentAt}
        WHERE id = ?
      `, [status, error, deliveryId]);

    } catch (dbError) {
      console.error('[DELIVERY] Error updating delivery status:', dbError);
    }
  }

  /**
   * Increment delivery attempt counter
   * @param {number} deliveryId - Delivery ID
   */
  async incrementDeliveryAttempt(deliveryId) {
    try {
      await database.query(
        'UPDATE deliveries SET attempts = attempts + 1 WHERE id = ?',
        [deliveryId]
      );
    } catch (error) {
      console.error('[DELIVERY] Error incrementing attempt:', error);
    }
  }

  /**
   * Handle delivery failure
   * @param {number} deliveryId - Delivery ID
   * @param {string} errorMessage - Error message
   */
  async handleDeliveryFailure(deliveryId, errorMessage) {
    await this.updateDeliveryStatus(deliveryId, 'failed', errorMessage);
  }

  /**
   * Create formatted message for Media-Webhook (Sonarr/Radarr/Bazarr)
   * Transforms Slack format to Mattermost/Rocket.Chat format
   * @param {Object} payload - Slack formatted payload
   * @param {string} eventType - Event type
   * @returns {Object} - Formatted message
   */
  createMediaWebhookMessage(payload, _eventType) {
    try {
      // Detect Bazarr format (has type, title, message)
      const isBazarr = payload.type && payload.title && payload.message;

      // Extract main text - support both Slack and Bazarr formats
      const mainText = isBazarr ? payload.message : (payload.text || '');
      const username = payload.username || 'Media Server';

      // Extract attachment details if present
      let title = '';
      let details = mainText;

      if (isBazarr) {
        // Bazarr format
        title = payload.title;
        details = payload.message;
      } else if (payload.attachments && payload.attachments.length > 0) {
        // Slack format
        const attachment = payload.attachments[0];
        // Use title from attachment if available
        title = attachment.title || '';
        // Replace escaped newlines with actual newlines
        details = (attachment.text || attachment.fallback || mainText).replace(/\\n/g, '\n');
      }

      // Determine event action and emoji based on text content and event type
      let action = '';
      const lowerText = (title + ' ' + mainText).toLowerCase();

      if (lowerText.includes('grabbed') || lowerText.includes('download')) {
        action = '🔽 **Letöltés megkezdve**';
      } else if (lowerText.includes('imported') || lowerText.includes('complete')) {
        action = '✅ **Letöltés befejezve és importálva**';
      } else if (lowerText.includes('upgraded')) {
        action = '⬆️ **Jobb minőségre frissítve**';
      } else if (lowerText.includes('deleted') || lowerText.includes('removed')) {
        action = '🗑️ **Törölve**';
      } else if (lowerText.includes('renamed')) {
        action = '📝 **Átnevezve**';
      } else if (lowerText.includes('test')) {
        action = '🧪 **Teszt üzenet**';
      } else if (lowerText.includes('manual') || lowerText.includes('interaction')) {
        action = '⚠️ **Kézi beavatkozás szükséges**';
      } else {
        action = '📺 **Média esemény**';
      }

      // Build formatted message
      // Use mainText as action if it contains emoji (from Sonarr webhook)
      let finalAction = action;
      if (mainText && (mainText.includes('🔽') || mainText.includes('✅') || mainText.includes('📝') || mainText.includes('🗑️'))) {
        finalAction = mainText;
      }

      let formattedMessage = `${finalAction}\n`;

      // Add title if available
      if (title) {
        formattedMessage += `**Cím:** ${title}\n`;
      }

      // Add details without "Details:" prefix (details already have icons)
      if (details && details !== title) {
        formattedMessage += `${details}`;
      }

      return {
        text: formattedMessage,
        username: username
      };

    } catch (error) {
      console.error('[MEDIA-WEBHOOK] Error formatting message:', error);
      return {
        text: `📺 ${payload.text || 'Media event'}`,
        username: payload.username || 'Media Server'
      };
    }
  }

  /**
   * Create formatted message for Uptime Kuma
   * Transforms Slack format to Mattermost/Rocket.Chat format
   * @param {Object} payload - Slack formatted payload from Uptime Kuma
   * @param {string} eventType - Event type
   * @returns {Object} - Formatted message
   */
  createUptimeKumaMessage(payload, _eventType) {
    try {
      // Extract main text and monitor name
      const mainText = payload.text || '';
      const username = payload.username || 'Uptime Kuma';

      // Extract monitor details from attachments
      let monitorName = '';
      let details = mainText;
      let color = '';

      if (payload.attachments && payload.attachments.length > 0) {
        const attachment = payload.attachments[0];
        monitorName = attachment.title || '';
        details = attachment.text || attachment.fallback || mainText;
        color = attachment.color || '';
      }

      // Determine status based on text content and color
      let action = '';
      const lowerText = (mainText + ' ' + details).toLowerCase();

      if (color === 'danger' || lowerText.includes('down') || lowerText.includes('offline')) {
        action = '🔴 **Szolgáltatás leállt**';
      } else if (color === 'good' || lowerText.includes('up') || lowerText.includes('online') || lowerText.includes('back up')) {
        action = '🟢 **Szolgáltatás elérhető**';
      } else if (lowerText.includes('warning') || lowerText.includes('degraded')) {
        action = '🟡 **Figyelmeztetés**';
      } else if (lowerText.includes('test')) {
        action = '🧪 **Teszt értesítés**';
      } else {
        action = '🔔 **Uptime Kuma értesítés**';
      }

      // Build formatted message
      let formattedMessage = `${action}\n`;

      // Add monitor name if available
      if (monitorName) {
        formattedMessage += `**Monitor:** ${monitorName}\n`;
      }

      // Add details
      if (details) {
        formattedMessage += `**Részletek:** ${details}`;
      }

      return {
        text: formattedMessage,
        username: username
      };

    } catch (error) {
      console.error('[UPTIME-KUMA] Error formatting message:', error);
      return {
        text: `🔔 ${payload.text || 'Uptime Kuma notification'}`,
        username: payload.username || 'Uptime Kuma'
      };
    }
  }

  /**
   * Mark event as processed
   * @param {number} eventId - Event ID
   */
  async markEventProcessed(eventId) {
    try {
      await database.query(
        'UPDATE events SET processed_at = NOW() WHERE id = ?',
        [eventId]
      );
    } catch (error) {
      console.error('[EVENT] Error marking event as processed:', error);
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EventProcessor;