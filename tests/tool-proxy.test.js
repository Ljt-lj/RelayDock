'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ToolProxy } = require('../src/tool-proxy');

function call(name, args, id = name + '-call') {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  };
}

test('tool proxy executes read tools and gates mutations behind approvals', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relaydock-tools-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'a.txt'), 'alpha\nbeta\n', 'utf8');
  await fs.writeFile(path.join(root, 'existing.txt'), 'before', 'utf8');

  const proxy = new ToolProxy(root, path.join(root, '.relaydock'), {
    getSecrets: () => ['secret-token-value'],
    timeoutMs: 5000
  });

  const listed = await proxy.executeReadOnly(call('list_files', { path: '.' }));
  assert.match(listed.output, /src\/a\.txt/);
  const read = await proxy.executeReadOnly(call('read_file', { path: 'src/a.txt' }));
  assert.equal(read.output, 'alpha\nbeta\n');
  const searched = await proxy.executeReadOnly(call('search_text', { query: 'beta' }));
  assert.match(searched.output, /src\/a\.txt:2/);

  await assert.rejects(
    () => proxy.executeReadOnly(call('read_file', { path: '.env' })),
    /Sensitive files/
  );

  const approval = await proxy.prepareMutation(call('propose_write_file', {
    path: 'created.txt',
    content: 'created',
    reason: 'test write'
  }), { sessionId: 'session-1', providerId: 'deepseek' });
  assert.equal((await proxy.listPending()).length, 1);
  const written = await proxy.resolve(approval.approvalId, 'approve');
  assert.equal(written.result.ok, true);
  assert.equal(await fs.readFile(path.join(root, 'created.txt'), 'utf8'), 'created');
  assert.equal((await proxy.listPending()).length, 0);

  const conflict = await proxy.prepareMutation(call('propose_write_file', {
    path: 'existing.txt',
    content: 'after',
    reason: 'test conflict'
  }), { sessionId: 'session-1', providerId: 'deepseek' });
  await fs.writeFile(path.join(root, 'existing.txt'), 'user change', 'utf8');
  await assert.rejects(() => proxy.resolve(conflict.approvalId, 'approve'), (error) => {
    assert.equal(error.code, 'WORKSPACE_CONFLICT');
    return true;
  });
  assert.equal(await fs.readFile(path.join(root, 'existing.txt'), 'utf8'), 'user change');

  const command = await proxy.prepareMutation(call('propose_run_command', {
    command: process.execPath,
    args: ['--version'],
    cwd: '.',
    reason: 'verify runtime'
  }), { sessionId: 'session-1', providerId: 'deepseek' });
  const commandResult = await proxy.resolve(command.approvalId, 'approve');
  assert.equal(commandResult.result.ok, true);
  assert.match(commandResult.result.output, /^v\d+\./);
});
