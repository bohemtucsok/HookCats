/**
 * GitLab Webhook Event Formatter
 * Handles various GitLab events (pipeline, push, merge request, issue, repository update)
 */

class GitLabFormatter {
  /**
   * Main GitLab message formatter
   * @param {Object} eventData - GitLab webhook payload
   * @returns {Object} Formatted message
   */
  createGitLabMessage(eventData) {
    const kind = eventData.object_kind || eventData.event_name || 'unknown';

    switch (kind) {
      case 'pipeline':
        return this._formatPipelineEvent(eventData);
      case 'push':
        return this._formatPushEvent(eventData);
      case 'merge_request':
        return this._formatMergeRequestEvent(eventData);
      case 'issue':
        return this._formatIssueEvent(eventData);
      case 'repository_update':
        return this._formatRepositoryUpdateEvent(eventData);
      default:
        return this._formatGenericEvent(eventData);
    }
  }

  /**
   * Format pipeline event
   */
  _formatPipelineEvent(eventData) {
    const attrs = eventData.object_attributes || {};
    const project = eventData.project || {};
    const commit = eventData.commit || {};
    const user = eventData.user || {};

    const status = (attrs.status || '').toLowerCase();
    const pipelineId = attrs.id;
    const pipelineUrl = attrs.url;
    const branch = (attrs.ref || '').replace('refs/heads/', '');

    const commitId = commit.id;
    const commitMsg = commit.message;
    const commitAuthor = commit.author?.name;

    const jobsCount = eventData.builds?.length || 0;
    const stages = new Set(eventData.builds?.map(b => b.stage).filter(Boolean));
    const stagesCount = stages.size;

    let statusIcon = '❓';
    let statusText = status;

    if (status === 'success') {
      statusIcon = '✅';
      statusText = 'Sikeres';
    } else if (status === 'failed') {
      statusIcon = '❌';
      statusText = 'Sikertelen';
    } else if (status === 'canceled') {
      statusIcon = '🚫';
      statusText = 'Megszakítva';
    } else if (status === 'running') {
      statusIcon = '🏃';
      statusText = 'Fut';
    } else if (status === 'pending') {
      statusIcon = '⏳';
      statusText = 'Várakozik';
    }

    let message = `${statusIcon} **Pipeline esemény**\n\n`;
    message += `**Státusz:** ${statusText}\n`;
    message += `**Projekt:** ${project.name || 'Ismeretlen'}\n`;
    if (branch) message += `**Branch:** \`${branch}\`\n`;
    if (pipelineId) message += `**Pipeline ID:** #${pipelineId}\n`;
    if (commitId) message += `**Commit:** ${commitId.substring(0, 8)}\n`;
    if (commitMsg) message += `**Commit üzenet:** ${commitMsg.trim()}\n`;
    if (commitAuthor) message += `**Commit szerző:** ${commitAuthor}\n`;
    if (user.name) message += `**Indította:** ${user.name}\n`;
    if (jobsCount) message += `**Feladatok:** ${jobsCount} job\n`;
    if (stagesCount) message += `**Stage-ek:** ${stagesCount}\n`;
    if (pipelineUrl) message += `**URL:** ${pipelineUrl}\n`;

    return {
      title: `Pipeline ${statusText}`,
      message: message,
      severity: status === 'success' ? 'info' : status === 'failed' ? 'error' : 'warning',
      status: status,
      project: project.name,
      branch: branch,
      commit: commitId,
      pipeline_id: pipelineId,
      url: pipelineUrl
    };
  }

  /**
   * Format push event
   */
  _formatPushEvent(eventData) {
    const project = eventData.project || {};
    const branch = (eventData.ref || '').replace('refs/heads/', '');
    const commit = eventData.checkout_sha;
    const commits = eventData.commits || [];
    const lastCommit = commits[commits.length - 1];

    const commitMsg = lastCommit?.message;
    const commitAuthor = lastCommit?.author?.name;
    const userName = eventData.user_name || eventData.user_username;

    let message = `⬆️ **Push esemény**\n\n`;
    message += `**Projekt:** ${project.name || 'Ismeretlen'}\n`;
    if (branch) message += `**Branch:** \`${branch}\`\n`;
    if (commit) message += `**Commit:** ${commit.substring(0, 8)}\n`;
    if (commitMsg) message += `**Commit üzenet:** ${commitMsg.trim()}\n`;
    if (commitAuthor) message += `**Commit szerző:** ${commitAuthor}\n`;
    if (userName) message += `**Indította:** ${userName}\n`;
    if (commits.length) message += `**Commit-ok száma:** ${commits.length}\n`;

    return {
      title: 'Push esemény',
      message: message,
      severity: 'info',
      status: 'pushed',
      project: project.name,
      branch: branch,
      commit: commit,
      commits_count: commits.length
    };
  }

  /**
   * Format merge request event
   */
  _formatMergeRequestEvent(eventData) {
    const attrs = eventData.object_attributes || {};
    const project = eventData.project || {};
    const user = eventData.user || {};

    const mrId = attrs.iid;
    const mrUrl = attrs.url;
    const mrTitle = attrs.title;
    const mrState = attrs.state;
    const sourceBranch = attrs.source_branch;
    const targetBranch = attrs.target_branch;
    const description = attrs.description;

    let message = `🔀 **Merge Request esemény**\n\n`;
    message += `**Projekt:** ${project.name || 'Ismeretlen'}\n`;
    if (mrId) message += `**MR ID:** #${mrId}\n`;
    if (mrTitle) message += `**Cím:** ${mrTitle}\n`;
    if (mrState) message += `**Státusz:** ${mrState}\n`;
    if (sourceBranch && targetBranch) {
      message += `**Branch:** \`${sourceBranch}\` → \`${targetBranch}\`\n`;
    }
    if (user.name) message += `**Indította:** ${user.name}\n`;
    if (description) message += `**Leírás:** ${description.trim().substring(0, 200)}...\n`;
    if (mrUrl) message += `**URL:** ${mrUrl}\n`;

    return {
      title: `Merge Request #${mrId}`,
      message: message,
      severity: 'info',
      status: mrState,
      project: project.name,
      mr_id: mrId,
      source_branch: sourceBranch,
      target_branch: targetBranch,
      url: mrUrl
    };
  }

  /**
   * Format issue event
   */
  _formatIssueEvent(eventData) {
    const attrs = eventData.object_attributes || {};
    const project = eventData.project || {};
    const user = eventData.user || {};

    const issueId = attrs.iid;
    const issueUrl = attrs.url;
    const issueTitle = attrs.title;
    const issueState = attrs.state;
    const description = attrs.description;

    let message = `❗ **Issue esemény**\n\n`;
    message += `**Projekt:** ${project.name || 'Ismeretlen'}\n`;
    if (issueId) message += `**Issue ID:** #${issueId}\n`;
    if (issueTitle) message += `**Cím:** ${issueTitle}\n`;
    if (issueState) message += `**Státusz:** ${issueState}\n`;
    if (user.name) message += `**Indította:** ${user.name}\n`;
    if (description) message += `**Leírás:** ${description.trim().substring(0, 200)}...\n`;
    if (issueUrl) message += `**URL:** ${issueUrl}\n`;

    return {
      title: `Issue #${issueId}`,
      message: message,
      severity: 'info',
      status: issueState,
      project: project.name,
      issue_id: issueId,
      url: issueUrl
    };
  }

  /**
   * Format repository update event
   */
  _formatRepositoryUpdateEvent(eventData) {
    const project = eventData.project || {};
    const userName = eventData.user_name || eventData.user;
    const changes = eventData.changes || [];
    const refs = eventData.refs || [];

    let message = `🔄 **Repository Update esemény**\n\n`;
    message += `**Projekt:** ${project.name || 'Ismeretlen'}\n`;
    if (userName) message += `**Indította:** ${userName}\n`;
    if (refs.length) message += `**Érintett ref-ek:** ${refs.join(', ')}\n`;

    if (changes.length) {
      message += `**Változások:**\n`;
      changes.forEach(change => {
        const before = change.before?.substring(0, 8) || 'N/A';
        const after = change.after?.substring(0, 8) || 'N/A';
        const ref = change.ref || 'unknown';
        message += `• \`${ref}\`: ${before} → ${after}\n`;
      });
    }

    return {
      title: 'Repository Update',
      message: message,
      severity: 'info',
      status: 'updated',
      project: project.name,
      changes_count: changes.length
    };
  }

  /**
   * Format generic/unknown event
   */
  _formatGenericEvent(eventData) {
    const kind = eventData.object_kind || eventData.event_name || 'unknown';
    const project = eventData.project || {};

    let message = `ℹ️ **GitLab esemény**\n\n`;
    message += `**Típus:** ${kind}\n`;
    message += `**Projekt:** ${project.name || 'Ismeretlen'}\n`;
    message += `**Raw data:** ${JSON.stringify(eventData, null, 2).substring(0, 500)}...\n`;

    return {
      title: `GitLab ${kind}`,
      message: message,
      severity: 'info',
      status: 'generic',
      project: project.name
    };
  }
}

module.exports = GitLabFormatter;
