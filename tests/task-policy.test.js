'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildRelayPacket } = require('../src/context-compiler');
const { RelayService } = require('../src/service');
const {
  COMPLETE_TASK_FIRST_CONSTRAINT,
  DEFAULT_MAX_STEPS,
  effectiveConstraints,
  normalizeMaxSteps
} = require('../src/task-policy');

async function createHarness(t, prefix = 'relaydock-task-policy-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  const dataDir = path.join(root, '.relaydock');
  const service = new RelayService({ workspace, dataDir });
  await service.init();
  const services = [service];
  t.after(async () => {
    for (const item of services) {
      for (const lease of item.activeLeases()) item.clearLeaseTimer(lease[1]);
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, workspace, dataDir, service, services };
}

function completed(content) {
  return {
    content,
    model: 'mock-model',
    toolCalls: [],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  };
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

function timeToolCall() {
  return {
    id: 'policy-time-call',
    type: 'function',
    function: {
      name: 'propose_get_current_time',
      arguments: JSON.stringify({ reason: 'Read the current time for the task' })
    }
  };
}

test('task policy defaults, normalization, and completion-first packet constraints', () => {
  assert.equal(DEFAULT_MAX_STEPS, 32);
  assert.equal(normalizeMaxSteps(undefined), 32);
  assert.equal(normalizeMaxSteps(250), 100);
  assert.equal(normalizeMaxSteps(0), 1);

  assert.deepEqual(effectiveConstraints({ constraints: ['Keep the public API stable'] }), [
    'Keep the public API stable',
    COMPLETE_TASK_FIRST_CONSTRAINT
  ]);
  assert.deepEqual(
    effectiveConstraints({ completeTaskFirst: false, constraints: ['Keep the public API stable'] }),
    ['Keep the public API stable']
  );

  const packet = buildRelayPacket({
    sessionId: 'policy-session',
    checkpoint: { workspace: { git: {} } },
    contract: {
      completeTaskFirst: true,
      maxSteps: 47,
      constraints: ['Keep the public API stable']
    },
    messages: [],
    tools: [],
    maxChars: 8000
  });
  assert.match(packet.markdown, /Completion-first policy:/);
  assert.match(packet.markdown, /Tool-step budget: 47/);
});

test('task policy persists, defaults old sessions, and survives restart', async (t) => {
  const { workspace, dataDir, service, services } = await createHarness(t);

  const created = await service.createSession({ title: 'Policy persistence', goal: 'Persist policy' });
  assert.equal(created.contract.completeTaskFirst, true);
  assert.equal(created.contract.maxSteps, 32);

  const updated = await service.updateSession(created.id, {
    completeTaskFirst: false,
    maxSteps: 73
  });
  assert.equal(updated.contract.completeTaskFirst, false);
  assert.equal(updated.contract.maxSteps, 73);

  const restarted = new RelayService({ workspace, dataDir });
  services.push(restarted);
  await restarted.init();
  const reloaded = await restarted.getSession(created.id);
  assert.equal(reloaded.contract.completeTaskFirst, false);
  assert.equal(reloaded.contract.maxSteps, 73);

  const legacyId = crypto.randomUUID();
  await restarted.ledger.append(legacyId, 'session.created', {
    title: 'Legacy task',
    workspace,
    goal: 'Backfill the default policy'
  }, { originProvider: 'user', actor: 'user' });
  const legacy = await restarted.getSession(legacyId);
  assert.equal(legacy.contract.completeTaskFirst, true);
  assert.equal(legacy.contract.maxSteps, 32);
});

test('unknown tools return recovery guidance and one-turn step overrides are not persisted', async (t) => {
  const { service } = await createHarness(t);
  const providerCalls = [];
  installProvider(service, async ({ messages }) => {
    providerCalls.push(messages.map((message) => ({ ...message })));
    if (providerCalls.length === 1) {
      return {
        content: null,
        model: 'mock-model',
        toolCalls: [{
          id: 'unknown-tool-call',
          type: 'function',
          function: {
            name: 'read_system_clock',
            arguments: JSON.stringify({ reason: 'The task needs the local clock' })
          }
        }],
        usage: null
      };
    }
    return completed('Recovered through the available approval tool.');
  });

  const session = await service.createSession({
    title: 'Unknown tool recovery',
    goal: 'Use a capability that has no dedicated tool',
    completeTaskFirst: true,
    maxSteps: 9
  });
  const result = await service.runTurn(session.id, {
    providerId: 'deepseek',
    instruction: 'Read the clock and finish the task.',
    maxSteps: 2
  });
  assert.equal(result.status, 'completed');
  assert.equal(providerCalls.length, 2);
  assert.match(
    providerCalls[1].find((message) => message.role === 'tool' && message.tool_call_id === 'unknown-tool-call').content,
    /request it through propose_run_command/
  );
  assert.ok(providerCalls[0].some((message) => (
    message.role === 'system' && /Completion-first policy:/.test(message.content)
  )));

  const timeline = await service.timeline(session.id);
  const handoff = timeline.filter((event) => event.type === 'handoff.requested').at(-1);
  assert.equal(handoff.payload.maxSteps, 2);
  assert.equal(handoff.payload.completeTaskFirst, true);
  assert.ok(timeline.some((event) => (
    event.type === 'tool.failed'
    && event.payload.code === 'UNKNOWN_TOOL'
    && event.payload.toolName === 'read_system_clock'
  )));

  const reloaded = await service.getSession(session.id);
  assert.equal(reloaded.contract.maxSteps, 9);
});

test('approval continuation uses the persistent task step budget', async (t) => {
  const { service } = await createHarness(t);
  let continuationMessages = null;
  installProvider(service, async ({ messages }) => {
    const approvedResult = messages.find((message) => (
      message.role === 'tool' && message.tool_call_id === 'policy-time-call'
    ));
    if (approvedResult) {
      continuationMessages = messages;
      return completed('The approved time result was used.');
    }
    return {
      content: null,
      model: 'mock-model',
      toolCalls: [timeToolCall()],
      usage: null
    };
  });

  const session = await service.createSession({
    title: 'Approval budget',
    goal: 'Continue after approval',
    maxSteps: 18
  });
  const paused = await service.runTurn(session.id, {
    providerId: 'deepseek',
    instruction: 'Check the current time.'
  });
  assert.equal(paused.status, 'approval_required');

  const resolved = await service.resolveApproval(paused.approval.approvalId, {
    decision: 'approve',
    continueTurn: true
  });
  assert.equal(resolved.continuation.status, 'completed');
  assert.ok(continuationMessages, 'the continuation must receive the approved tool result');

  const handoffs = (await service.timeline(session.id))
    .filter((event) => event.type === 'handoff.requested');
  assert.equal(handoffs.length, 2);
  assert.equal(handoffs[1].payload.maxSteps, 18);
});
