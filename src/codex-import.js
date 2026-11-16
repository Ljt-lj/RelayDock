'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function defaultCodexHome() {
  return process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), '.codex');
}

function sessionsRoot(codexHome = defaultCodexHome()) {
  return path.join(codexHome, 'sessions');
}

async function walkRollouts(root, acc = []) {
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return acc;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await walkRollouts(full, acc);
    else if (entry.isFile() && /^rollout-.*\.jsonl$/i.test(entry.name)) acc.push(full);
  }
  return acc;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    return '';
  }).filter(Boolean).join('\n').trim();
}

function messageKinds(payload) {
  const meta = payload && payload.internal_chat_message_metadata_passthrough;
  return Array.isArray(meta && meta.content_item_kinds) ? meta.content_item_kinds : [];
}

function isHarnessUserMessage(payload, text) {
  const kinds = messageKinds(payload);
  if (kinds.some((kind) => String(kind).startsWith('environments.') || String(kind).startsWith('permissions.') || String(kind) === 'generic.developer_instructions')) {
    return true;
  }
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('<environment_context>') || trimmed.startsWith('<permissions') || trimmed.startsWith('<app-context>')) return true;
  if (trimmed.startsWith('<skills_instructions>') || trimmed.startsWith('<collaboration_mode>')) return true;
  return false;
}

function cleanUserText(text) {
  let value = String(text || '').trim();
  // Drop leading file-mention boilerplate labels but keep the body.
  value = value.replace(/^\s*# Files mentioned by the user:\s*/i, '').trim();
  return value;
}

function parseRolloutLines(text) {
  const messages = [];
  let meta = null;
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'session_meta' && event.payload) {
      meta = event.payload;
      continue;
    }
    if (event.type !== 'response_item' || !event.payload || event.payload.type !== 'message') continue;
    const role = event.payload.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const rawText = extractText(event.payload.content);
    if (role === 'user' && isHarnessUserMessage(event.payload, rawText)) continue;
    const content = role === 'user' ? cleanUserText(rawText) : rawText;
    if (!content) continue;
    if (content.length > 50000) continue;
    messages.push({
      role,
      content,
      messageId: String(event.payload.id || ('codex:' + role + ':' + messages.length)).slice(0, 200),
      createdAt: event.timestamp || null
    });
  }
  return { meta, messages };
}

async function readRolloutSummary(filePath) {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read({
      buffer: Buffer.alloc(64 * 1024),
      position: 0
    });
    const head = buffer.slice(0, bytesRead).toString('utf8');
    const firstLine = head.split(/\r?\n/).find((line) => line.trim()) || '';
    let meta = null;
    try {
      const event = JSON.parse(firstLine);
      if (event.type === 'session_meta') meta = event.payload;
    } catch {}
    const sessionId = (meta && (meta.session_id || meta.id)) || path.basename(filePath).replace(/^rollout-|\.jsonl$/gi, '');
    return {
      path: filePath,
      fileName: path.basename(filePath),
      sessionId: String(sessionId),
      cwd: meta && meta.cwd || null,
      source: meta && (meta.source || meta.originator) || null,
      modelProvider: meta && meta.model_provider || null,
      startedAt: meta && meta.timestamp || null,
      mtimeMs: stat.mtimeMs,
      mtime: stat.mtime.toISOString(),
      size: stat.size
    };
  } finally {
    await handle.close();
  }
}

async function listCodexRollouts(options = {}) {
  const codexHome = options.codexHome || defaultCodexHome();
  const root = sessionsRoot(codexHome);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 30));
  const files = await walkRollouts(root);
  const summaries = [];
  for (const file of files) {
    try {
      summaries.push(await readRolloutSummary(file));
    } catch {
      // Skip unreadable rollouts.
    }
  }
  summaries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return {
    codexHome,
    sessionsRoot: root,
    rollouts: summaries.slice(0, limit)
  };
}

async function loadCodexRollout(filePath, options = {}) {
  const maxMessages = Math.max(1, Math.min(200, Number(options.maxMessages) || 60));
  const text = await fs.readFile(filePath, 'utf8');
  const parsed = parseRolloutLines(text);
  const messages = parsed.messages.slice(-maxMessages);
  const firstUser = messages.find((item) => item.role === 'user');
  const titleSeed = firstUser
    ? firstUser.content.replace(/\s+/g, ' ').slice(0, 80)
    : (parsed.meta && parsed.meta.cwd ? path.basename(parsed.meta.cwd) : 'Codex session');
  return {
    path: filePath,
    meta: parsed.meta,
    title: 'Codex · ' + titleSeed,
    goal: firstUser ? firstUser.content.slice(0, 2000) : '',
    sessionId: parsed.meta && (parsed.meta.session_id || parsed.meta.id) || null,
    messages,
    stats: {
      totalParsed: parsed.messages.length,
      imported: messages.length,
      truncated: parsed.messages.length > messages.length
    }
  };
}

function resolveRolloutPath(input, listed) {
  if (!input) return null;
  const value = String(input).trim();
  if (!value) return null;
  if (path.isAbsolute(value) || /[\\/]/.test(value)) return path.resolve(value);
  const match = (listed || []).find((item) => item.sessionId === value || item.fileName === value || item.path.endsWith(value));
  return match ? match.path : null;
}

module.exports = {
  defaultCodexHome,
  sessionsRoot,
  listCodexRollouts,
  loadCodexRollout,
  parseRolloutLines,
  resolveRolloutPath,
  isHarnessUserMessage,
  extractText
};
