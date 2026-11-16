'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { canonicalize, sha256 } = require('./utils');

class BlobStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'blobs');
  }

  async put(value) {
    await fs.mkdir(this.dir, { recursive: true });
    const raw = JSON.stringify(value, null, 2);
    const digest = sha256(canonicalize(value));
    const ref = digest + '.json';
    const file = path.join(this.dir, ref);
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, raw, { encoding: 'utf8', mode: 0o600 });
    }
    return { ref, digest, bytes: Buffer.byteLength(raw) };
  }

  async get(ref) {
    if (!/^[a-f0-9]{64}\.json$/.test(ref)) throw new Error('Invalid blob reference');
    return JSON.parse(await fs.readFile(path.join(this.dir, ref), 'utf8'));
  }
}

module.exports = { BlobStore };
