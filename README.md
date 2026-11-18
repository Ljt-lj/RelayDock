# RelayDock

RelayDock 是一个面向本地编码 Agent 的接力工作台：把 Codex 中的可验证任务状态整理成 Relay Packet，交给 DeepSeek 等 OpenAI Chat Completions 兼容模型继续执行，再把结果汇入统一账本并导出回 Codex。

它解决的不是“复制聊天窗口”，而是“让另一个 Agent 能在同一工作区里接着干活”。交接内容包含任务契约、Checkpoint、对话、工具结果、Git 状态和审批记录，同时明确哪些上下文被裁剪、哪些文件可能发生冲突。

## 当前状态

仓库已经包含可运行的 0.1.0 MVP：

- append-only JSONL Session Ledger；
- Checkpoint 与内容寻址 Blob Store；
- Relay Packet Context Compiler；
- OpenAI Chat Completions 兼容 Provider Adapter；
- 默认 DeepSeek 配置；
- 读取工具直执行、写入与命令执行前审批；
- 单写入者租约、工作区冲突检查和密钥脱敏；
- 本地 HTTP API；
- RelayDock Studio 可视化工作台；
- OpenAI 兼容 Model Gateway（`/v1`），可被 Codex / Cursor 当作模型端点；
- stdio MCP 控制面，供三方平台显式记录会话证据与交接；
- 从本机 `~/.codex/sessions` 导入 Codex rollout 到 Studio/CLI/MCP；
- 从本机 `~/.cursor/projects/*/agent-transcripts` 导入 Cursor Agent 会话到 Studio/CLI/MCP；
- 会话、消息、快照、Packet、模型回合、审批和导出 CLI；
- 事件、Provider 和 Relay Packet JSON Schema；
- 使用 Node.js 内置测试框架的自动化测试。

## 工作方式

~~~text
Codex Skill / CLI                 RelayDock Studio
       |                                  |
       +---------> RelayDock Sidecar <----+
                         |
             +-----------+-----------+
             |                       |
       Session Ledger          Provider Adapter
       Blob Store              Tool Proxy
             |                       |
             +---------> Relay Packet
                         |
                   DeepSeek / compatible API
~~~

RelayDock 是独立 Sidecar。它不会劫持 Codex 的内部请求，也不会自动读取 Codex 私有会话历史。Codex 侧通过 Skill、CLI 或本地 API 显式记录关键消息、任务契约和 Checkpoint；DeepSeek 侧通过 RelayDock 进入同一账本。完成后可导出 Markdown 或 JSON 回到 Codex。

## 环境要求

- Node.js 20 或更高版本；
- Git；
- 可选的 Git 仓库工作区；
- 可选的真实 Provider API Key。

项目当前没有第三方 npm 依赖。

## 快速开始

~~~powershell
git clone https://github.com/Ljt-lj/RelayDock.git
cd D:\RelayDock
node .\bin\relaydock.js serve --workspace D:\RelayDock --port 4173
~~~

打开 http://127.0.0.1:4173/ 进入 RelayDock Studio。同一进程还暴露纯桥接入口：

- Gateway: `http://127.0.0.1:4173/v1`
- MCP: `node .\bin\relaydock.js mcp --workspace D:\RelayDock`

纯桥接用法见 [docs/bridge.md](docs/bridge.md)。把 Codex / Cursor 的 Base URL 指到 Gateway，或通过 MCP 只导入证据；真实聊天仍留在原平台。

默认数据目录是工作区下的 .relaydock，可用 --data-dir 或 RELAYDOCK_DATA_DIR 覆盖：

~~~powershell
$env:RELAYDOCK_DATA_DIR = 'D:\RelayDock\state'
node .\bin\relaydock.js serve --workspace D:\RelayDock
~~~

.repo 根目录的 .env.example 只是变量清单；当前实现不会自动加载 .env 文件。请在启动进程中设置环境变量，或仅在 Studio 的 Provider 配置中填写“本次运行密钥”。

## 配置 DeepSeek

~~~powershell
$env:DEEPSEEK_API_KEY = '<your-key>'
node .\bin\relaydock.js serve --workspace D:\RelayDock
~~~

也可以在 Studio 左下角点击 DeepSeek，填写 API Key。该密钥只保存在当前 RelayDock 进程内存中，不写入账本、Provider 配置或快照。

连接测试会调用兼容端点的 /models。没有 API Key 时，不要发起真实模型请求。

## CLI 工作流

以下命令都需要把 SESSION_ID 替换为 session:create 返回的会话 ID。

~~~powershell
# 1. 建立任务契约
node .\bin\relaydock.js session:create --title "完成登录模块" --goal "实现并验证登录流程"

# 2. 从 Codex 记录关键对话；稳定 message-id 可保证重复导入幂等
node .\bin\relaydock.js message --session SESSION_ID --role user --provider codex --message-id codex:msg-001 --content "用户提出了登录需求"
node .\bin\relaydock.js message --session SESSION_ID --role assistant --provider codex --message-id codex:msg-002 --content "当前实现进度和未完成项"

# 3. 保存可恢复工作区状态
node .\bin\relaydock.js checkpoint --session SESSION_ID --summary "核心代码已完成，等待联调" --test-status "旧测试未通过"

# 4. 预览将发送给接手模型的上下文
node .\bin\relaydock.js packet --session SESSION_ID

# 5. 交给 DeepSeek 继续
node .\bin\relaydock.js turn --session SESSION_ID --provider deepseek --instruction "继续完成测试并修复失败项"

# 6. 处理模型提出的写操作
node .\bin\relaydock.js approval:list --session SESSION_ID
node .\bin\relaydock.js approval:resolve --approval APPROVAL_ID --decision approve --continue

# 7. 把结果导回 Codex
node .\bin\relaydock.js export --session SESSION_ID --format markdown
~~~

其他常用命令：

~~~powershell
node .\bin\relaydock.js status
node .\bin\relaydock.js session:list
node .\bin\relaydock.js provider:list
node .\bin\relaydock.js packet --session SESSION_ID --json
node .\bin\relaydock.js export --session SESSION_ID --format json
~~~

## Studio 工作流

1. 新建会话，填写目标、约束和验收标准。
2. 点击“创建 Checkpoint”，确认 Git 分支、文件数量和变更状态。
3. 在“预览 Relay Packet”中检查实际发送的上下文与裁剪统计。
4. 配置并测试 Provider。
5. 在底部输入下一步指令，交给接手模型。
6. 文件写入或命令执行会暂停并进入“审批”；批准后才执行，执行前会检查文件哈希冲突。
7. 点击“导出给 Codex”，通过统一时间线把增量结果带回 Codex。
8. 在 Diff 面板查看未提交改动。

## 作为 Codex Skill 使用

仓库根目录的 SKILL.md 定义了 Codex 侧的任务交接流程。可以将仓库目录链接或复制到 Codex skills 目录，例如 Windows 下的 %USERPROFILE%\.codex\skills\relaydock，然后让 Codex 在任务交接、额度恢复、Provider 切换或回传结果时使用它。

Skill 的职责是：

- 明确记录任务目标和验收标准；
- 在切换模型前创建 Checkpoint；
- 预览并控制 Relay Packet；
- 通过审批执行工具；
- 将外部模型输出标记为不可信证据；
- 将结果导出回 Codex。

Skill 不负责自动读取 Codex 内部隐藏历史，也不承诺复制模型的私有推理、缓存或供应商内部状态。

## 数据与安全

- 默认只监听 127.0.0.1。
- Studio 通过 /api/bootstrap 获取短期进程 Token，受保护 API 需要 x-relaydock-token。
- 账本使用追加写 JSONL；事件共享同一会话序列。
- 大型 Checkpoint 存放在 blobs/，账本保存摘要、引用和哈希。
- API Key 只来自环境变量或进程内存。
- 外部模型消息标记为 untrusted。
- 默认排除 .env、密钥、私钥和常见敏感路径。
- 写文件和运行命令都必须人工审批。
- 命令不经过 shell，并限制工作目录、超时和输出大小。

## 当前 MVP 边界

- 只支持 OpenAI Chat Completions 兼容 API，尚未实现 OpenAI Responses、Anthropic 和 Gemini Adapter。
- 当前账本是 JSONL，不是 SQLite。
- 不会自动 Hook Codex 客户端，也不会自动同步 Codex 私有历史。
- 不是可直接替换 Codex 全局模型的 Model Gateway。
- 写租约是单进程内存状态，不是多实例分布式锁。
- Tool Proxy 目前提供三个只读工具和两个审批型变更工具。
- 已提供 stdio MCP 与 Chat Completions Gateway；尚未实现 Responses API、SSE/流式 UI、费用预算和自动额度检测。
- RelayDock 自己运行有限的 Agent Loop；复杂工具能力仍取决于目标模型的 Tool Call 兼容性。

后续方向包括 SQLite 索引、模型额度与回退策略、Responses API 完整兼容、流式事件、增量回传、冲突合并和多实例协调。

## 文档

- [中文使用说明](docs/使用说明.md)
- [初步设计](docs/initial-design.md)
- [纯桥接 MCP / Gateway](docs/bridge.md)
- [本地 API](docs/api.md)
- [Codex Skill](SKILL.md)

## 开发

~~~powershell
npm test
npm run check
~~~

## License

MIT
