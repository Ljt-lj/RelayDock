# RelayDock Pure Bridge

RelayDock can sit between Codex / Cursor and a receiving provider without becoming the primary chat UI.

There are two bridge surfaces:

1. **MCP control plane** — third-party agents keep their own conversation, and call RelayDock tools to record evidence, checkpoints, packets, approvals, and exports.
2. **OpenAI-compatible Gateway** — point Codex / Cursor at `http://127.0.0.1:4173/v1` as a model provider. The real chat stays in that platform; RelayDock captures the turn into its ledger and forwards it upstream.

Studio remains available for audit, packet preview, and approval, but it is optional in this mode.

## Start the daemon

~~~powershell
$env:DEEPSEEK_API_KEY = '<your-key>'
$env:RELAYDOCK_TOKEN = 'dev-relaydock-token'
node .\bin\relaydock.js serve --workspace D:\YourRepo --port 4173
~~~

Printed on start:

- Studio: `http://127.0.0.1:4173/`
- Gateway: `http://127.0.0.1:4173/v1`
- Bearer token for Gateway auth
- MCP command line

## MCP (Codex / Cursor control plane)

### Run

~~~powershell
node .\bin\relaydock.js mcp --workspace D:\YourRepo
~~~

stdio only. Do not write logs to stdout; MCP JSON-RPC uses stdout.

### Cursor example (`mcp.json`)

~~~json
{
  "mcpServers": {
    "relaydock": {
      "command": "node",
      "args": [
        "D:/RelayDock/bin/relaydock.js",
        "mcp",
        "--workspace",
        "D:/YourRepo"
      ]
    }
  }
}
~~~

### Typical tool sequence

1. `relaydock_session_create` with `originProvider: "codex"` or `"cursor"` and a stable `externalKey`
2. `relaydock_message_record` for the important user/assistant evidence
3. `relaydock_checkpoint_create`
4. `relaydock_packet_compile` to inspect context
5. Either keep chatting through the Gateway, or call `relaydock_turn_run`
6. `relaydock_export` and paste the summary back into the source platform

## Gateway (same chat UI, RelayDock as model)

### Auth

~~~http
Authorization: Bearer <RELAYDOCK_TOKEN or serve token>
~~~

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/models` | List bridge models |
| POST | `/v1/chat/completions` | OpenAI Chat Completions bridge |
| POST | `/v1/responses` | OpenAI Responses API bridge (Codex) |
| GET | `/v1/responses/:id` | Read a recent bridged response |

`POST /v1/responses` accepts Responses-style `input`, `instructions`, and `tools`, translates them to the upstream Chat Completions provider, and returns Responses `output` items (`message` / `function_call`). `stream: true` emits SSE events ending with `response.completed`.

### Models

| Model id | Behavior |
| --- | --- |
| `deepseek` / `relaydock/deepseek` | Forward through RelayDock and inject a Relay Packet |
| `relaydock/deepseek+raw` | Forward messages as-is, still write the ledger |
| `relaydock/deepseek+agent` | Run RelayDock's approval-gated agent loop |

### Helpful headers

| Header | Purpose |
| --- | --- |
| `x-relaydock-session` | Reuse an existing RelayDock session id |
| `x-relaydock-external-key` | Stable platform conversation id (`codex:thread-...`, `cursor:chat-...`) |
| `x-relaydock-origin` | `codex`, `cursor`, etc. |
| `x-relaydock-title` | Title used when auto-creating a session |

### Codex / custom OpenAI-compatible provider

Edit `%USERPROFILE%\.codex\config.toml`:

~~~toml
model = "relaydock/deepseek"
model_provider = "relaydock"

[model_providers.relaydock]
name = "RelayDock"
base_url = "http://127.0.0.1:4173/v1"
env_key = "RELAYDOCK_TOKEN"
wire_api = "responses"
~~~

Then:

~~~powershell
$env:RELAYDOCK_TOKEN = 'dev-relaydock-token'
$env:DEEPSEEK_API_KEY = '<your-key>'
node .\bin\relaydock.js serve --workspace D:\YourRepo --port 4173
~~~

Codex talks Responses API to RelayDock; RelayDock bridges to DeepSeek Chat Completions. The conversation remains in Codex. RelayDock stores packet hashes and bridged replies in `.relaydock`.

### Cursor custom model / OpenAI-compatible endpoint

Point the custom OpenAI-compatible endpoint at the same Gateway base URL and bearer token. Prefer a stable `externalKey` if the client can send custom headers; otherwise RelayDock creates a new bridge session per unbound request stream.

## What stays on the third-party platform

- The live user chat transcript
- The platform's own tool loop (unless you choose `+agent`)
- The platform's UI, quotas, and account session

## What RelayDock owns

- Append-only session ledger
- Checkpoints and packet compilation
- Upstream provider credentials and forwarding
- Approval records for RelayDock agent-loop mutations
- Export artifacts for pasting back into Codex / Cursor

## Safety notes

- Gateway and Studio listen on `127.0.0.1` by default.
- Treat Gateway bearer tokens like local API keys.
- External model output remains `untrusted` evidence in the ledger.
- `+agent` mutations still require explicit approval.
