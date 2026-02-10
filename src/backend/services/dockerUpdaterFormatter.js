/**
 * Docker Updater (Watchtower) Webhook Formatter
 * Formats Docker container update notifications from Watchtower
 * Simplifies verbose Watchtower messages into clean update notifications
 * Supports Mattermost attachments format for rich notifications
 */
class DockerUpdaterFormatter {
  /**
   * Create formatted message from Watchtower webhook payload
   * @param {Object} payload - Watchtower webhook payload
   * @param {string} sourceName - Source name (used as hostname if no hostname in message)
   * @returns {Object} - Formatted message for chat platforms (Mattermost format)
   */
  createDockerUpdaterMessage(payload, sourceName = null) {
    console.log('[DOCKER_UPDATER] Formatting payload:', JSON.stringify(payload));
    console.log('[DOCKER_UPDATER] Source name (hostname):', sourceName);

    // Watchtower sends different formats:
    // 1. Direct text: { text: "message" }
    // 2. Slack format: { text: "message" } or { attachments: [...] }
    // 3. Generic/plain text
    
    let text = '';
    
    // Extract text from various formats
    if (payload.text) {
      text = payload.text;
    } else if (payload.message) {
      text = payload.message;
    } else if (payload.attachments && payload.attachments.length > 0) {
      // Slack attachments format
      text = payload.attachments.map(a => a.text || a.fallback || '').join('\n');
    } else if (typeof payload === 'string') {
      text = payload;
    } else {
      text = JSON.stringify(payload);
    }
    
    // Extract hostname/server name from the message or use source name
    // Priority: message prefix (hostname:) > source name > environment > fallback
    let hostname = sourceName || 'Docker Server';
    
    // The template format is: "${HOSTNAME}: message"
    // So we look for "hostname: " at the start of the message
    const hostnameMatch = text.match(/^([^:]+):\s+/);
    if (hostnameMatch) {
      hostname = hostnameMatch[1].trim();
      // Remove the hostname prefix from the text for cleaner processing
      text = text.substring(hostnameMatch[0].length);
    }

    // Detect message type
    const messageType = this.detectMessageType(text);

    // Format based on message type
    if (messageType === 'startup') {
      return this.formatStartupMessage(text, hostname);
    } else if (messageType === 'update') {
      return this.formatUpdateMessage(text, hostname);
    } else if (messageType === 'error') {
      return this.formatErrorMessage(text, hostname);
    } else {
      return this.formatGenericMessage(text, hostname);
    }
  }

  /**
   * Detect Watchtower message type
   * @param {string} text - Message text
   * @returns {string} - Message type (startup, update, error, generic)
   */
  detectMessageType(text) {
    if (text.includes('Scheduling first run') || text.includes('Using notifications')) {
      return 'startup';
    } else if (text.includes('Creating /') || text.includes('Found new') || text.includes('Stopping /')) {
      return 'update';
    } else if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
      return 'error';
    } else {
      return 'generic';
    }
  }

  /**
   * Format startup/initialization message
   * @param {string} text - Message text
   * @param {string} hostname - Server hostname
   * @returns {Object} - Formatted Mattermost message
   */
  formatStartupMessage(text, hostname) {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Extract key information
    let version = 'Unknown';
    let nextRun = 'Not scheduled';
    let timeUntilRun = '';

    for (const line of lines) {
      // Extract version
      const versionMatch = line.match(/Watchtower (\d+\.\d+\.\d+)/);
      if (versionMatch) {
        version = versionMatch[1];
      }

      // Extract next run time
      if (line.includes('Scheduling first run:')) {
        const runMatch = line.match(/Scheduling first run:\s*(.+)/);
        if (runMatch) {
          nextRun = runMatch[1].trim();
        }
      }

      // Extract time until run
      if (line.includes('first check will be performed in')) {
        const timeMatch = line.match(/performed in (.+)/);
        if (timeMatch) {
          timeUntilRun = timeMatch[1].trim();
        }
      }
    }

    // Build Mattermost attachment
    const attachment = {
      color: '#3AA3E3', // Blue for info
      author_name: hostname,
      author_icon: 'https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png',
      title: `Watchtower v${version} - Monitoring Started`,
      fields: [
        {
          short: true,
          title: '🖥️ Szerver',
          value: hostname
        },
        {
          short: true,
          title: '🕐 Következő ellenőrzés',
          value: timeUntilRun || 'Hamarosan'
        },
        {
          short: false,
          title: '📅 Ütemezett futtatás',
          value: nextRun
        }
      ],
      footer: 'Watchtower',
      ts: Math.floor(Date.now() / 1000)
    };

    return {
      text: '🚀 **Watchtower monitoring elindult**',
      attachments: [attachment],
      username: 'Watchtower',
      icon_url: 'https://containrrr.dev/watchtower/assets/logo.png'
    };
  }

  /**
   * Format container update message
   * @param {string} text - Message text
   * @param {string} hostname - Server hostname
   * @returns {Object} - Formatted Mattermost message
   */
  formatUpdateMessage(text, hostname) {
    const lines = text.split('\n').filter(line => line.trim());
    const updates = [];
    for (const line of lines) {
      // Remove hostname prefix from each line
      const cleanLine = line.replace(/^[^:]+:\s*/, '');

      // Check for "Found new" - indicates a container has an update available
      if (cleanLine.includes('Found new')) {
        // "Found new" lines are informational - actual updates tracked via "Creating" branch
      }
      
      // Check for "Creating" - indicates successful update
      else if (cleanLine.includes('Creating /')) {
        const containerMatch = cleanLine.match(/Creating \/(.+)/);
        if (containerMatch) {
          const containerName = containerMatch[1];
          updates.push({
            name: containerName,
            status: 'success',
            action: 'frissítve ✅'
          });
        }
      }
      
      // Check for errors or failures
      else if (cleanLine.toLowerCase().includes('error') || cleanLine.toLowerCase().includes('failed') || cleanLine.toLowerCase().includes('unauthorized')) {
        // Extract container name from error message
        let containerName = 'Unknown';
        
        // Try to extract container name from various error formats
        // Format 1: "Error response from daemon: ... repository: name/container"
        const repoMatch = cleanLine.match(/repository:\s*([^,\s]+)/);
        if (repoMatch) {
          const parts = repoMatch[1].split('/');
          containerName = parts[parts.length - 1]; // Last part of path
        }
        
        // Format 2: Container name before error
        const errorMatch = text.match(/([^\s:]+)\s*.*error/i);
        if (errorMatch && !repoMatch) {
          containerName = errorMatch[1];
        }
        
        // Extract short error message (first sentence or up to 100 chars)
        let errorMsg = cleanLine;
        if (cleanLine.includes('. ')) {
          errorMsg = cleanLine.substring(0, cleanLine.indexOf('. ') + 1);
        } else if (cleanLine.length > 100) {
          errorMsg = cleanLine.substring(0, 100) + '...';
        }
        
        // Clean up error message
        errorMsg = errorMsg
          .replace(/^Error response from daemon:\s*/i, '')
          .replace(/Proceeding to next\.?/i, '')
          .trim();
        
        updates.push({
          name: containerName,
          status: 'failed',
          action: '❌ ' + errorMsg
        });
      }
    }

    // If no structured updates found, parse simple container name
    if (updates.length === 0 && text.includes('Creating /')) {
      const matches = text.matchAll(/Creating \/([^\s\n]+)/g);
      for (const match of matches) {
        updates.push({
          name: match[1],
          status: 'success',
          action: 'frissítve ✅'
        });
      }
    }

    // Count successes and failures
    const successCount = updates.filter(u => u.status === 'success').length;
    const failureCount = updates.filter(u => u.status !== 'success').length;
    const overallStatus = failureCount > 0 ? 'failed' : 'success';

    // Build attachment
    const attachment = {
      color: overallStatus === 'success' ? '#00c100' : '#ff0000',
      author_name: hostname,
      author_icon: 'https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png',
      title: successCount > 0 
        ? `${successCount} konténer frissítve${failureCount > 0 ? `, ${failureCount} sikertelen` : ''}`
        : 'Konténer frissítés',
      fields: [],
      footer: 'Watchtower',
      ts: Math.floor(Date.now() / 1000)
    };

    // Add each container as a field
    if (updates.length > 0) {
      for (const update of updates) {
        // For failed updates, show error message in value (full width)
        // For success, show short status (two columns)
        attachment.fields.push({
          short: update.status === 'success',
          title: update.name,
          value: update.action
        });
      }
    } else {
      // No updates detected, show raw message
      attachment.text = text;
    }

    return {
      text: '🐳 **Docker konténer frissítés**',
      attachments: [attachment],
      username: 'Watchtower',
      icon_url: 'https://containrrr.dev/watchtower/assets/logo.png'
    };
  }

  /**
   * Format error message
   * @param {string} text - Message text
   * @param {string} hostname - Server hostname
   * @returns {Object} - Formatted Mattermost message
   */
  formatErrorMessage(text, hostname) {
    const attachment = {
      color: '#ff0000',
      author_name: hostname,
      author_icon: 'https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png',
      title: 'Hiba történt a konténer frissítés során',
      text: text,
      footer: 'Watchtower',
      ts: Math.floor(Date.now() / 1000)
    };

    return {
      text: `⚠️ **Watchtower hiba**`,
      attachments: [attachment],
      username: 'Watchtower',
      icon_url: 'https://containrrr.dev/watchtower/assets/logo.png'
    };
  }

  /**
   * Format generic message (fallback)
   * @param {string} text - Message text
   * @param {string} hostname - Server hostname
   * @returns {Object} - Formatted Mattermost message
   */
  formatGenericMessage(text, hostname) {
    const attachment = {
      color: '#808080',
      author_name: hostname,
      author_icon: 'https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png',
      text: text,
      footer: 'Watchtower',
      ts: Math.floor(Date.now() / 1000)
    };

    return {
      text: `🐳 **Docker értesítés**`,
      attachments: [attachment],
      username: 'Watchtower',
      icon_url: 'https://containrrr.dev/watchtower/assets/logo.png'
    };
  }

  /**
   * Extract hostname from environment or system
   * @returns {string|null} - Hostname or null
   */
  extractHostnameFromEnv() {
    // Try to get hostname from environment
    const hostname = process.env.HOSTNAME || process.env.HOST || null;
    return hostname;
  }

  /**
   * Capitalize first letter of a string
   * @param {string} str - Input string
   * @returns {string} - Capitalized string
   */
  capitalizeFirstLetter(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = DockerUpdaterFormatter;
