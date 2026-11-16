'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const IGNORED_DIRS = new Set(['.git', '.relaydock', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache']);
const MAX_FILE_BYTES = 512 * 1024;

function slash(value) {
  return value.split(path.sep).join('/');
}

function isSensitivePath(rel) {
  const normalized = slash(rel).toLowerCase();
  if (normalized === '.env.example') return false;
  return (
    /(^|\/)(\.env(\.|$)|[^/]*\.(pem|key|p12|pfx)$)/.test(normalized) ||
    /(^|\/)(id_rsa|id_ed25519|credentials\.json|secrets?\.json|\.npmrc|\.pypirc)$/.test(normalized)
  );
}

function resolveInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate || '.');
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes the workspace');
  return resolved;
}

function relativePath(root, absolute) {
  return slash(path.relative(path.resolve(root), path.resolve(absolute)));
}

async function runGit(root, args, maxBuffer = 4 * 1024 * 1024) {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root,
      windowsHide: true,
      timeout: 15000,
      maxBuffer
    });
    return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' };
  } catch (error) {
    return { ok: false, stdout: error.stdout || '', stderr: error.stderr || error.message || '' };
  }
}

async function walkFiles(root, options = {}) {
  const limit = options.limit || 1200;
  const output = [];
  async function visit(current) {
    if (output.length >= limit) return;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (output.length >= limit) break;
      const absolute = path.join(current, entry.name);
      const rel = relativePath(root, absolute);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await visit(absolute);
      } else if (entry.isFile() && !isSensitivePath(rel)) {
        output.push({ absolute, rel });
      }
    }
  }
  await visit(path.resolve(root));
  return output;
}

async function assertSafeWorkspacePath(root, candidate) {
  const resolved = resolveInside(root, candidate || '.');
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, resolved);
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const error = new Error('Symbolic links are rejected by RelayDock file operations');
      error.code = 'SYMLINK_REJECTED';
      throw error;
    }
  }
  return resolved;
}

async function hashFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch {
    return null;
  }
}

async function getGitState(root) {
  const [branch, commit, status, unstaged, staged] = await Promise.all([
    runGit(root, ['branch', '--show-current']),
    runGit(root, ['rev-parse', 'HEAD']),
    runGit(root, ['status', '--short']),
    runGit(root, ['diff', '--no-ext-diff', '--binary']),
    runGit(root, ['diff', '--cached', '--no-ext-diff', '--binary'])
  ]);
  const diff = [unstaged.stdout, staged.stdout].filter(Boolean).join('\n');
  return {
    isRepository: branch.ok || commit.ok || status.ok,
    branch: branch.stdout.trim() || '(detached)',
    commit: commit.stdout.trim() || null,
    status: status.stdout.slice(0, 30000),
    diff: diff.slice(0, 200000),
    diffTruncated: diff.length > 200000,
    error: status.ok ? null : String(status.stderr || '').slice(0, 1000)
  };
}

async function collectWorkspaceState(root) {
  const files = await walkFiles(root);
  const hashes = [];
  for (const file of files) {
    const digest = await hashFile(file.absolute);
    if (digest) hashes.push({ path: file.rel, sha256: digest });
  }
  return {
    root: path.resolve(root),
    capturedAt: new Date().toISOString(),
    git: await getGitState(root),
    files: hashes,
    filesTruncated: files.length >= 1200
  };
}

async function readWorkspaceFile(root, rel, options = {}) {
  if (isSensitivePath(rel)) throw new Error('Sensitive files are excluded from RelayDock tools');
  const target = await assertSafeWorkspacePath(root, rel);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error('Path is not a file');
  const maxBytes = options.maxBytes || 64 * 1024;
  if (stat.size > maxBytes) throw new Error('File exceeds the ' + maxBytes + ' byte read limit');
  const content = await fs.readFile(target, 'utf8');
  if (!options.startLine && !options.endLine) return content;
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, Number(options.startLine) || 1);
  const end = Math.min(lines.length, Number(options.endLine) || lines.length);
  return lines.slice(start - 1, end).map((line, index) => String(start + index).padStart(5) + ' | ' + line).join('\n');
}

async function listWorkspaceFiles(root, rel = '.', limit = 250) {
  const base = await assertSafeWorkspacePath(root, rel);
  const stat = await fs.stat(base);
  if (stat.isFile()) return [relativePath(root, base)];
  const files = await walkFiles(root, { limit: 2000 });
  const prefix = relativePath(root, base);
  return files.map((file) => file.rel).filter((item) => !prefix || item === prefix || item.startsWith(prefix + '/')).slice(0, Math.max(1, Math.min(500, limit)));
}

async function searchWorkspace(root, query, rel = '.', maxMatches = 50) {
  if (!query || String(query).length > 200) throw new Error('Search query must be 1-200 characters');
  const files = await walkFiles(root, { limit: 1200 });
  const prefix = rel && rel !== '.' ? relativePath(root, resolveInside(root, rel)) + '/' : '';
  const needle = String(query).toLowerCase();
  const matches = [];
  for (const file of files) {
    if (prefix && !file.rel.startsWith(prefix)) continue;
    const digest = await hashFile(file.absolute);
    if (!digest) continue;
    let content;
    try {
      content = await fs.readFile(file.absolute, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].toLowerCase().includes(needle)) {
        matches.push({ path: file.rel, line: index + 1, text: lines[index].slice(0, 300) });
        if (matches.length >= maxMatches) return { matches, truncated: true };
      }
    }
  }
  return { matches, truncated: false };
}

async function hashWorkspaceFile(root, rel) {
  const target = await assertSafeWorkspacePath(root, rel);
  return hashFile(target);
}

async function writeWorkspaceFile(root, rel, content, expectedHash = null) {
  if (isSensitivePath(rel)) throw new Error('Sensitive files cannot be written by RelayDock tools');
  if (typeof content !== 'string') throw new Error('File content must be a string');
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('File content exceeds the 512 KiB write limit');
  const target = await assertSafeWorkspacePath(root, rel);
  const relative = relativePath(root, target);
  if (relative === '.git' || relative.startsWith('.git/') || relative.startsWith('.relaydock/')) {
    throw new Error('Writing to RelayDock or Git metadata is not allowed');
  }
  const currentHash = await hashFile(target);
  if (expectedHash !== null && expectedHash !== undefined && currentHash !== expectedHash) {
    const error = new Error('Workspace conflict: the file changed after the proposal was created');
    error.code = 'WORKSPACE_CONFLICT';
    throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await assertSafeWorkspacePath(root, relative);
  const realRoot = await fs.realpath(path.resolve(root));
  const realParent = await fs.realpath(path.dirname(target));
  const parentRelative = path.relative(realRoot, realParent);
  if (parentRelative.startsWith('..') || path.isAbsolute(parentRelative)) throw new Error('Path escapes the workspace');
  await fs.writeFile(target, content, { encoding: 'utf8', flag: 'w' });
  return { path: relative, sha256: await hashFile(target), bytes: Buffer.byteLength(content) };
}

module.exports = {
  assertSafeWorkspacePath,
  collectWorkspaceState,
  getGitState,
  hashWorkspaceFile,
  isSensitivePath,
  listWorkspaceFiles,
  readWorkspaceFile,
  relativePath,
  resolveInside,
  searchWorkspace,
  walkFiles,
  writeWorkspaceFile
};
