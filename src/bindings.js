'use strict';

const path = require('node:path');
const { readJson, writeJson } = require('./utils');

class BindingStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'gateway-bindings.json');
  }

  async load() {
    const stored = await readJson(this.file, null);
    if (!stored || typeof stored !== 'object' || !stored.bindings || typeof stored.bindings !== 'object') {
      return { version: 1, bindings: {} };
    }
    return { version: 1, bindings: stored.bindings };
  }

  async save(data) {
    await writeJson(this.file, { version: 1, bindings: data.bindings || {} }, { mode: 0o600 });
  }

  async get(externalKey) {
    const key = normalizeKey(externalKey);
    if (!key) return null;
    const data = await this.load();
    return data.bindings[key] || null;
  }

  async set(externalKey, binding) {
    const key = normalizeKey(externalKey);
    if (!key) throw new Error('externalKey is required');
    const data = await this.load();
    data.bindings[key] = {
      sessionId: binding.sessionId,
      originProvider: binding.originProvider || 'external',
      title: binding.title || null,
      updatedAt: new Date().toISOString()
    };
    await this.save(data);
    return data.bindings[key];
  }

  async list() {
    const data = await this.load();
    return Object.entries(data.bindings).map(([externalKey, value]) => ({ externalKey, ...value }));
  }

  async removeBySession(sessionId) {
    const id = String(sessionId || '');
    if (!id) return [];
    const data = await this.load();
    const removed = [];
    for (const [externalKey, value] of Object.entries(data.bindings)) {
      if (value && value.sessionId === id) {
        removed.push(externalKey);
        delete data.bindings[externalKey];
      }
    }
    if (removed.length) await this.save(data);
    return removed;
  }
}

function normalizeKey(value) {
  return String(value || '').trim().slice(0, 240);
}

module.exports = { BindingStore, normalizeKey };
