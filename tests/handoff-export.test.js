'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { RelayService } = require('../src/service');

async function createService(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-handoff-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  const service = new RelayService({ workspace, dataDir: path.join(root, '.relaydock') });
  await service.init();
  t.after(async () => {
    for (const lease of service.activeLeases()) service.clearLeaseTimer(lease[1]);
    await fs.rm(root, { recursive: true, force: true });
  });
  return { workspace, service };
}

test('markdown export is a handoff brief and keeps tool bodies out of the file', async (t) => {
  const { workspace, service } = await createService(t);
  const session = await service.createSession({
    title: 'Login fix',
    goal: 'Finish the login tests',
    openIssues: ['Old suite still fails'],
    nextSteps: ['Re-run the login suite']
  });
  await service.recordMessage(session.id, { role: 'user', content: '你是一个什么项目？' });
  const fileBody = 'UNIQUE_README_BODY_' + 'x'.repeat(400);
  await service.ledger.append(session.id, 'tool.completed', {
    toolCallId: 'call-readme',
    toolName: 'read_file',
    detail: 'README.md',
    summary: 'Read README.md',
    output: fileBody
  }, { originProvider: 'deepseek', actor: 'deepseek' });
  await service.recordMessage(session.id, {
    role: 'assistant',
    originProvider: 'deepseek',
    content: 'RelayDock 是本地接力工作台。'
  });

  const markdown = await service.exportSession(session.id, 'markdown');
  const json = await service.exportSession(session.id, 'json');

  assert.match(markdown, new RegExp(workspace.replace(/\\/g, '\\\\')));
  assert.match(markdown, /Finish the login tests/);
  assert.match(markdown, /RelayDock 是本地接力工作台。/);
  assert.match(markdown, /No files were changed by this session/);
  assert.match(markdown, /read_file README\.md: Read README\.md/);
  assert.equal(markdown.includes(fileBody), false);
  assert.equal(markdown.includes('call-readme'), false);
  assert.equal(json.events.some((event) => event.payload && event.payload.output === fileBody), true);
});

test('markdown export lists files this session actually wrote', async (t) => {
  const { service } = await createService(t);
  const session = await service.createSession({ title: 'Write file' });
  await service.ledger.append(session.id, 'file.changed', {
    path: 'src/login.js',
    sha256: 'abcdef1234567890',
    bytes: 42
  }, { originProvider: 'deepseek', actor: 'user' });

  const markdown = await service.exportSession(session.id, 'markdown');
  assert.match(markdown, /src\/login\.js/);
  assert.match(markdown, /abcdef1234567890/);
  assert.equal(markdown.includes('No files were changed by this session'), false);
});
