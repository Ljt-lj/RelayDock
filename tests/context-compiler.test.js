'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { approximateTokens, buildRelayPacket } = require('../src/context-compiler');

function event(sequence, type, payload) {
  return {
    sequence,
    type,
    origin_provider: payload.originProvider || 'relaydock',
    payload
  };
}

test('relay packet preserves task state, provenance, and truncation metadata', () => {
  const messages = [
    event(1, 'message.created', {
      role: 'user',
      originProvider: 'codex',
      content: 'Implement the feature. Authorization: Bearer abcdefgh12345678'
    }),
    event(2, 'message.created', {
      role: 'assistant',
      originProvider: 'deepseek',
      untrusted: true,
      content: 'I inspected the repository.'
    })
  ];
  const tools = [
    event(3, 'tool.completed', {
      originProvider: 'deepseek',
      toolName: 'read_file',
      summary: 'Read src/app.js',
      output: 'export function feature() {\n  return true;\n}'
    })
  ];
  const packet = buildRelayPacket({
    sessionId: 'session-1',
    checkpoint: {
      checkpointId: 'checkpoint-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      summary: 'Half complete',
      openIssues: ['Run tests'],
      nextSteps: ['Fix the remaining failure'],
      workspace: {
        root: 'D:/project',
        git: {
          branch: 'main',
          commit: 'abc123',
          status: ' M src/app.js',
          diff: '+ changed'
        },
        files: [{ path: 'src/app.js', sha256: 'a'.repeat(64) }]
      }
    },
    contract: {
      goal: 'Ship the feature',
      acceptanceCriteria: ['Tests pass'],
      constraints: ['No dependencies'],
      decisions: ['Use the event ledger']
    },
    messages,
    tools,
    request: 'Continue with the remaining test failure.',
    maxChars: 8000
  });

  assert.match(packet.markdown, /RelayDock Handoff Packet/);
  assert.match(packet.markdown, /Goal: Ship the feature/);
  assert.match(packet.markdown, /UNTRUSTED EVIDENCE/);
  assert.match(packet.markdown, /M src\/app\.js/);
  assert.match(packet.markdown, /export function feature\(\)/);
  assert.match(packet.markdown, /\[REDACTED\]/);
  assert.equal(packet.markdown.includes('abcdefgh12345678'), false);
  assert.ok(packet.markdown.length <= 8000);
  assert.equal(packet.stats.messageEvents, 2);
  assert.equal(packet.stats.toolEvents, 1);
});

test('relay packet enforces the minimum configured budget and records omission', () => {
  const messages = Array.from({ length: 30 }, (_, index) => event(index + 1, 'message.created', {
    role: 'assistant',
    originProvider: 'deepseek',
    untrusted: true,
    content: 'message-' + index + ' ' + 'x'.repeat(900)
  }));
  const packet = buildRelayPacket({
    sessionId: 'session-2',
    checkpoint: { workspace: { git: {} } },
    contract: {},
    messages,
    tools: [],
    maxChars: 100
  });

  assert.equal(packet.stats.maxChars, 8000);
  assert.ok(packet.markdown.length <= 8000);
  assert.ok(packet.omitted.length > 0);
  assert.equal(packet.stats.approximateTokens, approximateTokens(packet.markdown));
});
