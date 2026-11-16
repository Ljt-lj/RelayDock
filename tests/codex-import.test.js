'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { listCodexRollouts, parseRolloutLines } = require('../src/codex-import');
const { createRelayServer, listen } = require('../src/server');
const { RelayService } = require('../src/service');

function sampleRollout() {
  return [
    JSON.stringify({
      type: 'session_meta',
      payload: {
        session_id: 'codex-test-session',
        cwd: 'D:\\demo-project',
        source: 'Codex Desktop',
        model_provider: 'wetokens',
        timestamp: '2026-11-16T01:00:00.000Z'
      }
    }),
    JSON.stringify({
      type: 'response_item',
      timestamp: '2026-11-16T01:00:01.000Z',
      payload: {
        type: 'message',
        id: 'msg-env',
        role: 'user',
        content: [{ type: 'input_text', text: '<environment_context><cwd>D:\\demo-project</cwd></environment_context>' }],
        internal_chat_message_metadata_passthrough: { content_item_kinds: ['environments.environment_context'] }
      }
    }),
    JSON.stringify({
      type: 'response_item',
      timestamp: '2026-11-16T01:00:02.000Z',
      payload: {
        type: 'message',
        id: 'msg-user',
        role: 'user',
        content: [{ type: 'input_text', text: '请继续完成登录模块并修复失败测试' }],
        internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] }
      }
    }),
    JSON.stringify({
      type: 'response_item',
      timestamp: '2026-11-16T01:00:03.000Z',
      payload: {
        type: 'message',
        id: 'msg-assistant',
        role: 'assistant',
        content: [{ type: 'output_text', text: '已完成认证中间件，还剩两个集成测试失败。' }]
      }
    })
  ].join('\n') + '\n';
}

test('parseRolloutLines keeps real chat and drops harness context', () => {
  const parsed = parseRolloutLines(sampleRollout());
  assert.equal(parsed.meta.session_id, 'codex-test-session');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].role, 'user');
  assert.match(parsed.messages[0].content, /登录模块/);
  assert.equal(parsed.messages[1].role, 'assistant');
});

test('service imports a local Codex rollout into a RelayDock session', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-codex-import-'));
  const sessionsDir = path.join(root, 'sessions', '2026', '11', '16');
  await fs.mkdir(sessionsDir, { recursive: true });
  const rolloutPath = path.join(sessionsDir, 'rollout-2026-11-16T01-00-00-codex-test-session.jsonl');
  await fs.writeFile(rolloutPath, sampleRollout(), 'utf8');

  const service = new RelayService({ workspace: root, dataDir: path.join(root, '.relaydock') });
  const listed = await service.listCodexSessions({ codexHome: root, limit: 10 });
  assert.equal(listed.rollouts.length, 1);
  assert.equal(listed.rollouts[0].sessionId, 'codex-test-session');

  const imported = await service.importCodexSession({
    codexHome: root,
    path: 'codex-test-session',
    maxMessages: 20
  });
  assert.ok(imported.session.id);
  assert.equal(imported.imported.length, 2);
  assert.equal(imported.session.counts.messages, 2);
  assert.ok(imported.checkpoint.checkpointId);

  await fs.rm(root, { recursive: true, force: true });
});

test('HTTP API can list and import Codex rollouts', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-codex-api-'));
  const sessionsDir = path.join(root, 'codex-home', 'sessions', '2026', '11', '16');
  await fs.mkdir(sessionsDir, { recursive: true });
  const rolloutPath = path.join(sessionsDir, 'rollout-demo.jsonl');
  await fs.writeFile(rolloutPath, sampleRollout(), 'utf8');

  const server = await createRelayServer({
    workspace: root,
    dataDir: path.join(root, '.relaydock'),
    token: 'codex-import-token'
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const headers = {
    'content-type': 'application/json',
    'x-relaydock-token': 'codex-import-token'
  };
  const listed = await fetch(address.url + '/api/codex/sessions?limit=10&codexHome=' + encodeURIComponent(path.join(root, 'codex-home')), {
    headers
  }).then((response) => response.json());
  assert.equal(listed.rollouts.length, 1);

  const imported = await fetch(address.url + '/api/codex/import', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      path: listed.rollouts[0].path,
      maxMessages: 20
    })
  }).then(async (response) => {
    assert.equal(response.status, 201);
    return response.json();
  });
  assert.equal(imported.imported.length, 2);
  assert.match(imported.session.title, /Codex/);
});

test('listCodexRollouts returns empty when sessions dir missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-codex-empty-'));
  const listed = await listCodexRollouts({ codexHome: root, limit: 5 });
  assert.equal(listed.rollouts.length, 0);
  await fs.rm(root, { recursive: true, force: true });
});
