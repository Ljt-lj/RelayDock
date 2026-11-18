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
| GET | /api/overview | Sessions, Providers, approvals, approval gates, leases, data directory |
| GET | /api/providers | List Providers without secrets |
| POST | /api/providers | Create or update a Provider |
| GET | /api/providers/:id | Read one Provider |
| PUT | /api/providers/:id/credential | Set and encrypt an API Key |
| DELETE | /api/providers/:id/credential | Delete a saved encrypted API Key |
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
| GET | /api/diff?sessionId= | Git status/diff for a session workspace (omit sessionId for the default workspace) |
| GET | /v1/models | OpenAI-compatible model list (Bearer token) |
| POST | /v1/chat/completions | OpenAI-compatible bridge completion (Bearer token) |
| POST | /v1/responses | OpenAI Responses API bridge for Codex (Bearer token) |
| GET | /v1/responses/:id | Read a recently bridged Responses result |
| GET | /api/codex/sessions | List local Codex rollout files under ~/.codex/sessions |
| POST | /api/codex/import | Import a Codex rollout into a RelayDock session |
| GET | /api/cursor/sessions | List local Cursor agent transcripts under ~/.cursor/projects |
| POST | /api/cursor/import | Import a Cursor agent transcript into a RelayDock session |
| GET | /api/workspace | Default workspace for new sessions, data directory, and recent workspaces |
| PUT | /api/workspace | Set the default workspace for new sessions (`{ "path": "..." }`) |

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
  "workspace": "D:\\YourRepo",
  "constraints": ["保持现有 API 兼容"],
  "acceptanceCriteria": ["单元测试通过", "未登录请求返回 401"],
  "decisions": ["沿用现有 Token 格式"],
  "openIssues": ["刷新 Token 尚未接入"],
  "nextSteps": ["修复登录集成测试"],
  "completeTaskFirst": true,
  "maxSteps": 32,
  "originProvider": "codex",
  "predecessorSessionId": "source-session-id"
}
~~~

`workspace` is optional; when omitted the server uses the default workspace from `PUT /api/workspace` / process startup. Tools, checkpoints, diffs, and approvals for that session use `session.workspace` only.

`completeTaskFirst` defaults to `true`. When enabled, RelayDock adds a completion-first constraint to the Relay Packet and system prompt. If the provider asks for a capability that is not registered as a dedicated tool, the agent loop returns recovery guidance and requires the model to request the concrete executable or script through `propose_run_command`. The resulting approval is an expected pause; after the real tool result arrives, the model continues the task.

`maxSteps` defaults to `32` and accepts integers from `1` to `100`. It is persisted on the task contract and governs normal turns and approval continuations. Existing sessions created before these fields existed are backfilled with `true` and `32` when reconstructed.

`predecessorSessionId` creates a continuation in the same relay lineage and inherits the predecessor's `lineageId`. When no predecessor is supplied, an explicit `lineageId` can define the shared lineage; otherwise the new Session id becomes its own lineage. A pending approval blocks every Session that shares the workspace or lineage.

The returned session includes id, title, workspace, contract, counts, lastMessage, and latestCheckpoint.

## Update a Session

~~~http
PATCH /api/sessions/:id
Content-Type: application/json
x-relaydock-token: <token>
~~~

~~~json
{
  "workspace": "D:\\AnotherRepo",
  "goal": "updated goal",
  "completeTaskFirst": false,
  "maxSteps": 64
}
~~~

`workspace` must be an existing directory. Changing it does not alter the global default workspace or other sessions. `completeTaskFirst` and `maxSteps` update the persistent task policy.

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
  "maxSteps": 48
}
~~~

`maxSteps` is optional. When omitted, RelayDock uses the task's persistent `contract.maxSteps`; when supplied, it overrides only this call and does not mutate the contract.

Possible result statuses:

- completed;
- approval_required;
- step_limit.

The server acquires a session lease and workspace lease before recording the instruction, creates a fresh checkpoint, compiles a packet, calls the Provider, records external messages as untrusted, and executes read-only tools automatically. Protected tools, including file writes, commands, and current-time lookup, return a pending approval instead of executing immediately.

A failed Provider call is recorded as provider.error and handoff.completed with status failed. Existing checkpoints remain intact.

If the same session already has a running turn, or another session is using the same workspace, the request returns `409 WRITE_LEASE_BUSY`. The rejected instruction is not recorded in the ledger.

## Concurrent Turns

Turns in different sessions can overlap when their workspaces are different. The server coordinates execution using three boundaries:

- one active turn per session;
- one active operation per resolved workspace;
- one approval gate shared by the same Session, workspace, or relay lineage.

The ordinary lease is held through Provider calls and read-only tool execution. When a protected tool creates an approval, that lease is released but the approval gate remains. The gate continues to block the owning Session, all Sessions using the same workspace, and all Sessions in the same lineage. After approval, RelayDock acquires the lease again and keeps it through tool execution and the optional continuation turn. Leases renew every 60 seconds with a 10-minute expiry. Windows workspace paths are compared case-insensitively.

The same rule applies to workspace changes, deletion, approved mutations, and Gateway completions that write to a session ledger.

`GET /api/overview` exposes active leases and approval gates. A gate can still be active when `leases` is empty:

~~~json
{
  "leases": [
    {
      "sessionId": "session-id",
      "providerId": "deepseek",
      "kind": "turn",
      "workspace": "D:\\YourRepo",
      "acquiredAt": "2026-11-18T08:00:00.000Z",
      "expiresAt": "2026-11-18T08:10:00.000Z"
    }
  ],
  "approvalGates": [
    {
      "approvalId": "approval-id",
      "sessionId": "session-id",
      "providerId": "deepseek",
      "toolName": "propose_get_current_time",
      "workspace": "D:\\YourRepo",
      "lineageId": "source-session-id",
      "handoffId": "handoff-id",
      "checkpointId": "checkpoint-id",
      "createdAt": "2026-11-18T08:00:00.000Z"
    }
  ]
}
~~~

Pending approval files are loaded during service startup, so these gates are restored after a restart. Conflicting turns return `409 WRITE_LEASE_BUSY`, and the rejected instruction is not recorded in the Session ledger.

## Resolve an Approval

~~~http
POST /api/approvals/:id/resolve
~~~

~~~json
{
  "decision": "approve",
  "continueTurn": true,
  "maxSteps": 48
}
~~~

The approval continuation uses the task's persistent `maxSteps` when this field is omitted. Supplying it overrides only the continuation call.

Approval runs outside the original HTTP turn. Protected-tool proposals record the Session, workspace, lineage, handoff, checkpoint, and original tool call at proposal time. Resolve uses that recorded workspace even if the Studio later selects another Session.

Approved actions execute the real tool:

- file writes recheck the previously observed file hash before writing;
- commands run without a shell inside the recorded workspace, with a restricted environment, timeout, and output limit;
- `propose_get_current_time` runs `Get-Date -Format o` through PowerShell on Windows and returns the actual local timestamp with its UTC offset.

Codex/Cursor import binds the inferred path onto `session.workspace` only; it does not switch the process default workspace unless no path can be inferred (then the new session uses the default).

Use decision reject to discard the pending action without executing it.

Approving a protected action reacquires the same Session and workspace lease used by turns, ignoring only its own approval gate. Any other lease or approval gate in the same Session, workspace, or lineage returns `409 WRITE_LEASE_BUSY`.

When `continueTurn` is true, RelayDock injects the original assistant tool call and the real tool result into the paused model conversation before requesting the next assistant step. The continuation uses the task's persistent tool-step budget unless `maxSteps` explicitly overrides it. MCP `relaydock_approval_resolve` defaults `continueTurn` to true; pass `false` to execute the tool without resuming the model. Rejecting an action does not acquire a workspace lease and clears the gate.

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

Provider configuration never stores an inline apiKey. Provider metadata is persisted in `providers.json`. A key can come from `apiKeyEnv` or from the Studio/API, in which case it is encrypted with AES-256-GCM and persisted in `credentials.json`.

`POST /api/providers` accepts an optional `apiKey` for convenience:

~~~json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "contextWindow": 64000,
  "maxOutputTokens": 8192,
  "enabled": true,
  "apiKey": "<plaintext only in the request body>"
}
~~~

The key can also be changed independently:

~~~http
PUT /api/providers/deepseek/credential
Content-Type: application/json
x-relaydock-token: <token>

{
  "apiKey": "<new-key>"
}
~~~

Saving a new key encrypts it with a fresh initialization vector. The encrypted record uses the Provider ID as authenticated additional data. Provider API responses never return the plaintext key.

To remove a locally saved key:

~~~http
DELETE /api/providers/deepseek/credential
x-relaydock-token: <token>
~~~

Deleting an encrypted key does not remove an API key supplied through `apiKeyEnv`; that environment fallback remains active until the RelayDock process environment changes.

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
- 409: session, workspace, lineage, or approval-gate conflict (`WRITE_LEASE_BUSY`);
- 413: request or message too large;
- 415: non-JSON request body;
- 429: Provider rate limit;
- 502: Provider/network/protocol failure.

Provider network failures preserve the underlying connection cause without exposing credentials or query parameters. The API returns sanitized diagnostics in both `message` and `details`:

~~~json
{
  "error": {
    "code": "PROVIDER_NETWORK_ERROR",
    "message": "Provider network request failed: POST https://api.deepseek.com/chat/completions (EACCES, connect, api.deepseek.com:443). The local process was not allowed to open the connection. Check firewall, proxy, VPN, and app network permissions.",
    "details": {
      "method": "POST",
      "url": "https://api.deepseek.com/chat/completions",
      "code": "EACCES",
      "syscall": "connect",
      "address": "api.deepseek.com",
      "port": "443",
      "hint": "The local process was not allowed to open the connection. Check firewall, proxy, VPN, and app network permissions."
    }
  }
}
~~~

Common causes include `EACCES`/Windows Sockets `10013` (firewall or outbound access denied), `ENOTFOUND`/`EAI_AGAIN` (DNS), `ECONNREFUSED` (wrong endpoint or proxy), `ECONNRESET` (connection reset), and `ETIMEDOUT` (reachability timeout). `PROVIDER_TIMEOUT` includes `details.method`, `details.url`, and `details.timeoutMs`.

## Local Data

Default location: <workspace>/.relaydock

~~~text
.relaydock/
  events.jsonl
  providers.json
  credentials.json
  credentials.key
  blobs/<sha256>.json
  approvals/<approval-id>.json
~~~

`providers.json` stores non-secret Provider configuration. `credentials.json` stores only AES-256-GCM ciphertext, IVs, authentication tags, and timestamps. By default, RelayDock creates `credentials.key` with a locally generated 32-byte master key and mode `0600`. Alternatively, set `RELAYDOCK_MASTER_KEY` to a Base64-encoded 32-byte key and do not keep a local key file.

This is local encryption at rest, not Windows DPAPI, a hardware-backed keystore, or a cloud KMS. Protect the master key and ciphertext together only as a matched set; losing the master key makes existing saved credentials unrecoverable.

The current MVP uses JSONL instead of SQLite. Events are flushed as append-only lines and reloaded at startup. A partial final line can be ignored after an abrupt shutdown, but no fsync or multi-process write coordination is provided yet.
