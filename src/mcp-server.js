'use strict';

const { VERSION } = require('./version');

const PROTOCOL_VERSION = '2024-11-05';

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

function tools() {
  return [
    tool('relaydock_status', 'Show RelayDock workspace overview: sessions, providers, approvals, and data directory.', {
      type: 'object',
      properties: {},
      additionalProperties: false
    }),
    tool('relaydock_provider_list', 'List configured OpenAI-compatible providers without secrets.', {
      type: 'object',
      properties: {},
      additionalProperties: false
    }),
    tool('relaydock_session_create', 'Create a RelayDock bridge session that mirrors a third-party platform task.', {
      type: 'object',
      properties: {
        title: { type: 'string' },
        goal: { type: 'string' },
        constraints: { type: 'array', items: { type: 'string' } },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        decisions: { type: 'array', items: { type: 'string' } },
        openIssues: { type: 'array', items: { type: 'string' } },
        nextSteps: { type: 'array', items: { type: 'string' } },
        originProvider: { type: 'string', description: 'codex, cursor, or another platform id' },
        externalKey: { type: 'string', description: 'Optional stable key that binds this platform conversation to the RelayDock session' }
      },
      additionalProperties: false
    }),
    tool('relaydock_session_list', 'List RelayDock bridge sessions.', {
      type: 'object',
      properties: {},
      additionalProperties: false
    }),
    tool('relaydock_session_get', 'Get one session and pending approvals.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' }
      },
      required: ['sessionId'],
      additionalProperties: false
    }),
    tool('relaydock_session_update', 'Update the task contract for a bridge session.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        title: { type: 'string' },
        goal: { type: 'string' },
        summary: { type: 'string' },
        constraints: { type: 'array', items: { type: 'string' } },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        decisions: { type: 'array', items: { type: 'string' } },
        openIssues: { type: 'array', items: { type: 'string' } },
        nextSteps: { type: 'array', items: { type: 'string' } },
        originProvider: { type: 'string' }
      },
      required: ['sessionId'],
      additionalProperties: false
    }),
    tool('relaydock_session_bind', 'Bind a third-party conversation id to an existing RelayDock session.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        externalKey: { type: 'string' },
        originProvider: { type: 'string' }
      },
      required: ['sessionId', 'externalKey'],
      additionalProperties: false
    }),
    tool('relaydock_message_record', 'Import a message from Codex/Cursor into the RelayDock ledger. Use stable messageId values for idempotency.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        role: { type: 'string', enum: ['user', 'assistant', 'system'] },
        content: { type: 'string' },
        originProvider: { type: 'string' },
        messageId: { type: 'string' },
        model: { type: 'string' },
        untrusted: { type: 'boolean' }
      },
      required: ['sessionId', 'role', 'content'],
      additionalProperties: false
    }),
    tool('relaydock_checkpoint_create', 'Create a recoverable workspace checkpoint before handoff.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        summary: { type: 'string' },
        testStatus: { type: 'string' },
        openIssues: { type: 'array', items: { type: 'string' } },
        nextSteps: { type: 'array', items: { type: 'string' } },
        originProvider: { type: 'string' }
      },
      required: ['sessionId'],
      additionalProperties: false
    }),
    tool('relaydock_packet_compile', 'Compile the Relay Packet that would be sent to a receiving provider.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        request: { type: 'string' },
        maxChars: { type: 'number' }
      },
      required: ['sessionId'],
      additionalProperties: false
    }),
    tool('relaydock_turn_run', 'Run one receiving-provider turn through RelayDock (agent loop with approval-gated mutations).', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        providerId: { type: 'string' },
        instruction: { type: 'string' },
        maxSteps: { type: 'number' }
      },
      required: ['sessionId'],
      additionalProperties: false
    }),
    tool('relaydock_approval_list', 'List pending mutation approvals.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' }
      },
      additionalProperties: false
    }),
    tool('relaydock_approval_resolve', 'Approve or reject a pending mutation. Optionally continue the paused turn.', {
      type: 'object',
      properties: {
        approvalId: { type: 'string' },
        decision: { type: 'string', enum: ['approve', 'reject'] },
        continueTurn: { type: 'boolean' },
        maxSteps: { type: 'number' }
      },
      required: ['approvalId', 'decision'],
      additionalProperties: false
    }),
    tool('relaydock_export', 'Export the bridge session as Markdown or JSON for pasting back into Codex/Cursor.', {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        format: { type: 'string', enum: ['markdown', 'json'] }
      },
      required: ['sessionId'],
      additionalProperties: false
    }),
    tool('relaydock_workspace_get', 'Show the current RelayDock workspace and recent workspaces.', {
      type: 'object',
      properties: {},
      additionalProperties: false
    }),
    tool('relaydock_workspace_set', 'Switch the file/Git workspace directory used by tools, checkpoints, and diffs.', {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to an existing directory' }
      },
      required: ['path'],
      additionalProperties: false
    }),
    tool('relaydock_codex_list', 'List local Codex rollout sessions from ~/.codex/sessions for import.', {
      type: 'object',
      properties: {
        limit: { type: 'number' }
      },
      additionalProperties: false
    }),
    tool('relaydock_codex_import', 'Import a local Codex rollout into a RelayDock session (creates one if needed).', {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute rollout path, file name, or Codex session id' },
        sessionId: { type: 'string', description: 'Optional existing RelayDock session to append into' },
        maxMessages: { type: 'number' },
        title: { type: 'string' },
        goal: { type: 'string' },
        createCheckpoint: { type: 'boolean' }
      },
      required: ['path'],
      additionalProperties: false
    }),
    tool('relaydock_cursor_list', 'List local Cursor agent transcripts from ~/.cursor/projects/*/agent-transcripts for import.', {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        project: { type: 'string', description: 'Optional Cursor project slug filter' }
      },
      additionalProperties: false
    }),
    tool('relaydock_cursor_import', 'Import a local Cursor agent transcript into a RelayDock session (creates one if needed).', {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute transcript path, file name, or Cursor session uuid' },
        sessionId: { type: 'string', description: 'Optional existing RelayDock session to append into' },
        maxMessages: { type: 'number' },
        title: { type: 'string' },
        goal: { type: 'string' },
        project: { type: 'string' },
        createCheckpoint: { type: 'boolean' }
      },
      required: ['path'],
      additionalProperties: false
    })
  ];
}

async function callTool(service, name, args = {}) {
  switch (name) {
    case 'relaydock_status':
      return service.overview();
    case 'relaydock_provider_list':
      return { providers: await service.providerList() };
    case 'relaydock_session_create': {
      const session = await service.createSession(args);
      if (args.externalKey) {
        await service.bindExternalSession(args.externalKey, {
          sessionId: session.id,
          originProvider: args.originProvider || 'external',
          title: session.title
        });
      }
      return session;
    }
    case 'relaydock_session_list':
      return { sessions: await service.listSessions(), bindings: await service.listBindings() };
    case 'relaydock_session_get': {
      const session = await service.getSession(args.sessionId);
      return { session, approvals: await service.pendingApprovals(args.sessionId) };
    }
    case 'relaydock_session_update': {
      const { sessionId, ...rest } = args;
      return service.updateSession(sessionId, rest);
    }
    case 'relaydock_session_bind':
      return service.bindExternalSession(args.externalKey, {
        sessionId: args.sessionId,
        originProvider: args.originProvider || 'external'
      });
    case 'relaydock_message_record':
      return service.recordMessage(args.sessionId, args);
    case 'relaydock_checkpoint_create':
      return service.createCheckpoint(args.sessionId, args);
    case 'relaydock_packet_compile': {
      const packet = await service.compilePacket(args.sessionId, {
        request: args.request,
        maxChars: args.maxChars
      });
      return {
        checkpointId: packet.checkpointId,
        stats: packet.stats,
        omitted: packet.omitted,
        markdown: packet.markdown
      };
    }
    case 'relaydock_turn_run':
      return service.runTurn(args.sessionId, {
        providerId: args.providerId || 'deepseek',
        instruction: args.instruction || '',
        maxSteps: args.maxSteps
      });
    case 'relaydock_approval_list':
      return { approvals: await service.pendingApprovals(args.sessionId || null) };
    case 'relaydock_approval_resolve':
      return service.resolveApproval(args.approvalId, {
        decision: args.decision,
        continueTurn: Boolean(args.continueTurn),
        maxSteps: args.maxSteps
      });
    case 'relaydock_export':
      return service.exportSession(args.sessionId, args.format === 'json' ? 'json' : 'markdown');
    case 'relaydock_workspace_get':
      return service.getWorkspace();
    case 'relaydock_workspace_set':
      return service.setWorkspace(args.path);
    case 'relaydock_codex_list':
      return service.listCodexSessions({ limit: args.limit });
    case 'relaydock_codex_import':
      return service.importCodexSession({
        path: args.path,
        sessionId: args.sessionId,
        maxMessages: args.maxMessages,
        title: args.title,
        goal: args.goal,
        createCheckpoint: args.createCheckpoint
      });
    case 'relaydock_cursor_list':
      return service.listCursorSessions({ limit: args.limit, project: args.project });
    case 'relaydock_cursor_import':
      return service.importCursorSession({
        path: args.path,
        sessionId: args.sessionId,
        maxMessages: args.maxMessages,
        title: args.title,
        goal: args.goal,
        project: args.project,
        createCheckpoint: args.createCheckpoint
      });
    default:
      throw Object.assign(new Error('Unknown tool: ' + name), { code: -32601 });
  }
}

function textResult(value, isError = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: typeof value === 'string' ? { text: value } : value,
    isError
  };
}

class McpServer {
  constructor(service, options = {}) {
    this.service = service;
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    this.error = options.error || process.stderr;
    this.buffer = '';
    this.closed = false;
  }

  write(message) {
    this.output.write(JSON.stringify(message) + '\n');
  }

  log(message) {
    this.error.write(String(message) + '\n');
  }

  async handle(message) {
    if (!message || typeof message !== 'object') return null;
    if (message.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' }
      };
    }

    if (message.method && message.id === undefined) {
      if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return null;
      return null;
    }

    const id = message.id;
    try {
      if (message.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'relaydock', version: VERSION }
          }
        };
      }
      if (message.method === 'ping') {
        return { jsonrpc: '2.0', id, result: {} };
      }
      if (message.method === 'tools/list') {
        return { jsonrpc: '2.0', id, result: { tools: tools() } };
      }
      if (message.method === 'tools/call') {
        const name = message.params && message.params.name;
        const args = (message.params && message.params.arguments) || {};
        try {
          const value = await callTool(this.service, name, args);
          return { jsonrpc: '2.0', id, result: textResult(value) };
        } catch (error) {
          return {
            jsonrpc: '2.0',
            id,
            result: textResult({
              error: error.code || 'TOOL_FAILED',
              message: error.message
            }, true)
          };
        }
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found: ' + String(message.method || '') }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: error.message || 'Internal error' }
      };
    }
  }

  async start() {
    await this.service.init();
    this.input.setEncoding('utf8');
    this.input.on('data', (chunk) => {
      this.buffer += chunk;
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          this.write({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' }
          });
          continue;
        }
        Promise.resolve(this.handle(message)).then((response) => {
          if (response) this.write(response);
        }).catch((error) => {
          this.log('MCP handler failure: ' + error.message);
          if (message && message.id !== undefined) {
            this.write({
              jsonrpc: '2.0',
              id: message.id,
              error: { code: -32603, message: error.message || 'Internal error' }
            });
          }
        });
      }
    });
    this.input.on('end', () => {
      this.closed = true;
    });
    this.input.on('error', (error) => {
      this.log('MCP stdin error: ' + error.message);
    });
  }
}

module.exports = { McpServer, tools, callTool, PROTOCOL_VERSION };
