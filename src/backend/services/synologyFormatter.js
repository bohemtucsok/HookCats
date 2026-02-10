/**
 * Synology DSM Webhook Formatter
 * Formats Synology DSM notification webhooks for chat platforms
 */
class SynologyFormatter {
  /**
   * Create formatted message from Synology webhook payload
   * @param {Object} payload - Synology webhook payload
   * @returns {Object} - Formatted message for chat platforms
   */
  createSynologyMessage(payload) {
    console.log('[SYNOLOGY] Formatting payload:', JSON.stringify(payload));

    // Synology sends simple text notifications
    // Example: { "text": "[syn-hp2] Active Backup for Business - A(z) syn-hp2 eszközön..." }

    const text = payload.text || payload.message || JSON.stringify(payload);

    // Extract device/system name from text if possible (format: [DeviceName] Message)
    const deviceMatch = text.match(/^\[([^\]]+)\]/);
    const deviceName = deviceMatch ? deviceMatch[1] : null;

    // Get full message with device name
    const fullMessage = text;

    // Determine severity based on keywords
    let severity = 'info';
    const lowerText = text.toLowerCase();

    if (lowerText.includes('hiba') || lowerText.includes('error') || lowerText.includes('sikertelen') || lowerText.includes('failed')) {
      severity = 'error';
    } else if (lowerText.includes('figyelmeztetés') || lowerText.includes('warning') || lowerText.includes('figyelmezt')) {
      severity = 'warning';
    } else if (lowerText.includes('bejelentkezés') || lowerText.includes('login') || lowerText.includes('kapcsolódás')) {
      severity = 'info';
    }

    // Determine icon based on severity
    const icons = {
      error: '🚨',
      warning: '⚠️',
      info: '🔔'
    };
    const icon = icons[severity] || '🔔';

    // Get current timestamp
    const timestamp = new Date().toISOString();

    // Build formatted message for Mattermost
    // Format: 🔔 **Synology Notification**
    //
    // [device] Full message text
    //
    // 📅 timestamp
    const formattedMessage = `${icon} **Synology Értesítés**\n\n${fullMessage}\n\n📅 ${timestamp}`;

    // Detect event type
    let eventType = 'notification';
    if (lowerText.includes('bejelentkezés') || lowerText.includes('login')) {
      eventType = 'login';
    } else if (lowerText.includes('backup') || lowerText.includes('biztonsági mentés')) {
      eventType = 'backup';
    } else if (lowerText.includes('frissítés') || lowerText.includes('update')) {
      eventType = 'update';
    } else if (lowerText.includes('lemez') || lowerText.includes('disk') || lowerText.includes('tárhely')) {
      eventType = 'storage';
    }

    return {
      text: formattedMessage,
      title: `Synology - ${deviceName || 'DSM'}`,
      message: fullMessage,
      severity: severity,
      device: deviceName,
      eventType: eventType,
      timestamp: timestamp
    };
  }
}

module.exports = SynologyFormatter;
