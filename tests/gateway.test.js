'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseModel } = require('../src/gateway');
const { createRelayServer, listen } = require('../src/server');

test('gateway model names encode provider and bridge flags', () => {
  assert.deepEqual(parseModel('deepseek'), { providerId: 'deepseek', injectPacket: true, agentLoop: false });
  assert.deepEqual(parseModel('relaydock/deepseek+raw'), { providerId: 'deepseek', injectPacket: false, agentLoop: false });
  assert.deepEqual(parseModel('relaydock/deepseek+agent'), { providerId: 'deepseek', injectPacket: true, agentLoop: true });
});

test('OpenAI-compatible gateway lists models and bridges chat completions into a session', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-gateway-'));
  await fs.writeFile(path.join(root, 'readme.txt'), 'workspace\n', 'utf8');

  let seenBody = null;
  const fetchImpl = async (url, options = {}) => {
    seenBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return JSON.stringify({
          id: 'cmpl-test',
          model: 'deepseek-chat',
          choices: [{ message: { role: 'assistant', content: 'bridged reply' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
        });
      }
    };
  };

  const server = await createRelayServer({
    workspace: root,
    dataDir: path.join(root, '.relaydock'),
    token: 'gateway-token'
  });
  await server.service.credentials.set('deepseek', 'test-key');
  const originalClient = server.service.providerClient.bind(server.service);
  server.service.providerClient = async (id) => {
    const value = await originalClient(id);
    value.client.fetchImpl = fetchImpl;
    return value;
  };

  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const unauthorized = await fetch(address.url + '/v1/models');
  assert.equal(unauthorized.status, 401);

  const models = await fetch(address.url + '/v1/models', {
    headers: { authorization: 'Bearer gateway-token' }
  }).then((response) => response.json());
  assert.ok(models.data.some((item) => item.id === 'relaydock/deepseek'));

  const completion = await fetch(address.url + '/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer gateway-token',
      'content-type': 'application/json',
      'x-relaydock-origin': 'codex',
      'x-relaydock-external-key': 'codex:thread-bridge-1',
      'x-relaydock-title': 'Login handoff'
    },
    body: JSON.stringify({
      model: 'relaydock/deepseek',
      messages: [{ role: 'user', content: 'Continue the login work' }]
    })
  }).then((response) => response.json());

  assert.equal(completion.choices[0].message.content, 'bridged reply');
  assert.match(seenBody.messages[0].content, /RelayDock Handoff Packet|bridged coding task/i);

  const bootstrap = await fetch(address.url + '/api/bootstrap').then((response) => response.json());
  const overview = await fetch(address.url + '/api/overview', {
    headers: { 'x-relaydock-token': bootstrap.token }
  }).then((response) => response.json());
  assert.equal(overview.bridge.gateway, true);
  assert.equal(overview.bindings[0].externalKey, 'codex:thread-bridge-1');
  assert.equal(overview.sessions[0].title, 'Login handoff');
});

test('OpenAI Responses API bridge returns output_text and supports retrieval', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-responses-'));
  await fs.writeFile(path.join(root, 'readme.txt'), 'workspace\n', 'utf8');

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    async text() {
      return JSON.stringify({
        id: 'cmpl-responses',
        model: 'deepseek-chat',
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_shell_1',
              type: 'function',
              function: { name: 'shell', arguments: '{"command":"npm test"}' }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
      });
    }
  });

  const server = await createRelayServer({
    workspace: root,
    dataDir: path.join(root, '.relaydock'),
    token: 'responses-token'
  });
  await server.service.credentials.set('deepseek', 'test-key');
  const originalClient = server.service.providerClient.bind(server.service);
  server.service.providerClient = async (id) => {
    const value = await originalClient(id);
    value.client.fetchImpl = fetchImpl;
    return value;
  };

  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const created = await fetch(address.url + '/v1/responses', {
    method: 'POST',
    headers: {
      authorization: 'Bearer responses-token',
      'content-type': 'application/json',
      'x-relaydock-origin': 'codex',
      'x-relaydock-external-key': 'codex:responses-1'
    },
    body: JSON.stringify({
      model: 'relaydock/deepseek',
      instructions: 'You are Codex continuing through RelayDock.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Run the tests' }] }],
      tools: [{
        type: 'function',
        name: 'shell',
        description: 'Run a shell command',
        parameters: { type: 'object', properties: { command: { type: 'string' } } }
      }]
    })
  }).then((response) => response.json());

  assert.equal(created.object, 'response');
  assert.equal(created.status, 'completed');
  assert.equal(created.output[0].type, 'function_call');
  assert.equal(created.output[0].name, 'shell');
  assert.match(created.output[0].arguments, /npm test/);

  const stored = await fetch(address.url + '/v1/responses/' + created.id, {
    headers: { authorization: 'Bearer responses-token' }
  }).then((response) => response.json());
  assert.equal(stored.id, created.id);
});

test('Responses SSE stream emits completed event', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-responses-sse-'));
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    async text() {
      return JSON.stringify({
        id: 'cmpl-sse',
        model: 'deepseek-chat',
        choices: [{ message: { role: 'assistant', content: 'stream hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
      });
    }
  });

  const server = await createRelayServer({
    workspace: root,
    dataDir: path.join(root, '.relaydock'),
    token: 'sse-token'
  });
  await server.service.credentials.set('deepseek', 'test-key');
  const originalClient = server.service.providerClient.bind(server.service);
  server.service.providerClient = async (id) => {
    const value = await originalClient(id);
    value.client.fetchImpl = fetchImpl;
    return value;
  };

  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const response = await fetch(address.url + '/v1/responses', {
    method: 'POST',
    headers: {
      authorization: 'Bearer sse-token',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'relaydock/deepseek+raw',
      stream: true,
      input: 'Say hi'
    })
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /event: response\.completed/);
  assert.match(text, /stream hi/);
  assert.match(text, /\[DONE\]/);
});
