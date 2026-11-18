'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { McpServer, callTool, tools } = require('../src/mcp-server');
const { RelayService } = require('../src/service');

test('MCP tool catalog covers the bridge control plane', () => {
  const names = tools().map((item) => item.name);
  assert.ok(names.includes('relaydock_session_create'));
  assert.ok(names.includes('relaydock_checkpoint_create'));
  assert.ok(names.includes('relaydock_packet_compile'));
  assert.ok(names.includes('relaydock_export'));
  const resolve = tools().find((item) => item.name === 'relaydock_approval_resolve');
  assert.equal(resolve.inputSchema.properties.continueTurn.default, true);
});

test('MCP approval resolution continues the paused turn by default', async () => {
  const calls = [];
  const service = {
    async resolveApproval(approvalId, input) {
      calls.push({ approvalId, input });
      return { status: 'resolved', decision: input.decision };
    }
  };

  await callTool(service, 'relaydock_approval_resolve', {
    approvalId: 'approval-1',
    decision: 'approve'
  });
  await callTool(service, 'relaydock_approval_resolve', {
    approvalId: 'approval-2',
    decision: 'approve',
    continueTurn: false
  });

  assert.equal(calls[0].input.continueTurn, true);
  assert.equal(calls[1].input.continueTurn, false);
});

test('MCP tools can create a bound session and record Codex evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-mcp-'));
  const service = new RelayService({ workspace: root, dataDir: path.join(root, '.relaydock') });
  await service.init();

  const session = await callTool(service, 'relaydock_session_create', {
    title: 'Codex bridge',
    goal: 'Keep the real chat in Codex',
    originProvider: 'codex',
    externalKey: 'codex:thread-1'
  });
  assert.ok(session.id);

  const message = await callTool(service, 'relaydock_message_record', {
    sessionId: session.id,
    role: 'assistant',
    content: 'Codex finished the auth helper.',
    originProvider: 'codex',
    messageId: 'codex:assistant:1'
  });
  assert.equal(message.payload.messageId, 'codex:assistant:1');

  const checkpoint = await callTool(service, 'relaydock_checkpoint_create', {
    sessionId: session.id,
    summary: 'Ready to hand off'
  });
  assert.equal(checkpoint.sessionId, session.id);

  const listed = await callTool(service, 'relaydock_session_list', {});
  assert.equal(listed.bindings[0].externalKey, 'codex:thread-1');
  assert.equal(listed.bindings[0].sessionId, session.id);

  await fs.rm(root, { recursive: true, force: true });
});

test('MCP stdio server answers initialize and tools/list', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-mcp-stdio-'));
  const service = new RelayService({ workspace: root, dataDir: path.join(root, '.relaydock') });
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk));

  const mcp = new McpServer(service, { input, output, error: new PassThrough() });
  await mcp.start();

  input.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } }
  }) + '\n');
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');

  await new Promise((resolve) => setTimeout(resolve, 50));
  const lines = chunks.join('').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].result.serverInfo.name, 'relaydock');
  assert.ok(lines[1].result.tools.length >= 10);

  input.end();
  await fs.rm(root, { recursive: true, force: true });
});
