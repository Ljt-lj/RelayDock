'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRelayServer, listen } = require('../src/server');

async function startServer(root, token) {
  const server = await createRelayServer({
    workspace: root,
    dataDir: path.join(root, '.relaydock'),
    token
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  return { server, address };
}

async function stopServer(context) {
  if (!context || context.stopped) return;
  context.stopped = true;
  await new Promise((resolve, reject) => {
    context.server.close((error) => error ? reject(error) : resolve());
  });
}

test('Provider configuration and encrypted credentials survive an HTTP server restart', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-credential-api-'));
  const token = 'credential-api-token';
  const secret = 'sk-http-secret-that-must-never-be-returned';
  const headers = {
    'content-type': 'application/json',
    'x-relaydock-token': token
  };
  const servers = new Set();
  let current = null;

  t.after(async () => {
    for (const context of servers) await stopServer(context);
    await fs.rm(root, { recursive: true, force: true });
  });

  const launch = async () => {
    current = await startServer(root, token);
    servers.add(current);
    return current;
  };

  await launch();
  const saveResponse = await fetch(current.address.url + '/api/providers', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: 'deepseek',
      name: 'DeepSeek Persisted',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-reasoner',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      enabled: true,
      apiKey: secret
    })
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.configured, true);
  assert.equal(saved.model, 'deepseek-reasoner');
  assert.equal(Object.hasOwn(saved, 'apiKey'), false);
  assert.equal(JSON.stringify(saved).includes(secret), false);

  const providerFile = await fs.readFile(path.join(root, '.relaydock', 'providers.json'), 'utf8');
  const credentialFile = await fs.readFile(path.join(root, '.relaydock', 'credentials.json'), 'utf8');
  assert.equal(providerFile.includes(secret), false);
  assert.equal(credentialFile.includes(secret), false);

  await stopServer(current);
  await launch();
  const listResponse = await fetch(current.address.url + '/api/providers', { headers });
  assert.equal(listResponse.status, 200);
  const listRaw = await listResponse.text();
  assert.equal(listRaw.includes(secret), false);
  const listed = JSON.parse(listRaw).providers.find((provider) => provider.id === 'deepseek');
  assert.equal(listed.configured, true);
  assert.equal(listed.name, 'DeepSeek Persisted');
  assert.equal(listed.model, 'deepseek-reasoner');
  assert.equal(listed.contextWindow, 128000);

  const clearResponse = await fetch(
    current.address.url + '/api/providers/deepseek/credential',
    { method: 'DELETE', headers }
  );
  assert.equal(clearResponse.status, 200);
  assert.equal((await clearResponse.json()).configured, false);

  await stopServer(current);
  await launch();
  const afterClear = await fetch(current.address.url + '/api/providers', { headers }).then((response) => response.json());
  const cleared = afterClear.providers.find((provider) => provider.id === 'deepseek');
  assert.equal(cleared.configured, false);
  assert.equal(cleared.model, 'deepseek-reasoner');
});
