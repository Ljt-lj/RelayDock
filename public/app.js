'use strict';

const TIMELINE_MODE_KEY = 'relaydock.timelineMode';
const LANGUAGE_KEY = 'relaydock.language';

const translations = {
  zh: {
    'app.title': 'RelayDock Studio',
    'health.connecting': '连接中',
    'health.connected': '本地已连接',
    'health.failed': '连接失败',
    'workspace.configureTitle': '配置会话工作区',
    'workspace.label': '会话工作区',
    'workspace.currentPath': '本会话工作区路径',
    'workspace.defaultPath': '新建会话默认工作区',
    'workspace.currentHelp': '仅影响当前接力任务的文件读写、Git Diff 与 Checkpoint。切换任务会自动使用各自绑定的工作区。',
    'workspace.defaultHelp': '没有选中会话时，这里设置的是新建空白会话的默认工作区。',
    'workspace.recent': '最近使用',
    'workspace.alsoDefaultHint': '也可同时把该路径设为新建会话默认工作区。',
    'workspace.alsoDefault': '同时设为新建默认',
    'workspace.configureCurrent': '配置本会话工作区',
    'workspace.configureDefault': '配置默认工作区',
    'workspace.sessionSet': '会话工作区已设为 {path}',
    'workspace.defaultSet': '默认工作区已设为 {path}',
    'workspace.buttonCurrent': '配置本会话工作区：{path}',
    'workspace.buttonDefault': '配置新建会话默认工作区：{path}',
    'actions.refresh': '刷新',
    'actions.close': '关闭',
    'actions.cancel': '取消',
    'actions.save': '保存',
    'sessions.title': '任务会话',
    'sessions.new': '新建会话',
    'sessions.empty': '还没有任务会话。新建一个会话后，从 Codex 记录目标并创建 Checkpoint。',
    'sessions.untitled': '未命名任务',
    'sessions.noMessages': '尚未记录消息',
    'sessions.messages': '{count} 消息',
    'sessions.messages.one': '{count} 消息',
    'sessions.snapshots': '{count} 快照',
    'sessions.snapshots.one': '{count} 快照',
    'sessions.delete': '删除',
    'sessions.deleteTitle': '硬删除此接力任务',
    'sessions.deleteConfirm': '确定硬删除接力任务「{label}」？\n将永久删除其时间线、Checkpoint 与绑定，且不可恢复。',
    'sessions.deleted': '已硬删除「{label}」',
    'sessions.created': '会话已创建',
    'sessions.name': '任务名称',
    'sessions.newTitle': '新的接力任务',
    'sessions.goal': '任务目标',
    'sessions.goalHelp': '写清最终要交付的行为或结果。',
    'sessions.acceptance': '验收标准（每行一条）',
    'sessions.constraints': '约束（每行一条）',
    'sessions.createAction': '创建会话',
    'providers.title': '模型供应商',
    'providers.add': '添加供应商',
    'providers.configured': '已配置',
    'providers.pending': '待配置',
    'security.localOnly': '仅监听本机 · 密钥不入账本',
    'active.emptyTitle': '选择一个任务',
    'active.emptyMeta': 'RelayDock 会在这里合并 Codex 与外部模型的进展。',
    'active.noGoal': '尚未填写任务目标',
    'timeline.ariaLabel': '时间线显示模式',
    'timeline.full': '完整轨迹',
    'timeline.fullTitle': '显示交接、工具、审批等完整处理信息',
    'timeline.chat': '仅会话',
    'timeline.chatTitle': '只显示用户与模型的会话消息',
    'timeline.emptyBuildTitle': '建立第一段可恢复的接力',
    'timeline.emptyBuildBody': '新建会话，记录任务目标，然后创建 Checkpoint。Codex 与 DeepSeek 的消息、工具结果和审批会汇入同一条时间线。',
    'timeline.emptyChatTitle': '还没有会话消息',
    'timeline.emptyEventsTitle': '当前会话还没有事件',
    'timeline.emptyChatBody': '仅会话模式只显示用户与模型的对话。可切换到「完整轨迹」查看 Checkpoint、工具与审批。',
    'timeline.emptyEventsBody': '导入 Codex / Cursor 或发送第一条指令后，事件会出现在这里。',
    'timeline.untrusted': '外部模型输出，按不可信证据处理',
    'timeline.checkpointDefault': '已创建工作区快照',
    'timeline.approvalDefault': '等待用户审批工具操作',
    'timeline.toolDefault': '工具执行结果',
    'timeline.viewOutput': '查看输出',
    'timeline.branch': '分支 {branch}',
    'timeline.changed': '{count} 个变更',
    'timeline.changed.one': '{count} 个变更',
    'timeline.files': '{count} 个文件',
    'timeline.files.one': '{count} 个文件',
    'timeline.unknown': '未知',
    'speaker.user': '用户',
    'speaker.assistant': '助手',
    'speaker.system': '系统',
    'speaker.message': '消息',
    'source.checkpoint': '检查点',
    'source.tool': '工具',
    'source.handoff': '交接',
    'source.approval': '审批',
    'lease.none': '无写锁',
    'lease.held': '{provider} 持有写锁',
    'approvals.count.zero': '0 审批',
    'approvals.count': '{count} 审批',
    'approvals.count.one': '{count} 审批',
    'approvals.tab': '审批',
    'approvals.title': '写操作审批',
    'approvals.body': '批准后才执行，并在执行前检查工作区冲突。',
    'approvals.empty': '没有待审批操作。',
    'approvals.fileWrite': '文件写入',
    'approvals.command': '命令执行',
    'approvals.reject': '拒绝',
    'approvals.approve': '批准并继续',
    'composer.model': '接手模型',
    'composer.untrustedHint': '外部输出按不可信证据记录',
    'composer.placeholder': '描述下一步，或让接手模型继续当前任务…',
    'checkpoint.create': '创建 Checkpoint',
    'checkpoint.created': 'Checkpoint 已创建',
    'checkpoint.resumableTitle': '任务可恢复状态',
    'checkpoint.resumableBody': 'Checkpoint 引用私有快照，账本保存摘要与哈希。',
    'checkpoint.metricMessages': '消息',
    'checkpoint.metricCheckpoints': 'Checkpoint',
    'checkpoint.metricPending': '待审批',
    'checkpoint.metricChanged': '变更文件',
    'checkpoint.latest': '最新快照',
    'checkpoint.none': '尚未创建 Checkpoint。',
    'checkpoint.summary': '摘要',
    'checkpoint.branch': '分支',
    'checkpoint.commit': '提交',
    'checkpoint.createdAt': '创建时间',
    'contract.button': '任务契约',
    'contract.title': '任务契约',
    'contract.goal': '目标',
    'contract.summary': '摘要',
    'contract.edit': '编辑任务契约',
    'contract.currentSummary': '当前摘要',
    'contract.decisions': '关键决策（每行一条）',
    'contract.nextSteps': '下一步（每行一条）',
    'contract.save': '保存契约',
    'contract.updated': '任务契约已更新',
    'packet.preview': '预览 Relay Packet',
    'packet.title': 'Relay Packet',
    'packet.body': '接收模型实际看到的预算化上下文。',
    'packet.generate': '生成',
    'packet.refresh': '刷新',
    'packet.empty': '生成后在这里预览发送给接手模型的上下文。',
    'packet.characters': '字符',
    'packet.tokens': '约 Tokens',
    'packet.messages': '消息',
    'packet.omitted': '裁剪项',
    'packet.generated': 'Relay Packet 已生成',
    'export.action': '导出给 Codex',
    'export.done': '增量记录已导出，可交回 Codex',
    'send.action': '交给接手模型',
    'inspector.ariaLabel': '检查器',
    'inspector.noSession': '选择一个会话以查看 Checkpoint、Relay Packet、审批和 Git Diff。',
    'diff.title': '工作区 Diff',
    'diff.currentWorkspace': '当前会话工作区：{path}',
    'diff.notSet': '（未设置）',
    'diff.body': '写入前用于检查未提交改动和潜在冲突。',
    'diff.loading': '正在读取 Git 状态…',
    'diff.root': 'Diff 根目录：{path}',
    'diff.empty': '没有未提交改动。',
    'toast.configureProvider': '请先配置模型供应商',
    'toast.approvalRequired': '模型请求执行写操作，请审批',
    'toast.stepLimit': '工具步数用尽，已强制汇总当前结论',
    'toast.turnComplete': '模型回合已完成',
    'toast.approved': '操作已批准并继续执行',
    'toast.rejected': '操作已拒绝',
    'errors.requestFailed': '请求失败',
    'errors.exportFailed': '导出失败',
    'import.codex': '导入 Codex',
    'import.codexTitle': '导入本机 Codex 会话',
    'import.codexNotFound': '未在 {path} 找到 rollout 文件。',
    'import.codexHint': '选择一条 Codex 本地记录，RelayDock 会自动抽取用户/助手消息并创建会话（跳过环境注入等噪音）。',
    'import.codexImported': '已导入 {count} 条 Codex 消息',
    'import.codexImported.one': '已导入 {count} 条 Codex 消息',
    'import.cursor': '导入 Cursor',
    'import.cursorTitle': '导入本机 Cursor 会话',
    'import.cursorNotFound': '未在 {path} 找到 agent-transcripts。',
    'import.cursorHint': '选择一条 Cursor Agent 本地记录，RelayDock 会抽取用户提问与助手可见回复并创建会话（默认跳过 subagent）。',
    'import.cursorImported': '已导入 {count} 条 Cursor 消息',
    'import.cursorImported.one': '已导入 {count} 条 Cursor 消息',
    'import.workspace': '工作区 {path}',
    'import.workspaceSuffix': '，会话工作区 {path}',
    'import.unrecognizedWorkspace': '未识别工作区',
    'provider.id': '供应商 ID',
    'provider.idHelp': '小写字母、数字和连字符。',
    'provider.name': '显示名称',
    'provider.baseUrl': '兼容端点',
    'provider.baseUrlHelp': 'OpenAI Chat Completions 兼容地址。',
    'provider.model': '模型 ID',
    'provider.apiKeyEnv': '密钥环境变量',
    'provider.contextWindow': '上下文窗口',
    'provider.maxOutputTokens': '最大输出 Tokens',
    'provider.apiKey': '本次运行密钥',
    'provider.apiKeyHelp': '只保存在当前 RelayDock 进程内存；不会写入账本。留空则读取环境变量。',
    'provider.edit': '配置供应商',
    'provider.add': '添加供应商',
    'provider.save': '保存配置',
    'provider.saved': '供应商已保存，连接正常',
    'provider.savedModels': ' · {count} 个模型',
    'provider.savedModels.one': ' · {count} 个模型',
    'provider.testFailed': '供应商已保存，但连接测试失败：{message}',
    'language.switchToEnglish': 'Switch to English',
    'language.switchToChinese': '切换到中文',
    'language.englishLabel': 'EN',
    'language.chineseLabel': '中文'
  },
  en: {
    'app.title': 'RelayDock Studio',
    'health.connecting': 'Connecting',
    'health.connected': 'Local connected',
    'health.failed': 'Connection failed',
    'workspace.configureTitle': 'Configure session workspace',
    'workspace.label': 'Workspace',
    'workspace.currentPath': 'Session workspace path',
    'workspace.defaultPath': 'Default workspace for new sessions',
    'workspace.currentHelp': 'This path controls file access, Git diff, and Checkpoints for the current relay. Each session uses its own workspace.',
    'workspace.defaultHelp': 'With no session selected, this becomes the default workspace for new blank sessions.',
    'workspace.recent': 'Recent',
    'workspace.alsoDefaultHint': 'You can also use this path as the default for new sessions.',
    'workspace.alsoDefault': 'Set as new-session default',
    'workspace.configureCurrent': 'Configure session workspace',
    'workspace.configureDefault': 'Configure default workspace',
    'workspace.sessionSet': 'Session workspace set to {path}',
    'workspace.defaultSet': 'Default workspace set to {path}',
    'workspace.buttonCurrent': 'Configure this session workspace: {path}',
    'workspace.buttonDefault': 'Configure the default new-session workspace: {path}',
    'actions.refresh': 'Refresh',
    'actions.close': 'Close',
    'actions.cancel': 'Cancel',
    'actions.save': 'Save',
    'sessions.title': 'Task Sessions',
    'sessions.new': 'New Session',
    'sessions.empty': 'No task sessions yet. Create one, capture the goal from Codex, then create a Checkpoint.',
    'sessions.untitled': 'Untitled task',
    'sessions.noMessages': 'No messages yet',
    'sessions.messages': '{count} messages',
    'sessions.messages.one': '{count} message',
    'sessions.snapshots': '{count} snapshots',
    'sessions.snapshots.one': '{count} snapshot',
    'sessions.delete': 'Delete',
    'sessions.deleteTitle': 'Permanently delete this relay session',
    'sessions.deleteConfirm': 'Permanently delete “{label}”?\nIts timeline, Checkpoints, and bindings will be removed and cannot be recovered.',
    'sessions.deleted': 'Deleted “{label}”',
    'sessions.created': 'Session created',
    'sessions.name': 'Task name',
    'sessions.newTitle': 'New relay task',
    'sessions.goal': 'Task goal',
    'sessions.goalHelp': 'Describe the behavior or result that must be delivered.',
    'sessions.acceptance': 'Acceptance criteria (one per line)',
    'sessions.constraints': 'Constraints (one per line)',
    'sessions.createAction': 'Create Session',
    'providers.title': 'Model Providers',
    'providers.add': 'Add provider',
    'providers.configured': 'Configured',
    'providers.pending': 'Needs setup',
    'security.localOnly': 'Local-only listener · Keys stay out of the ledger',
    'active.emptyTitle': 'Select a task',
    'active.emptyMeta': 'RelayDock merges progress from Codex and external models here.',
    'active.noGoal': 'No task goal yet',
    'timeline.ariaLabel': 'Timeline display mode',
    'timeline.full': 'Full trace',
    'timeline.fullTitle': 'Show handoffs, tool calls, approvals, and other processing details',
    'timeline.chat': 'Chat only',
    'timeline.chatTitle': 'Show only conversation messages from users and models',
    'timeline.emptyBuildTitle': 'Start a resumable relay',
    'timeline.emptyBuildBody': 'Create a session, capture the task goal, then create a Checkpoint. Codex and DeepSeek messages, tool results, and approvals will share one timeline.',
    'timeline.emptyChatTitle': 'No chat messages yet',
    'timeline.emptyEventsTitle': 'This session has no events yet',
    'timeline.emptyChatBody': 'Chat-only mode shows user and model messages. Switch to Full trace to inspect Checkpoints, tools, and approvals.',
    'timeline.emptyEventsBody': 'Import a Codex / Cursor session or send the first instruction to populate the timeline.',
    'timeline.untrusted': 'External model output is treated as untrusted evidence',
    'timeline.checkpointDefault': 'Workspace snapshot created',
    'timeline.approvalDefault': 'Waiting for approval of a tool operation',
    'timeline.toolDefault': 'Tool execution result',
    'timeline.viewOutput': 'View output',
    'timeline.branch': 'branch {branch}',
    'timeline.changed': '{count} changed',
    'timeline.changed.one': '{count} change',
    'timeline.files': '{count} files',
    'timeline.files.one': '{count} file',
    'timeline.unknown': 'unknown',
    'speaker.user': 'User',
    'speaker.assistant': 'Assistant',
    'speaker.system': 'System',
    'speaker.message': 'Message',
    'source.checkpoint': 'checkpoint',
    'source.tool': 'tool',
    'source.handoff': 'handoff',
    'source.approval': 'approval',
    'lease.none': 'No write lock',
    'lease.held': '{provider} holds the write lock',
    'approvals.count.zero': '0 approvals',
    'approvals.count': '{count} approvals',
    'approvals.count.one': '{count} approval',
    'approvals.tab': 'Approvals',
    'approvals.title': 'Write Approvals',
    'approvals.body': 'Actions run only after approval, following a workspace conflict check.',
    'approvals.empty': 'No approvals pending.',
    'approvals.fileWrite': 'File write',
    'approvals.command': 'Command execution',
    'approvals.reject': 'Reject',
    'approvals.approve': 'Approve and Continue',
    'composer.model': 'Takeover model',
    'composer.untrustedHint': 'External output is recorded as untrusted evidence',
    'composer.placeholder': 'Describe the next step, or ask the takeover model to continue this task…',
    'checkpoint.create': 'Create Checkpoint',
    'checkpoint.created': 'Checkpoint created',
    'checkpoint.resumableTitle': 'Task Recovery',
    'checkpoint.resumableBody': 'Checkpoints reference private snapshots; the ledger stores summaries and hashes.',
    'checkpoint.metricMessages': 'Messages',
    'checkpoint.metricCheckpoints': 'Checkpoints',
    'checkpoint.metricPending': 'Pending',
    'checkpoint.metricChanged': 'Changed files',
    'checkpoint.latest': 'Latest Snapshot',
    'checkpoint.none': 'No Checkpoint created yet.',
    'checkpoint.summary': 'Summary',
    'checkpoint.branch': 'Branch',
    'checkpoint.commit': 'Commit',
    'checkpoint.createdAt': 'Created',
    'contract.button': 'Task Contract',
    'contract.title': 'Task Contract',
    'contract.goal': 'Goal',
    'contract.summary': 'Summary',
    'contract.edit': 'Edit Task Contract',
    'contract.currentSummary': 'Current summary',
    'contract.decisions': 'Key decisions (one per line)',
    'contract.nextSteps': 'Next steps (one per line)',
    'contract.save': 'Save Contract',
    'contract.updated': 'Task contract updated',
    'packet.preview': 'Preview Relay Packet',
    'packet.title': 'Relay Packet',
    'packet.body': 'The budgeted context the receiving model will actually see.',
    'packet.generate': 'Generate',
    'packet.refresh': 'Refresh',
    'packet.empty': 'Generate the packet to preview the context sent to the takeover model.',
    'packet.characters': 'Characters',
    'packet.tokens': 'Approx. Tokens',
    'packet.messages': 'Messages',
    'packet.omitted': 'Omitted',
    'packet.generated': 'Relay Packet generated',
    'export.action': 'Export for Codex',
    'export.done': 'Incremental record exported for return to Codex',
    'send.action': 'Send to Takeover Model',
    'inspector.ariaLabel': 'Inspector',
    'inspector.noSession': 'Select a session to inspect Checkpoints, Relay Packets, approvals, and Git diffs.',
    'diff.title': 'Workspace Diff',
    'diff.currentWorkspace': 'Current session workspace: {path}',
    'diff.notSet': '(not set)',
    'diff.body': 'Review uncommitted changes and likely conflicts before writes.',
    'diff.loading': 'Reading Git status…',
    'diff.root': 'Diff root: {path}',
    'diff.empty': 'No uncommitted changes.',
    'toast.configureProvider': 'Configure a model provider first',
    'toast.approvalRequired': 'The model requested a write action. Review the approval.',
    'toast.stepLimit': 'Tool step limit reached; the current conclusion was summarized',
    'toast.turnComplete': 'Model turn completed',
    'toast.approved': 'Action approved; execution will continue',
    'toast.rejected': 'Action rejected',
    'errors.requestFailed': 'Request failed',
    'errors.exportFailed': 'Export failed',
    'import.codex': 'Import Codex',
    'import.codexTitle': 'Import a Local Codex Session',
    'import.codexNotFound': 'No rollout files found in {path}.',
    'import.codexHint': 'Choose a local Codex record. RelayDock will extract user and assistant messages into a session while skipping environment-injection noise.',
    'import.codexImported': 'Imported {count} Codex messages',
    'import.codexImported.one': 'Imported {count} Codex message',
    'import.cursor': 'Import Cursor',
    'import.cursorTitle': 'Import a Local Cursor Session',
    'import.cursorNotFound': 'No agent transcripts found in {path}.',
    'import.cursorHint': 'Choose a local Cursor Agent record. RelayDock will extract user prompts and visible assistant replies while skipping subagents by default.',
    'import.cursorImported': 'Imported {count} Cursor messages',
    'import.cursorImported.one': 'Imported {count} Cursor message',
    'import.workspace': 'Workspace {path}',
    'import.workspaceSuffix': ', workspace {path}',
    'import.unrecognizedWorkspace': 'Workspace not detected',
    'provider.id': 'Provider ID',
    'provider.idHelp': 'Lowercase letters, numbers, and hyphens.',
    'provider.name': 'Display name',
    'provider.baseUrl': 'Compatible endpoint',
    'provider.baseUrlHelp': 'OpenAI Chat Completions-compatible URL.',
    'provider.model': 'Model ID',
    'provider.apiKeyEnv': 'Key environment variable',
    'provider.contextWindow': 'Context window',
    'provider.maxOutputTokens': 'Max output tokens',
    'provider.apiKey': 'Runtime API key',
    'provider.apiKeyHelp': 'Stored only in this RelayDock process memory; never written to the ledger. Leave blank to use the environment variable.',
    'provider.edit': 'Configure Provider',
    'provider.add': 'Add Provider',
    'provider.save': 'Save Configuration',
    'provider.saved': 'Provider saved and connection verified',
    'provider.savedModels': ' · {count} models',
    'provider.savedModels.one': ' · {count} model',
    'provider.testFailed': 'Provider saved, but the connection test failed: {message}',
    'language.switchToEnglish': 'Switch to English',
    'language.switchToChinese': '切换到中文',
    'language.englishLabel': 'EN',
    'language.chineseLabel': '中文'
  }
};

const state = {
  token: null,
  connection: 'connecting',
  language: localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh',
  workspace: null,
  defaultWorkspace: null,
  recentWorkspaces: [],
  sessions: [],
  providers: [],
  activeSession: null,
  timeline: [],
  approvals: [],
  packet: null,
  diff: null,
  tab: 'checkpoint',
  modalMode: null,
  busy: false,
  timelineMode: localStorage.getItem(TIMELINE_MODE_KEY) === 'chat' ? 'chat' : 'full'
};

function t(key, variables = {}) {
  const template = translations[state.language]?.[key] ?? translations.zh[key] ?? key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

function tCount(key, count, variables = {}) {
  return t(count === 1 ? key + '.one' : key, { count, ...variables });
}

function activeWorkspacePath() {
  if (state.activeSession && state.activeSession.workspace) return state.activeSession.workspace;
  return state.defaultWorkspace || state.workspace || '';
}

function syncWorkspaceLabel() {
  const pathValue = activeWorkspacePath();
  if (elements.workspaceLabel) {
    elements.workspaceLabel.textContent = shortPath(pathValue);
    elements.workspaceLabel.title = pathValue || '';
  }
  if (elements.workspaceButton) {
    elements.workspaceButton.title = state.activeSession
      ? t('workspace.buttonCurrent', { path: pathValue || '' })
      : t('workspace.buttonDefault', { path: pathValue || '' });
  }
}

const elements = {};
for (const id of [
  'healthBadge', 'workspaceButton', 'workspaceLabel', 'languageToggle', 'refreshButton', 'importCodexButton', 'importCursorButton', 'newSessionButton', 'sessionList',
  'addProviderButton', 'providerList', 'activeTitle', 'activeMeta', 'timelineModeSwitch', 'leaseBadge', 'approvalCount',
  'contractButton', 'timeline', 'providerSelect', 'composerText', 'checkpointButton', 'packetButton',
  'exportButton', 'sendButton', 'inspectorBody', 'modalBackdrop', 'modalTitle', 'modalForm',
  'modalError', 'modalCloseButton', 'modalCancelButton', 'modalSubmitButton', 'toast'
]) elements[id] = document.getElementById(id);

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined && text !== null) item.textContent = text;
  return item;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const locale = state.language === 'en' ? 'en-US' : 'zh-CN';
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function syncConnectionLabel() {
  const label = elements.healthBadge && elements.healthBadge.lastElementChild;
  if (label) label.textContent = t('health.' + state.connection);
}

function applyLanguage() {
  document.documentElement.lang = state.language === 'en' ? 'en' : 'zh-CN';
  document.title = t('app.title');

  document.querySelectorAll('[data-i18n]').forEach((item) => {
    item.textContent = t(item.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((item) => {
    item.title = t(item.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((item) => {
    item.setAttribute('aria-label', t(item.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((item) => {
    item.placeholder = t(item.dataset.i18nPlaceholder);
  });

  const targetKey = state.language === 'zh' ? 'language.switchToEnglish' : 'language.switchToChinese';
  const labelKey = state.language === 'zh' ? 'language.englishLabel' : 'language.chineseLabel';
  if (elements.languageToggle) {
    elements.languageToggle.textContent = t(labelKey);
    elements.languageToggle.title = t(targetKey);
    elements.languageToggle.setAttribute('aria-label', t(targetKey));
  }

  syncConnectionLabel();
  syncWorkspaceLabel();
  renderAll();
}

function toggleLanguage() {
  state.language = state.language === 'zh' ? 'en' : 'zh';
  localStorage.setItem(LANGUAGE_KEY, state.language);
  if (!elements.modalBackdrop.classList.contains('hidden')) closeModal();
  applyLanguage();
}

function shortPath(value) {
  if (!value) return '';
  return value.length > 70 ? '…' + value.slice(-69) : value;
}

function showToast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.className = 'toast' + (error ? ' error' : '');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.add('hidden'), 4200);
}

async function api(path, options = {}) {
  const headers = { 'x-relaydock-token': state.token || '' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (!response.ok) {
      let detail = t('errors.requestFailed');
    try {
      const body = await response.json();
      detail = body.error && body.error.message ? body.error.message : detail;
    } catch {}
    throw new Error(detail);
  }
  const type = response.headers.get('content-type') || '';
  return type.includes('application/json') ? response.json() : response.text();
}

async function bootstrap() {
  try {
    const data = await fetch('/api/bootstrap').then((response) => response.json());
    state.token = data.token;
    state.workspace = data.workspace;
    state.defaultWorkspace = data.workspace;
    syncWorkspaceLabel();
    elements.healthBadge.classList.add('ok');
      state.connection = 'connected';
      syncConnectionLabel();
    await loadOverview(true);
  } catch (error) {
    elements.healthBadge.classList.remove('ok');
      state.connection = 'failed';
      syncConnectionLabel();
    showToast(error.message, true);
  }
}

async function loadOverview(selectFirst = false) {
  const data = await api('/api/overview');
  state.sessions = data.sessions;
  state.providers = data.providers;
  state.approvals = data.approvals;
  state.leases = data.leases;
  state.workspace = data.workspace || state.workspace;
  state.defaultWorkspace = data.defaultWorkspace || data.workspace || state.defaultWorkspace;
  state.recentWorkspaces = data.recentWorkspaces || [];
  renderSessions();
  renderProviders();
  if (!state.activeSession && (selectFirst || state.sessions.length)) {
    if (state.sessions.length) await selectSession(state.sessions[0].id);
  } else if (state.activeSession) {
    const current = state.sessions.find((item) => item.id === state.activeSession.id);
    if (current) state.activeSession = current;
  }
  syncWorkspaceLabel();
  renderHeader();
  renderTimeline();
  renderInspector();
}

function openWorkspaceModal() {
  const session = state.activeSession;
  const fields = [];
  fields.push(modalField(
      session ? t('workspace.currentPath') : t('workspace.defaultPath'),
    'path',
    activeWorkspacePath(),
    'text',
    session
        ? t('workspace.currentHelp')
        : t('workspace.defaultHelp')
  ));
  if (state.recentWorkspaces && state.recentWorkspaces.length) {
    const recent = node('div', 'recent-workspaces');
      recent.append(node('div', 'recent-workspaces-title', t('workspace.recent')));
    for (const item of state.recentWorkspaces.slice(0, 8)) {
      const button = node('button', 'recent-workspace-item', item);
      button.type = 'button';
      button.addEventListener('click', () => {
        const input = elements.modalForm.querySelector('[name="path"]');
        if (input) input.value = item;
      });
      recent.append(button);
    }
    fields.push(recent);
  }
  if (session) {
      const hint = node('p', '', t('workspace.alsoDefaultHint'));
    hint.style.margin = '0';
    hint.style.color = 'var(--muted)';
    hint.style.fontSize = '12px';
    fields.push(hint);
    const alsoDefault = node('label', '');
    alsoDefault.style.display = 'flex';
    alsoDefault.style.alignItems = 'center';
    alsoDefault.style.gap = '8px';
    alsoDefault.style.fontSize = '12px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'alsoDefault';
      alsoDefault.append(checkbox, document.createTextNode(t('workspace.alsoDefault')));
    fields.push(alsoDefault);
  }
    openModal(session ? t('workspace.configureCurrent') : t('workspace.configureDefault'), fields, t('actions.save'), async (values) => {
    const alsoDefault = Boolean(elements.modalForm.querySelector('[name="alsoDefault"]') && elements.modalForm.querySelector('[name="alsoDefault"]').checked);
    if (session) {
      const updated = await api('/api/sessions/' + encodeURIComponent(session.id), {
        method: 'PATCH',
        body: { workspace: values.path }
      });
      state.activeSession = updated;
      state.diff = null;
      if (alsoDefault) {
        const defaults = await api('/api/workspace', {
          method: 'PUT',
          body: { path: values.path }
        });
        state.defaultWorkspace = defaults.workspace;
        state.workspace = defaults.workspace;
        state.recentWorkspaces = defaults.recentWorkspaces || state.recentWorkspaces;
      }
      await loadOverview(false);
      await selectSession(session.id);
        showToast(t('workspace.sessionSet', { path: shortPath(updated.workspace) }));
      return;
    }
    const result = await api('/api/workspace', {
      method: 'PUT',
      body: { path: values.path }
    });
    state.workspace = result.workspace;
    state.defaultWorkspace = result.workspace;
    state.recentWorkspaces = result.recentWorkspaces || [];
    state.diff = null;
    syncWorkspaceLabel();
    await loadOverview(false);
      showToast(t('workspace.defaultSet', { path: shortPath(result.workspace) }));
  });
}

async function selectSession(sessionId) {
  state.activeSession = state.sessions.find((item) => item.id === sessionId) || null;
  const data = await api('/api/sessions/' + encodeURIComponent(sessionId));
  state.activeSession = data.session;
  state.approvals = data.approvals || [];
  state.timeline = (await api('/api/sessions/' + encodeURIComponent(sessionId) + '/timeline')).events;
  state.packet = null;
  state.diff = null;
  syncWorkspaceLabel();
  renderAll();
}

async function refreshActive() {
  if (!state.activeSession) {
    await loadOverview(false);
    return;
  }
  const sessionId = state.activeSession.id;
  const previousUpdatedAt = state.activeSession.updatedAt;
  const data = await api('/api/sessions/' + encodeURIComponent(sessionId));
  state.activeSession = data.session;
  state.approvals = data.approvals || [];
  state.timeline = (await api('/api/sessions/' + encodeURIComponent(sessionId) + '/timeline')).events;
  const overview = await api('/api/overview');
  state.sessions = overview.sessions;
  state.providers = overview.providers;
  state.leases = overview.leases;
  if (previousUpdatedAt !== data.session.updatedAt) {
    state.packet = null;
    state.diff = null;
  }
  renderAll();
}

function renderAll() {
  renderSessions();
  renderProviders();
  renderHeader();
  renderTimeline();
  renderInspector();
}

function shortenLabel(value, maxChars = 18) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return t('sessions.untitled');
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 3)).trimEnd() + '...';
}

function renderSessions() {
  elements.sessionList.replaceChildren();
  if (!state.sessions.length) {
      const empty = node('div', 'empty-inspector', t('sessions.empty'));
    elements.sessionList.append(empty);
    return;
  }
  for (const session of state.sessions) {
    const row = node('div', 'session-row' + (state.activeSession && state.activeSession.id === session.id ? ' active' : ''));
    const button = node('button', 'session-item');
    button.type = 'button';
    button.title = session.title || '';
    button.append(node('span', 'session-item-title', shortenLabel(session.title, 18)));
      button.append(node('span', 'session-item-excerpt', session.lastMessage ? session.lastMessage.excerpt : t('sessions.noMessages')));
    if (session.workspace) {
      button.append(node('span', 'session-item-workspace', pathTail(session.workspace)));
    }
    const meta = node('span', 'session-item-meta');
      meta.append(node('span', '', tCount('sessions.messages', session.counts.messages)));
      meta.append(node('span', '', tCount('sessions.snapshots', session.counts.checkpoints)));
    meta.append(node('span', '', formatDate(session.updatedAt)));
    button.append(meta);
    button.addEventListener('click', () => selectSession(session.id).catch((error) => showToast(error.message, true)));

    const remove = node('button', 'session-delete-button');
    remove.type = 'button';
      remove.title = t('sessions.deleteTitle');
      remove.setAttribute('aria-label', t('sessions.deleteTitle'));
      remove.textContent = t('sessions.delete');
    remove.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteSession(session).catch((error) => showToast(error.message, true));
    });

    row.append(button, remove);
    elements.sessionList.append(row);
  }
}

async function deleteSession(session) {
  if (!session || !session.id) return;
  const label = shortenLabel(session.title, 18);
  const confirmed = window.confirm(t('sessions.deleteConfirm', { label }));
  if (!confirmed) return;
  setBusy(true);
  try {
    await api('/api/sessions/' + encodeURIComponent(session.id), { method: 'DELETE' });
    if (state.activeSession && state.activeSession.id === session.id) {
      state.activeSession = null;
      state.timeline = [];
      state.approvals = [];
      state.packet = null;
    }
    await loadOverview(false);
    if (!state.activeSession && state.sessions[0]) {
      await selectSession(state.sessions[0].id);
    } else {
      renderAll();
    }
      showToast(t('sessions.deleted', { label }));
  } finally {
    setBusy(false);
  }
}

function renderProviders() {
  elements.providerList.replaceChildren();
  for (const provider of state.providers) {
    const button = node('button', 'provider-item');
    button.type = 'button';
    const name = node('span', 'provider-name', provider.name);
      const status = node(
        'span',
        'provider-state' + (provider.configured ? ' ready' : ''),
        provider.configured ? t('providers.configured') : t('providers.pending')
      );
    button.append(name, status);
    button.title = provider.model + ' · ' + provider.baseUrl;
    button.addEventListener('click', () => openProviderModal(provider));
    elements.providerList.append(button);
  }
  const previous = elements.providerSelect.value;
  elements.providerSelect.replaceChildren();
  for (const provider of state.providers) {
    const option = node('option', '', provider.name + ' · ' + provider.model);
    option.value = provider.id;
    option.disabled = !provider.enabled;
    elements.providerSelect.append(option);
  }
  if (previous && state.providers.some((item) => item.id === previous)) elements.providerSelect.value = previous;
  else if (state.providers.length) elements.providerSelect.value = state.providers[0].id;
}

function renderHeader() {
  const session = state.activeSession;
  if (!session) {
      elements.activeTitle.textContent = t('active.emptyTitle');
      elements.activeMeta.textContent = t('active.emptyMeta');
      elements.leaseBadge.textContent = t('lease.none');
    elements.leaseBadge.className = 'status-pill neutral';
      elements.approvalCount.textContent = t('approvals.count.zero');
    elements.sendButton.disabled = true;
    return;
  }
  elements.activeTitle.textContent = shortenLabel(session.title, 28);
  elements.activeTitle.title = session.title || '';
    const goal = session.contract && session.contract.goal ? session.contract.goal : t('active.noGoal');
  const workspaceBit = session.workspace ? (' · ' + pathTail(session.workspace)) : '';
  elements.activeMeta.textContent = goal + workspaceBit;
  elements.activeMeta.title = (session.workspace || '') + (goal ? ('\n' + goal) : '');
  syncWorkspaceLabel();
  const lease = (state.leases || []).find((item) => item.sessionId === session.id);
    elements.leaseBadge.textContent = lease ? t('lease.held', { provider: lease.providerId }) : t('lease.none');
  elements.leaseBadge.className = 'status-pill ' + (lease ? 'warning' : 'neutral');
  const count = state.approvals.length;
    elements.approvalCount.textContent = count ? tCount('approvals.count', count) : t('approvals.count.zero');
  elements.approvalCount.className = 'status-pill ' + (count ? 'warning' : 'neutral');
  elements.sendButton.disabled = state.busy || !state.providers.length;
}

function eventClass(event) {
  if (event.type === 'approval.requested' || event.type === 'handoff.paused') return 'approval';
  if (event.type === 'provider.error' || event.type === 'tool.failed') return 'error';
  if (event.origin_provider === 'user' || event.origin_provider === 'codex') return 'user';
  if (event.origin_provider && event.origin_provider !== 'relaydock') return 'external';
  return 'system';
}

function sourceLabel(event) {
  if (event.type === 'message.created') return event.payload.originProvider || event.origin_provider;
  if (event.type === 'checkpoint.created') return t('source.checkpoint');
  if (event.type.startsWith('tool.')) return t('source.tool');
  if (event.type.startsWith('handoff.')) return t('source.handoff');
  if (event.type.startsWith('approval.')) return t('source.approval');
  return event.origin_provider;
}

function chatSpeaker(event) {
  const payload = event.payload || {};
  const origin = payload.originProvider || event.origin_provider || '';
    if (payload.role === 'user' || origin === 'user') return { label: t('speaker.user'), kind: 'user' };
  if (origin === 'codex') return { label: 'Codex', kind: 'user' };
  if (origin && origin !== 'relaydock' && origin !== 'gateway') {
    return { label: origin, kind: 'external' };
  }
    if (payload.role === 'assistant') return { label: t('speaker.assistant'), kind: 'external' };
    if (payload.role === 'system') return { label: t('speaker.system'), kind: 'system' };
    return { label: origin || t('speaker.message'), kind: eventClass(event) };
}

function syncTimelineModeSwitch() {
  if (!elements.timelineModeSwitch) return;
  elements.timelineModeSwitch.querySelectorAll('.mode-switch-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.timelineMode);
  });
  elements.timeline.classList.toggle('timeline-chat', state.timelineMode === 'chat');
  elements.timeline.classList.toggle('timeline-full', state.timelineMode === 'full');
}

function setTimelineMode(mode) {
  state.timelineMode = mode === 'chat' ? 'chat' : 'full';
  localStorage.setItem(TIMELINE_MODE_KEY, state.timelineMode);
  syncTimelineModeSwitch();
  renderTimeline();
}

function visibleTimelineEvents() {
  const hidden = new Set(['packet.previewed', 'write_lease.acquired', 'write_lease.released']);
  return state.timeline.filter((event) => {
    if (hidden.has(event.type)) return false;
    if (state.timelineMode === 'chat') return event.type === 'message.created';
    return true;
  });
}

function renderTimeline() {
  syncTimelineModeSwitch();
  if (!state.activeSession) {
    elements.timeline.replaceChildren();
    const empty = node('div', 'empty-state');
    empty.append(node('div', 'empty-state-symbol', '↔'));
      empty.append(node('h3', '', t('timeline.emptyBuildTitle')));
      empty.append(node('p', '', t('timeline.emptyBuildBody')));
    elements.timeline.append(empty);
    return;
  }
  elements.timeline.replaceChildren();
  const events = visibleTimelineEvents();
  if (!events.length) {
    const empty = node('div', 'empty-state');
      empty.append(node('h3', '', state.timelineMode === 'chat' ? t('timeline.emptyChatTitle') : t('timeline.emptyEventsTitle')));
    empty.append(node('p', '', state.timelineMode === 'chat'
        ? t('timeline.emptyChatBody')
        : t('timeline.emptyEventsBody')));
    elements.timeline.append(empty);
    return;
  }

  for (const event of events) {
    const payload = event.payload || {};
    const entry = node('article', 'timeline-entry' + (state.timelineMode === 'chat' ? ' chat-entry' : ''));
    const card = node('div', 'event-card ' + eventClass(event));
    const head = node('div', 'event-head');
    const author = node('div', 'event-author');

    if (state.timelineMode === 'chat') {
      const speaker = chatSpeaker(event);
      const badge = node('span', 'event-source ' + speaker.kind, speaker.label);
      author.append(badge);
      if (payload.model) author.append(node('span', 'event-model', payload.model));
      head.append(author, node('span', 'event-time', formatDate(event.created_at)));
      card.append(head);
      card.append(node('div', 'event-content', payload.content || '(empty)'));
      if (payload.toolCalls && payload.toolCalls.length) {
        const tags = node('div', 'event-tags');
        for (const call of payload.toolCalls) {
          tags.append(node('span', 'event-tag', call.name + (call.detail ? ' · ' + call.detail : '')));
        }
        card.append(tags);
      }
      entry.append(card);
    } else {
      const sequence = node('div', 'timeline-seq', '#' + event.sequence);
      const badge = node('span', 'event-source ' + eventClass(event), sourceLabel(event));
      author.append(badge, node('span', '', event.type));
      head.append(author, node('span', 'event-time', formatDate(event.created_at)));
      card.append(head);

      if (event.type === 'message.created') {
        card.append(node('div', 'event-content', payload.content || '(empty)'));
          if (payload.untrusted) card.append(node('div', 'untrusted-note', t('timeline.untrusted')));
        if (payload.toolCalls && payload.toolCalls.length) {
          const tags = node('div', 'event-tags');
          for (const call of payload.toolCalls) tags.append(node('span', 'event-tag', call.name + (call.detail ? ' · ' + call.detail : '')));
          card.append(tags);
        }
      } else if (event.type === 'checkpoint.created') {
          card.append(node('div', 'event-summary', payload.summary || t('timeline.checkpointDefault')));
        const tags = node('div', 'event-tags');
          tags.append(node('span', 'event-tag', t('timeline.branch', { branch: payload.branch || t('timeline.unknown') })));
          tags.append(node('span', 'event-tag', tCount('timeline.changed', payload.changedFiles)));
          tags.append(node('span', 'event-tag', tCount('timeline.files', payload.fileCount)));
        card.append(tags);
      } else if (event.type === 'approval.requested') {
          card.append(node('div', 'event-summary', payload.summary || t('timeline.approvalDefault')));
        const tags = node('div', 'event-tags');
        tags.append(node('span', 'event-tag', payload.actionType || 'action'));
        card.append(tags);
      } else if (event.type === 'tool.completed' || event.type === 'tool.failed') {
          card.append(node('div', 'event-summary', payload.summary || payload.error || payload.toolName || t('timeline.toolDefault')));
        if (payload.output) {
          const details = node('details', 'event-details');
            details.append(node('summary', '', t('timeline.viewOutput')));
          details.append(node('pre', '', payload.output));
          card.append(details);
        }
      } else if (event.type === 'provider.error') {
        card.append(node('div', 'event-summary', (payload.code || 'ERROR') + ': ' + (payload.message || '')));
      } else {
        card.append(node('div', 'event-summary', JSON.stringify(payload)));
      }
      entry.append(sequence, card);
    }

    elements.timeline.append(entry);
  }
  elements.timeline.scrollTop = elements.timeline.scrollHeight;
}

function inspectorTabButton(label, tab) {
  const button = node('button', 'tab-button' + (state.tab === tab ? ' active' : ''), label);
  button.type = 'button';
  button.addEventListener('click', () => {
    state.tab = tab;
    document.querySelectorAll('.tab-button').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
    if (tab === 'diff' && !state.diff) loadDiff().catch((error) => showToast(error.message, true));
    renderInspector();
  });
  return button;
}

async function loadDiff() {
  const sessionId = state.activeSession && state.activeSession.id;
  state.diff = await api('/api/diff' + (sessionId ? ('?sessionId=' + encodeURIComponent(sessionId)) : ''));
  renderInspector();
}

function renderInspector() {
  elements.inspectorBody.replaceChildren();
  if (!state.activeSession) {
      elements.inspectorBody.append(node('div', 'empty-inspector', t('inspector.noSession')));
    return;
  }
  if (state.tab === 'checkpoint') renderCheckpointInspector();
  if (state.tab === 'packet') renderPacketInspector();
  if (state.tab === 'approvals') renderApprovalInspector();
  if (state.tab === 'diff') renderDiffInspector();
}

function renderCheckpointInspector() {
  const session = state.activeSession;
  const latest = session.latestCheckpoint;
  const heading = node('div', 'inspector-heading');
  const info = node('div');
    info.append(node('h3', '', t('checkpoint.resumableTitle')), node('p', '', t('checkpoint.resumableBody')));
  const create = node('button', 'text-icon-button', '+');
  create.type = 'button';
    create.title = t('checkpoint.create');
  create.addEventListener('click', createCheckpoint);
  heading.append(info, create);
  elements.inspectorBody.append(heading);

  const metrics = node('div', 'metric-grid');
  const values = [
      [t('checkpoint.metricMessages'), session.counts.messages],
      [t('checkpoint.metricCheckpoints'), session.counts.checkpoints],
      [t('checkpoint.metricPending'), session.counts.pendingApprovals],
      [t('checkpoint.metricChanged'), latest ? latest.changedFiles : '—']
  ];
  for (const [label, value] of values) {
    const metric = node('div', 'metric');
    metric.append(node('div', 'metric-label', label), node('div', 'metric-value', String(value)));
    metrics.append(metric);
  }
  elements.inspectorBody.append(metrics);

  const section = node('div', 'inspector-section');
    section.append(node('h4', '', t('checkpoint.latest')));
  if (!latest) {
      section.append(node('div', 'empty-inspector', t('checkpoint.none')));
  } else {
    const rows = node('div', 'kv-list');
    const entries = [
        [t('checkpoint.summary'), latest.summary || '—'],
        [t('checkpoint.branch'), latest.branch || '—'],
        [t('checkpoint.commit'), latest.commit ? String(latest.commit).slice(0, 12) : '—'],
        [t('checkpoint.createdAt'), formatDate(latest.createdAt)]
    ];
    for (const [key, value] of entries) {
      const row = node('div', 'kv-row');
      row.append(node('span', 'kv-key', key), node('span', 'kv-value', String(value)));
      rows.append(row);
    }
    section.append(rows);
  }
  elements.inspectorBody.append(section);

  const contractSection = node('div', 'inspector-section');
    contractSection.append(node('h4', '', t('contract.title')));
  const contract = session.contract || {};
  const contractRows = node('div', 'kv-list');
    for (const [key, label] of [['goal', t('contract.goal')], ['summary', t('contract.summary')]]) {
    const row = node('div', 'kv-row');
    row.append(node('span', 'kv-key', label), node('span', 'kv-value', contract[key] || '—'));
    contractRows.append(row);
  }
  contractSection.append(contractRows);
  const tags = node('div', 'tag-list');
  for (const item of (contract.constraints || []).slice(0, 10)) tags.append(node('span', 'tag', item));
  contractSection.append(tags);
  elements.inspectorBody.append(contractSection);
}

function renderPacketInspector() {
  const heading = node('div', 'inspector-heading');
  const info = node('div');
    info.append(node('h3', '', t('packet.title')), node('p', '', t('packet.body')));
    const generate = node('button', 'secondary-button', state.packet ? t('packet.refresh') : t('packet.generate'));
  generate.type = 'button';
  generate.addEventListener('click', previewPacket);
  heading.append(info, generate);
  elements.inspectorBody.append(heading);
  if (!state.packet) {
      elements.inspectorBody.append(node('div', 'empty-inspector', t('packet.empty')));
    return;
  }
  const metrics = node('div', 'metric-grid');
    for (const [label, value] of [
      [t('packet.characters'), state.packet.stats.characters],
      [t('packet.tokens'), state.packet.stats.approximateTokens],
      [t('packet.messages'), state.packet.stats.messageEvents],
      [t('packet.omitted'), state.packet.omitted.length]
    ]) {
    const metric = node('div', 'metric');
    metric.append(node('div', 'metric-label', label), node('div', 'metric-value', String(value)));
    metrics.append(metric);
  }
  elements.inspectorBody.append(metrics);
  elements.inspectorBody.append(node('pre', 'packet-preview', state.packet.markdown));
}

function renderApprovalInspector() {
  const heading = node('div', 'inspector-heading');
  const info = node('div');
    info.append(node('h3', '', t('approvals.title')), node('p', '', t('approvals.body')));
    const refresh = node('button', 'secondary-button', t('packet.refresh'));
  refresh.type = 'button';
  refresh.addEventListener('click', refreshActive);
  heading.append(info, refresh);
  elements.inspectorBody.append(heading);
  if (!state.approvals.length) {
      elements.inspectorBody.append(node('div', 'empty-inspector', t('approvals.empty')));
    return;
  }
  for (const approval of state.approvals) {
    const item = node('div', 'approval-item');
      item.append(node('h4', '', approval.actionType === 'write_file' ? t('approvals.fileWrite') : t('approvals.command')));
    item.append(node('div', 'approval-preview', approval.summary + '\n' + approval.preview));
    const actions = node('div', 'approval-actions');
      const reject = node('button', 'secondary-button', t('approvals.reject'));
    reject.type = 'button';
    reject.addEventListener('click', () => resolveApproval(approval.approvalId, 'reject'));
      const approve = node('button', 'primary-button', t('approvals.approve'));
    approve.type = 'button';
    approve.addEventListener('click', () => resolveApproval(approval.approvalId, 'approve'));
    actions.append(reject, approve);
    item.append(actions);
    elements.inspectorBody.append(item);
  }
}

function renderDiffInspector() {
  const heading = node('div', 'inspector-heading');
  const info = node('div');
  info.append(
      node('h3', '', t('diff.title')),
    node('p', '', state.activeSession
        ? t('diff.currentWorkspace', { path: state.activeSession.workspace || t('diff.notSet') })
        : t('diff.body'))
  );
    const refresh = node('button', 'secondary-button', t('packet.refresh'));
  refresh.type = 'button';
  refresh.addEventListener('click', () => loadDiff().catch((error) => showToast(error.message, true)));
  heading.append(info, refresh);
  elements.inspectorBody.append(heading);
  if (!state.diff) {
      elements.inspectorBody.append(node('div', 'empty-inspector', t('diff.loading')));
    return;
  }
  if (state.diff.workspace) {
      elements.inspectorBody.append(node('p', '', t('diff.root', { path: state.diff.workspace })));
  }
    elements.inspectorBody.append(node('pre', 'diff-panel', state.diff.diff || state.diff.status || t('diff.empty')));
}

async function createCheckpoint() {
  if (!state.activeSession) return;
  setBusy(true);
  try {
    await api('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/checkpoints', { method: 'POST', body: {} });
    await refreshActive();
    state.tab = 'checkpoint';
    setActiveTab('checkpoint');
      showToast(t('checkpoint.created'));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function previewPacket() {
  if (!state.activeSession) return;
  setBusy(true);
  try {
    const packet = await api('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/packet', { method: 'POST', body: {} });
    await refreshActive();
    state.packet = packet;
    state.tab = 'packet';
    setActiveTab('packet');
    renderInspector();
      showToast(t('packet.generated'));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function sendTurn() {
  if (!state.activeSession) return;
  const providerId = elements.providerSelect.value;
    if (!providerId) return showToast(t('toast.configureProvider'), true);
  setBusy(true);
  try {
    const result = await api('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/turn', {
      method: 'POST',
      body: { providerId, instruction: elements.composerText.value.trim(), maxSteps: 6 }
    });
    elements.composerText.value = '';
    await refreshActive();
    if (result.status === 'approval_required') {
      state.tab = 'approvals';
      setActiveTab('approvals');
      renderInspector();
        showToast(t('toast.approvalRequired'));
    } else if (result.status === 'step_limit') {
        showToast(t('toast.stepLimit'), true);
    } else {
        showToast(t('toast.turnComplete'));
    }
  } catch (error) {
    await refreshActive().catch(() => {});
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function resolveApproval(approvalId, decision) {
  setBusy(true);
  try {
    await api('/api/approvals/' + encodeURIComponent(approvalId) + '/resolve', {
      method: 'POST',
      body: { decision, continueTurn: decision === 'approve', maxSteps: 6 }
    });
    await refreshActive();
    state.tab = 'approvals';
    setActiveTab('approvals');
      showToast(decision === 'approve' ? t('toast.approved') : t('toast.rejected'));
  } catch (error) {
    await refreshActive().catch(() => {});
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function exportForCodex() {
  if (!state.activeSession) return;
  try {
    const response = await fetch('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/export?format=markdown', {
      headers: { 'x-relaydock-token': state.token }
    });
      if (!response.ok) throw new Error(t('errors.exportFailed'));
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'relaydock-' + state.activeSession.id.slice(0, 8) + '.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast(t('export.done'));
  } catch (error) {
    showToast(error.message, true);
  }
}

function setBusy(value) {
  state.busy = value;
  elements.sendButton.disabled = value || !state.activeSession || !state.providers.length;
  elements.checkpointButton.disabled = value;
  elements.packetButton.disabled = value;
  elements.exportButton.disabled = value;
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab-button').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
}

function modalField(label, name, value = '', type = 'text', help = '') {
  const wrap = node('div', 'form-field');
  wrap.append(node('label', '', label));
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  input.name = name;
  input.value = value || '';
  if (type !== 'textarea') input.type = type;
  if (type === 'textarea') input.rows = 4;
  wrap.append(input);
  if (help) wrap.append(node('small', '', help));
  return wrap;
}

function openModal(title, fields, submitLabel, onSubmit) {
  state.modalMode = 'custom';
  elements.modalTitle.textContent = title;
  elements.modalForm.replaceChildren(...fields);
  elements.modalSubmitButton.textContent = submitLabel;
  elements.modalSubmitButton.classList.remove('hidden');
  elements.modalError.classList.add('hidden');
  elements.modalBackdrop.classList.remove('hidden');
  elements.modalBackdrop.setAttribute('aria-hidden', 'false');
  elements.modalSubmitButton.onclick = async () => {
    try {
      elements.modalSubmitButton.disabled = true;
      const values = Object.fromEntries(new FormData(elements.modalForm).entries());
      await onSubmit(values);
      closeModal();
    } catch (error) {
      elements.modalError.textContent = error.message;
      elements.modalError.classList.remove('hidden');
    } finally {
      elements.modalSubmitButton.disabled = false;
    }
  };
  const first = elements.modalForm.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 20);
}

function closeModal() {
  elements.modalBackdrop.classList.add('hidden');
  elements.modalBackdrop.setAttribute('aria-hidden', 'true');
  elements.modalError.classList.add('hidden');
  elements.modalSubmitButton.classList.remove('hidden');
  elements.modalSubmitButton.onclick = null;
  state.modalMode = null;
}

function openSessionModal() {
  const fields = [];
    fields.push(modalField(t('sessions.name'), 'title', t('sessions.newTitle')));
    const goal = modalField(t('sessions.goal'), 'goal', '', 'textarea', t('sessions.goalHelp'));
  fields.push(goal);
    fields.push(modalField(t('sessions.acceptance'), 'acceptanceCriteria', '', 'textarea'));
    fields.push(modalField(t('sessions.constraints'), 'constraints', '', 'textarea'));
    openModal(t('sessions.new'), fields, t('sessions.createAction'), async (values) => {
    const session = await api('/api/sessions', {
      method: 'POST',
      body: {
        title: values.title,
        goal: values.goal,
        acceptanceCriteria: values.acceptanceCriteria.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        constraints: values.constraints.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
      }
    });
    await loadOverview(false);
    await selectSession(session.id);
      showToast(t('sessions.created'));
  });
}

async function openCodexImportModal() {
  setBusy(true);
  try {
    const data = await api('/api/codex/sessions?limit=30');
    const rollouts = data.rollouts || [];
      elements.modalTitle.textContent = t('import.codexTitle');
    elements.modalForm.replaceChildren();
    elements.modalError.classList.add('hidden');
    elements.modalSubmitButton.classList.add('hidden');

    if (!rollouts.length) {
        elements.modalForm.append(node('p', '', t('import.codexNotFound', { path: data.sessionsRoot || '~/.codex/sessions' })));
    } else {
        const hint = node('p', '', t('import.codexHint'));
      hint.style.margin = '0 0 10px';
      hint.style.color = 'var(--muted)';
      hint.style.fontSize = '13px';
      elements.modalForm.append(hint);
      const list = node('div', 'codex-import-list');
      for (const item of rollouts) {
        const button = node('button', 'codex-import-item');
        button.type = 'button';
        button.append(node('strong', '', item.cwd ? pathTail(item.cwd) : item.sessionId));
        button.append(node('span', '', [
          formatDate(item.mtime),
          item.source || '',
          item.modelProvider || '',
          item.sessionId.slice(0, 8)
        ].filter(Boolean).join(' · ')));
        button.append(node('span', '', item.fileName));
        button.addEventListener('click', async () => {
          setBusy(true);
          try {
            const result = await api('/api/codex/import', {
              method: 'POST',
              body: {
                path: item.path,
                maxMessages: 60,
                createCheckpoint: true,
                switchWorkspace: true
              }
            });
            closeModal();
            await loadOverview(false);
            await selectSession(result.session.id);
            showToast(
                tCount('import.codexImported', result.imported.length)
                + (result.workspace ? t('import.workspaceSuffix', { path: pathTail(result.workspace) }) : '')
            );
          } catch (error) {
            elements.modalError.textContent = error.message;
            elements.modalError.classList.remove('hidden');
            showToast(error.message, true);
          } finally {
            setBusy(false);
          }
        });
        list.append(button);
      }
      elements.modalForm.append(list);
    }

    elements.modalBackdrop.classList.remove('hidden');
    elements.modalBackdrop.setAttribute('aria-hidden', 'false');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function openCursorImportModal() {
  setBusy(true);
  try {
    const data = await api('/api/cursor/sessions?limit=30');
    const transcripts = data.transcripts || [];
      elements.modalTitle.textContent = t('import.cursorTitle');
    elements.modalForm.replaceChildren();
    elements.modalError.classList.add('hidden');
    elements.modalSubmitButton.classList.add('hidden');

    if (!transcripts.length) {
        elements.modalForm.append(node('p', '', t('import.cursorNotFound', { path: data.projectsRoot || '~/.cursor/projects' })));
    } else {
        const hint = node('p', '', t('import.cursorHint'));
      hint.style.margin = '0 0 10px';
      hint.style.color = 'var(--muted)';
      hint.style.fontSize = '13px';
      elements.modalForm.append(hint);
      const list = node('div', 'codex-import-list');
      for (const item of transcripts) {
        const button = node('button', 'codex-import-item');
        button.type = 'button';
        button.append(node('strong', '', item.project || item.sessionId));
        button.append(node('span', '', [
          formatDate(item.mtime),
          item.sessionId.slice(0, 8),
            item.workspace ? t('import.workspace', { path: pathTail(item.workspace) }) : t('import.unrecognizedWorkspace')
        ].filter(Boolean).join(' · ')));
        if (item.preview) button.append(node('span', '', item.preview));
        button.addEventListener('click', async () => {
          setBusy(true);
          try {
            const result = await api('/api/cursor/import', {
              method: 'POST',
              body: {
                path: item.path,
                maxMessages: 40,
                createCheckpoint: true,
                switchWorkspace: true
              }
            });
            closeModal();
            await loadOverview(false);
            await selectSession(result.session.id);
            showToast(
                tCount('import.cursorImported', result.imported.length)
                + (result.workspace ? t('import.workspaceSuffix', { path: pathTail(result.workspace) }) : '')
            );
          } catch (error) {
            elements.modalError.textContent = error.message;
            elements.modalError.classList.remove('hidden');
            showToast(error.message, true);
          } finally {
            setBusy(false);
          }
        });
        list.append(button);
      }
      elements.modalForm.append(list);
    }

    elements.modalBackdrop.classList.remove('hidden');
    elements.modalBackdrop.setAttribute('aria-hidden', 'false');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

function pathTail(value) {
  const parts = String(value || '').replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || value;
}

function openContractModal() {
  if (!state.activeSession) return;
  const contract = state.activeSession.contract || {};
  const fields = [];
    fields.push(modalField(t('sessions.name'), 'title', contract.title || ''));
    fields.push(modalField(t('sessions.goal'), 'goal', contract.goal || '', 'textarea'));
    fields.push(modalField(t('contract.currentSummary'), 'summary', contract.summary || '', 'textarea'));
    fields.push(modalField(t('sessions.acceptance'), 'acceptanceCriteria', (contract.acceptanceCriteria || []).join('\n'), 'textarea'));
    fields.push(modalField(t('sessions.constraints'), 'constraints', (contract.constraints || []).join('\n'), 'textarea'));
    fields.push(modalField(t('contract.decisions'), 'decisions', (contract.decisions || []).join('\n'), 'textarea'));
    fields.push(modalField(t('contract.nextSteps'), 'nextSteps', (contract.nextSteps || []).join('\n'), 'textarea'));
    openModal(t('contract.edit'), fields, t('contract.save'), async (values) => {
    const lines = (value) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    await api('/api/sessions/' + encodeURIComponent(state.activeSession.id), {
      method: 'PATCH',
      body: {
        title: values.title,
        goal: values.goal,
        summary: values.summary,
        acceptanceCriteria: lines(values.acceptanceCriteria),
        constraints: lines(values.constraints),
        decisions: lines(values.decisions),
        nextSteps: lines(values.nextSteps)
      }
    });
    await refreshActive();
      showToast(t('contract.updated'));
  });
}

function openProviderModal(provider) {
  const editing = Boolean(provider);
  const current = provider || { id: '', name: '', type: 'openai-compatible', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY', contextWindow: 64000, maxOutputTokens: 8192, enabled: true };
  const fields = [];
    fields.push(modalField(t('provider.id'), 'id', current.id, 'text', t('provider.idHelp')));
    fields.push(modalField(t('provider.name'), 'name', current.name));
    fields.push(modalField(t('provider.baseUrl'), 'baseUrl', current.baseUrl, 'text', t('provider.baseUrlHelp')));
  const grid = node('div', 'form-grid');
    grid.append(modalField(t('provider.model'), 'model', current.model));
    grid.append(modalField(t('provider.apiKeyEnv'), 'apiKeyEnv', current.apiKeyEnv || ''));
  fields.push(grid);
  const limits = node('div', 'form-grid');
    limits.append(modalField(t('provider.contextWindow'), 'contextWindow', current.contextWindow, 'number'));
    limits.append(modalField(t('provider.maxOutputTokens'), 'maxOutputTokens', current.maxOutputTokens, 'number'));
  fields.push(limits);
    fields.push(modalField(t('provider.apiKey'), 'apiKey', '', 'password', t('provider.apiKeyHelp')));
    openModal(editing ? t('provider.edit') : t('provider.add'), fields, t('provider.save'), async (values) => {
    const saved = await api('/api/providers', {
      method: 'POST',
      body: {
        id: values.id,
        name: values.name,
        baseUrl: values.baseUrl,
        model: values.model,
        apiKeyEnv: values.apiKeyEnv || null,
        contextWindow: Number(values.contextWindow),
        maxOutputTokens: Number(values.maxOutputTokens),
        enabled: true,
        apiKey: values.apiKey || undefined
      }
    });
    if (values.apiKey) await api('/api/providers/' + encodeURIComponent(saved.id) + '/credential', { method: 'PUT', body: { apiKey: values.apiKey } });
    await loadOverview(false);
    try {
      const result = await api('/api/providers/' + encodeURIComponent(saved.id) + '/test', { method: 'POST', body: {} });
        showToast(t('provider.saved') + (result.modelCount ? tCount('provider.savedModels', result.modelCount) : ''));
    } catch (error) {
        showToast(t('provider.testFailed', { message: error.message }), true);
    }
  });
}

elements.newSessionButton.addEventListener('click', openSessionModal);
elements.importCodexButton.addEventListener('click', () => openCodexImportModal().catch((error) => showToast(error.message, true)));
if (elements.importCursorButton) {
  elements.importCursorButton.addEventListener('click', () => openCursorImportModal().catch((error) => showToast(error.message, true)));
}
elements.addProviderButton.addEventListener('click', () => openProviderModal(null));
  if (elements.languageToggle) elements.languageToggle.addEventListener('click', toggleLanguage);
elements.refreshButton.addEventListener('click', () => refreshActive().catch((error) => showToast(error.message, true)));
elements.contractButton.addEventListener('click', openContractModal);
if (elements.workspaceButton) {
  elements.workspaceButton.addEventListener('click', openWorkspaceModal);
}
if (elements.timelineModeSwitch) {
  elements.timelineModeSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('.mode-switch-button');
    if (!button || !button.dataset.mode) return;
    setTimelineMode(button.dataset.mode);
  });
  syncTimelineModeSwitch();
}
elements.checkpointButton.addEventListener('click', createCheckpoint);
elements.packetButton.addEventListener('click', previewPacket);
elements.exportButton.addEventListener('click', exportForCodex);
elements.sendButton.addEventListener('click', sendTurn);
elements.modalCloseButton.addEventListener('click', closeModal);
elements.modalCancelButton.addEventListener('click', closeModal);
elements.modalBackdrop.addEventListener('click', (event) => { if (event.target === elements.modalBackdrop) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.modalBackdrop.classList.contains('hidden')) closeModal(); });
document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.tab = button.dataset.tab;
    setActiveTab(state.tab);
    if (state.tab === 'diff' && !state.diff) loadDiff().catch((error) => showToast(error.message, true));
    renderInspector();
  });
});

setInterval(() => {
  if (!state.busy && state.activeSession) refreshActive().catch(() => {});
}, 12000);

  applyLanguage();
  bootstrap();
