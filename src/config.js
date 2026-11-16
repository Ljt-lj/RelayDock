'use strict';

const path = require('node:path');
const { readJson, writeJson } = require('./utils');

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
  constructor() {
    this.memory = new Map();
  }

  set(providerId, secret) {
    if (typeof secret !== 'string' || !secret.trim()) throw new Error('Credential cannot be empty');
    this.memory.set(providerId, secret.trim());
  }

  clear(providerId) {
    this.memory.delete(providerId);
  }

  get(provider) {
    return this.memory.get(provider.id) || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : '') || '';
  }

  has(provider) {
    return Boolean(this.get(provider));
  }

  allSecrets() {
    return [...this.memory.values()];
  }
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
