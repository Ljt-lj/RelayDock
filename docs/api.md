# RelayDock API

RelayDock exposes a local HTTP API for the Studio, CLI integrations, the OpenAI-compatible Gateway, and the stdio MCP bridge.

## Start

~~~powershell
node .\bin\relaydock.js serve --workspace D:\RelayDock --host 127.0.0.1 --port 4173
~~~

Default address: http://127.0.0.1:4173/

## Authentication

GET /api/health and GET /api/bootstrap are available without a Token. Other /api/ endpoints require:

~~~http
x-relaydock-token: <token-from-bootstrap>
~~~

The Studio fetches the Token from /api/bootstrap at startup. The Token lives only in the server process unless RELAYDOCK_TOKEN is set.

Requests with an Origin header must be same-origin. The server rejects cross-origin API access.

## Endpoint Summary

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/health | Liveness and version |
| GET | /api/bootstrap | Studio Token, version, workspace |
| GET | /api/overview | Sessions, Providers, approvals, leases, data directory |
| GET | /api/providers | List Providers without secrets |
| POST | /api/providers | Create or update a Provider |
| GET | /api/providers/:id | Read one Provider |
| PUT | /api/providers/:id/credential | Set a process-memory API Key |
| POST | /api/providers/:id/test | Test the configured endpoint |
| GET | /api/sessions | List sessions |
| POST | /api/sessions | Create a session contract |
| GET | /api/sessions/:id | Session plus pending approvals |
| PATCH | /api/sessions/:id | Update the task contract |
| DELETE | /api/sessions/:id | Hard-delete a session, its ledger events, unused checkpoint blobs, and bindings |
| GET | /api/sessions/:id/timeline | Full ordered event timeline |
| POST | /api/sessions/:id/messages | Append or idempotently return a message |
| POST | /api/sessions/:id/checkpoints | Create a workspace checkpoint |
| POST | /api/sessions/:id/packet | Compile a Relay Packet |
| POST | /api/sessions/:id/turn | Run a Provider turn |
| POST | /api/sessions/:id/handoff | Alias of turn |
| GET | /api/sessions/:id/export?format=markdown | Download Markdown export |
| GET | /api/sessions/:id/export?format=json | JSON session export |
| POST | /api/approvals/:id/resolve | Approve or reject a pending action |
| GET | /api/diff | Git status and diff for the workspace |
| GET | /v1/models | OpenAI-compatible model list (Bearer token) |
| POST | /v1/chat/completions | OpenAI-compatible bridge completion (Bearer token) |
| POST | /v1/responses | OpenAI Responses API bridge for Codex (Bearer token) |
| GET | /v1/responses/:id | Read a recently bridged Responses result |
| GET | /api/codex/sessions | List local Codex rollout files under ~/.codex/sessions |
| POST | /api/codex/import | Import a Codex rollout into a RelayDock session |
| GET | /api/cursor/sessions | List local Cursor agent transcripts under ~/.cursor/projects |
| POST | /api/cursor/import | Import a Cursor agent transcript into a RelayDock session |
| GET | /api/workspace | Current workspace, data directory, and recent workspaces |
| PUT | /api/workspace | Switch the active file/Git workspace (`{ "path": "..." }`) |

Gateway details and MCP setup: [bridge.md](bridge.md).

All write endpoints accept application/json and have a 2 MiB request-body limit. Session messages have an additional 200,000-character limit.

## Create a Session

~~~http
POST /api/sessions
Content-Type: application/json
x-relaydock-token: <token>
~~~

~~~json
{
  "title": "完成登录模块",
  "goal": "实现并验证登录流程",
  "constraints": ["保持现有 API 兼容"],
  "acceptanceCriteria": ["单元测试通过", "未登录请求返回 401"],
  "decisions": ["沿用现有 Token 格式"],
  "openIssues": ["刷新 Token 尚未接入"],
  "nextSteps": ["修复登录集成测试"],
  "originProvider": "codex"
}
~~~

The returned session includes id, title, contract, counts, lastMessage, and latestCheckpoint.

## Record a Message

~~~http
POST /api/sessions/:id/messages
Content-Type: application/json
x-relaydock-token: <token>
~~~

~~~json
{
  "role": "assistant",
  "content": "已完成登录接口，剩余两个失败测试。",
  "originProvider": "codex",
  "model": "codex",
  "messageId": "codex:assistant:2026-11-16-001",
  "untrusted": false
}
~~~

messageId is the idempotency key. Repeating the same messageId returns the existing event instead of appending a duplicate. Messages from providers other than user and codex default to untrusted=true.

## Create a Checkpoint

~~~http
POST /api/sessions/:id/checkpoints
~~~

~~~json
{
  "summary": "登录实现完成，正在修复集成测试",
  "testStatus": "2 tests failed",
  "openIssues": ["刷新 Token 缺测试"],
  "nextSteps": ["修复登录集成测试"],
  "originProvider": "relaydock"
}
~~~

The checkpoint contains:

- the task contract;
- recent messages;
- tool event summaries;
- Git branch, commit, status, and diff;
- file inventory and hashes;
- test status, open issues, and next steps.

The full snapshot is stored in a content-addressed Blob Store. The ledger keeps a blob reference, digest, summary, branch, commit, counts, and file-hash aggregate.

## Compile a Relay Packet

~~~http
POST /api/sessions/:id/packet
~~~

~~~json
{
  "request": "Continue by running the failing tests and fixing the root cause.",
  "maxChars": 28000
}
~~~

The response contains markdown, structured sections, stats, omitted items, and the checkpoint ID. Packet generation records only its hash and statistics in the ledger, not the full packet.

## Run a Provider Turn

~~~http
POST /api/sessions/:id/turn
~~~

~~~json
{
  "providerId": "deepseek",
  "instruction": "继续修复登录集成测试",
  "maxSteps": 4
}
~~~

Possible result statuses:

- completed;
- approval_required;
- step_limit.

The server acquires a single-provider write lease for the session, creates a fresh checkpoint, compiles a packet, calls the Provider, records external messages as untrusted, and executes only read-only tools automatically. Mutations return a pending approval.

A failed Provider call is recorded as provider.error and handoff.completed with status failed. Existing checkpoints remain intact.

## Resolve an Approval

~~~http
POST /api/approvals/:id/resolve
~~~

~~~json
{
  "decision": "approve",
  "continueTurn": true,
  "maxSteps": 4
}
~~~

Approval runs outside the original HTTP turn. A write approval rechecks the previously observed file hash before writing. A command approval runs without a shell, inside the workspace, with a restricted environment, timeout, and output limit.

Use decision reject to discard the pending action without executing it.

## Provider Configuration

~~~http
POST /api/providers
~~~

~~~json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "contextWindow": 64000,
  "maxOutputTokens": 8192,
  "enabled": true
}
~~~

Preview/model endpoints are expected to follow OpenAI Chat Completions conventions:

- POST {baseUrl}/chat/completions
- GET {baseUrl}/models
- Authorization: Bearer <key>

Provider configuration never stores an inline apiKey. A key can come from apiKeyEnv or PUT /api/providers/:id/credential, which keeps it in process memory only.

## Error Shape

~~~json
{
  "error": {
    "code": "PROVIDER_NOT_CONFIGURED",
    "message": "No credential configured for this provider"
  }
}
~~~

Common HTTP statuses:

- 400: invalid input or Provider not configured;
- 401: missing or invalid RelayDock Token;
- 403: cross-origin request;
- 404: resource not found;
- 409: write lease conflict;
- 413: request or message too large;
- 415: non-JSON request body;
- 429: Provider rate limit;
- 502: Provider/network/protocol failure.

## Local Data

Default location: <workspace>/.relaydock

~~~text
.relaydock/
  events.jsonl
  providers.json
  blobs/<sha256>.json
  approvals/<approval-id>.json
~~~

The current MVP uses JSONL instead of SQLite. Events are flushed as append-only lines and reloaded at startup. A partial final line can be ignored after an abrupt shutdown, but no fsync or multi-process write coordination is provided yet.
