'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  decodeCursorProjectSlug,
  isHarnessNoise,
  listCursorTranscripts,
  parseTranscriptLines
} = require('../src/cursor-import');
const { createRelayServer, listen } = require('../src/server');
const { RelayService } = require('../src/service');

function sampleTranscript() {
  return [
    JSON.stringify({
      role: 'user',
      message: {
        content: [{
          type: 'text',
          text: '<timestamp>Monday, Nov 16, 2026, 2:26 PM (UTC+8)</timestamp>\n<user_query>\n请继续完成登录模块并修复失败测试\n</user_query>'
        }]
      }
    }),
    JSON.stringify({
      role: 'assistant',
      message: {
        content: [
          { type: 'text', text: '我先检查相关文件。' },
          { type: 'tool_use', name: 'Read', input: { path: 'D:\\demo\\auth.js' } }
        ]
      }
    }),
    JSON.stringify({
      role: 'assistant',
      message: {
        content: [{ type: 'text', text: '已完成认证中间件，还剩两个集成测试失败。' }]
      }
    })
  ].join('\n') + '\n';
}

test('parseTranscriptLines extracts user_query and skips tool_use-only noise', () => {
  const parsed = parseTranscriptLines(sampleTranscript());
  assert.equal(parsed.messages.length, 3);
  assert.equal(parsed.messages[0].role, 'user');
  assert.match(parsed.messages[0].content, /登录模块/);
  assert.equal(parsed.messages[0].createdAt, 'Monday, Nov 16, 2026, 2:26 PM (UTC+8)');
  assert.equal(parsed.messages[1].role, 'assistant');
  assert.match(parsed.messages[1].content, /检查相关文件/);
  assert.doesNotMatch(parsed.messages[1].content, /tool_use|Read/);
});

test('Cursor project slugs decode to workspace paths and harness dumps are dropped', () => {
  assert.equal(decodeCursorProjectSlug('d-RelayDock'), path.resolve('D:\\RelayDock'));
  assert.equal(decodeCursorProjectSlug('c-Users-Kele-Desktop'), path.resolve('C:\\Users\\Kele\\Desktop'));
  assert.equal(isHarnessNoise('assistant', '<dynamic_tools>lots</dynamic_tools>'), true);
  assert.equal(isHarnessNoise('assistant', '已完成认证中间件'), false);

  const noisy = sampleTranscript() + JSON.stringify({
    role: 'assistant',
    message: { content: [{ type: 'text', text: 'Available dynamic tool namespaces:\n<dynamic_tools>x</dynamic_tools>' }] }
  }) + '\n';
  const parsed = parseTranscriptLines(noisy);
  assert.equal(parsed.messages.length, 3);
});

test('service imports a local Cursor transcript into a RelayDock session', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-cursor-import-'));
  const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const transcriptDir = path.join(root, 'projects', 'demo-project', 'agent-transcripts', sessionId);
  await fs.mkdir(transcriptDir, { recursive: true });
  const transcriptPath = path.join(transcriptDir, sessionId + '.jsonl');
  await fs.writeFile(transcriptPath, sampleTranscript(), 'utf8');

  const service = new RelayService({ workspace: root, dataDir: path.join(root, '.relaydock') });
  const listed = await service.listCursorSessions({ cursorHome: root, limit: 10 });
  assert.equal(listed.transcripts.length, 1);
  assert.equal(listed.transcripts[0].sessionId, sessionId);
  assert.equal(listed.transcripts[0].project, 'demo-project');

  const projectWorkspace = path.join(root, 'project-workspace');
  await fs.mkdir(projectWorkspace, { recursive: true });
  // Rewrite transcript under a slug that decodes to projectWorkspace via junction-like path is hard;
  // instead pass switchWorkspace with inferred path by planting an absolute path in content.
  const richTranscript = [
    JSON.stringify({
      role: 'user',
      message: {
        content: [{
          type: 'text',
          text: '<user_query>\n请在 ' + projectWorkspace + ' 继续修复登录\n</user_query>'
        }]
      }
    }),
    JSON.stringify({
      role: 'assistant',
      message: { content: [{ type: 'text', text: '好的，我只改这个项目目录。' }] }
    })
  ].join('\n') + '\n';
  await fs.writeFile(transcriptPath, richTranscript, 'utf8');

  const imported = await service.importCursorSession({
    cursorHome: root,
    path: sessionId,
    maxMessages: 20,
    switchWorkspace: true
  });
  assert.ok(imported.session.id);
  assert.equal(imported.imported.length, 2);
  assert.ok(imported.checkpoint.checkpointId);
  assert.match(imported.session.title, /Cursor/);
  assert.equal(path.resolve(imported.workspace), path.resolve(projectWorkspace));
  assert.equal(imported.workspaceChange.switched, true);

  await fs.rm(root, { recursive: true, force: true });
});

test('HTTP API can list and import Cursor transcripts', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-cursor-api-'));
  const sessionId = '11111111-2222-3333-4444-555555555555';
  const transcriptDir = path.join(root, 'cursor-home', 'projects', 'demo-api', 'agent-transcripts', sessionId);
  await fs.mkdir(transcriptDir, { recursive: true });
  await fs.writeFile(path.join(transcriptDir, sessionId + '.jsonl'), sampleTranscript(), 'utf8');

  const server = await createRelayServer({
    workspace: root,
    dataDir: path.join(root, '.relaydock'),
    token: 'cursor-import-token'
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const headers = {
    'content-type': 'application/json',
    'x-relaydock-token': 'cursor-import-token'
  };
  const listed = await fetch(
    address.url + '/api/cursor/sessions?limit=10&cursorHome=' + encodeURIComponent(path.join(root, 'cursor-home')),
    { headers }
  ).then((response) => response.json());
  assert.equal(listed.transcripts.length, 1);

  const imported = await fetch(address.url + '/api/cursor/import', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      path: listed.transcripts[0].path,
      maxMessages: 20
    })
  }).then(async (response) => {
    assert.equal(response.status, 201);
    return response.json();
  });
  assert.equal(imported.imported.length, 3);
  assert.match(imported.session.title, /Cursor/);
});

test('listCursorTranscripts returns empty when projects dir missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-cursor-empty-'));
  const listed = await listCursorTranscripts({ cursorHome: root, limit: 5 });
  assert.equal(listed.transcripts.length, 0);
  await fs.rm(root, { recursive: true, force: true });
});
