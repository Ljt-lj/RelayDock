'use strict';

const { URL } = require('node:url');
const { redactDeep, redactText } = require('./utils');

class ProviderError extends Error {
  constructor(message, options = {}) {
    const secrets = Array.isArray(options.secrets) ? options.secrets : [];
    super(redactText(message, secrets));
    this.name = 'ProviderError';
    this.code = options.code || 'PROVIDER_ERROR';
    this.status = options.status || null;
    this.details = options.details ? redactDeep(options.details, secrets) : null;
  }
}

function endpoint(baseUrl, suffix) {
  return String(baseUrl).replace(/\/+$/, '') + suffix;
}

function safeRequestUrl(value) {
  try {
    const parsed = new URL(String(value));
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '[invalid URL]';
  }
}

function sanitizeDetail(value, secrets) {
  const text = redactText(value, secrets);
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) => safeRequestUrl(candidate)).slice(0, 1000);
}

function requestMethod(options) {
  const method = String(options.method || 'GET').toUpperCase();
  return /^[A-Z]+$/.test(method) ? method : 'GET';
}

function extractCauseDetails(error, secrets) {
  const details = {};
  const seen = new Set();
  let current = error && error.cause;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current !== 'object') {
      if (!details.message) details.message = sanitizeDetail(current, secrets);
      break;
    }
    if (seen.has(current)) break;
    seen.add(current);
    if (details.code === undefined && (current.code || current.errno)) {
      details.code = sanitizeDetail(current.code || current.errno, secrets);
    }
    for (const key of ['syscall', 'address', 'port']) {
      if (details[key] === undefined && current[key] !== undefined) {
        details[key] = sanitizeDetail(current[key], secrets);
      }
    }
    if (current.message) {
      const message = sanitizeDetail(current.message, secrets);
      details.message = details.message ? details.message + '; ' + message : message;
    }
    current = current.cause;
  }
  return details;
}

function networkHint(details) {
  const signature = [details.code, details.message].filter(Boolean).join(' ').toUpperCase();
  if (/EACCES|EPERM|10013|ACCESS.*DENIED|PERMISSION.*DENIED/.test(signature)) {
    return 'The local process was not allowed to open the connection. Check firewall, proxy, VPN, and app network permissions.';
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(signature)) {
    return 'The provider host could not be resolved. Check DNS and the configured base URL.';
  }
  if (/ECONNREFUSED/.test(signature)) {
    return 'The provider refused the connection. Check the base URL, port, and local proxy settings.';
  }
  if (/ECONNRESET|EPIPE|UND_ERR_SOCKET/.test(signature)) {
    return 'The connection was reset while talking to the provider. Check the proxy, VPN, or retry the request.';
  }
  if (/ETIMEDOUT|UND_ERR_.*TIMEOUT/.test(signature)) {
    return 'The connection timed out. Check network reachability, proxy settings, or retry the request.';
  }
  if (/CERT|SELF_SIGNED|TLS|SSL|UNABLE_TO_VERIFY/.test(signature)) {
    return 'TLS certificate verification failed. Check the provider certificate, system clock, or TLS proxy.';
  }
  return null;
}

function networkFailure(error, method, url, secrets) {
  const cause = extractCauseDetails(error, secrets);
  const location = cause.address
    ? cause.address + (cause.port ? ':' + cause.port : '')
    : null;
  const reason = [cause.code, cause.syscall, location, cause.message].filter(Boolean).join(', ');
  let message = 'Provider network request failed: ' + method + ' ' + url;
  if (reason) message += ' (' + reason + ')';
  const hint = networkHint(cause);
  if (hint) {
    message += '. ' + hint;
  } else {
    const original = sanitizeDetail(error && error.message || '', secrets);
    if (original && original !== 'fetch failed') message += '. ' + original;
  }
  const details = { method, url, ...cause };
  if (hint) details.hint = hint;
  return { message, details };
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
    const method = requestMethod(options);
    const safeUrl = safeRequestUrl(url);
    const timeoutMs = Number(options.timeoutMs || this.timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        throw new ProviderError(sanitizeDetail(detail, [this.apiKey]), {
          code: response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_HTTP_ERROR',
          status: response.status,
          details: {
            method,
            url: safeUrl,
            status: response.status,
            providerCode: data && data.error && data.error.code ? data.error.code : null
          },
          secrets: [this.apiKey]
        });
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') {
        throw new ProviderError(
          'Provider request timed out after ' + timeoutMs + 'ms: ' + method + ' ' + safeUrl,
          {
            code: 'PROVIDER_TIMEOUT',
            details: { method, url: safeUrl, timeoutMs },
            secrets: [this.apiKey]
          }
        );
      }
      if (error instanceof ProviderError) throw error;
      const failure = networkFailure(error, method, safeUrl, [this.apiKey]);
      throw new ProviderError(failure.message, {
        code: 'PROVIDER_NETWORK_ERROR',
        details: failure.details,
        secrets: [this.apiKey]
      });
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

module.exports = { OpenAICompatibleProvider, ProviderError, endpoint, safeRequestUrl };
