'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRelayServer, listen } = require('../src/server');
const { RelayService } = require('../src/service');

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function installProvider(service, complete) {
  service.providerClient = async (providerId) => ({
    provider: {
      id: providerId,
      enabled: true,
      model: 'mock-model',
      maxOutputTokens: 1000
    },
    secret: 'test-secret',
    client: { complete }
  });
}

async function createHarness(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-concurrency-http-'));
  const alpha = path.join(root, 'alpha');
  const beta = path.join(root, 'beta');
  await Promise.all([fs.mkdir(alpha), fs.mkdir(beta)]);
  const service = new RelayService({
    workspace: alpha,
    dataDir: path.join(root, '.relaydock')
  });
  await service.init();
  const server = await createRelayServer({
    service,
    token: 'concurrency-http-token'
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    for (const lease of service.activeLeases()) service.clearLeaseTimer(lease[1]);
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { service, address };
}

function requestTurn(address, sessionId, instruction) {
  return fetch(address.url + '/api/sessions/' + encodeURIComponent(sessionId) + '/turn', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-relaydock-token': 'concurrency-http-token'
    },
    body: JSON.stringify({
      providerId: 'deepseek',
      instruction,
      maxSteps: 1
    })
  });
}

test('HTTP turns in different workspaces overlap', async (t) => {
  const { service, address } = await createHarness(t);
  const bothStarted = deferred();
  let calls = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  installProvider(service, async () => {
    calls += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (calls === 2) bothStarted.resolve();
    await Promise.race([
      bothStarted.promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('HTTP turns did not overlap')), 1500);
      })
    ]);
    inFlight -= 1;
    return {
      content: 'completed',
      model: 'mock-model',
      toolCalls: [],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    };
  });

  const first = await service.createSession({
    title: 'HTTP alpha',
    goal: 'first',
    workspace: path.join(service.workspace, '..', 'alpha')
  });
  const second = await service.createSession({
    title: 'HTTP beta',
    goal: 'second',
    workspace: path.join(service.workspace, '..', 'beta')
  });
  const responses = await Promise.all([
    requestTurn(address, first.id, 'first instruction'),
    requestTurn(address, second.id, 'second instruction')
  ]);

  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(maxInFlight, 2);
});

test('HTTP writes to the same workspace return a structured 409', async (t) => {
  const { service, address } = await createHarness(t);
  const started = deferred();
  const release = deferred();

  installProvider(service, async () => {
    started.resolve();
    await release.promise;
    return {
      content: 'completed',
      model: 'mock-model',
      toolCalls: [],
      usage: null
    };
  });

  const first = await service.createSession({
    title: 'HTTP owner',
    goal: 'hold workspace',
    workspace: service.workspace
  });
  const second = await service.createSession({
    title: 'HTTP waiter',
    goal: 'same workspace',
    workspace: service.workspace
  });

  const active = requestTurn(address, first.id, 'hold the workspace');
  await started.promise;
  const rejected = await requestTurn(address, second.id, 'must not run');

  assert.equal(rejected.status, 409);
  const body = await rejected.json();
  assert.equal(body.error.code, 'WRITE_LEASE_BUSY');

  release.resolve();
  const completed = await active;
  assert.equal(completed.status, 200);
});
