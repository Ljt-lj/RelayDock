'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRelayServer, listen } = require('../src/server');

test('local API supports the Studio bootstrap, session, checkpoint, packet, and static app flow', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-server-'));
  await fs.writeFile(path.join(root, 'sample.txt'), 'sample workspace\n', 'utf8');
  const server = await createRelayServer({
    workspace: root,
    dataDir: path.join(root, '.relaydock'),
    token: 'test-relaydock-token'
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const health = await fetch(address.url + '/api/health').then((response) => response.json());
  assert.equal(health.ok, true);

  const unauthorized = await fetch(address.url + '/api/overview');
  assert.equal(unauthorized.status, 401);

  const bootstrap = await fetch(address.url + '/api/bootstrap').then((response) => response.json());
  assert.equal(bootstrap.token, 'test-relaydock-token');
  assert.equal(bootstrap.workspace, root);

  const headers = {
    'content-type': 'application/json',
    'x-relaydock-token': bootstrap.token
  };
  const sessionResponse = await fetch(address.url + '/api/sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Integration task',
      goal: 'Verify the end-to-end API',
      acceptanceCriteria: ['Checkpoint and packet are generated']
    })
  });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();

  const messageUrl = address.url + '/api/sessions/' + session.id + '/messages';
  const firstMessage = await fetch(messageUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ role: 'user', content: 'keep one copy', messageId: 'stable-message-1' })
  }).then((response) => response.json());
  const duplicateMessage = await fetch(messageUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ role: 'user', content: 'keep one copy', messageId: 'stable-message-1' })
  }).then((response) => response.json());
  assert.equal(duplicateMessage.event_id, firstMessage.event_id);

  const checkpointResponse = await fetch(address.url + '/api/sessions/' + session.id + '/checkpoints', {
    method: 'POST',
    headers,
    body: '{}'
  });
  assert.equal(checkpointResponse.status, 201);
  const checkpoint = await checkpointResponse.json();
  assert.equal(checkpoint.sessionId, session.id);

  const packetResponse = await fetch(address.url + '/api/sessions/' + session.id + '/packet', {
    method: 'POST',
    headers,
    body: JSON.stringify({ maxChars: 9000 })
  });
  assert.equal(packetResponse.status, 200);
  const packet = await packetResponse.json();
  assert.match(packet.markdown, /Verify the end-to-end API/);

  const longSession = await fetch(address.url + '/api/sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Cursor · 这是一个非常非常非常非常非常长的默认任务标题需要被截断显示',
      goal: 'truncate title'
    })
  }).then((response) => response.json());
  assert.ok(longSession.title.length <= 28);
  assert.match(longSession.title, /\.\.\.$/);

  const deleted = await fetch(address.url + '/api/sessions/' + encodeURIComponent(longSession.id), {
    method: 'DELETE',
    headers
  });
  assert.equal(deleted.status, 200);
  const deletedBody = await deleted.json();
  assert.equal(deletedBody.ok, true);
  const missing = await fetch(address.url + '/api/sessions/' + encodeURIComponent(longSession.id), { headers });
  assert.equal(missing.status, 404);

  const overview = await fetch(address.url + '/api/overview', {
    headers: { 'x-relaydock-token': bootstrap.token }
  }).then((response) => response.json());
  assert.equal(overview.sessions.length, 1);
  assert.equal(overview.sessions[0].counts.checkpoints, 1);
  assert.equal(overview.sessions[0].counts.messages, 1);

  const page = await fetch(address.url + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /RelayDock Studio/);
});
