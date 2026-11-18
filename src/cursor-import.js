'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function defaultCursorHome() {
  return process.env.CURSOR_HOME
    ? path.resolve(process.env.CURSOR_HOME)
    : path.join(os.homedir(), '.cursor');
}

function projectsRoot(cursorHome = defaultCursorHome()) {
  return path.join(cursorHome, 'projects');
}

function isUuidName(name) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(name || ''));
}

async function walkTranscripts(root, acc = [], options = {}) {
  const includeSubagents = Boolean(options.includeSubagents);
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return acc;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!includeSubagents && entry.name === 'subagents') continue;
      await walkTranscripts(full, acc, options);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    if (!includeSubagents && /[\\/]subagents[\\/]/i.test(full)) continue;
    acc.push(full);
  }
  return acc;
}

function extractTextParts(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (part.type === 'tool_use' || part.type === 'tool_result') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    return '';
  }).filter(Boolean).join('\n').trim();
}

function extractTimestamp(text) {
  const match = String(text || '').match(/<timestamp>\s*([^<]+?)\s*<\/timestamp>/i);
  return match ? match[1].trim() : null;
}

function cleanUserText(text) {
  let value = String(text || '').trim();
  value = value.replace(/<timestamp>\s*[^<]*<\/timestamp>\s*/gi, '').trim();
  const query = value.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  if (query) return query[1].trim();
  value = value.replace(/<\/?(user_info|agent_transcripts|communication|citing_code|system_reminder)[^>]*>/gi, ' ').trim();
  return value;
}

function cleanAssistantText(text) {
  let value = String(text || '').trim();
  // Keep the human-visible reply; drop trailing tool dumps if any leaked into text.
  value = value.replace(/<\/?(tool_use|tool_result|function_calls)[^>]*>[\s\S]*$/gi, '').trim();
  return value;
}

function isHarnessNoise(role, text) {
  const value = String(text || '');
  if (!value.trim()) return true;
  if (/<(dynamic_tools|available_skills|agent_skill|system_reminder|mcp_file_system|functions\.)\b/i.test(value)) {
    return true;
  }
  if (/Available dynamic tool namespaces:/i.test(value)) return true;
  if (/^You (use tools via function calls|are an AI coding assistant)/i.test(value)) return true;
  if (role === 'assistant' && value.length > 12000) return true;
  if (role === 'user' && value.length > 8000 && !/<user_query>/i.test(String(text))) return true;
  return false;
}

function decodeCursorProjectSlug(slug) {
  const parts = String(slug || '').split('-').filter(Boolean);
  if (parts.length < 2) return null;
  const drive = parts[0];
  if (!/^[a-zA-Z]$/.test(drive)) return null;
  return path.resolve(drive.toUpperCase() + ':' + path.sep + parts.slice(1).join(path.sep));
}

function extractPathCandidates(text) {
  const value = String(text || '');
  // Stop at whitespace so Chinese/English prose after a path is not absorbed.
  const windows = value.match(/[A-Za-z]:\\[^\s"'<>|*?]+/g) || [];
  const unix = value.match(/\/(?:Users|home|mnt|opt|var|data)\/[^\s"'<>|*?]+/g) || [];
  return [...windows, ...unix].map((item) => item.replace(/[),.，。；;]+$/g, ''));
}

async function pathExistsAsDir(candidate) {
  try {
    const stat = await fs.stat(candidate);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function resolveExistingWorkspace(candidates) {
  const exact = [];
  const seen = new Set();
  for (const raw of candidates) {
    if (!raw) continue;
    const current = path.resolve(String(raw));
    if (seen.has(current)) continue;
    seen.add(current);
    if (await pathExistsAsDir(current)) exact.push(current);
  }
  if (exact.length) {
    exact.sort((a, b) => b.length - a.length);
    return exact[0];
  }

  // Fall back to walking parents only when no candidate exists exactly.
  for (const raw of candidates) {
    if (!raw) continue;
    let current = path.resolve(String(raw));
    for (let depth = 0; depth < 8; depth += 1) {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
      if (seen.has(current)) continue;
      seen.add(current);
      if (await pathExistsAsDir(current)) return current;
    }
  }
  return null;
}

async function inferWorkspaceFromTranscript({ project, messages, filePath }) {
  const candidates = [];
  const fromSlug = decodeCursorProjectSlug(project);
  if (fromSlug) candidates.push(fromSlug);

  const sample = (messages || []).slice(-20).map((item) => item.content).join('\n');
  for (const item of extractPathCandidates(sample)) candidates.push(item);
  if (filePath) {
    for (const item of extractPathCandidates(filePath)) candidates.push(item);
  }

  // Prefer slug decode when it exists as a directory.
  if (fromSlug && await pathExistsAsDir(fromSlug)) return fromSlug;
  return resolveExistingWorkspace(candidates);
}

function parseTranscriptLines(text) {
  const messages = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const role = event.role === 'user' || event.role === 'assistant' ? event.role : null;
    if (!role) continue;
    const raw = extractTextParts(event.message && event.message.content);
    if (!raw) continue;
    const createdAt = extractTimestamp(raw);
    const content = role === 'user' ? cleanUserText(raw) : cleanAssistantText(raw);
    if (!content) continue;
    if (isHarnessNoise(role, content)) continue;
    if (content.length > 50000) continue;
    messages.push({
      role,
      content,
      messageId: String(event.id || event.messageId || ('cursor:' + role + ':' + messages.length)).slice(0, 200),
      createdAt
    });
  }
  return { messages };
}

function projectSlugFromPath(filePath, cursorHome = defaultCursorHome()) {
  const root = projectsRoot(cursorHome);
  const relative = path.relative(root, filePath);
  const parts = relative.split(/[\\/]/).filter(Boolean);
  return parts[0] || null;
}

function sessionIdFromPath(filePath) {
  const base = path.basename(filePath, '.jsonl');
  if (isUuidName(base)) return base;
  const parent = path.basename(path.dirname(filePath));
  if (isUuidName(parent)) return parent;
  return base;
}

async function readTranscriptSummary(filePath, options = {}) {
  const cursorHome = options.cursorHome || defaultCursorHome();
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read({
      buffer: Buffer.alloc(96 * 1024),
      position: 0
    });
    const head = buffer.slice(0, bytesRead).toString('utf8');
    const parsed = parseTranscriptLines(head);
    const firstUser = parsed.messages.find((item) => item.role === 'user');
    const preview = firstUser
      ? firstUser.content.replace(/\s+/g, ' ').slice(0, 120)
      : '';
    const sessionId = sessionIdFromPath(filePath);
    const project = projectSlugFromPath(filePath, cursorHome);
    const workspace = await inferWorkspaceFromTranscript({
      project,
      messages: parsed.messages,
      filePath
    });
    return {
      path: filePath,
      fileName: path.basename(filePath),
      sessionId: String(sessionId),
      project,
      workspace,
      preview,
      startedAt: firstUser && firstUser.createdAt || null,
      mtimeMs: stat.mtimeMs,
      mtime: stat.mtime.toISOString(),
      size: stat.size,
      isSubagent: /[\\/]subagents[\\/]/i.test(filePath)
    };
  } finally {
    await handle.close();
  }
}

async function listCursorTranscripts(options = {}) {
  const cursorHome = options.cursorHome || defaultCursorHome();
  const root = projectsRoot(cursorHome);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 30));
  const includeSubagents = Boolean(options.includeSubagents);
  const projectFilter = options.project ? String(options.project).trim() : '';
  const files = await walkTranscripts(root, [], { includeSubagents });
  const summaries = [];
  for (const file of files) {
    try {
      const summary = await readTranscriptSummary(file, { cursorHome });
      if (projectFilter && summary.project !== projectFilter) continue;
      if (!includeSubagents && summary.isSubagent) continue;
      summaries.push(summary);
    } catch {
      // Skip unreadable transcripts.
    }
  }
  summaries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return {
    cursorHome,
    projectsRoot: root,
    transcripts: summaries.slice(0, limit)
  };
}

async function loadCursorTranscript(filePath, options = {}) {
  const maxMessages = Math.max(1, Math.min(200, Number(options.maxMessages) || 40));
  const cursorHome = options.cursorHome || defaultCursorHome();
  const text = await fs.readFile(filePath, 'utf8');
  const parsed = parseTranscriptLines(text);
  const messages = parsed.messages.slice(-maxMessages);
  const firstUser = messages.find((item) => item.role === 'user');
  const lastUser = [...messages].reverse().find((item) => item.role === 'user');
  const project = projectSlugFromPath(filePath, cursorHome);
  const workspace = await inferWorkspaceFromTranscript({ project, messages, filePath });
  const titleSeed = (lastUser || firstUser)
    ? (lastUser || firstUser).content.replace(/\s+/g, ' ').slice(0, 80)
    : (project || 'Cursor session');
  return {
    path: filePath,
    project,
    workspace,
    title: 'Cursor · ' + titleSeed,
    goal: (lastUser || firstUser) ? (lastUser || firstUser).content.slice(0, 2000) : '',
    sessionId: sessionIdFromPath(filePath),
    messages,
    stats: {
      totalParsed: parsed.messages.length,
      imported: messages.length,
      truncated: parsed.messages.length > messages.length,
      droppedHarness: Math.max(0, (text.split(/\r?\n/).filter(Boolean).length) - parsed.messages.length)
    }
  };
}

function resolveTranscriptPath(input, listed) {
  if (!input) return null;
  const value = String(input).trim();
  if (!value) return null;
  if (path.isAbsolute(value) || /[\\/]/.test(value)) return path.resolve(value);
  const match = (listed || []).find((item) => (
    item.sessionId === value
    || item.fileName === value
    || item.path.endsWith(value)
  ));
  return match ? match.path : null;
}

module.exports = {
  defaultCursorHome,
  projectsRoot,
  listCursorTranscripts,
  loadCursorTranscript,
  parseTranscriptLines,
  resolveTranscriptPath,
  decodeCursorProjectSlug,
  inferWorkspaceFromTranscript,
  isHarnessNoise,
  extractTextParts,
  cleanUserText
};
