'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Ledger } = require('../src/ledger');
const { redactDeep } = require('../src/utils');

test('ledger assigns per-session sequences, redacts secrets, and reloads persisted events', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-ledger-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const secret = 'very-secret-token';
  const ledger = new Ledger(root, (value) => redactDeep(value, [secret]));
  const first = await ledger.append('session-a', 'message.created', {
    content: 'Authorization: Bearer ' + secret
  });
  const second = await ledger.append('session-a', 'message.created', { content: 'second' });
  const other = await ledger.append('session-b', 'message.created', { content: 'other' });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(other.sequence, 1);
  assert.equal(first.payload.content.includes(secret), false);
  assert.match(first.payload.content, /\[REDACTED\]/);
  assert.equal(first.content_hash.length, 64);

  const raw = await fs.readFile(path.join(root, 'events.jsonl'), 'utf8');
  assert.equal(raw.includes(secret), false);

  const reloaded = new Ledger(root, (value) => redactDeep(value, [secret]));
  const third = await reloaded.append('session-a', 'message.created', { content: 'after reload' });
  assert.equal(third.sequence, 3);
  assert.equal((await reloaded.list({ sessionId: 'session-a' })).length, 3);
  assert.equal((await reloaded.list({ type: 'message.created' })).length, 4);
});
