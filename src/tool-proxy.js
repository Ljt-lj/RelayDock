'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readJson, redactText, safeFileName, sha256, writeJson } = require('./utils');
const {
  hashWorkspaceFile,
  isSensitivePath,
  listWorkspaceFiles,
  readWorkspaceFile,
  resolveInside,
  searchWorkspace,
  writeWorkspaceFile
} = require('./workspace');

const execFileAsync = promisify(execFile);

const TOOL_DEFINITIONS = Object.freeze([
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List workspace files under a relative path. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path, default .' },
          limit: { type: 'integer', minimum: 1, maximum: 500 }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 workspace file. Secrets and files over 64 KiB are excluded.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          startLine: { type: 'integer', minimum: 1 },
          endLine: { type: 'integer', minimum: 1 }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_text',
      description: 'Search workspace text files using a literal case-insensitive query. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          path: { type: 'string' },
          maxMatches: { type: 'integer', minimum: 1, maximum: 100 }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_write_file',
      description: 'Propose writing a complete UTF-8 file. Requires explicit user approval and stops the current turn.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['path', 'content', 'reason'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_run_command',
      description: 'Propose a non-shell command in the workspace. Requires explicit user approval and stops the current turn.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' }, maxItems: 30 },
          cwd: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['command', 'reason'],
        additionalProperties: false
      }
    }
  }
]);

const READ_TOOLS = new Set(['list_files', 'read_file', 'search_text']);
const MUTATION_TOOLS = new Set(['propose_write_file', 'propose_run_command']);

function parseArguments(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Tool arguments are not valid JSON');
  }
}

function publicApproval(record) {
  return {
    approvalId: record.approvalId,
    sessionId: record.sessionId,
    providerId: record.providerId,
    toolCallId: record.toolCallId,
    workspace: record.workspace || null,
    actionType: record.action.type,
    summary: record.action.summary,
    preview: record.action.preview,
    createdAt: record.createdAt
  };
}

class ToolProxy {
  constructor(workspace, dataDir, options = {}) {
    this.workspace = path.resolve(workspace);
    this.approvalDir = path.join(dataDir, 'approvals');
    this.secrets = options.getSecrets || (() => []);
    this.timeoutMs = options.timeoutMs || 30000;
    this.maxOutputBytes = options.maxOutputBytes || 64 * 1024;
  }

  definitions() {
    return TOOL_DEFINITIONS;
  }

  isReadOnly(name) {
    return READ_TOOLS.has(name);
  }

  isMutation(name) {
    return MUTATION_TOOLS.has(name);
  }

  sanitize(text) {
    return redactText(text, this.secrets());
  }

  async executeReadOnly(toolCall) {
    const name = toolCall.function.name;
    const args = parseArguments(toolCall.function.arguments);
    if (name === 'list_files') {
      const files = await listWorkspaceFiles(this.workspace, args.path || '.', args.limit || 200);
      return { summary: 'Listed ' + files.length + ' files', output: files.join('\n') };
    }
    if (name === 'read_file') {
      if (isSensitivePath(args.path)) throw new Error('Sensitive files are excluded');
      const content = await readWorkspaceFile(this.workspace, args.path, {
        startLine: args.startLine,
        endLine: args.endLine
      });
      return { summary: 'Read ' + args.path, output: content };
    }
    if (name === 'search_text') {
      const result = await searchWorkspace(this.workspace, args.query, args.path || '.', args.maxMatches || 50);
      const text = result.matches.map((match) => match.path + ':' + match.line + ': ' + match.text).join('\n') || 'No matches';
      return { summary: 'Search "' + args.query + '": ' + result.matches.length + ' matches', output: text };
    }
    throw new Error('Unknown read-only tool: ' + name);
  }

  async prepareMutation(toolCall, context) {
    const name = toolCall.function.name;
    const args = parseArguments(toolCall.function.arguments);
    const approvalId = crypto.randomUUID();
    let action;
    if (name === 'propose_write_file') {
      if (!args.path) throw new Error('path is required');
      if (typeof args.content !== 'string') throw new Error('content must be a string');
      if (Buffer.byteLength(args.content) > 512 * 1024) throw new Error('Proposed file exceeds 512 KiB');
      if (isSensitivePath(args.path)) throw new Error('Sensitive files cannot be written');
      resolveInside(this.workspace, args.path);
      const expectedHash = await hashWorkspaceFile(this.workspace, args.path);
      action = {
        type: 'write_file',
        path: args.path,
        content: args.content,
        expectedHash,
        reason: String(args.reason || ''),
        summary: 'Write ' + args.path,
        preview: 'Replace or create ' + args.path + ' (' + Buffer.byteLength(args.content) + ' bytes). Conflict check: ' + (expectedHash ? 'existing file hash ' + expectedHash.slice(0, 12) : 'new file') + '.'
      };
    } else if (name === 'propose_run_command') {
      if (!args.command) throw new Error('command is required');
      const argsList = Array.isArray(args.args) ? args.args.map(String) : [];
      if (argsList.length > 30) throw new Error('Too many command arguments');
      const cwd = resolveInside(this.workspace, args.cwd || '.');
      action = {
        type: 'run_command',
        command: String(args.command),
        args: argsList,
        cwd: path.relative(this.workspace, cwd) || '.',
        reason: String(args.reason || ''),
        summary: 'Run ' + args.command + (argsList.length ? ' ' + argsList.join(' ') : ''),
        preview: 'Run without a shell in ' + (path.relative(this.workspace, cwd) || '.') + ': ' + args.command + (argsList.length ? ' ' + argsList.join(' ') : '')
      };
    } else {
      throw new Error('Unknown mutation tool: ' + name);
    }
    const record = {
      approvalId,
      sessionId: context.sessionId,
      providerId: context.providerId,
      toolCallId: toolCall.id,
      workspace: path.resolve(context.workspace || this.workspace),
      action,
      createdAt: new Date().toISOString()
    };
    await writeJson(this.approvalFile(approvalId), record, { mode: 0o600 });
    return publicApproval(record);
  }

  approvalFile(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid approval id');
    return path.join(this.approvalDir, safeFileName(id) + '.json');
  }

  async getApproval(id) {
    return readJson(this.approvalFile(id), null);
  }

  async listPending() {
    await fs.mkdir(this.approvalDir, { recursive: true });
    const files = (await fs.readdir(this.approvalDir)).filter((name) => name.endsWith('.json'));
    const records = [];
    for (const file of files) {
      const record = await readJson(path.join(this.approvalDir, file), null);
      if (record) records.push(publicApproval(record));
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async resolve(approvalId, decision) {
    const record = await this.getApproval(approvalId);
    if (!record) throw new Error('Approval is missing or already resolved');
    if (decision === 'reject') {
      await fs.rm(this.approvalFile(approvalId), { force: true });
      return { record, result: { ok: false, summary: 'Rejected by user' } };
    }
    let result;
    try {
      result = await this.executeApproved(record.action);
    } catch (error) {
      error.publicResult = { ok: false, summary: this.sanitize(error.message), code: error.code || 'TOOL_FAILED' };
      await fs.rm(this.approvalFile(approvalId), { force: true });
      throw error;
    }
    await fs.rm(this.approvalFile(approvalId), { force: true });
    return { record, result: { ok: true, ...result } };
  }

  async executeApproved(action) {
    if (action.type === 'write_file') {
      const result = await writeWorkspaceFile(this.workspace, action.path, action.content, action.expectedHash);
      return { summary: 'Wrote ' + result.path + ' (' + result.bytes + ' bytes, sha256 ' + result.sha256.slice(0, 12) + ')', files: [result] };
    }
    if (action.type === 'run_command') {
      const cwd = resolveInside(this.workspace, action.cwd);
      const env = this.safeEnvironment();
      try {
        const completed = await execFileAsync(action.command, action.args, {
          cwd,
          env,
          shell: false,
          windowsHide: true,
          timeout: this.timeoutMs,
          maxBuffer: this.maxOutputBytes
        });
        return {
          summary: 'Command completed: ' + action.command + ' (exit 0)',
          output: this.sanitize(String(completed.stdout || '') + String(completed.stderr || '')).slice(0, this.maxOutputBytes),
          exitCode: 0
        };
      } catch (error) {
        const output = this.sanitize(String(error.stdout || '') + String(error.stderr || error.message || '')).slice(0, this.maxOutputBytes);
        const result = { ok: false, summary: 'Command failed: ' + action.command + ' (exit ' + (error.code || 1) + ')', output, exitCode: error.code || 1, code: 'COMMAND_FAILED' };
        return result;
      }
    }
    throw new Error('Unsupported approved action');
  }

  safeEnvironment() {
    const safe = {};
    const allow = ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'];
    for (const key of allow) if (process.env[key]) safe[key] = process.env[key];
    return safe;
  }
}

module.exports = { TOOL_DEFINITIONS, ToolProxy, parseArguments, publicApproval };
