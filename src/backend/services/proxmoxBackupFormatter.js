/**
 * Proxmox Backup Message Formatter
 * Formats Proxmox backup notifications similar to the original Python implementation
 */

class ProxmoxBackupFormatter {
  /**
   * Create Proxmox backup message for Mattermost
   * @param {Object} backupInfo - Backup information from Proxmox
   * @returns {Object} Formatted Mattermost message
   */
  createProxmoxBackupMessage(backupInfo) {
    const eventType = backupInfo.type || 'unknown';
    let status = backupInfo.status || null;

    // Determine status from severity or title if status is not provided
    if (!status) {
      const severity = (backupInfo.severity || '').toLowerCase();
      const titleText = (backupInfo.title || '').toLowerCase();

      if (severity === 'error' || titleText.includes('failed') || titleText.includes('error')) {
        status = 'error';
      } else if (titleText.includes('started') || titleText.includes('starting')) {
        status = 'started';
      } else if (severity === 'info' && (titleText.includes('successful') || titleText.includes('finished'))) {
        status = 'completed';
      } else {
        status = 'unknown';
      }
    }

    let title, message;

    if (status === 'started') {
      title = '🔄 Backup folyamat elindult';
      message = this._createStartedMessage(backupInfo);
    } else if (status === 'completed' || status === 'success') {
      title = '✅ Backup folyamat befejezve';
      message = this._createCompletedMessage(backupInfo);
    } else if (status === 'error') {
      title = '❌ Backup hiba';
      message = this._createErrorMessage(backupInfo);
    } else {
      title = 'ℹ️ Backup esemény';
      message = `Esemény típusa: ${eventType}\nStátusz: ${status}`;
    }

    // Mattermost message format
    const mattermostMessage = {
      text: `## ${title}\n\n${message}`,
      username: 'Proxmox Backup Bot',
      icon_url: 'https://www.proxmox.com/images/proxmox/proxmox_logo_standard_blue_300px.png'
    };

    return mattermostMessage;
  }

  /**
   * Create backup started message
   * @private
   */
  _createStartedMessage(backupInfo) {
    const vms = backupInfo.vms || [];
    const storage = backupInfo.storage || 'unknown';
    const mode = backupInfo.mode || 'unknown';
    const totalVms = backupInfo.total_vms || vms.length;

    const messageLines = [
      '*Backup folyamat elindult*',
      '',
      `**Hoszt:** ${backupInfo.hostname || 'unknown'}`,
      `**Tároló:** ${storage}`,
      `**Mód:** ${mode}`,
      `**VM-ek száma:** ${totalVms}`,
      `**Backup típus:** ${backupInfo.backup_type || 'unknown'}`
    ];

    if (vms.length > 0) {
      messageLines.push('', '**Mentendő VM-ek:**');

      // Only show first 5 VMs
      const vmsToShow = vms.slice(0, 5);
      for (const vm of vmsToShow) {
        const vmName = vm.name || `VM ${vm.vmid || 'unknown'}`;
        const vmSize = vm.size || '';
        const sizeInfo = (vmSize && vmSize !== 'unknown') ? ` (${vmSize})` : '';
        messageLines.push(`• ${vmName}${sizeInfo}`);
      }

      if (vms.length > 5) {
        messageLines.push(`• ... és még ${vms.length - 5} VM`);
      }
    }

    return messageLines.join('\n');
  }

  /**
   * Create backup completed message
   * @private
   */
  _createCompletedMessage(backupInfo) {
    let successfulVms = backupInfo.successful_vms || [];
    let failedVms = backupInfo.failed_vms || [];
    const storage = backupInfo.storage || 'unknown';
    const mode = backupInfo.mode || 'unknown';

    // If no detailed data, try to extract from Proxmox message
    if (successfulVms.length === 0 && failedVms.length === 0) {
      const proxmoxMessage = backupInfo.message || '';
      if (proxmoxMessage) {
        const parsed = this._parseProxmoxMessage(proxmoxMessage);
        successfulVms = parsed.successful;
        failedVms = parsed.failed;
      }
    }

    const successVmsStr = this._formatVmList(successfulVms) || 'Nincs';
    const failedVmsStr = this._formatVmList(failedVms) || 'Nincs';

    const messageLines = [
      '*Backup folyamat befejezve*',
      '',
      `**Hoszt:** ${backupInfo.hostname || 'unknown'}`,
      `**Tároló:** ${storage}`,
      `**Mód:** ${mode}`,
      `**Backup típus:** ${backupInfo.backup_type || 'unknown'}`,
      `**Sikeres VM-ek:** ${successVmsStr}`,
      `**Hibás VM-ek:** ${failedVmsStr}`,
      `**Státusz:** ${backupInfo.status || 'unknown'}`
    ];

    // Add detailed VM information
    if (successfulVms.length > 0 && typeof successfulVms[0] === 'object') {
      messageLines.push('', '**Sikeres VM részletek:**');
      const vmsToShow = successfulVms.slice(0, 3);
      for (const vm of vmsToShow) {
        const vmName = vm.name || `VM ${vm.vmid || 'unknown'}`;
        const vmSize = vm.size || '';
        const vmDuration = vm.duration || '';
        const sizeInfo = (vmSize && vmSize !== 'unknown') ? ` - ${vmSize}` : '';
        const durationInfo = (vmDuration && vmDuration !== 'unknown') ? ` - ${vmDuration}` : '';
        messageLines.push(`• ${vmName}${sizeInfo}${durationInfo}`);
      }
    }

    if (failedVms.length > 0 && typeof failedVms[0] === 'object') {
      messageLines.push('', '**Hibás VM részletek:**');
      const vmsToShow = failedVms.slice(0, 3);
      for (const vm of vmsToShow) {
        const vmName = vm.name || `VM ${vm.vmid || 'unknown'}`;
        const vmError = vm.error || '';
        const errorInfo = (vmError && vmError !== 'unknown') ? ` - ${vmError}` : '';
        messageLines.push(`• ${vmName}${errorInfo}`);
      }
    }

    return messageLines.join('\n');
  }

  /**
   * Create backup error message
   * @private
   */
  _createErrorMessage(backupInfo) {
    // Extract error message from title or message field
    let errorMsg = backupInfo.error_message || backupInfo.title || '';

    // Extract main error from title (remove the prefix part)
    if (errorMsg.includes(':')) {
      const parts = errorMsg.split(':');
      if (parts.length >= 3) {
        // Format: "vzdump backup status (hostname): backup failed: actual error"
        errorMsg = parts.slice(2).join(':').trim();
      }
    }

    const storage = backupInfo.storage || backupInfo['job-id'] || 'N/A';
    const mode = backupInfo.mode || 'N/A';
    const hostname = backupInfo.hostname || 'unknown';
    const timestamp = backupInfo.timestamp ? new Date(parseInt(backupInfo.timestamp) * 1000).toLocaleString('hu-HU') : 'N/A';

    // Parse VM information from message field
    let vmDetails = '';
    const proxmoxMessage = backupInfo.message || '';

    if (proxmoxMessage) {
      // Extract VM table from message
      const lines = proxmoxMessage.split('\n');
      const vmidIndex = lines.findIndex(line => line.includes('VMID') && line.includes('Name'));

      if (vmidIndex !== -1) {
        // Find all VMs listed in the vzdump command
        const vzdumpLine = lines.find(line => line.startsWith('vzdump'));
        if (vzdumpLine) {
          const vmids = vzdumpLine.match(/\d{3,4}/g) || [];
          vmDetails = `\n**Érintett VM-ek:** ${vmids.join(', ')}`;
        }
      }
    }

    const messageLines = [
      `**Hoszt:** ${hostname}`,
      `**Időpont:** ${timestamp}`,
      `**Hiba:** ${errorMsg}`,
      vmDetails,
      '',
      '**Részletek:**',
      `- Tároló: ${storage}`,
      `- Mód: ${mode}`,
      `- Típus: ${backupInfo.type || 'vzdump'}`
    ];

    return messageLines.join('\n');
  }

  /**
   * Parse Proxmox message format to extract VM statuses
   * Format: "ID VM_NAME status"
   * @private
   */
  _parseProxmoxMessage(message) {
    const successful = [];
    const failed = [];

    const lines = message.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
        const status = parts[2];

        if (status === 'ok') {
          successful.push(parts[1]);
        } else {
          failed.push(parts[1]);
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Format VM list to string
   * @private
   */
  _formatVmList(vms) {
    if (!vms || vms.length === 0) return '';

    return vms.map(vm => {
      if (typeof vm === 'object') {
        return vm.name || `${vm.vmid || 'unknown'}`;
      }
      return vm;
    }).join(', ');
  }
}

module.exports = ProxmoxBackupFormatter;
