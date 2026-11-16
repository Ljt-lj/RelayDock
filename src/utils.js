'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashObject(value) {
  return sha256(canonicalize(value));
}

function redactText(input, secrets = []) {
  let text = String(input ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) text = text.split(secret).join('[REDACTED]');
  }
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/gi, 'Bearer [REDACTED]');
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  text = text.replace(/(api[_-]?key\s*[:=]\s*)[^\s,;"']+/gi, '$1[REDACTED]');
  text = text.replace(/(token\s*[:=]\s*)[^\s,;"']+/gi, '$1[REDACTED]');
  return text;
}

function redactDeep(value, secrets = []) {
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, secrets));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = /^(authorization|apiKey|api_key|secret|password|token)$/i.test(key)
        ? '[REDACTED]'
        : redactDeep(item, secrets);
    }
    return out;
  }
  return value;
}

async function atomicWrite(filePath, content, options = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(temp, content, options);
  await fs.rename(temp, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value, options = {}) {
  await atomicWrite(filePath, JSON.stringify(value, null, 2) + '\n', options);
}

function safeFileName(input) {
  return String(input).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'item';
}

module.exports = {
  atomicWrite,
  canonicalize,
  hashObject,
  readJson,
  redactDeep,
  redactText,
  safeFileName,
  sha256,
  writeJson
};
