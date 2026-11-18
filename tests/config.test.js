'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CredentialStore, DEFAULT_PROVIDER } = require('../src/config');
const { RelayService } = require('../src/service');

async function temporaryDirectory(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('credentials are encrypted at rest and reload across store instances', async (t) => {
  const previousMasterKey = process.env.RELAYDOCK_MASTER_KEY;
  delete process.env.RELAYDOCK_MASTER_KEY;
  t.after(() => {
    if (previousMasterKey === undefined) delete process.env.RELAYDOCK_MASTER_KEY;
    else process.env.RELAYDOCK_MASTER_KEY = previousMasterKey;
  });

  const dataDir = await temporaryDirectory(t, 'relaydock-credentials-');
  const secret = 'sk-test-secret-that-must-not-appear-on-disk';
  const store = new CredentialStore(dataDir);
  await store.load();
  await store.set('deepseek', secret);

  const credentialsRaw = await fs.readFile(path.join(dataDir, 'credentials.json'), 'utf8');
  const keyRaw = await fs.readFile(path.join(dataDir, 'credentials.key'), 'utf8');
  assert.equal(credentialsRaw.includes(secret), false);
  assert.equal(keyRaw.includes(secret), false);

  const credentials = JSON.parse(credentialsRaw);
  assert.equal(credentials.version, 1);
  assert.equal(credentials.algorithm, 'aes-256-gcm');
  assert.equal(typeof credentials.credentials.deepseek.iv, 'string');
  assert.equal(typeof credentials.credentials.deepseek.tag, 'string');
  assert.equal(typeof credentials.credentials.deepseek.ciphertext, 'string');
  assert.equal(credentials.credentials.deepseek.updatedAt.endsWith('Z'), true);

  const reloaded = new CredentialStore(dataDir);
  await reloaded.load();
  assert.equal(reloaded.get(DEFAULT_PROVIDER), secret);
  assert.equal(reloaded.source(DEFAULT_PROVIDER), 'encrypted-file');

  if (process.platform !== 'win32') {
    const credentialsMode = (await fs.stat(path.join(dataDir, 'credentials.json'))).mode & 0o777;
    const keyMode = (await fs.stat(path.join(dataDir, 'credentials.key'))).mode & 0o777;
    assert.equal(credentialsMode, 0o600);
    assert.equal(keyMode, 0o600);
  }
});

test('a different master key cannot decrypt persisted credentials', async (t) => {
  const dataDir = await temporaryDirectory(t, 'relaydock-credentials-key-');
  const firstKey = Buffer.alloc(32, 0x11);
  const secondKey = Buffer.alloc(32, 0x22);
  const first = new CredentialStore(dataDir, { masterKey: firstKey });
  await first.load();
  await first.set('deepseek', 'persisted-secret');

  const second = new CredentialStore(dataDir, { masterKey: secondKey });
  await assert.rejects(() => second.load(), (error) => {
    assert.equal(error.code, 'CREDENTIAL_DECRYPT_FAILED');
    assert.doesNotMatch(error.message, /persisted-secret/);
    return true;
  });
});

test('provider environment variables remain an unpersisted credential fallback', async (t) => {
  const dataDir = await temporaryDirectory(t, 'relaydock-credentials-env-');
  const envName = 'RELAYDOCK_TEST_PROVIDER_KEY';
  const previous = process.env[envName];
  process.env[envName] = 'environment-secret';
  t.after(() => {
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
  });

  const provider = { ...DEFAULT_PROVIDER, apiKeyEnv: envName };
  const store = new CredentialStore(dataDir);
  await store.load();
  assert.equal(store.get(provider), 'environment-secret');
  assert.equal(store.source(provider), 'environment');
  await assert.rejects(() => fs.access(path.join(dataDir, 'credentials.json')));
});

test('service persists provider metadata and encrypted credentials without plaintext', async (t) => {
  const root = await temporaryDirectory(t, 'relaydock-credentials-service-');
  const dataDir = path.join(root, '.relaydock');
  const secret = 'sk-service-secret-never-on-disk';
  const service = new RelayService({ workspace: root, dataDir });
  await service.init();
  await service.upsertProvider({
    ...DEFAULT_PROVIDER,
    apiKey: secret
  });

  const providersRaw = await fs.readFile(path.join(dataDir, 'providers.json'), 'utf8');
  const credentialsRaw = await fs.readFile(path.join(dataDir, 'credentials.json'), 'utf8');
  assert.equal(providersRaw.includes(secret), false);
  assert.equal(credentialsRaw.includes(secret), false);

  const restarted = new RelayService({ workspace: root, dataDir });
  await restarted.init();
  const providers = await restarted.providerList();
  assert.equal(providers.find((provider) => provider.id === 'deepseek').configured, true);
  assert.equal(restarted.credentials.get(DEFAULT_PROVIDER), secret);

  const cleared = await restarted.clearCredential('deepseek');
  assert.equal(cleared.configured, false);
  const afterClear = new RelayService({ workspace: root, dataDir });
  await afterClear.init();
  const afterClearProviders = await afterClear.providerList();
  assert.equal(afterClearProviders.find((provider) => provider.id === 'deepseek').configured, false);
});

test('a Base64 master key from the environment avoids a local key file', async (t) => {
  const previous = process.env.RELAYDOCK_MASTER_KEY;
  process.env.RELAYDOCK_MASTER_KEY = Buffer.alloc(32, 0x33).toString('base64');
  t.after(() => {
    if (previous === undefined) delete process.env.RELAYDOCK_MASTER_KEY;
    else process.env.RELAYDOCK_MASTER_KEY = previous;
  });

  const dataDir = await temporaryDirectory(t, 'relaydock-credentials-env-master-');
  const store = new CredentialStore(dataDir);
  await store.set('deepseek', 'environment-master-secret');
  await assert.rejects(() => fs.access(path.join(dataDir, 'credentials.key')));

  const reloaded = new CredentialStore(dataDir);
  await reloaded.load();
  assert.equal(reloaded.get(DEFAULT_PROVIDER), 'environment-master-secret');
  assert.equal(reloaded.masterKeySource, 'environment');
});
