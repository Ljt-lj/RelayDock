'use strict';

const crypto = require('node:crypto');
const { sha256 } = require('./utils');

const responseStore = new Map();
const RESPONSE_STORE_LIMIT = 200;

function extractBearer(request) {
  const header = String(request.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function parseModel(model) {
  const raw = String(model || 'deepseek').trim();
  const withoutPrefix = raw.replace(/^relaydock\//i, '');
  const parts = withoutPrefix.split('+').filter(Boolean);
  const providerId = (parts[0] || 'deepseek').toLowerCase();
  const flags = new Set(parts.slice(1).map((item) => item.toLowerCase()));
  return {
    providerId,
    injectPacket: !flags.has('raw'),
    agentLoop: flags.has('agent')
  };
}

function messageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
        if (part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') return String(part.text || '');
      }
      return '';
    }).filter(Boolean).join('\n');
  }
  if (content == null) return '';
  return String(content);
}

function stableMessageId(originProvider, role, content, index) {
  return originProvider + ':' + role + ':' + sha256(String(index) + '\n' + role + '\n' + content).slice(0, 24);
}

function openaiChatResponse({ id, model, content, usage, finishReason, toolCalls }) {
  const message = { role: 'assistant', content: content || (toolCalls && toolCalls.length ? null : '') };
  if (toolCalls && toolCalls.length) message.tool_calls = toolCalls;
  return {
    id: id || ('chatcmpl_' + crypto.randomUUID().replace(/-/g, '')),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason || (toolCalls && toolCalls.length ? 'tool_calls' : 'stop')
    }],
    usage: normalizeChatUsage(usage)
  };
}

function normalizeChatUsage(usage) {
  if (!usage) {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  return {
    prompt_tokens: usage.prompt_tokens || usage.input_tokens || 0,
    completion_tokens: usage.completion_tokens || usage.output_tokens || 0,
    total_tokens: usage.total_tokens || ((usage.prompt_tokens || usage.input_tokens || 0) + (usage.completion_tokens || usage.output_tokens || 0))
  };
}

function normalizeResponsesUsage(usage) {
  const chat = normalizeChatUsage(usage);
  return {
    input_tokens: chat.prompt_tokens,
    output_tokens: chat.completion_tokens,
    total_tokens: chat.total_tokens
  };
}

function responsesToolsToChat(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map((tool) => {
    if (!tool || typeof tool !== 'object') return null;
    if (tool.type === 'function' && tool.function && tool.function.name) return tool;
    if (tool.type === 'function' && tool.name) {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || tool.input_schema || { type: 'object', properties: {} }
        }
      };
    }
    return null;
  }).filter(Boolean);
}

function inputToChatMessages(input, instructions) {
  const messages = [];
  if (instructions) {
    messages.push({ role: 'system', content: String(instructions) });
  }
  if (typeof input === 'string') {
    if (input.trim()) messages.push({ role: 'user', content: input });
    return messages;
  }
  if (!Array.isArray(input)) return messages;

  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const type = item.type || (item.role ? 'message' : null);

    if (type === 'message' || item.role) {
      const role = item.role === 'developer' ? 'system' : (item.role || 'user');
      if (!['system', 'user', 'assistant', 'tool'].includes(role)) continue;
      const content = messageText(item.content);
      if (!content && role !== 'assistant') continue;
      messages.push({ role, content });
      continue;
    }

    if (type === 'function_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: item.call_id || item.id || ('call_' + crypto.randomUUID().replace(/-/g, '')),
          type: 'function',
          function: {
            name: item.name,
            arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {})
          }
        }]
      });
      continue;
    }

    if (type === 'function_call_output') {
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id || item.id,
        content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output || '')
      });
      continue;
    }

    if (type === 'input_text' && item.text) {
      messages.push({ role: 'user', content: String(item.text) });
    }
  }
  return messages;
}

function openaiResponsesResponse({ id, model, content, usage, toolCalls, status }) {
  const responseId = id && String(id).startsWith('resp_') ? id : ('resp_' + crypto.randomUUID().replace(/-/g, ''));
  const output = [];
  const calls = Array.isArray(toolCalls) ? toolCalls : [];

  for (const call of calls) {
    const callId = call.id || ('call_' + crypto.randomUUID().replace(/-/g, ''));
    output.push({
      id: 'fc_' + crypto.randomUUID().replace(/-/g, ''),
      type: 'function_call',
      status: 'completed',
      call_id: callId,
      name: call.function && call.function.name,
      arguments: (call.function && call.function.arguments) || '{}'
    });
  }

  if (content || !calls.length) {
    output.push({
      id: 'msg_' + crypto.randomUUID().replace(/-/g, ''),
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{
        type: 'output_text',
        annotations: [],
        logprobs: [],
        text: content || ''
      }]
    });
  }

  const value = {
    id: responseId,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: status || 'completed',
    model,
    output,
    usage: normalizeResponsesUsage(usage),
    error: null,
    incomplete_details: null,
    metadata: {}
  };
  rememberResponse(value);
  return value;
}

function rememberResponse(value) {
  responseStore.set(value.id, value);
  while (responseStore.size > RESPONSE_STORE_LIMIT) {
    const first = responseStore.keys().next().value;
    responseStore.delete(first);
  }
}

function getStoredResponse(id) {
  return responseStore.get(id) || null;
}

function bridgeOptionsFromHttp(request, body, defaults = {}) {
  return {
    model: body.model,
    maxTokens: body.max_tokens || body.max_output_tokens,
    temperature: body.temperature,
    sessionId: request.headers['x-relaydock-session'] || body.session_id || body.metadata && body.metadata.sessionId,
    externalKey: request.headers['x-relaydock-external-key'] || body.metadata && body.metadata.externalKey,
    originProvider: request.headers['x-relaydock-origin'] || body.metadata && body.metadata.originProvider || defaults.originProvider || 'gateway',
    title: request.headers['x-relaydock-title'] || body.metadata && body.metadata.title,
    injectPacket: body.metadata && body.metadata.injectPacket,
    agentLoop: body.metadata && body.metadata.agentLoop
  };
}

function writeSse(response, event, data) {
  response.write('event: ' + event + '\n');
  response.write('data: ' + JSON.stringify(data) + '\n\n');
}

function streamResponsesResult(httpResponse, result) {
  const headers = {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-content-type-options': 'nosniff'
  };
  httpResponse.writeHead(200, headers);

  writeSse(httpResponse, 'response.created', { type: 'response.created', response: { ...result, output: [], status: 'in_progress' } });

  for (const item of result.output) {
    writeSse(httpResponse, 'response.output_item.added', {
      type: 'response.output_item.added',
      output_index: result.output.indexOf(item),
      item: { ...item, status: 'in_progress', content: item.type === 'message' ? [] : item.content }
    });

    if (item.type === 'message') {
      const part = item.content && item.content[0];
      writeSse(httpResponse, 'response.content_part.added', {
        type: 'response.content_part.added',
        item_id: item.id,
        output_index: result.output.indexOf(item),
        content_index: 0,
        part: { type: 'output_text', text: '', annotations: [], logprobs: [] }
      });
      const text = part && part.text || '';
      const chunkSize = 48;
      for (let index = 0; index < text.length; index += chunkSize) {
        const delta = text.slice(index, index + chunkSize);
        writeSse(httpResponse, 'response.output_text.delta', {
          type: 'response.output_text.delta',
          item_id: item.id,
          output_index: result.output.indexOf(item),
          content_index: 0,
          delta
        });
      }
      writeSse(httpResponse, 'response.output_text.done', {
        type: 'response.output_text.done',
        item_id: item.id,
        output_index: result.output.indexOf(item),
        content_index: 0,
        text
      });
      writeSse(httpResponse, 'response.content_part.done', {
        type: 'response.content_part.done',
        item_id: item.id,
        output_index: result.output.indexOf(item),
        content_index: 0,
        part
      });
    }

    writeSse(httpResponse, 'response.output_item.done', {
      type: 'response.output_item.done',
      output_index: result.output.indexOf(item),
      item
    });
  }

  writeSse(httpResponse, 'response.completed', { type: 'response.completed', response: result });
  httpResponse.write('data: [DONE]\n\n');
  httpResponse.end();
}

async function handleGatewayRequest(service, request, url, body, authToken, httpResponse) {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const bearer = extractBearer(request);
  if (!bearer || bearer !== authToken) {
    const error = new Error('A valid Bearer token is required for the RelayDock gateway');
    error.status = 401;
    error.code = 'TOKEN_REQUIRED';
    throw error;
  }

  if ((pathname === '/v1/models' || pathname === '/models') && request.method === 'GET') {
    const providers = await service.providerList();
    const models = [];
    for (const provider of providers) {
      if (!provider.enabled) continue;
      for (const id of [provider.id, 'relaydock/' + provider.id, 'relaydock/' + provider.id + '+raw', 'relaydock/' + provider.id + '+agent']) {
        models.push({
          id,
          object: 'model',
          created: 0,
          owned_by: 'relaydock',
          permission: []
        });
      }
    }
    return { status: 200, value: { object: 'list', data: models } };
  }

  const responseMatch = pathname.match(/^(?:\/v1)?\/responses(?:\/([^/]+))?$/);
  if (responseMatch) {
    const responseId = responseMatch[1] || null;
    if (responseId && request.method === 'GET') {
      const stored = getStoredResponse(responseId);
      if (!stored) {
        const error = new Error('Response not found');
        error.status = 404;
        error.code = 'RESPONSE_NOT_FOUND';
        throw error;
      }
      return { status: 200, value: stored };
    }
    if (!responseId && request.method === 'POST') {
      const messages = inputToChatMessages(body.input, body.instructions);
      if (!messages.length) {
        const error = new Error('input is required');
        error.status = 400;
        error.code = 'INVALID_GATEWAY_REQUEST';
        throw error;
      }
      const bridge = await service.bridgeCompletion({
        ...bridgeOptionsFromHttp(request, body, { originProvider: 'codex' }),
        messages,
        tools: responsesToolsToChat(body.tools),
        preserveToolHistory: true
      });
      const value = openaiResponsesResponse({
        model: bridge.model || body.model,
        content: bridge.content,
        usage: bridge.usage,
        toolCalls: bridge.toolCalls,
        status: 'completed'
      });
      if (body.stream) {
        if (!httpResponse) {
          const error = new Error('Streaming requires an HTTP response object');
          error.status = 500;
          error.code = 'STREAM_UNAVAILABLE';
          throw error;
        }
        streamResponsesResult(httpResponse, value);
        return { streamed: true };
      }
      return { status: 200, value };
    }
  }

  if ((pathname === '/v1/chat/completions' || pathname === '/chat/completions') && request.method === 'POST') {
    const bridge = await service.bridgeCompletion({
      ...bridgeOptionsFromHttp(request, body),
      messages: body.messages || [],
      tools: Array.isArray(body.tools) ? body.tools : []
    });
    const value = openaiChatResponse({
      id: bridge.rawId,
      model: bridge.model || body.model,
      content: bridge.content,
      usage: bridge.usage,
      finishReason: bridge.finishReason,
      toolCalls: bridge.toolCalls
    });
    if (body.stream) {
      if (!httpResponse) {
        const error = new Error('Streaming requires an HTTP response object');
        error.status = 500;
        error.code = 'STREAM_UNAVAILABLE';
        throw error;
      }
      const chunk = {
        id: value.id,
        object: 'chat.completion.chunk',
        created: value.created,
        model: value.model,
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            content: bridge.content || '',
            tool_calls: bridge.toolCalls && bridge.toolCalls.length ? bridge.toolCalls.map((call, index) => ({
              index,
              id: call.id,
              type: 'function',
              function: call.function
            })) : undefined
          },
          finish_reason: value.choices[0].finish_reason
        }]
      };
      httpResponse.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-content-type-options': 'nosniff'
      });
      httpResponse.write('data: ' + JSON.stringify(chunk) + '\n\n');
      httpResponse.write('data: [DONE]\n\n');
      httpResponse.end();
      return { streamed: true };
    }
    return { status: 200, value };
  }

  const error = new Error('Gateway endpoint not found');
  error.status = 404;
  error.code = 'NOT_FOUND';
  throw error;
}

module.exports = {
  handleGatewayRequest,
  parseModel,
  messageText,
  stableMessageId,
  openaiChatResponse,
  openaiResponsesResponse,
  inputToChatMessages,
  responsesToolsToChat,
  extractBearer,
  getStoredResponse
};
