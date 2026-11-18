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

async function createHarness(t, prefix = 'relaydock-approval-flow-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const alpha = path.join(root, 'alpha');
  const beta = path.join(root, 'beta');
  const gamma = path.join(root, 'gamma');
  await Promise.all([fs.mkdir(alpha), fs.mkdir(beta), fs.mkdir(gamma)]);
  const dataDir = path.join(root, '.relaydock');
  const service = new RelayService({ workspace: alpha, dataDir });
  await service.init();
  const services = [service];
  t.after(async () => {
    for (const item of services) {
      for (const lease of item.activeLeases()) item.clearLeaseTimer(lease[1]);
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, alpha, beta, gamma, dataDir, service, services };
}

function completed(content) {
  return {
    content,
    model: 'mock-model',
    toolCalls: [],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  };
}

function timeToolCall() {
  return {
    id: 'time-call-1',
    type: 'function',
    function: {
      name: 'propose_get_current_time',
      arguments: JSON.stringify({ reason: 'The user asked for the current Beijing time' })
    }
  };
}

test('approval gate blocks workspace and lineage until the real time result is continued', async (t) => {
  const { alpha, beta, gamma, service } = await createHarness(t);
  const continuationStarted = deferred();
  const releaseContinuation = deferred();
  let continuationMessages = null;
  let advertisedTools = null;
  let systemPrompt = null;

  installProvider(service, async ({ messages, tools }) => {
    if (!advertisedTools) {
      advertisedTools = tools;
      systemPrompt = messages.find((message) => message.role === 'system');
    }
    const approvedTool = messages.find((message) => message.role === 'tool' && message.tool_call_id === 'time-call-1');
    if (approvedTool) {
      continuationMessages = messages;
      continuationStarted.resolve();
      await releaseContinuation.promise;
      return completed('The current Beijing time has been read.');
    }
    const taskText = messages
      .filter((message) => message.role === 'user')
      .map((message) => String(message.content || ''))
      .join('\n');
    if (taskText.includes('What is the current Beijing time?')) {
      return {
        content: null,
        model: 'mock-model',
        toolCalls: [timeToolCall()],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      };
    }
    return completed('Unrelated task completed.');
  });

  const parent = await service.createSession({ title: 'Source task', goal: 'source', workspace: alpha });
  const child = await service.createSession({
    title: 'Time relay',
    goal: 'read time',
    workspace: alpha,
    predecessorSessionId: parent.id
  });
  const sameWorkspace = await service.createSession({ title: 'Same workspace', goal: 'wait', workspace: alpha });
  const sameLineage = await service.createSession({
    title: 'Same lineage',
    goal: 'wait',
    workspace: beta,
    predecessorSessionId: parent.id
  });
  const unrelated = await service.createSession({ title: 'Unrelated', goal: 'run', workspace: gamma });

  const paused = await service.runTurn(child.id, {
    providerId: 'deepseek',
    instruction: 'What is the current Beijing time?'
  });
  assert.equal(paused.status, 'approval_required');
  assert.equal(paused.approval.toolName, 'propose_get_current_time');
  assert.equal(paused.approval.lineageId, parent.id);
  assert.equal((await service.overview()).approvalGates.length, 1);
  assert.ok(advertisedTools.some((item) => item.function.name === 'propose_get_current_time'));
  assert.match(systemPrompt.content, /request propose_get_current_time instead of guessing/i);
  assert.match(systemPrompt.content, /pending approval is expected to pause the turn/i);

  await assert.rejects(
    service.runTurn(sameWorkspace.id, { providerId: 'deepseek', instruction: 'must stay blocked' }),
    (error) => error.code === 'WRITE_LEASE_BUSY' && error.status === 409
  );
  await assert.rejects(
    service.runTurn(sameLineage.id, { providerId: 'deepseek', instruction: 'must inherit the gate' }),
    (error) => error.code === 'WRITE_LEASE_BUSY' && error.status === 409
  );
  const concurrent = await service.runTurn(unrelated.id, {
    providerId: 'deepseek',
    instruction: 'This unrelated task may proceed'
  });
  assert.equal(concurrent.status, 'completed');

  const resolving = service.resolveApproval(paused.approval.approvalId, {
    decision: 'approve',
    continueTurn: true,
    maxSteps: 2
  });
  await continuationStarted.promise;
  await assert.rejects(
    service.runTurn(sameWorkspace.id, { providerId: 'deepseek', instruction: 'still blocked while continuing' }),
    (error) => error.code === 'WRITE_LEASE_BUSY' && error.status === 409
  );
  releaseContinuation.resolve();
  const resolved = await resolving;

  assert.equal(resolved.result.ok, true);
  assert.equal(resolved.continuation.status, 'completed');
  assert.ok(continuationMessages, 'continuation must call the provider');
  const assistantCall = continuationMessages.find((message) => (
    message.role === 'assistant'
    && Array.isArray(message.tool_calls)
    && message.tool_calls.some((call) => call.id === 'time-call-1')
  ));
  const toolResult = continuationMessages.find((message) => (
    message.role === 'tool' && message.tool_call_id === 'time-call-1'
  ));
  assert.ok(assistantCall, 'original assistant tool call must be injected');
  assert.ok(toolResult, 'real tool result must be injected');
  assert.equal(toolResult.name, 'propose_get_current_time');
  assert.match(toolResult.content, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  const overview = await service.overview();
  assert.equal(overview.approvalGates.length, 0);
  assert.equal(overview.approvals.length, 0);
  const timeline = await service.timeline(child.id);
  assert.ok(timeline.some((event) => (
    event.type === 'tool.completed'
    && event.payload.toolCallId === 'time-call-1'
    && /^\d{4}-\d{2}-\d{2}T/.test(event.payload.output)
  )));
});

test('pending approval gates are restored from disk after service restart', async (t) => {
  const { alpha, dataDir, service, services } = await createHarness(t, 'relaydock-approval-restart-');
  installProvider(service, async ({ messages }) => {
    const taskText = messages
      .filter((message) => message.role === 'user')
      .map((message) => String(message.content || ''))
      .join('\n');
    if (taskText.includes('restart time request')) {
      return {
        content: null,
        model: 'mock-model',
        toolCalls: [timeToolCall()],
        usage: null
      };
    }
    return completed('unexpected');
  });

  const session = await service.createSession({ title: 'Restart', goal: 'time', workspace: alpha });
  const paused = await service.runTurn(session.id, {
    providerId: 'deepseek',
    instruction: 'restart time request'
  });
  assert.equal(paused.status, 'approval_required');

  const restarted = new RelayService({ workspace: alpha, dataDir });
  services.push(restarted);
  await restarted.init();
  const overview = await restarted.overview();
  assert.equal(overview.approvalGates.length, 1);
  assert.equal(overview.approvalGates[0].approvalId, paused.approval.approvalId);

  const rejected = await restarted.resolveApproval(paused.approval.approvalId, { decision: 'reject' });
  assert.equal(rejected.decision, 'reject');
  assert.equal((await restarted.overview()).approvalGates.length, 0);
});

test('HTTP overview exposes approval gates and approval resolution clears rejected gates', async (t) => {
  const { alpha, service } = await createHarness(t, 'relaydock-approval-http-');
  installProvider(service, async () => ({
    content: null,
    model: 'mock-model',
    toolCalls: [timeToolCall()],
    usage: null
  }));

  const server = await createRelayServer({ service, token: 'approval-token' });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  const session = await service.createSession({ title: 'HTTP approval', goal: 'time', workspace: alpha });
  const paused = await service.runTurn(session.id, {
    providerId: 'deepseek',
    instruction: 'What time is it?'
  });
  assert.equal(paused.status, 'approval_required');

  const headers = { 'x-relaydock-token': 'approval-token' };
  const overview = await fetch(address.url + '/api/overview', { headers }).then((response) => response.json());
  assert.equal(overview.approvalGates.length, 1);
  assert.equal(overview.approvalGates[0].approvalId, paused.approval.approvalId);

  const response = await fetch(
    address.url + '/api/approvals/' + encodeURIComponent(paused.approval.approvalId) + '/resolve',
    {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ decision: 'reject' })
    }
  );
  assert.equal(response.status, 200);
  const after = await fetch(address.url + '/api/overview', { headers }).then((item) => item.json());
  assert.equal(after.approvalGates.length, 0);
});
