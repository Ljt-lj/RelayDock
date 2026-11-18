'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { OpenAICompatibleProvider, endpoint, safeRequestUrl } = require('../src/provider');

const provider = {
  id: 'deepseek',
  baseUrl: 'https://api.example.test/',
  model: 'deepseek-chat',
  maxOutputTokens: 2048
};

test('endpoint trims trailing slashes', () => {
  assert.equal(endpoint(provider.baseUrl, '/models'), 'https://api.example.test/models');
});

test('OpenAI-compatible adapter sends credentials and parses tool calls', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      id: 'response-1',
      model: 'deepseek-chat',
      choices: [{
        message: {
          content: 'I will inspect the file.',
          tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/a.js"}' } }]
        },
        finish_reason: 'tool_calls'
      }],
      usage: { prompt_tokens: 10, completion_tokens: 4 }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const client = new OpenAICompatibleProvider(provider, 'test-key', { fetchImpl });
  const tested = await client.testConnection();
  assert.equal(tested.modelAvailable, true);
  assert.equal(tested.modelCount, 2);

  const completion = await client.complete({
    messages: [{ role: 'user', content: 'continue' }],
    tools: []
  });
  assert.equal(completion.content, 'I will inspect the file.');
  assert.equal(completion.toolCalls[0].function.name, 'read_file');
  assert.equal(completion.usage.prompt_tokens, 10);
  assert.equal(calls[1].options.headers.authorization, 'Bearer test-key');
});

test('adapter fails clearly when no credential is available', async () => {
  const client = new OpenAICompatibleProvider(provider, '');
  await assert.rejects(() => client.complete({ messages: [] }), (error) => {
    assert.equal(error.code, 'PROVIDER_NOT_CONFIGURED');
    return true;
  });
});

test('network failures preserve sanitized connection cause details', async () => {
  const cause = Object.assign(new Error('connect EACCES 127.0.0.1:443'), {
    code: 'EACCES',
    syscall: 'connect',
    address: '127.0.0.1',
    port: 443
  });
  const networkError = new TypeError('fetch failed');
  networkError.cause = cause;
  const client = new OpenAICompatibleProvider(provider, 'super-secret-key', {
    fetchImpl: async () => {
      throw networkError;
    }
  });

  await assert.rejects(
    () => client.request('https://api.example.test/chat/completions?api_key=super-secret-key', { method: 'POST' }),
    (error) => {
      assert.equal(error.code, 'PROVIDER_NETWORK_ERROR');
      assert.match(error.message, /POST https:\/\/api\.example\.test\/chat\/completions/);
      assert.match(error.message, /EACCES/);
      assert.match(error.message, /connect/);
      assert.match(error.message, /127\.0\.0\.1:443/);
      assert.match(error.message, /network permissions/);
      assert.doesNotMatch(error.message, /super-secret-key/);
      assert.equal(error.details.method, 'POST');
      assert.equal(error.details.url, 'https://api.example.test/chat/completions');
      assert.equal(error.details.code, 'EACCES');
      assert.equal(error.details.syscall, 'connect');
      assert.equal(error.details.address, '127.0.0.1');
      assert.equal(error.details.port, '443');
      return true;
    }
  );
});

test('timeouts identify the method, sanitized endpoint, and timeout', async () => {
  const client = new OpenAICompatibleProvider(provider, 'test-key', {
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })
  });

  await assert.rejects(
    () => client.request('https://api.example.test/models?token=hidden', { method: 'GET', timeoutMs: 20 }),
    (error) => {
      assert.equal(error.code, 'PROVIDER_TIMEOUT');
      assert.match(error.message, /timed out after 20ms/);
      assert.match(error.message, /GET https:\/\/api\.example\.test\/models/);
      assert.doesNotMatch(error.message, /hidden/);
      assert.deepEqual(error.details, {
        method: 'GET',
        url: 'https://api.example.test/models',
        timeoutMs: 20
      });
      return true;
    }
  );
});

test('safeRequestUrl removes credentials, query parameters, and fragments', () => {
  assert.equal(
    safeRequestUrl('https://user:pass@api.example.test/v1/models?api_key=secret#fragment'),
    'https://api.example.test/v1/models'
  );
});
