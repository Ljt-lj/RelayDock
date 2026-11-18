'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-concurrency-'));
  const alpha = path.join(root, 'alpha');
  const beta = path.join(root, 'beta');
  const gamma = path.join(root, 'gamma');
  await Promise.all([fs.mkdir(alpha), fs.mkdir(beta), fs.mkdir(gamma)]);
  const service = new RelayService({
    workspace: alpha,
    dataDir: path.join(root, '.relaydock')
  });
  await service.init();
  t.after(async () => {
    for (const lease of service.activeLeases()) service.clearLeaseTimer(lease[1]);
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, alpha, beta, gamma, service };
}

test('different sessions in different workspaces run concurrently', async (t) => {
  const { alpha, beta, service } = await createHarness(t);
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const secondStarted = deferred();

  installProvider(service, async () => {
    calls += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (calls === 2) secondStarted.resolve();
    await Promise.race([
      secondStarted.promise,
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
    inFlight -= 1;
    return {
      content: 'completed',
      model: 'mock-model',
      toolCalls: [],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    };
  });

  const first = await service.createSession({ title: 'Alpha', goal: 'first', workspace: alpha });
  const second = await service.createSession({ title: 'Beta', goal: 'second', workspace: beta });
  const results = await Promise.all([
    service.runTurn(first.id, { providerId: 'deepseek', instruction: 'first instruction' }),
    service.runTurn(second.id, { providerId: 'deepseek', instruction: 'second instruction' })
  ]);

  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.status === 'completed'));
  assert.equal(maxInFlight, 2, 'provider calls should overlap');
  assert.equal(service.activeLeases().length, 0);
});

test('the same session rejects a second concurrent turn before recording it', async (t) => {
  const { alpha, service } = await createHarness(t);
  const release = deferred();
  const started = deferred();
  installProvider(service, async () => {
    started.resolve();
    await release.promise;
    return { content: 'completed', model: 'mock-model', toolCalls: [], usage: null };
  });

  const session = await service.createSession({ title: 'Serial task', goal: 'serial', workspace: alpha });
  const first = service.runTurn(session.id, { providerId: 'deepseek', instruction: 'first instruction' });
  await started.promise;

  await assert.rejects(
    service.runTurn(session.id, { providerId: 'deepseek', instruction: 'must not be recorded' }),
    (error) => error.code === 'WRITE_LEASE_BUSY' && error.status === 409
  );

  release.resolve();
  await first;
  const timeline = await service.timeline(session.id);
  const userMessages = timeline.filter((event) => (
    event.type === 'message.created' && event.payload.role === 'user'
  ));
  assert.deepEqual(userMessages.map((event) => event.payload.content), ['first instruction']);
});

test('sessions sharing a workspace cannot write concurrently', async (t) => {
  const { alpha, service } = await createHarness(t);
  const release = deferred();
  const started = deferred();
  installProvider(service, async () => {
    started.resolve();
    await release.promise;
    return { content: 'completed', model: 'mock-model', toolCalls: [], usage: null };
  });

  const first = await service.createSession({ title: 'Owner', goal: 'own alpha', workspace: alpha });
  const second = await service.createSession({ title: 'Waiter', goal: 'also alpha', workspace: alpha });
  const activeTurn = service.runTurn(first.id, {
    providerId: 'deepseek',
    instruction: 'hold the workspace'
  });
  await started.promise;

  await assert.rejects(
    service.runTurn(second.id, { providerId: 'deepseek', instruction: 'must fail' }),
    (error) => error.code === 'WRITE_LEASE_BUSY' && error.status === 409
  );

  const rejectedTimeline = await service.timeline(second.id);
  assert.equal(
    rejectedTimeline.filter((event) => event.type === 'message.created' && event.payload.role === 'user').length,
    0
  );

  release.resolve();
  await activeTurn;
});

test('running sessions cannot be deleted or moved, and approvals honor the workspace lease', async (t) => {
  const { alpha, beta, gamma, service } = await createHarness(t);
  const release = deferred();
  const started = deferred();
  installProvider(service, async () => {
    started.resolve();
    await release.promise;
    return { content: 'completed', model: 'mock-model', toolCalls: [], usage: null };
  });

  const owner = await service.createSession({ title: 'Owner', goal: 'hold', workspace: alpha });
  const approvalSession = await service.createSession({ title: 'Approval', goal: 'write', workspace: alpha });
  const tools = service.toolProxyFor(alpha);
  const approval = await tools.prepareMutation({
    id: 'write-call',
    function: {
      name: 'propose_write_file',
      arguments: JSON.stringify({
        path: 'approved.txt',
        content: 'approved\n',
        reason: 'concurrency test'
      })
    }
  }, {
    sessionId: approvalSession.id,
    providerId: 'deepseek',
    workspace: alpha
  });

  const activeTurn = service.runTurn(owner.id, {
    providerId: 'deepseek',
    instruction: 'hold alpha'
  });
  await started.promise;

  await assert.rejects(
    service.updateSession(owner.id, { workspace: beta }),
    (error) => error.code === 'WRITE_LEASE_BUSY'
  );
  await assert.rejects(
    service.deleteSession(owner.id),
    (error) => error.code === 'WRITE_LEASE_BUSY'
  );
  await assert.rejects(
    service.resolveApproval(approval.approvalId, { decision: 'approve' }),
    (error) => error.code === 'WRITE_LEASE_BUSY'
  );

  release.resolve();
  await activeTurn;

  const resolved = await service.resolveApproval(approval.approvalId, { decision: 'approve' });
  assert.equal(resolved.result.ok, true);
  assert.equal(await fs.readFile(path.join(alpha, 'approved.txt'), 'utf8'), 'approved\n');

  const moved = await service.updateSession(owner.id, { workspace: gamma });
  assert.equal(path.resolve(moved.workspace), path.resolve(gamma));
});
