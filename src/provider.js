'use strict';

const { redactText } = require('./utils');

class ProviderError extends Error {
  constructor(message, options = {}) {
    super(redactText(message));
    this.name = 'ProviderError';
    this.code = options.code || 'PROVIDER_ERROR';
    this.status = options.status || null;
  }
}

function endpoint(baseUrl, suffix) {
  return String(baseUrl).replace(/\/+$/, '') + suffix;
}

class OpenAICompatibleProvider {
  constructor(provider, apiKey, options = {}) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || 120000;
  }

  headers() {
    const headers = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = 'Bearer ' + this.apiKey;
    return headers;
  }

  async request(url, options = {}) {
    if (!this.fetchImpl) throw new ProviderError('This Node.js runtime does not provide fetch()');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { ...options, signal: controller.signal });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 2000) };
      }
      if (!response.ok) {
        const detail = data && data.error && (data.error.message || data.error.code)
          ? data.error.message || data.error.code
          : String(response.statusText || 'Provider request failed');
        throw new ProviderError(detail, {
          code: response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_HTTP_ERROR',
          status: response.status
        });
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new ProviderError('Provider request timed out', { code: 'PROVIDER_TIMEOUT' });
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(error.message || 'Provider request failed', { code: 'PROVIDER_NETWORK_ERROR' });
    } finally {
      clearTimeout(timer);
    }
  }

  async complete(input) {
    if (!this.apiKey) throw new ProviderError('No credential configured for this provider', { code: 'PROVIDER_NOT_CONFIGURED' });
    const payload = {
      model: this.provider.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: Math.min(input.maxTokens || this.provider.maxOutputTokens, this.provider.maxOutputTokens)
    };
    if (input.tools && input.tools.length) {
      payload.tools = input.tools;
      payload.tool_choice = 'auto';
    }
    const data = await this.request(endpoint(this.provider.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) throw new ProviderError('Provider returned no assistant message', { code: 'INVALID_PROVIDER_RESPONSE' });
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls || [],
      finishReason: choice.finish_reason || null,
      usage: data.usage || null,
      model: data.model || this.provider.model,
      rawId: data.id || null
    };
  }

  async testConnection() {
    if (!this.apiKey) throw new ProviderError('No credential configured for this provider', { code: 'PROVIDER_NOT_CONFIGURED' });
    const data = await this.request(endpoint(this.provider.baseUrl, '/models'), {
      method: 'GET',
      headers: this.headers(),
      timeoutMs: 20000
    });
    const models = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
    return {
      ok: true,
      model: this.provider.model,
      modelAvailable: models.length ? models.includes(this.provider.model) : null,
      modelCount: models.length,
      models: models.slice(0, 20)
    };
  }
}

module.exports = { OpenAICompatibleProvider, ProviderError, endpoint };
