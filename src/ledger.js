'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { hashObject, redactDeep } = require('./utils');

class Ledger {
  constructor(dataDir, redactInput = (value) => value) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'events.jsonl');
    this.redactInput = redactInput;
    this.events = [];
    this.sequences = new Map();
    this.ready = null;
    this.queue = Promise.resolve();
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await fs.mkdir(this.dataDir, { recursive: true });
      try {
        const raw = await fs.readFile(this.file, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.events.push(event);
            const current = this.sequences.get(event.session_id) || 0;
            this.sequences.set(event.session_id, Math.max(current, event.sequence));
          } catch {
            // A partial final line can occur after an abrupt shutdown.
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    })();
    return this.ready;
  }

  async append(sessionId, type, payload, meta = {}) {
    await this.init();
    const operation = this.queue.then(async () => {
      const safePayload = redactDeep(payload, []);
      const decorated = this.redactInput(safePayload);
      const sequence = (this.sequences.get(sessionId) || 0) + 1;
      const event = {
        event_id: crypto.randomUUID(),
        session_id: sessionId,
        branch_id: meta.branchId || 'main',
        sequence,
        origin_provider: meta.originProvider || 'relaydock',
        actor: meta.actor || 'system',
        type,
        created_at: new Date().toISOString(),
        content_hash: hashObject(decorated),
        payload: decorated
      };
      await fs.appendFile(this.file, JSON.stringify(event) + '\n', { encoding: 'utf8', mode: 0o600 });
      this.sequences.set(sessionId, sequence);
      this.events.push(event);
      return event;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async list(filter = {}) {
    await this.init();
    await this.queue;
    return this.events.filter((event) => {
      if (filter.sessionId && event.session_id !== filter.sessionId) return false;
      if (filter.type && event.type !== filter.type) return false;
      return true;
    });
  }

  async timeline(sessionId) {
    return (await this.list({ sessionId })).sort((a, b) => a.sequence - b.sequence);
  }
}

module.exports = { Ledger };
