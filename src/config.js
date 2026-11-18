'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { readJson, writeJson } = require('./utils');

const CREDENTIAL_FILE_VERSION = 1;
const CREDENTIAL_ALGORITHM = 'aes-256-gcm';
const MASTER_KEY_ENV = 'RELAYDOCK_MASTER_KEY';
const CREDENTIAL_AAD_PREFIX = 'relaydock:credential:v1:';

const DEFAULT_PROVIDER = Object.freeze({
  id: 'deepseek',
  name: 'DeepSeek',
  type: 'openai-compatible',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  contextWindow: 64000,
  maxOutputTokens: 8192,
  enabled: true
});

class ProviderStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'providers.json');
  }

  async list() {
    const stored = await readJson(this.file, null);
    if (!stored) {
      await this.save([DEFAULT_PROVIDER]);
      return [DEFAULT_PROVIDER];
    }
    return Array.isArray(stored.providers) ? stored.providers : [DEFAULT_PROVIDER];
  }

  async save(providers) {
    await writeJson(this.file, { version: 1, providers }, { mode: 0o600 });
  }

  async upsert(provider) {
    const providers = await this.list();
    const index = providers.findIndex((item) => item.id === provider.id);
    if (index >= 0) providers[index] = provider;
    else providers.push(provider);
    await this.save(providers);
    return provider;
  }

  async get(id) {
    return (await this.list()).find((provider) => provider.id === id) || null;
  }
}

class CredentialStore {
  constructor(dataDir, options = {}) {
    if (!dataDir) throw new Error('CredentialStore requires a data directory');
    this.file = path.join(dataDir, 'credentials.json');
    this.keyFile = path.join(dataDir, 'credentials.key');
    this.memory = new Map();
    this.records = new Map();
    this.masterKey = options.masterKey ? decodeMasterKey(options.masterKey) : null;
    this.masterKeySource = options.masterKey ? 'option' : null;
    this.loaded = false;
    this.loading = null;
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.loaded) return this;
    if (!this.loading) {
      this.loading = this.loadFromDisk().then(() => {
        this.loaded = true;
        return this;
      }).catch((error) => {
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  async loadFromDisk() {
    let stored;
    try {
      stored = await readJson(this.file, null);
    } catch (error) {
      throw credentialError('Credential store is not valid JSON: ' + this.file, 'CREDENTIAL_STORE_INVALID', error);
    }
    if (!stored) {
      await this.resolveMasterKey({ required: false });
      return;
    }
    if (
      stored.version !== CREDENTIAL_FILE_VERSION
      || stored.algorithm !== CREDENTIAL_ALGORITHM
      || !stored.credentials
      || typeof stored.credentials !== 'object'
      || Array.isArray(stored.credentials)
    ) {
      throw credentialError('Credential store has an unsupported format', 'CREDENTIAL_STORE_INVALID');
    }

    const entries = Object.entries(stored.credentials);
    await this.resolveMasterKey({ required: entries.length > 0 });
    for (const [providerId, record] of entries) {
      let secret;
      try {
        secret = this.decryptRecord(providerId, record);
      } catch (error) {
        throw credentialError(
          'Unable to decrypt the credential for ' + providerId + '; the master key may have changed',
          'CREDENTIAL_DECRYPT_FAILED',
          error
        );
      }
      this.records.set(providerId, record);
      this.memory.set(providerId, secret);
    }
  }

  async resolveMasterKey(options = {}) {
    if (this.masterKey) return this.masterKey;
    const envKey = process.env[MASTER_KEY_ENV];
    if (envKey) {
      this.masterKey = decodeMasterKey(envKey, MASTER_KEY_ENV);
      this.masterKeySource = 'environment';
      return this.masterKey;
    }

    let stored;
    try {
      stored = await readJson(this.keyFile, null);
    } catch (error) {
      throw credentialError('Credential key file is not valid JSON: ' + this.keyFile, 'CREDENTIAL_KEY_INVALID', error);
    }
    if (stored) {
      if (
        stored.version !== CREDENTIAL_FILE_VERSION
        || stored.algorithm !== CREDENTIAL_ALGORITHM
        || typeof stored.key !== 'string'
      ) {
        throw credentialError('Credential key file has an unsupported format', 'CREDENTIAL_KEY_INVALID');
      }
      this.masterKey = decodeMasterKey(stored.key, 'credential key file');
      this.masterKeySource = 'local-file';
      return this.masterKey;
    }

    if (options.create) {
      this.masterKey = crypto.randomBytes(32);
      this.masterKeySource = 'local-file';
      await writeJson(this.keyFile, {
        version: CREDENTIAL_FILE_VERSION,
        algorithm: CREDENTIAL_ALGORITHM,
        key: this.masterKey.toString('base64')
      }, { mode: 0o600 });
      return this.masterKey;
    }
    if (options.required) {
      throw credentialError(
        'Credential store exists but no master key is available; restore credentials.key or set ' + MASTER_KEY_ENV,
        'CREDENTIAL_KEY_MISSING'
      );
    }
    return null;
  }

  encryptRecord(providerId, secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(CREDENTIAL_ALGORITHM, this.masterKey, iv);
    cipher.setAAD(Buffer.from(CREDENTIAL_AAD_PREFIX + providerId, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      updatedAt: new Date().toISOString()
    };
  }

  decryptRecord(providerId, record) {
    if (!this.masterKey) throw new Error('Master key is unavailable');
    if (
      !record
      || typeof record.iv !== 'string'
      || typeof record.tag !== 'string'
      || typeof record.ciphertext !== 'string'
    ) {
      throw new Error('Encrypted credential record is invalid');
    }
    const decipher = crypto.createDecipheriv(
      CREDENTIAL_ALGORITHM,
      this.masterKey,
      Buffer.from(record.iv, 'base64')
    );
    decipher.setAAD(Buffer.from(CREDENTIAL_AAD_PREFIX + providerId, 'utf8'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
  }

  async persist() {
    const credentials = {};
    for (const providerId of [...this.records.keys()].sort()) {
      credentials[providerId] = this.records.get(providerId);
    }
    await writeJson(this.file, {
      version: CREDENTIAL_FILE_VERSION,
      algorithm: CREDENTIAL_ALGORITHM,
      credentials
    }, { mode: 0o600 });
  }

  enqueue(operation) {
    const run = this.queue.then(operation, operation);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  set(providerId, secret) {
    if (typeof secret !== 'string' || !secret.trim()) throw new Error('Credential cannot be empty');
    const normalized = secret.trim();
    return this.enqueue(async () => {
      await this.load();
      await this.resolveMasterKey({ required: false, create: true });
      const previousSecret = this.memory.get(providerId);
      const previousRecord = this.records.get(providerId);
      this.memory.set(providerId, normalized);
      this.records.set(providerId, this.encryptRecord(providerId, normalized));
      try {
        await this.persist();
      } catch (error) {
        if (previousSecret === undefined) this.memory.delete(providerId);
        else this.memory.set(providerId, previousSecret);
        if (previousRecord === undefined) this.records.delete(providerId);
        else this.records.set(providerId, previousRecord);
        throw error;
      }
      return this;
    });
  }

  clear(providerId) {
    return this.enqueue(async () => {
      await this.load();
      const previousSecret = this.memory.get(providerId);
      const previousRecord = this.records.get(providerId);
      this.memory.delete(providerId);
      this.records.delete(providerId);
      if (previousRecord !== undefined) {
        try {
          await this.persist();
        } catch (error) {
          if (previousSecret !== undefined) this.memory.set(providerId, previousSecret);
          if (previousRecord !== undefined) this.records.set(providerId, previousRecord);
          throw error;
        }
      }
      return this;
    });
  }

  get(provider) {
    return this.memory.get(provider.id) || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : '') || '';
  }

  has(provider) {
    return Boolean(this.get(provider));
  }

  source(provider) {
    if (this.memory.has(provider.id)) return 'encrypted-file';
    if (provider.apiKeyEnv && process.env[provider.apiKeyEnv]) return 'environment';
    return 'none';
  }

  allSecrets() {
    return [...this.memory.values()];
  }
}

function credentialError(message, code, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function decodeMasterKey(input, source = 'master key') {
  if (Buffer.isBuffer(input)) {
    if (input.length !== 32) throw credentialError(source + ' must contain exactly 32 bytes', 'CREDENTIAL_KEY_INVALID');
    return Buffer.from(input);
  }
  const encoded = String(input || '').trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw credentialError(
      source + ' must be a Base64-encoded 32-byte key',
      'CREDENTIAL_KEY_INVALID'
    );
  }
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length !== 32) {
    throw credentialError(source + ' must decode to exactly 32 bytes', 'CREDENTIAL_KEY_INVALID');
  }
  return decoded;
}

function validateProvider(input, existing = null) {
  const base = existing || DEFAULT_PROVIDER;
  const provider = {
    id: String(input.id || base.id || '').trim().toLowerCase(),
    name: String(input.name || base.name || '').trim(),
    type: 'openai-compatible',
    baseUrl: String(input.baseUrl || base.baseUrl || '').trim().replace(/\/+$/, ''),
    model: String(input.model || base.model || '').trim(),
    apiKeyEnv: input.apiKeyEnv === null ? null : String(input.apiKeyEnv || base.apiKeyEnv || '').trim() || null,
    contextWindow: Number(input.contextWindow || base.contextWindow || 64000),
    maxOutputTokens: Number(input.maxOutputTokens || base.maxOutputTokens || 8192),
    enabled: input.enabled !== false
  };
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(provider.id)) throw new Error('Provider id must use lowercase letters, numbers, and hyphens');
  if (!provider.name) throw new Error('Provider name is required');
  if (!/^https?:\/\//.test(provider.baseUrl)) throw new Error('Provider baseUrl must be an HTTP(S) URL');
  if (!provider.model) throw new Error('Provider model is required');
  if (provider.apiKeyEnv && !/^[A-Z][A-Z0-9_]*$/.test(provider.apiKeyEnv)) throw new Error('apiKeyEnv must be an environment variable name');
  if (!Number.isInteger(provider.contextWindow) || provider.contextWindow < 1024) throw new Error('contextWindow is invalid');
  if (!Number.isInteger(provider.maxOutputTokens) || provider.maxOutputTokens < 128) throw new Error('maxOutputTokens is invalid');
  return provider;
}

function publicProvider(provider, credentialStore) {
  const copy = { ...provider };
  delete copy.apiKey;
  copy.configured = credentialStore.has(provider);
  return copy;
}

module.exports = {
  CredentialStore,
  DEFAULT_PROVIDER,
  ProviderStore,
  publicProvider,
  validateProvider
};
