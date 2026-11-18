#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { McpServer } = require('../src/mcp-server');
const { RelayService } = require('../src/service');
const { createRelayServer, listen } = require('../src/server');
const { VERSION } = require('../src/version');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith('--')) {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        index += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(item);
    }
  }
  return { positional, flags };
}

function print(value) {
  if (typeof value === 'string') process.stdout.write(value.endsWith('\n') ? value : value + '\n');
  else process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function makeService(flags) {
  const workspace = path.resolve(flags.workspace || process.cwd());
  const dataDir = flags['data-dir']
    ? path.resolve(flags['data-dir'])
    : path.resolve(process.env.RELAYDOCK_DATA_DIR || path.join(workspace, '.relaydock'));
  return new RelayService({ workspace, dataDir });
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0] || 'help';
  if (command === 'help' || command === '--help') {
    print([
      'RelayDock ' + VERSION,
      '',
      'Commands:',
      '  serve [--host 127.0.0.1] [--port 4173] [--workspace PATH]',
      '  mcp [--workspace PATH] [--data-dir PATH]',
      '  status [--workspace PATH]',
      '  session:create --title TEXT [--goal TEXT]',
      '  session:list',
      '  session:update --session ID --contract-json JSON',
      '  session:delete --session ID',
      '  message --session ID --role user|assistant --content TEXT [--provider ID] [--message-id ID]',
      '  checkpoint --session ID [--summary TEXT] [--test-status TEXT]',
      '  packet --session ID [--max-chars 28000]',
      '  turn --session ID [--provider deepseek] [--instruction TEXT] [--max-steps 32]',
      '  approval:list [--session ID]',
      '  approval:resolve --approval ID --decision approve|reject [--continue] [--max-steps 32]',
      '  provider:list',
      '  export --session ID [--format markdown|json]',
      '  workspace:get',
      '  workspace:set --path PATH',
      '  codex:list [--limit 30]',
      '  codex:import --rollout PATH|SESSION_ID [--session ID] [--max-messages 60]',
      '  cursor:list [--limit 30] [--project SLUG]',
      '  cursor:import --transcript PATH|SESSION_ID [--session ID] [--max-messages 60]',
      '',
      'Bridge modes:',
      '  mcp   stdio MCP control plane for Codex/Cursor',
      '  serve also exposes OpenAI-compatible Gateway at /v1',
      '',
      'Provider credentials are read from the API key environment variable or set through the Studio API.'
    ].join('\n'));
    return;
  }
  if (command === 'serve') {
    const service = makeService(flags);
    const server = await createRelayServer({ service });
    const address = await listen(server, { host: flags.host, port: flags.port });
    print('RelayDock Studio: ' + address.url);
    print('Gateway: ' + address.url + '/v1');
    print('Auth: Authorization: Bearer ' + server.token);
    print('Workspace: ' + service.workspace);
    print('MCP: node bin/relaydock.js mcp --workspace ' + service.workspace);
    return;
  }
  if (command === 'mcp') {
    const service = makeService(flags);
    const mcp = new McpServer(service);
    await mcp.start();
    return;
  }

  const service = makeService(flags);
  await service.init();
  if (command === 'status') return print(await service.overview());
  if (command === 'session:create') return print(await service.createSession({ title: flags.title, goal: flags.goal }));
  if (command === 'session:list') return print({ sessions: await service.listSessions() });
  if (command === 'session:update') {
    const contract = JSON.parse(flags['contract-json'] || '{}');
    return print(await service.updateSession(flags.session, contract));
  }
  if (command === 'session:delete') {
    if (!flags.session) throw new Error('--session is required');
    return print(await service.deleteSession(flags.session));
  }
  if (command === 'message') {
    return print(await service.recordMessage(flags.session, {
      role: flags.role || 'user',
      content: flags.content,
      originProvider: flags.provider || 'codex',
      messageId: flags['message-id'] || undefined
    }));
  }
  if (command === 'checkpoint') {
    return print(await service.createCheckpoint(flags.session, {
      summary: flags.summary,
      testStatus: flags['test-status']
    }));
  }
  if (command === 'packet') {
    const packet = await service.compilePacket(flags.session, { maxChars: Number(flags['max-chars']) || undefined });
    return print(flags.json ? packet : packet.markdown);
  }
  if (command === 'turn') {
    return print(await service.runTurn(flags.session, {
      providerId: flags.provider || 'deepseek',
      instruction: flags.instruction || '',
      maxSteps: flags['max-steps'] === undefined ? undefined : Number(flags['max-steps'])
    }));
  }
  if (command === 'approval:list') return print({ approvals: await service.pendingApprovals(flags.session || null) });
  if (command === 'approval:resolve') {
    if (!flags.approval) throw new Error('--approval is required');
    return print(await service.resolveApproval(flags.approval, {
      decision: flags.decision === 'reject' ? 'reject' : 'approve',
      continueTurn: Boolean(flags.continue),
      maxSteps: flags['max-steps'] === undefined ? undefined : Number(flags['max-steps'])
    }));
  }
  if (command === 'provider:list') return print({ providers: await service.providerList() });
  if (command === 'export') {
    return print(await service.exportSession(flags.session, flags.format === 'json' ? 'json' : 'markdown'));
  }
  if (command === 'workspace:get') return print(await service.getWorkspace());
  if (command === 'workspace:set') {
    if (!flags.path) throw new Error('--path is required');
    return print(await service.setWorkspace(flags.path));
  }
  if (command === 'codex:list') {
    return print(await service.listCodexSessions({ limit: Number(flags.limit) || 30 }));
  }
  if (command === 'codex:import') {
    if (!flags.rollout && !flags.session && !flags.path) throw new Error('--rollout PATH|SESSION_ID is required');
    return print(await service.importCodexSession({
      path: flags.rollout || flags.path,
      sessionId: flags.session || undefined,
      maxMessages: Number(flags['max-messages']) || 60,
      title: flags.title,
      goal: flags.goal,
      createCheckpoint: flags['no-checkpoint'] ? false : true
    }));
  }
  if (command === 'cursor:list') {
    return print(await service.listCursorSessions({
      limit: Number(flags.limit) || 30,
      project: flags.project || undefined
    }));
  }
  if (command === 'cursor:import') {
    if (!flags.transcript && !flags.path && !flags['session-id']) {
      throw new Error('--transcript PATH|SESSION_ID is required');
    }
    return print(await service.importCursorSession({
      path: flags.transcript || flags.path || flags['session-id'],
      sessionId: flags.session || undefined,
      maxMessages: Number(flags['max-messages']) || 60,
      title: flags.title,
      goal: flags.goal,
      project: flags.project || undefined,
      createCheckpoint: flags['no-checkpoint'] ? false : true
    }));
  }
  throw new Error('Unknown command: ' + command);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.code || 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
