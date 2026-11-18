'use strict';

// Markdown is the handoff Codex reads. Tool bodies and raw event JSON stay in the JSON export.

function blank(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function bullets(items, empty) {
  const lines = (items || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!lines.length) return '- ' + empty;
  return lines.map((item) => '- ' + item).join('\n');
}

function clip(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n…[truncated]';
}

function renderHandoffMarkdown(session, events) {
  const contract = session.contract || {};
  const files = events.filter((event) => event.type === 'file.changed');
  const requestedById = new Map();
  for (const event of events) {
    if (event.type !== 'tool.requested') continue;
    const payload = event.payload || {};
    if (payload.toolCallId) requestedById.set(payload.toolCallId, payload);
  }
  const tools = events.filter((event) => event.type === 'tool.completed' || event.type === 'tool.failed');
  const messages = events.filter((event) => event.type === 'message.created' && event.payload && event.payload.content);
  const checkpoints = events.filter((event) => event.type === 'checkpoint.created');
  const checkpoint = checkpoints.length ? checkpoints[checkpoints.length - 1].payload || {} : null;
  const lines = [
    '# RelayDock handoff',
    '',
    '- Session: ' + session.id,
    '- Title: ' + (session.title || contract.title || 'Untitled'),
    '- Workspace: ' + (session.workspace || contract.workspace || ''),
    '- Exported: ' + new Date().toISOString(),
    '',
    '## Task',
    '',
    '- Goal: ' + blank(contract.goal, '(not recorded)'),
    '- Summary: ' + blank(contract.summary, '(not recorded)'),
    '',
    'Acceptance:',
    bullets(contract.acceptanceCriteria, 'None recorded'),
    '',
    'Open issues:',
    bullets(contract.openIssues, 'None recorded'),
    '',
    'Next steps:',
    bullets(contract.nextSteps, 'None recorded'),
    '',
    '## Files changed by this session',
    ''
  ];
  if (!files.length) {
    lines.push('No files were changed by this session.', '');
  } else {
    for (const event of files) {
      const payload = event.payload || {};
      lines.push('- ' + (payload.path || '(unknown path)') + ' · sha256 ' + (payload.sha256 || '(none)') + ' · ' + (payload.bytes == null ? 'unknown' : payload.bytes) + ' bytes');
    }
    lines.push('');
  }
  lines.push('## Latest checkpoint', '');
  if (!checkpoint) {
    lines.push('No checkpoint recorded.', '');
  } else {
    lines.push(
      '- Branch: ' + blank(checkpoint.branch, '(unknown)'),
      '- Commit: ' + blank(checkpoint.commit, '(unknown)'),
      '- Workspace status: ' + (checkpoint.changedFiles == null ? 'unknown' : checkpoint.changedFiles) + ' changed paths, ' + (checkpoint.fileCount == null ? 'unknown' : checkpoint.fileCount) + ' files',
      '- Note: ' + blank(checkpoint.summary, '(none)'),
      ''
    );
  }
  lines.push('## Conversation', '');
  if (!messages.length) lines.push('No messages recorded.', '');
  for (const event of messages) {
    const payload = event.payload || {};
    const who = payload.originProvider || payload.role || event.origin_provider || 'unknown';
    lines.push('### ' + who + (payload.untrusted ? ' (untrusted evidence)' : ''), '', clip(payload.content, 4000), '');
  }
  lines.push('## Tools', '');
  if (!tools.length) lines.push('No tools ran.', '');
  for (const event of tools) {
    const payload = event.payload || {};
    const requested = requestedById.get(payload.toolCallId) || {};
    const name = payload.toolName || requested.toolName || event.type;
    const detail = payload.detail || requested.detail || '';
    const status = event.type === 'tool.failed' ? 'failed' : 'completed';
    lines.push('- ' + name + (detail ? ' ' + detail : '') + ': ' + blank(payload.summary || payload.error, status));
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = { renderHandoffMarkdown };
