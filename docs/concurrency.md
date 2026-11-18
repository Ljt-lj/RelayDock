# RelayDock 并发执行

RelayDock 以 Session 和工作区为边界协调并发，目标是允许多个互不相关的任务同时推进，同时避免两个 Agent 同时修改同一目录。

## 并发规则

| 场景 | 行为 |
| --- | --- |
| 不同 Session，不同工作区 | 可同时执行 |
| 同一 Session | 同一时间只允许一个回合或审批续跑 |
| 不同 Session，相同工作区 | 执行与审批续跑互斥 |
| 不同 Session，相同 lineage（前置任务） | 等待中的审批会阻塞其他接力任务 |
| 任务运行中删除 Session | 返回 `409 WRITE_LEASE_BUSY` |
| 任务运行中切换 Session 工作区 | 返回 `409 WRITE_LEASE_BUSY` |

工作区路径使用绝对路径比较。Windows 下会统一大小写，避免 `D:\Repo` 与 `d:\repo` 被误认为两个工作区。

## 租约生命周期

租约覆盖一次完整执行，而不只覆盖 HTTP 请求进入或 Provider 调用阶段：

1. 服务端先检查 Session 和 Session 绑定工作区是否已有活动租约。
2. 获取成功后，才写入用户 instruction。
3. Checkpoint、Packet、Provider 调用和只读工具均持有租约。
4. 出现受保护工具审批时，租约释放；用户批准后重新获取租约，并把审批执行与后续模型回合纳入同一生命周期。
5. 无论成功、失败或超时，都由 `finally` 路径释放租约。

租约每 60 秒续期一次，默认 10 分钟过期。当前实现是单进程内存租约，不是跨进程或分布式锁。

工具步数是任务契约的一部分，默认 32，允许 1–100。审批续跑沿用该任务的持久化预算；调用方显式传入的 `maxSteps` 只覆盖当前回合或当前 continuation，不会改动任务配置。

## 审批 Gate 与接力 Lineage

审批请求除了普通的执行租约，还会创建一个不随租约释放的 approval gate。Gate 在以下任一条件匹配时阻塞新任务：

- 同一个 Session；
- 同一个工作区；
- 同一个 `lineageId`，也就是从同一前置任务派生出的其他接力任务。

批准后会忽略当前审批自己的 gate，真实执行工具，并把原始 tool call 和真实 tool result 回注给模型继续执行。例如 `propose_get_current_time` 会运行 `Get-Date -Format o`，模型收到的是本机真实时间而不是猜测值。只有工具执行和 continuation 都结束后，当前 gate 才会移除。拒绝审批或执行流程结束后也会清理 gate。

创建接力任务时可以传入 `predecessorSessionId` 继承前置任务的 lineage；也可以在没有前置 Session 时显式传入 `lineageId`。旧 Session 没有 lineage 字段时，使用 Session 自身 id 作为 lineage。

`pending` 状态的 approval gate 会从磁盘中的审批记录恢复，因此服务重启后仍会继续阻塞相关工作区或 lineage。

## API 行为

并发冲突统一返回：

~~~json
{
  "error": {
    "code": "WRITE_LEASE_BUSY",
    "message": "This workspace is already in use by another running task (deepseek)"
  }
}
~~~

HTTP 状态码为 `409`。被拒绝的回合不会把 instruction 写入 Session Ledger。

`GET /api/overview` 的 `leases` 字段可用于 Studio、CLI 或外部集成展示当前执行状态：

~~~json
{
  "sessionId": "session-id",
  "providerId": "deepseek",
  "kind": "turn",
  "workspace": "D:\\YourRepo",
  "acquiredAt": "2026-11-18T08:00:00.000Z",
  "expiresAt": "2026-11-18T08:10:00.000Z"
}
~~~

`kind` 当前可能为 `turn`、`approval`、`delete`、`workspace_update`、`gateway` 或 `gateway_agent`。

`GET /api/overview` 同时包含 `approvalGates` 字段。它表示仍在阻塞执行的审批，即使普通 `leases` 已经释放。

## Studio 行为

- 任务列表独立标记每个 Session 的“运行中”和“工作区占用”状态。
- 切换 Session 不会取消已经发起的请求。
- 请求完成后只刷新发起请求的 Session，不依赖当前选中的 Session。
- 12 秒轮询在任务运行时继续更新租约和时间线。
- 运行中的 Session 禁用删除和工作区切换；同一工作区的其他 Session 禁用发送和批准操作。
