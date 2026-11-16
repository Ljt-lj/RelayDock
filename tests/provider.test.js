'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { OpenAICompatibleProvider, endpoint } = require('../src/provider');

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
