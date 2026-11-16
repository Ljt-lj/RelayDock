'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRelayServer, listen } = require('../src/server');
const { RelayService } = require('../src/service');

test('service can switch workspace and remember recent paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-workspace-'));
  const first = path.join(root, 'project-a');
  const second = path.join(root, 'project-b');
  await fs.mkdir(first);
  await fs.mkdir(second);
  await fs.writeFile(path.join(second, 'note.txt'), 'hello\n', 'utf8');

  const service = new RelayService({
    workspace: first,
    dataDir: path.join(root, '.relaydock')
  });
  await service.init();
  assert.equal(service.workspace, first);

  const switched = await service.setWorkspace(second);
  assert.equal(switched.workspace, second);
  assert.ok(switched.recentWorkspaces.includes(second));
  assert.ok(switched.recentWorkspaces.includes(first));

  const files = await service.toolProxy.executeReadOnly({
    function: { name: 'list_files', arguments: JSON.stringify({ path: '.', limit: 20 }) }
  });
  assert.match(files.output, /note\.txt/);

  await fs.rm(root, { recursive: true, force: true });
});

test('HTTP API switches workspace for the running Studio process', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-workspace-api-'));
  const first = path.join(root, 'alpha');
  const second = path.join(root, 'beta');
  await fs.mkdir(first);
  await fs.mkdir(second);

  const server = await createRelayServer({
    workspace: first,
    dataDir: path.join(root, '.relaydock'),
    token: 'workspace-token'
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const headers = {
    'content-type': 'application/json',
    'x-relaydock-token': 'workspace-token'
  };
  const before = await fetch(address.url + '/api/workspace', { headers }).then((response) => response.json());
  assert.equal(before.workspace, first);

  const after = await fetch(address.url + '/api/workspace', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ path: second })
  }).then((response) => response.json());
  assert.equal(after.workspace, second);

  const overview = await fetch(address.url + '/api/overview', { headers }).then((response) => response.json());
  assert.equal(overview.workspace, second);
});
