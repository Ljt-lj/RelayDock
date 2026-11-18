'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRelayServer, listen } = require('../src/server');
const { RelayService } = require('../src/service');

test('default workspace setting does not override per-session workspaces', async () => {
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

test('sessions keep independent workspaces for checkpoints and tools', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-session-ws-'));
  const alpha = path.join(root, 'alpha');
  const beta = path.join(root, 'beta');
  await fs.mkdir(alpha);
  await fs.mkdir(beta);
  await fs.writeFile(path.join(alpha, 'alpha-only.txt'), 'a\n', 'utf8');
  await fs.writeFile(path.join(beta, 'beta-only.txt'), 'b\n', 'utf8');

  const service = new RelayService({
    workspace: alpha,
    dataDir: path.join(root, '.relaydock')
  });
  await service.init();

  const sessionA = await service.createSession({ title: 'A', goal: 'alpha', workspace: alpha });
  const sessionB = await service.createSession({ title: 'B', goal: 'beta', workspace: beta });
  assert.equal(path.resolve(sessionA.workspace), path.resolve(alpha));
  assert.equal(path.resolve(sessionB.workspace), path.resolve(beta));

  const checkpointA = await service.createCheckpoint(sessionA.id, { summary: 'alpha cp' });
  const checkpointB = await service.createCheckpoint(sessionB.id, { summary: 'beta cp' });
  assert.equal(path.resolve(checkpointA.workspace.root), path.resolve(alpha));
  assert.equal(path.resolve(checkpointB.workspace.root), path.resolve(beta));
  assert.ok(checkpointA.workspace.files.some((item) => String(item.path || item).includes('alpha-only.txt')));
  assert.ok(checkpointB.workspace.files.some((item) => String(item.path || item).includes('beta-only.txt')));

  const listedA = await service.toolProxyFor(alpha).executeReadOnly({
    function: { name: 'list_files', arguments: JSON.stringify({ path: '.', limit: 20 }) }
  });
  const listedB = await service.toolProxyFor(beta).executeReadOnly({
    function: { name: 'list_files', arguments: JSON.stringify({ path: '.', limit: 20 }) }
  });
  assert.match(listedA.output, /alpha-only\.txt/);
  assert.doesNotMatch(listedA.output, /beta-only\.txt/);
  assert.match(listedB.output, /beta-only\.txt/);
  assert.doesNotMatch(listedB.output, /alpha-only\.txt/);

  const updatedB = await service.updateSession(sessionB.id, { workspace: alpha });
  assert.equal(path.resolve(updatedB.workspace), path.resolve(alpha));
  const stillA = await service.getSession(sessionA.id);
  assert.equal(path.resolve(stillA.workspace), path.resolve(alpha));

  const diffB = await service.getDiff(sessionB.id);
  assert.equal(path.resolve(diffB.workspace), path.resolve(alpha));

  await fs.rm(root, { recursive: true, force: true });
});

test('HTTP API switches default workspace and session workspace separately', async (t) => {
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
  assert.equal(overview.defaultWorkspace, second);

  const session = await fetch(address.url + '/api/sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Session ws', goal: 'keep first', workspace: first })
  }).then((response) => response.json());
  assert.equal(session.workspace, first);

  const patched = await fetch(address.url + '/api/sessions/' + encodeURIComponent(session.id), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ workspace: second })
  }).then((response) => response.json());
  assert.equal(patched.workspace, second);

  const diff = await fetch(
    address.url + '/api/diff?sessionId=' + encodeURIComponent(session.id),
    { headers }
  ).then((response) => response.json());
  assert.equal(diff.workspace, second);
  assert.equal(diff.sessionId, session.id);
});

test('approval resolve uses the workspace recorded at proposal time', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-approval-ws-'));
  const alpha = path.join(root, 'alpha');
  const beta = path.join(root, 'beta');
  await fs.mkdir(alpha);
  await fs.mkdir(beta);

  const service = new RelayService({
    workspace: alpha,
    dataDir: path.join(root, '.relaydock')
  });
  await service.init();

  const session = await service.createSession({ title: 'Write in beta', goal: 'write', workspace: beta });
  const tools = service.toolProxyFor(beta);
  const approval = await tools.prepareMutation({
    id: 'call-1',
    function: {
      name: 'propose_write_file',
      arguments: JSON.stringify({
        path: 'from-approval.txt',
        content: 'written-in-beta\n',
        reason: 'isolation'
      })
    }
  }, { sessionId: session.id, providerId: 'deepseek', workspace: beta });

  assert.equal(path.resolve(approval.workspace), path.resolve(beta));

  // Flip the global default after the proposal; resolve must still write under beta.
  await service.setWorkspace(alpha);
  const resolved = await service.resolveApproval(approval.approvalId, { decision: 'approve' });
  assert.equal(resolved.decision, 'approve');
  assert.equal(resolved.result.ok, true);

  const written = await fs.readFile(path.join(beta, 'from-approval.txt'), 'utf8');
  assert.equal(written, 'written-in-beta\n');
  await assert.rejects(() => fs.access(path.join(alpha, 'from-approval.txt')));

  await fs.rm(root, { recursive: true, force: true });
});
