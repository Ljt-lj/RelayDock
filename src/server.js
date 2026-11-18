'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { handleGatewayRequest } = require('./gateway');
const { RelayService } = require('./service');
const { VERSION } = require('./version');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function securityHeaders(contentType) {
  const headers = {
    'content-type': contentType || 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  };
  return headers;
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { ...securityHeaders('application/json; charset=utf-8'), 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

async function readJsonBody(request) {
  const type = String(request.headers['content-type'] || '');
  if (!type.toLowerCase().startsWith('application/json')) {
    const error = new Error('Content-Type must be application/json');
    error.status = 415;
    throw error;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.status = 400;
    throw error;
  }
}

function apiError(response, error) {
  const code = error.code || 'REQUEST_FAILED';
  let status = error.status;
  if (!status || status < 400 || status > 599) {
    if (code === 'RATE_LIMITED') status = 429;
    else if (code === 'PROVIDER_NOT_CONFIGURED') status = 400;
    else if (String(code).startsWith('PROVIDER_')) status = 502;
    else status = 500;
  }
  const body = {
    code,
    message: String(error.message || 'Request failed')
  };
  if (error.details && typeof error.details === 'object') body.details = error.details;
  sendJson(response, status, { error: body });
}

function safeDownloadName(value, extension) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) + extension;
}

async function createRelayServer(options = {}) {
  const service = options.service || new RelayService({
    workspace: options.workspace || process.cwd(),
    dataDir: options.dataDir
  });
  await service.init();
  const token = options.token || process.env.RELAYDOCK_TOKEN || crypto.randomBytes(24).toString('base64url');
  const publicDir = options.publicDir || path.join(__dirname, '..', 'public');

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin) {
      const expected = 'http://' + (request.headers.host || '');
      if (origin !== expected) {
        sendJson(response, 403, { error: { code: 'ORIGIN_REJECTED', message: 'Cross-origin requests are not allowed' } });
        return;
      }
    }
    let url;
    let pathname;
    try {
      url = new URL(request.url, 'http://' + (request.headers.host || '127.0.0.1'));
      pathname = decodeURIComponent(url.pathname);
    } catch {
      sendJson(response, 400, { error: { code: 'INVALID_URL', message: 'Invalid URL' } });
      return;
    }

    try {
      if (pathname === '/api/health' && request.method === 'GET') {
        return sendJson(response, 200, { ok: true, version: VERSION });
      }
      if (pathname === '/api/bootstrap' && request.method === 'GET') {
        return sendJson(response, 200, {
          token,
          version: VERSION,
          workspace: service.workspace,
          gateway: {
            baseUrl: 'http://' + (request.headers.host || '127.0.0.1') + '/v1',
            auth: 'Authorization: Bearer <token>',
            models: ['deepseek', 'relaydock/deepseek', 'relaydock/deepseek+raw', 'relaydock/deepseek+agent']
          },
          mcp: {
            command: 'node',
            args: ['bin/relaydock.js', 'mcp', '--workspace', service.workspace]
          }
        });
      }

      if (
        pathname === '/v1'
        || pathname.startsWith('/v1/')
        || pathname === '/models'
        || pathname === '/chat/completions'
        || pathname === '/responses'
      ) {
        const body = request.method === 'GET' || request.method === 'HEAD' ? null : await readJsonBody(request);
        const result = await handleGatewayRequest(service, request, url, body || {}, token, response);
        if (result && result.streamed) return;
        return sendJson(response, result.status, result.value);
      }

      if (pathname.startsWith('/api/') && request.headers['x-relaydock-token'] !== token) {
        return sendJson(response, 401, { error: { code: 'TOKEN_REQUIRED', message: 'A valid RelayDock session token is required' } });
      }

      if (pathname === '/api/overview' && request.method === 'GET') {
        return sendJson(response, 200, await service.overview());
      }
      if (pathname === '/api/providers' && request.method === 'GET') {
        return sendJson(response, 200, { providers: await service.providerList() });
      }
      if (pathname === '/api/providers' && request.method === 'POST') {
        return sendJson(response, 200, await service.upsertProvider(await readJsonBody(request)));
      }
      const providerMatch = pathname.match(/^\/api\/providers\/([^/]+)(?:\/(credential|test))?$/);
      if (providerMatch) {
        const providerId = providerMatch[1];
        const action = providerMatch[2] || null;
        if (!action && request.method === 'GET') {
          const providers = await service.providerList();
          const provider = providers.find((item) => item.id === providerId);
          if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404, code: 'PROVIDER_NOT_FOUND' });
          return sendJson(response, 200, provider);
        }
        if (action === 'credential' && request.method === 'PUT') {
          const body = await readJsonBody(request);
          return sendJson(response, 200, await service.setCredential(providerId, body.apiKey));
        }
        if (action === 'test' && request.method === 'POST') {
          return sendJson(response, 200, await service.testProvider(providerId));
        }
      }

      if (pathname === '/api/sessions' && request.method === 'GET') {
        return sendJson(response, 200, { sessions: await service.listSessions() });
      }
      if (pathname === '/api/sessions' && request.method === 'POST') {
        return sendJson(response, 201, await service.createSession(await readJsonBody(request)));
      }

      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/([^/]+))?$/);
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        const action = sessionMatch[2] || null;
        if (!action && request.method === 'GET') {
          const session = await service.getSession(sessionId);
          return sendJson(response, 200, {
            session,
            approvals: await service.pendingApprovals(sessionId)
          });
        }
        if (!action && request.method === 'PATCH') {
          return sendJson(response, 200, await service.updateSession(sessionId, await readJsonBody(request)));
        }
        if (!action && request.method === 'DELETE') {
          return sendJson(response, 200, await service.deleteSession(sessionId));
        }
        if (action === 'timeline' && request.method === 'GET') {
          return sendJson(response, 200, { events: await service.timeline(sessionId) });
        }
        if (action === 'messages' && request.method === 'POST') {
          return sendJson(response, 201, await service.recordMessage(sessionId, await readJsonBody(request)));
        }
        if (action === 'checkpoints' && request.method === 'POST') {
          return sendJson(response, 201, await service.createCheckpoint(sessionId, await readJsonBody(request)));
        }
        if (action === 'packet' && request.method === 'POST') {
          return sendJson(response, 200, await service.compilePacket(sessionId, await readJsonBody(request)));
        }
        if ((action === 'turn' || action === 'handoff') && request.method === 'POST') {
          return sendJson(response, 200, await service.runTurn(sessionId, await readJsonBody(request)));
        }
        if (action === 'export' && request.method === 'GET') {
          const format = url.searchParams.get('format') === 'json' ? 'json' : 'markdown';
          const value = await service.exportSession(sessionId, format);
          if (format === 'json') return sendJson(response, 200, value);
          const body = String(value);
          response.writeHead(200, {
            ...securityHeaders('text/markdown; charset=utf-8'),
            'content-disposition': 'attachment; filename="' + safeDownloadName('relaydock-' + sessionId.slice(0, 8), '.md') + '"',
            'content-length': Buffer.byteLength(body)
          });
          return response.end(body);
        }
      }

      const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/resolve$/);
      if (approvalMatch && request.method === 'POST') {
        return sendJson(response, 200, await service.resolveApproval(approvalMatch[1], await readJsonBody(request)));
      }

      if (pathname === '/api/diff' && request.method === 'GET') {
        return sendJson(response, 200, await service.getDiff(url.searchParams.get('sessionId') || null));
      }

      if (pathname === '/api/workspace' && request.method === 'GET') {
        return sendJson(response, 200, await service.getWorkspace());
      }
      if (pathname === '/api/workspace' && request.method === 'PUT') {
        const body = await readJsonBody(request);
        return sendJson(response, 200, await service.setWorkspace(body.path || body.workspace));
      }

      if (pathname === '/api/codex/sessions' && request.method === 'GET') {
        return sendJson(response, 200, await service.listCodexSessions({
          limit: Number(url.searchParams.get('limit')) || 30,
          codexHome: url.searchParams.get('codexHome') || undefined
        }));
      }
      if (pathname === '/api/codex/import' && request.method === 'POST') {
        return sendJson(response, 201, await service.importCodexSession(await readJsonBody(request)));
      }

      if (pathname === '/api/cursor/sessions' && request.method === 'GET') {
        return sendJson(response, 200, await service.listCursorSessions({
          limit: Number(url.searchParams.get('limit')) || 30,
          cursorHome: url.searchParams.get('cursorHome') || undefined,
          project: url.searchParams.get('project') || undefined,
          includeSubagents: url.searchParams.get('includeSubagents') === '1'
        }));
      }
      if (pathname === '/api/cursor/import' && request.method === 'POST') {
        return sendJson(response, 201, await service.importCursorSession(await readJsonBody(request)));
      }

      if (pathname.startsWith('/api/')) {
        return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
      }
      const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const target = path.resolve(publicDir, requested);
      if (!target.startsWith(path.resolve(publicDir) + path.sep) && target !== path.join(path.resolve(publicDir), 'index.html')) {
        return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'File not found' } });
      }
      let stat;
      try {
        stat = await fs.stat(target);
      } catch {
        return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'File not found' } });
      }
      if (!stat.isFile()) return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'File not found' } });
      const content = await fs.readFile(target);
      response.writeHead(200, {
        ...securityHeaders(MIME[path.extname(target)] || 'application/octet-stream'),
        'content-length': content.length
      });
      if (request.method === 'HEAD') return response.end();
      return response.end(content);
    } catch (error) {
      return apiError(response, error);
    }
  });

  server.service = service;
  server.token = token;
  return server;
}

function listen(server, options = {}) {
  const host = options.host || process.env.RELAYDOCK_HOST || '127.0.0.1';
  const configuredPort = options.port ?? process.env.RELAYDOCK_PORT ?? 4173;
  const port = Number(configuredPort);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve({ host, port: server.address().port, url: 'http://' + host + ':' + server.address().port });
    });
  });
}

module.exports = { VERSION, createRelayServer, listen }; // VERSION re-exported for compatibility
