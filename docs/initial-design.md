# RelayDock 初步设计方案

## 1. 项目目标

RelayDock 是一个面向本地编码 Agent 的接力工作台，用于在 Codex 与其他模型供应商之间继续未完成任务。

核心使用场景：

1. 用户在 Codex 中完成了一部分代码修改。
2. Codex 额度耗尽、服务不可用，或者用户希望尝试其他模型。
3. 用户把当前任务交接给 DeepSeek 等供应商。
4. 新模型获得足够的任务上下文，可以继续修改代码、运行测试和推进任务。
5. 用户可以把新进展同步回 Codex，同时保留两边的对话和操作记录。

项目不是普通聊天记录导出工具。真正需要同步的是可执行、可恢复的任务状态。

## 2. 可实现边界

可以稳定同步：

- 用户消息和模型可见回复；
- 工具调用、工具结果和错误信息；
- 文件修改、Git Diff 和测试结果；
- 当前目标、约束、已确认决策和待办事项；
- 供应商、模型、Token 用量和费用信息；
- 工作区快照或快照引用。

无法保证同步：

- 模型隐藏推理过程；
- 模型内部 KV Cache；
- 供应商私有缓存和会话状态；
- 完全一致的 Tool Call 行为；
- 不经过协议转换的无缝模型替换。

因此，RelayDock 的交接单位是可审计的 Relay Packet，而不是完整复制某一个模型的内部状态。

## 3. 总体架构

```text
Codex Desktop / CLI
  |-- RelayDock Skill
  |-- MCP tools or local CLI
  `-- Optional local model gateway
                 |
          RelayDock Daemon
           |-- Session Ledger
           |-- Context Compiler
           |-- Provider Adapters
           |-- Tool Proxy
           `-- Local Web UI
                 |
       DeepSeek / other providers
```

Skill 负责定义交互流程和安全规则。持久化、模型适配、工作区操作和可视化由 RelayDock Daemon 与本地 Web UI 完成。

单靠一个 `SKILL.md` 无法提供持续同步、后台服务或独立可视化界面。

## 4. 核心模块

### 4.1 Session Ledger

Session Ledger 是所有 Agent 和界面共享的唯一事实来源。

采用 append-only 事件模型。初步设计建议最终使用 SQLite 保存索引和事件；当前 MVP 为保持零依赖，使用 JSONL 账本，并将较大的 Checkpoint 放入独立 Blob Store。

主要事件类型：

- `message.created`
- `tool.requested`
- `tool.completed`
- `tool.failed`
- `file.changed`
- `checkpoint.created`
- `handoff.requested`
- `handoff.accepted`
- `handoff.completed`
- `provider.error`
- `approval.requested`
- `approval.resolved`

每条事件至少包含：

- `event_id`
- `session_id`
- `branch_id`
- `sequence`
- `origin_provider`
- `actor`
- `created_at`
- `content_hash`
- `payload`

模型供应商的原始响应可以保留在独立 Blob Store 中，用于审计和协议兼容，但业务层使用统一事件结构。

### 4.2 Checkpoint

Checkpoint 用于在供应商失败、额度耗尽或用户主动切换前保存可恢复状态。

建议在以下时机自动创建：

- 每轮用户消息处理完成后；
- 长时间工具调用开始前；
- 批量文件修改前；
- 模型切换前；
- 上下文接近上限时；
- 用户主动请求时。

Checkpoint 至少包含：

- 会话 ID 和分支 ID；
- 当前 Git Commit、Branch 和未提交 Diff；
- 工作区文件清单及关键文件哈希；
- 当前任务契约；
- 对话和工具事件序号；
- 测试和构建结果；
- 未完成操作；
- 下一步建议。

### 4.3 Relay Packet

Relay Packet 是接收模型真正看到的上下文，不等于原始聊天记录。

建议结构：

```text
1. 安全与系统约束
2. 用户目标和验收标准
3. 当前任务约束
4. 最新 Checkpoint 摘要
5. 关键决策及原因
6. 最近相关对话
7. 相关工具调用和结果
8. 工作区与 Git 状态
9. 未解决问题
10. 下一步请求
```

Context Compiler 根据目标模型的上下文窗口、工具能力和多模态能力，对内容进行预算分配、压缩和裁剪。

不得把外部模型的输出直接提升为系统指令。外部内容应带有来源标记，并作为不可信证据注入。

### 4.4 Provider Adapter

Provider Adapter 负责屏蔽供应商协议差异，至少支持：

- OpenAI Responses API；
- OpenAI Chat Completions 兼容 API；
- DeepSeek 兼容接口；
- Anthropic Messages API；
- Gemini API；
- 通用自定义 HTTP Provider。

当前 MVP 已实现 OpenAI Chat Completions 兼容 Adapter 和 DeepSeek 默认配置；以下能力是后续扩展目标。Adapter 需要统一处理：

- 流式输出；
- Tool Call 和 Tool Result；
- JSON Schema；
- 上下文窗口；
- 最大输出 Token；
- 图片和文件输入；
- 用量与费用；
- 限流和额度错误；
- 重试、超时和中断恢复；
- `/models` 等能力发现接口。

建议维护 Capability Matrix，记录每个模型是否支持：

- 流式输出；
- 并行工具调用；
- 严格 JSON Schema；
- 图片输入；
- 长上下文；
- 推理内容字段；
- Prompt Cache。

### 4.5 Tool Proxy

所有文件、Shell、Git 和 MCP 工具都经过 Tool Proxy，以获得一致的安全和审计能力。

关键能力：

- 单写入者租约；
- 用户审批；
- 命令工作目录控制；
- 超时和最大输出限制；
- 敏感信息过滤；
- 工具调用记录；
- 工作区冲突检测；
- 工具能力降级。

默认只允许一个 Agent 持有写入租约。其他供应商可以只读查看或生成建议，避免两个 Agent 同时修改同一工作区。

## 5. 三种接入模式

### 5.1 Skill / MCP Sidecar

Codex 通过 Skill、MCP 或本地 CLI 调用 RelayDock：

- 创建 Checkpoint；
- 生成 Relay Packet；
- 调用其他模型；
- 导入结果；
- 返回 Codex。

优点：

- 实现较快；
- 不需要替换 Codex 的模型协议；
- 容易控制权限。

限制：

- Codex 必须仍然可以运行；
- 无法单独解决 Codex 完全不可用的问题。

### 5.2 本地 Model Gateway

RelayDock 暴露一个 OpenAI 兼容的本地端点，Codex 将其识别为模型供应商。

优点：

- 最接近同一会话内切换模型；
- 对话和工具事件可以由 Gateway 自动捕获；
- 可以统一用量和路由策略。

限制：

- Responses API 与不同供应商协议之间的转换较复杂；
- Tool Call 兼容性需要大量测试；
- 仍需要验证 Codex 在自身额度耗尽后是否允许使用外部 Provider。

### 5.3 独立 RelayDock Web UI

RelayDock 提供独立聊天与任务执行界面，在 Codex 不可用时继续任务。

优点：

- 不依赖 Codex 客户端继续运行；
- 可以完整展示双方时间线和上下文；
- 适合作为额度耗尽后的可靠兜底。

限制：

- 需要自己的 Agent Loop；
- 需要实现或接入完整工具执行运行时；
- 工作量和安全风险最高。

### 5.4 推荐组合

第一阶段优先完成：

1. Skill/MCP 控制面；
2. Session Ledger；
3. Checkpoint 和 Relay Packet；
4. 本地 Web UI；
5. DeepSeek Provider Adapter；
6. 手动交接和结果回传。

第二阶段增加：

1. 本地 Model Gateway；
2. 自动额度检测和 Provider Fallback；
3. 同一 Codex 会话内切换；
4. 自动增量同步。

第三阶段增加：

1. 独立 Agent Runtime；
2. 在 Codex 完全不可用时继续执行；
3. 多 Agent 并行比较和只读评审模式。

## 6. 双向同步规则

两个供应商的会话需要互通，但不应该变成两份可以随意并发修改的聊天记录。

建议规则：

1. 所有消息以 Session Ledger 为主，不直接修改另一个客户端的历史。
2. 每条外部消息标记 `origin_provider` 和 `untrusted`。
3. 使用稳定的消息 ID 和幂等键，避免重复导入。
4. 写入操作必须持有写锁。
5. 返回 Codex 时只导入增量事件和文件状态，避免重复全部历史。
6. 导入前比较 Git Commit、文件哈希和工作区 Diff。
7. 发生第三方文件修改时暂停自动合并并要求用户确认。

## 7. 可视化界面

RelayDock Studio 采用本地工作台形式。

### 7.1 主界面

- 左侧：会话列表、项目列表、Provider 状态。
- 中间：统一时间线，可切换合并视图和单 Provider 视图。
- 顶部：当前模型、写锁状态、上下文占用、费用、连接健康度。
- 右侧：Checkpoint、Relay Packet、文件、工具调用和 Token 详情。
- 底部：当前 Agent 的对话输入和运行状态。

### 7.2 关键交互

- 新建 Provider；
- 测试连接；
- 创建 Checkpoint；
- 预览 Relay Packet；
- 交接给指定 Provider；
- 比较两个模型的回答；
- 批准 Shell 或文件操作；
- 返回 Codex；
- 打开 Git Diff；
- 恢复历史 Checkpoint。

### 7.3 安全提示

交接前需要明确展示：

- 哪些内容会发送给目标供应商；
- 哪些内容因 Token 限制被裁剪；
- 目标模型是否支持当前工具；
- 是否包含敏感文件；
- 是否存在未提交的代码改动。

## 8. 安全与隐私

- 设计目标是由系统凭据管理器持有 API Key；当前 MVP 使用 AES-256-GCM 将 Studio 中填写的密钥加密后写入 `credentials.json`，本地主密钥来自 `credentials.key` 或 `RELAYDOCK_MASTER_KEY`。密钥不写入会话账本、Provider 配置或快照。
- Web UI 默认只监听 `127.0.0.1`。
- 本地服务使用短期访问令牌和 CSRF 防护。
- 默认不上传完整仓库，只上传 Relay Packet 所需内容。
- 支持文件排除规则和敏感信息正则。
- 所有工具调用和 Provider 请求写入审计日志。
- 外部模型输出作为不可信内容处理。
- 返回 Codex 前进行来源校验和重复检测。

## 9. 项目结构建议

```text
RelayDock/
  SKILL.md
  README.md
  docs/
    initial-design.md
  apps/
    daemon/
    studio/
  packages/
    session-ledger/
    context-compiler/
    provider-core/
    provider-openai-compatible/
    provider-anthropic/
    tool-proxy/
  schemas/
    events.schema.json
    relay-packet.schema.json
    provider.schema.json
  scripts/
  tests/
```

## 10. MVP 验收标准

第一版至少满足：

1. 可以从 Codex 当前任务生成 Checkpoint。
2. Checkpoint 包含目标、约束、对话摘要、工具记录和 Git Diff。
3. 可以在 RelayDock Studio 中预览交接内容。
4. 可以把任务交接给 DeepSeek 并继续对话。
5. DeepSeek 的回复和工具结果可以写入统一账本。
6. 可以把增量结果导回 Codex。
7. 两边对话在统一时间线中可追溯。
8. 文件写入出现冲突时会阻止自动合并。
9. API Key 不出现在数据库和日志中。
10. Provider 连接失败时保留已有 Checkpoint，不丢失会话。

## 11. 主要风险

### 11.1 协议兼容

不同供应商的流式事件、Tool Call 和推理字段并不完全一致。直接代理请求不足以实现稳定兼容，需要独立的协议转换和测试矩阵。

### 11.2 工具执行一致性

模型能力不同，某些模型可能无法正确使用复杂工具或并行 Tool Call。需要提供能力降级和明确的失败提示。

### 11.3 Codex 额度边界

外部 Provider 是否能绕过 Codex 自身额度限制尚未确认。独立 RelayDock Web UI 应作为确定可用的兜底路径。

### 11.4 上下文质量

简单摘要可能遗漏关键约束。需要通过用户可编辑的任务契约、结构化 Checkpoint 和交接预览来降低丢失风险。

### 11.5 并发修改

两个 Agent 同时写工作区容易产生冲突。第一版采用单写入者锁，不实现并发写入。

## 12. 下一步技术验证

在进入完整实现前，先验证：

1. Codex 使用自定义 OpenAI 兼容 Provider 的实际配置方式。
2. DeepSeek 在 Codex 工具协议下的流式 Tool Call 成功率。
3. 是否可以在不丢失会话的情况下切换 Provider。
4. Codex 额度耗尽后是否仍能启动并使用外部 Provider。
5. Codex 会话、工具结果和 Git 状态可以被稳定捕获到什么程度。

技术验证结果将决定第一版优先采用 Sidecar、Model Gateway 还是独立 Web UI。


## 13. MVP 落地状态

第一版已按 Sidecar 路线实现，入口包括本地 CLI、HTTP API 和 RelayDock Studio。当前实现与前述长期设计存在以下有意差异：

| 设计项 | 当前 MVP |
| --- | --- |
| Session Ledger | append-only JSONL，而非 SQLite |
| 快照存储 | 内容寻址 JSON Blob Store |
| Provider | 仅 OpenAI Chat Completions 兼容 API，默认 DeepSeek |
| Codex 接入 | Skill / CLI / 本地 API / MCP 显式记录，不自动读取 Codex 私有历史 |
| 模型切换 | Studio 交接，或把 Codex/Cursor 指向本地 `/v1` Gateway |
| Tool Proxy | 三个只读工具和两个审批型变更工具 |
| 写租约 | 单进程内存租约 |
| API Key | 环境变量，或使用 AES-256-GCM 加密持久化 |
| 回传方式 | Markdown / JSON 导出 |
| 流式输出 | 尚未实现 |

已完成的 MVP 验收路径：

1. 创建会话并记录目标、约束、验收标准、决策和待办。
2. 从 Codex 侧导入关键消息和工具结果。
3. 创建包含 Git 状态、文件哈希、近期对话和工具历史的 Checkpoint。
4. 编译并预览有字符预算的 Relay Packet。
5. 通过 DeepSeek 或其他兼容 Provider 发起接力回合。
6. 对文件写入和命令执行进行人工审批。
7. 在统一时间线中审计双方消息、工具、错误、租约和交接事件。
8. 导出 Markdown 或 JSON 回传 Codex。

下一阶段优先事项：

1. 引入 SQLite 账本索引和稳定的增量游标。
2. 增强 Responses API Gateway 与流式事件，同时保留独立 Studio 兜底。
3. 增加费用预算和额度回退策略。
4. 扩展 Anthropic、Gemini 和自定义 Provider Adapter。
5. 增加跨进程写锁、冲突合并和敏感文件交互式确认。

已落地的纯桥接能力：

1. stdio MCP 控制面（`node bin/relaydock.js mcp`）。
2. OpenAI Chat Completions 兼容 Gateway（`/v1/models`、`/v1/chat/completions`）。
3. 外部会话绑定（`externalKey` → RelayDock session）。
