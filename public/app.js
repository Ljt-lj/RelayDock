'use strict';

const TIMELINE_MODE_KEY = 'relaydock.timelineMode';

const state = {
  token: null,
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
  leases: [],
  approvalGates: [],
  pendingTurns: new Set(),
  pendingApprovals: new Set(),
  refreshPromise: null,
  refreshSessionId: null,
  timelineMode: localStorage.getItem(TIMELINE_MODE_KEY) === 'chat' ? 'chat' : 'full'
};

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
      ? ('配置本会话工作区：' + (pathValue || ''))
      : ('配置新建会话默认工作区：' + (pathValue || ''));
  }
}

const elements = {};
for (const id of [
  'healthBadge', 'workspaceButton', 'workspaceLabel', 'refreshButton', 'importCodexButton', 'importCursorButton', 'newSessionButton', 'sessionList',
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
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function shortPath(value) {
  if (!value) return '';
  return value.length > 70 ? '…' + value.slice(-69) : value;
}

function normalizedWorkspace(value) {
  return String(value || '')
    .replace(/\//g, '\\')
    .replace(/\\+$/g, '')
    .toLowerCase();
}

function leaseForSession(sessionId) {
  return (state.leases || []).find((lease) => lease.sessionId === sessionId) || null;
}

function leaseForWorkspace(session, exceptSessionId = null) {
  if (!session || !session.workspace) return null;
  const workspace = normalizedWorkspace(session.workspace);
  return (state.leases || []).find((lease) => (
    lease.sessionId !== exceptSessionId
    && lease.sessionId !== session.id
    && normalizedWorkspace(lease.workspace) === workspace
  )) || null;
}

function sessionLineageId(session) {
  return String(session && session.contract && session.contract.lineageId || session && session.id || '');
}

function approvalGateForSession(sessionId) {
  return (state.approvalGates || []).find((gate) => gate.sessionId === sessionId) || null;
}

function approvalGateConflictForSession(session, ignoreApprovalId = null) {
  if (!session) return null;
  const workspace = normalizedWorkspace(session.workspace);
  const lineageId = sessionLineageId(session);
  return (state.approvalGates || []).find((gate) => (
    gate.approvalId !== ignoreApprovalId
    && gate.sessionId !== session.id
    && (
      (workspace && normalizedWorkspace(gate.workspace) === workspace)
      || (lineageId && String(gate.lineageId || '') === lineageId)
    )
  )) || null;
}

function blockingApprovalGateForSession(session, ignoreApprovalId = null) {
  if (!session) return null;
  const workspace = normalizedWorkspace(session.workspace);
  const lineageId = sessionLineageId(session);
  return (state.approvalGates || []).find((gate) => (
    gate.approvalId !== ignoreApprovalId
    && (
      gate.sessionId === session.id
      || (workspace && normalizedWorkspace(gate.workspace) === workspace)
      || (lineageId && String(gate.lineageId || '') === lineageId)
    )
  )) || null;
}

function approvalGateConflictLabel(session, gate) {
  if (!session || !gate) return '';
  if (normalizedWorkspace(gate.workspace) === normalizedWorkspace(session.workspace)) {
    return '工作区审批阻塞';
  }
  if (String(gate.lineageId || '') === sessionLineageId(session)) {
    return '接力任务待审批';
  }
  return '审批阻塞';
}

function pendingSessionForWorkspace(session) {
  if (!session || !session.workspace) return null;
  const workspace = normalizedWorkspace(session.workspace);
  return state.sessions.find((item) => (
    item.id !== session.id
    && isSessionRunning(item.id)
    && normalizedWorkspace(item.workspace) === workspace
  )) || null;
}

function sessionActivity(session) {
  if (!session) return { lease: null, pending: false, approvalGate: null, conflict: null };
  const lease = leaseForSession(session.id);
  const pending = state.pendingTurns.has(session.id) || state.pendingApprovals.has(session.id);
  const approvalGate = approvalGateForSession(session.id);
  const workspaceConflict = leaseForWorkspace(session);
  const approvalConflict = approvalGateConflictForSession(session);
  const pendingConflict = pendingSessionForWorkspace(session);
  const conflict = lease || pending || approvalGate
    ? null
    : workspaceConflict || approvalConflict || (pendingConflict ? {
      sessionId: pendingConflict.id,
      providerId: '另一个任务',
      pending: true
    } : null);
  return { lease, pending, approvalGate, conflict };
}

function isSessionRunning(sessionId) {
  return Boolean(
    leaseForSession(sessionId)
    || approvalGateForSession(sessionId)
    || state.pendingTurns.has(sessionId)
    || state.pendingApprovals.has(sessionId)
  );
}

function sessionActionBlocker(session) {
  const activity = sessionActivity(session);
  if (activity.pending) return '当前任务正在提交操作';
  if (activity.lease) return '当前任务正在执行';
  if (activity.approvalGate) return '当前任务正在等待工具审批';
  if (activity.conflict && activity.conflict.approvalId) {
    return approvalGateConflictLabel(session, activity.conflict) + '，请先处理关联审批';
  }
  if (activity.conflict) return '当前任务或工作区正在执行其他操作';
  return '';
}

function approvalResolutionBlocker(session, approvalId) {
  if (!session) return '当前任务不存在';
  if (state.pendingApprovals.has(session.id)) return '当前审批正在提交';
  const lease = leaseForSession(session.id) || leaseForWorkspace(session);
  if (lease) return '当前任务或工作区正在执行其他操作';
  const gate = blockingApprovalGateForSession(session, approvalId);
  if (gate) {
    if (gate.sessionId === session.id) return '当前任务还有另一项待审批工具';
    if (normalizedWorkspace(gate.workspace) === normalizedWorkspace(session.workspace)) {
      return '同一工作区还有待审批工具';
    }
    return '同一接力任务线还有待审批工具';
  }
  const pendingConflict = pendingSessionForWorkspace(session);
  if (pendingConflict) return '同一工作区还有任务正在执行';
  return '';
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
    let detail = '请求失败';
    let code = 'REQUEST_FAILED';
    try {
      const body = await response.json();
      detail = body.error && body.error.message ? body.error.message : detail;
      code = body.error && body.error.code ? body.error.code : code;
    } catch {}
    const error = new Error(detail);
    error.code = code;
    error.status = response.status;
    throw error;
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
    elements.healthBadge.lastElementChild.textContent = '本地已连接';
    await loadOverview(true);
  } catch (error) {
    elements.healthBadge.classList.remove('ok');
    elements.healthBadge.lastElementChild.textContent = '连接失败';
    showToast(error.message, true);
  }
}

async function loadOverview(selectFirst = false) {
  const data = await api('/api/overview');
  state.sessions = data.sessions;
  state.providers = data.providers;
  state.approvals = data.approvals;
  state.leases = data.leases || [];
  state.approvalGates = data.approvalGates || [];
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
  if (session) {
    const blocker = sessionActionBlocker(session);
    if (blocker) {
      showToast(blocker, true);
      return;
    }
  }
  const fields = [];
  fields.push(modalField(
    session ? '本会话工作区路径' : '新建会话默认工作区',
    'path',
    activeWorkspacePath(),
    'text',
    session
      ? '仅影响当前接力任务的文件读写、Git Diff 与 Checkpoint。切换任务会自动使用各自绑定的工作区。'
      : '没有选中会话时，这里设置的是新建空白会话的默认工作区。'
  ));
  if (state.recentWorkspaces && state.recentWorkspaces.length) {
    const recent = node('div', 'recent-workspaces');
    recent.append(node('div', 'recent-workspaces-title', '最近使用'));
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
    const hint = node('p', '', '也可同时把该路径设为新建会话默认工作区。');
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
    alsoDefault.append(checkbox, document.createTextNode('同时设为新建默认'));
    fields.push(alsoDefault);
  }
  openModal(session ? '配置本会话工作区' : '配置默认工作区', fields, '保存', async (values) => {
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
      showToast('会话工作区已设为 ' + shortPath(updated.workspace));
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
    showToast('默认工作区已设为 ' + shortPath(result.workspace));
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

async function refreshActive(options = {}) {
  const activeSession = state.activeSession;
  if (!activeSession) {
    await loadOverview(false);
    return;
  }
  const sessionId = activeSession.id;
  if (state.refreshPromise && state.refreshSessionId === sessionId) {
    if (!options.force) return state.refreshPromise;
    await state.refreshPromise.catch(() => {});
    if (!state.activeSession || state.activeSession.id !== sessionId) return;
  }
  const previousUpdatedAt = activeSession.updatedAt;
  const task = (async () => {
    const [data, timeline, overview] = await Promise.all([
      api('/api/sessions/' + encodeURIComponent(sessionId)),
      api('/api/sessions/' + encodeURIComponent(sessionId) + '/timeline'),
      api('/api/overview')
    ]);
    if (!state.activeSession || state.activeSession.id !== sessionId) return;
    state.activeSession = data.session;
    state.approvals = data.approvals || [];
    state.timeline = timeline.events;
    state.sessions = overview.sessions;
    state.providers = overview.providers;
    state.leases = overview.leases || [];
    state.approvalGates = overview.approvalGates || [];
    if (previousUpdatedAt !== data.session.updatedAt) {
      state.packet = null;
      state.diff = null;
    }
    renderAll();
  })();
  state.refreshPromise = task;
  state.refreshSessionId = sessionId;
  try {
    return await task;
  } finally {
    if (state.refreshPromise === task) {
      state.refreshPromise = null;
      state.refreshSessionId = null;
    }
  }
}

async function refreshAfterSession(sessionId) {
  if (state.activeSession && state.activeSession.id === sessionId) {
    await refreshActive({ force: true });
    return;
  }
  await loadOverview(false);
  if (state.activeSession) await refreshActive();
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
  if (!text) return '未命名任务';
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 3)).trimEnd() + '...';
}

function renderSessions() {
  elements.sessionList.replaceChildren();
  if (!state.sessions.length) {
    const empty = node('div', 'empty-inspector', '还没有任务会话。新建一个会话后，从 Codex 记录目标并创建 Checkpoint。');
    elements.sessionList.append(empty);
    return;
  }
  for (const session of state.sessions) {
    const activity = sessionActivity(session);
    const activeClass = state.activeSession && state.activeSession.id === session.id ? ' active' : '';
    const runningClass = activity.lease || activity.pending ? ' running' : '';
    const blockedClass = activity.approvalGate || activity.conflict ? ' blocked' : '';
    const row = node('div', 'session-row' + activeClass + runningClass + blockedClass);
    const button = node('button', 'session-item');
    button.type = 'button';
    button.title = session.title || '';
    button.append(node('span', 'session-item-title', shortenLabel(session.title, 18)));
    button.append(node('span', 'session-item-excerpt', session.lastMessage ? session.lastMessage.excerpt : '尚未记录消息'));
    if (session.workspace) {
      button.append(node('span', 'session-item-workspace', pathTail(session.workspace)));
    }
    const meta = node('span', 'session-item-meta');
    if (activity.approvalGate) {
      meta.append(node('span', 'session-item-status blocked', '等待审批'));
    } else if (activity.conflict && activity.conflict.approvalId) {
      meta.append(node('span', 'session-item-status blocked', approvalGateConflictLabel(session, activity.conflict)));
    } else if (activity.lease || activity.pending) {
      meta.append(node('span', 'session-item-status running', '运行中'));
    } else if (activity.conflict) {
      meta.append(node('span', 'session-item-status blocked', '工作区占用'));
    }
    meta.append(node('span', '', session.counts.messages + ' 消息'));
    meta.append(node('span', '', session.counts.checkpoints + ' 快照'));
    meta.append(node('span', '', formatDate(session.updatedAt)));
    button.append(meta);
    button.addEventListener('click', () => selectSession(session.id).catch((error) => showToast(error.message, true)));

    const remove = node('button', 'session-delete-button');
    remove.type = 'button';
    remove.title = '硬删除此接力任务';
    remove.setAttribute('aria-label', '硬删除此接力任务');
    remove.textContent = '删除';
    remove.disabled = Boolean(activity.lease || activity.pending || activity.approvalGate || activity.conflict);
    if (remove.disabled) {
      remove.title = activity.approvalGate
        ? '任务等待审批，处理完成后才能删除'
        : activity.conflict && activity.conflict.approvalId
          ? '关联任务等待审批，处理完成后才能删除'
          : '任务运行中，结束后才能删除';
      remove.setAttribute('aria-label', remove.title);
    }
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
  const blocker = sessionActionBlocker(session);
  if (blocker) {
    showToast(blocker, true);
    return;
  }
  const label = shortenLabel(session.title, 18);
  const confirmed = window.confirm('确定硬删除接力任务「' + label + '」？\n将永久删除其时间线、Checkpoint 与绑定，且不可恢复。');
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
    showToast('已硬删除「' + label + '」');
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
    const status = node('span', 'provider-state' + (provider.configured ? ' ready' : ''), provider.configured ? '已配置' : '待配置');
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
    elements.activeTitle.textContent = '选择一个任务';
    elements.activeMeta.textContent = 'RelayDock 会在这里合并 Codex 与外部模型的进展。';
    elements.leaseBadge.textContent = '空闲';
    elements.leaseBadge.className = 'status-pill neutral';
    elements.approvalCount.textContent = '0 审批';
    elements.sendButton.disabled = true;
    return;
  }
  elements.activeTitle.textContent = shortenLabel(session.title, 28);
  elements.activeTitle.title = session.title || '';
  const goal = session.contract && session.contract.goal ? session.contract.goal : '尚未填写任务目标';
  const workspaceBit = session.workspace ? (' · ' + pathTail(session.workspace)) : '';
  elements.activeMeta.textContent = goal + workspaceBit;
  elements.activeMeta.title = (session.workspace || '') + (goal ? ('\n' + goal) : '');
  syncWorkspaceLabel();
  const activity = sessionActivity(session);
  if (activity.approvalGate) {
    elements.leaseBadge.textContent = '等待工具审批';
    elements.leaseBadge.className = 'status-pill warning';
  } else if (activity.conflict && activity.conflict.approvalId) {
    elements.leaseBadge.textContent = approvalGateConflictLabel(session, activity.conflict);
    elements.leaseBadge.className = 'status-pill warning';
  } else if (activity.lease || activity.pending) {
    elements.leaseBadge.textContent = (activity.lease && activity.lease.providerId
      ? activity.lease.providerId
      : '当前任务') + ' 执行中';
    elements.leaseBadge.className = 'status-pill warning';
  } else if (activity.conflict) {
    elements.leaseBadge.textContent = '工作区被 ' + activity.conflict.providerId + ' 占用';
    elements.leaseBadge.className = 'status-pill warning';
  } else {
    elements.leaseBadge.textContent = '空闲';
    elements.leaseBadge.className = 'status-pill neutral';
  }
  const count = state.approvals.length;
  elements.approvalCount.textContent = count + ' 审批';
  elements.approvalCount.className = 'status-pill ' + (count ? 'warning' : 'neutral');
  const actionBlocked = Boolean(activity.lease || activity.pending || activity.approvalGate || activity.conflict);
  elements.sendButton.disabled = !state.providers.length || actionBlocked;
  elements.sendButton.title = actionBlocked
    ? sessionActionBlocker(session)
    : '把当前指令交给接手模型';
  if (elements.workspaceButton) elements.workspaceButton.disabled = state.busy || actionBlocked;
  elements.checkpointButton.disabled = state.busy || actionBlocked;
  elements.packetButton.disabled = state.busy || actionBlocked;
  elements.exportButton.disabled = state.busy || actionBlocked;
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
  if (event.type === 'checkpoint.created') return 'checkpoint';
  if (event.type.startsWith('tool.')) return 'tool';
  if (event.type.startsWith('handoff.')) return 'handoff';
  if (event.type.startsWith('approval.')) return 'approval';
  return event.origin_provider;
}

function chatSpeaker(event) {
  const payload = event.payload || {};
  const origin = payload.originProvider || event.origin_provider || '';
  if (payload.role === 'user' || origin === 'user') return { label: '用户', kind: 'user' };
  if (origin === 'codex') return { label: 'Codex', kind: 'user' };
  if (origin && origin !== 'relaydock' && origin !== 'gateway') {
    return { label: origin, kind: 'external' };
  }
  if (payload.role === 'assistant') return { label: '助手', kind: 'external' };
  if (payload.role === 'system') return { label: '系统', kind: 'system' };
  return { label: origin || '消息', kind: eventClass(event) };
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
    empty.append(node('h3', '', '建立第一段可恢复的接力'));
    empty.append(node('p', '', '新建会话，记录任务目标，然后创建 Checkpoint。Codex 与 DeepSeek 的消息、工具结果和审批会汇入同一条时间线。'));
    elements.timeline.append(empty);
    return;
  }
  elements.timeline.replaceChildren();
  const events = visibleTimelineEvents();
  if (!events.length) {
    const empty = node('div', 'empty-state');
    empty.append(node('h3', '', state.timelineMode === 'chat' ? '还没有会话消息' : '当前会话还没有事件'));
    empty.append(node('p', '', state.timelineMode === 'chat'
      ? '仅会话模式只显示用户与模型的对话。可切换到「完整轨迹」查看 Checkpoint、工具与审批。'
      : '导入 Codex / Cursor 或发送第一条指令后，事件会出现在这里。'));
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
        if (payload.untrusted) card.append(node('div', 'untrusted-note', '外部模型输出，按不可信证据处理'));
        if (payload.toolCalls && payload.toolCalls.length) {
          const tags = node('div', 'event-tags');
          for (const call of payload.toolCalls) tags.append(node('span', 'event-tag', call.name + (call.detail ? ' · ' + call.detail : '')));
          card.append(tags);
        }
      } else if (event.type === 'checkpoint.created') {
        card.append(node('div', 'event-summary', payload.summary || '已创建工作区快照'));
        const tags = node('div', 'event-tags');
        tags.append(node('span', 'event-tag', 'branch ' + (payload.branch || 'unknown')));
        tags.append(node('span', 'event-tag', payload.changedFiles + ' changed'));
        tags.append(node('span', 'event-tag', payload.fileCount + ' files'));
        card.append(tags);
      } else if (event.type === 'approval.requested') {
        card.append(node('div', 'event-summary', payload.summary || '等待用户审批工具操作'));
        const tags = node('div', 'event-tags');
        tags.append(node('span', 'event-tag', payload.actionType || 'action'));
        card.append(tags);
      } else if (event.type === 'tool.completed' || event.type === 'tool.failed') {
        card.append(node('div', 'event-summary', payload.summary || payload.error || payload.toolName || '工具执行结果'));
        if (payload.output) {
          const details = node('details', 'event-details');
          details.append(node('summary', '', '查看输出'));
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
    elements.inspectorBody.append(node('div', 'empty-inspector', '选择一个会话以查看 Checkpoint、Relay Packet、审批和 Git Diff。'));
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
  info.append(node('h3', '', '任务可恢复状态'), node('p', '', 'Checkpoint 引用私有快照，账本保存摘要与哈希。'));
  const create = node('button', 'text-icon-button', '+');
  create.type = 'button';
  create.title = '创建 Checkpoint';
  create.addEventListener('click', createCheckpoint);
  heading.append(info, create);
  elements.inspectorBody.append(heading);

  const metrics = node('div', 'metric-grid');
  const values = [
    ['消息', session.counts.messages],
    ['Checkpoint', session.counts.checkpoints],
    ['待审批', session.counts.pendingApprovals],
    ['变更文件', latest ? latest.changedFiles : '—']
  ];
  for (const [label, value] of values) {
    const metric = node('div', 'metric');
    metric.append(node('div', 'metric-label', label), node('div', 'metric-value', String(value)));
    metrics.append(metric);
  }
  elements.inspectorBody.append(metrics);

  const section = node('div', 'inspector-section');
  section.append(node('h4', '', '最新快照'));
  if (!latest) {
    section.append(node('div', 'empty-inspector', '尚未创建 Checkpoint。'));
  } else {
    const rows = node('div', 'kv-list');
    const entries = [
      ['摘要', latest.summary || '—'],
      ['分支', latest.branch || '—'],
      ['提交', latest.commit ? String(latest.commit).slice(0, 12) : '—'],
      ['创建时间', formatDate(latest.createdAt)]
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
  contractSection.append(node('h4', '', '任务契约'));
  const contract = session.contract || {};
  const contractRows = node('div', 'kv-list');
  for (const [key, label] of [['goal', '目标'], ['summary', '摘要']]) {
    const row = node('div', 'kv-row');
    row.append(node('span', 'kv-key', label), node('span', 'kv-value', contract[key] || '—'));
    contractRows.append(row);
  }
  const completionFirstRow = node('div', 'kv-row');
  completionFirstRow.append(
    node('span', 'kv-key', '完成优先'),
    node('span', 'kv-value', contract.completeTaskFirst === false ? '已关闭' : '已开启')
  );
  contractRows.append(completionFirstRow);
  const maxStepsRow = node('div', 'kv-row');
  maxStepsRow.append(
    node('span', 'kv-key', '工具步数'),
    node('span', 'kv-value', String(contract.maxSteps || 32) + ' 步')
  );
  contractRows.append(maxStepsRow);
  contractSection.append(contractRows);
  const tags = node('div', 'tag-list');
  for (const item of (contract.constraints || []).slice(0, 10)) tags.append(node('span', 'tag', item));
  contractSection.append(tags);
  elements.inspectorBody.append(contractSection);
}

function renderPacketInspector() {
  const heading = node('div', 'inspector-heading');
  const info = node('div');
  info.append(node('h3', '', 'Relay Packet'), node('p', '', '接收模型实际看到的预算化上下文。'));
  const generate = node('button', 'secondary-button', state.packet ? '刷新' : '生成');
  generate.type = 'button';
  generate.addEventListener('click', previewPacket);
  heading.append(info, generate);
  elements.inspectorBody.append(heading);
  if (!state.packet) {
    elements.inspectorBody.append(node('div', 'empty-inspector', '生成后在这里预览发送给接手模型的上下文。'));
    return;
  }
  const metrics = node('div', 'metric-grid');
  for (const [label, value] of [['字符', state.packet.stats.characters], ['约 Tokens', state.packet.stats.approximateTokens], ['消息', state.packet.stats.messageEvents], ['裁剪项', state.packet.omitted.length]]) {
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
  info.append(node('h3', '', '工具审批'), node('p', '', '受保护工具批准后才执行；当前任务及其关联工作区、接力任务会保持阻塞。'));
  const refresh = node('button', 'secondary-button', '刷新');
  refresh.type = 'button';
  refresh.addEventListener('click', refreshActive);
  heading.append(info, refresh);
  elements.inspectorBody.append(heading);
  if (!state.approvals.length) {
    elements.inspectorBody.append(node('div', 'empty-inspector', '没有待审批操作。'));
    return;
  }
  for (const approval of state.approvals) {
    const item = node('div', 'approval-item');
    const titles = {
      propose_get_current_time: '读取系统时间',
      propose_write_file: '文件写入',
      propose_run_command: '命令执行'
    };
    const title = titles[approval.toolName]
      || (approval.actionType === 'write_file'
        ? '文件写入'
        : approval.actionType === 'run_command'
          ? '命令执行'
          : '工具执行');
    item.append(node('h4', '', title));
    item.append(node('div', 'approval-preview', approval.summary + '\n' + approval.preview));
    const actions = node('div', 'approval-actions');
    const reject = node('button', 'secondary-button', '拒绝');
    reject.type = 'button';
    reject.disabled = state.pendingApprovals.has(state.activeSession.id);
    reject.addEventListener('click', () => resolveApproval(approval.approvalId, 'reject'));
    const approve = node('button', 'primary-button', '批准并继续');
    approve.type = 'button';
    const blocker = approvalResolutionBlocker(state.activeSession, approval.approvalId);
    approve.disabled = Boolean(blocker);
    if (blocker) approve.title = blocker;
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
    node('h3', '', '工作区 Diff'),
    node('p', '', state.activeSession
      ? ('当前会话工作区：' + (state.activeSession.workspace || '(未设置)'))
      : '写入前用于检查未提交改动和潜在冲突。')
  );
  const refresh = node('button', 'secondary-button', '刷新');
  refresh.type = 'button';
  refresh.addEventListener('click', () => loadDiff().catch((error) => showToast(error.message, true)));
  heading.append(info, refresh);
  elements.inspectorBody.append(heading);
  if (!state.diff) {
    elements.inspectorBody.append(node('div', 'empty-inspector', '正在读取 Git 状态…'));
    return;
  }
  if (state.diff.workspace) {
    elements.inspectorBody.append(node('p', '', 'Diff 根目录：' + state.diff.workspace));
  }
  elements.inspectorBody.append(node('pre', 'diff-panel', state.diff.diff || state.diff.status || '没有未提交改动。'));
}

async function createCheckpoint() {
  if (!state.activeSession) return;
  const blocker = sessionActionBlocker(state.activeSession);
  if (blocker) return showToast(blocker, true);
  setBusy(true);
  try {
    await api('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/checkpoints', { method: 'POST', body: {} });
    await refreshActive();
    state.tab = 'checkpoint';
    setActiveTab('checkpoint');
    showToast('Checkpoint 已创建');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function previewPacket() {
  if (!state.activeSession) return;
  const blocker = sessionActionBlocker(state.activeSession);
  if (blocker) return showToast(blocker, true);
  setBusy(true);
  try {
    const packet = await api('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/packet', { method: 'POST', body: {} });
    await refreshActive();
    state.packet = packet;
    state.tab = 'packet';
    setActiveTab('packet');
    renderInspector();
    showToast('Relay Packet 已生成');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function sendTurn() {
  const session = state.activeSession;
  if (!session) return;
  const sessionId = session.id;
  if (state.pendingTurns.has(sessionId)) return;
  const blocker = sessionActionBlocker(session);
  if (blocker) return showToast(blocker, true);
  const providerId = elements.providerSelect.value;
  if (!providerId) return showToast('请先配置模型供应商', true);
  const instruction = elements.composerText.value.trim();
  state.pendingTurns.add(sessionId);
  renderAll();
  try {
    const result = await api('/api/sessions/' + encodeURIComponent(sessionId) + '/turn', {
      method: 'POST',
      body: { providerId, instruction }
    });
    const stillSelected = state.activeSession && state.activeSession.id === sessionId;
    if (stillSelected && instruction && elements.composerText.value.trim() === instruction) {
      elements.composerText.value = '';
    }
    await refreshAfterSession(sessionId);
    if (stillSelected && result.status === 'approval_required') {
      state.tab = 'approvals';
      setActiveTab('approvals');
      renderInspector();
      showToast('模型请求执行受保护工具，请审批');
    } else if (result.status === 'step_limit') {
      showToast('工具步数用尽，已强制汇总当前结论', true);
    } else {
      showToast('模型回合已完成');
    }
  } catch (error) {
    await refreshAfterSession(sessionId).catch(() => {});
    showToast(
      error.code === 'WRITE_LEASE_BUSY'
        ? '当前任务或同一工作区已有任务正在运行，请稍后重试'
        : error.message,
      true
    );
  } finally {
    state.pendingTurns.delete(sessionId);
    renderAll();
  }
}

async function resolveApproval(approvalId, decision) {
  const session = state.activeSession;
  if (!session) return;
  const sessionId = session.id;
  if (state.pendingApprovals.has(sessionId)) return;
  if (decision === 'approve') {
    const blocker = approvalResolutionBlocker(session, approvalId);
    if (blocker) return showToast(blocker, true);
  }
  state.pendingApprovals.add(sessionId);
  renderAll();
  try {
    await api('/api/approvals/' + encodeURIComponent(approvalId) + '/resolve', {
      method: 'POST',
      body: { decision, continueTurn: decision === 'approve' }
    });
    await refreshAfterSession(sessionId);
    if (state.activeSession && state.activeSession.id === sessionId) {
      state.tab = 'approvals';
      setActiveTab('approvals');
    }
    showToast(decision === 'approve' ? '操作已批准并继续执行' : '操作已拒绝');
  } catch (error) {
    await refreshAfterSession(sessionId).catch(() => {});
    showToast(
      error.code === 'WRITE_LEASE_BUSY'
        ? '当前任务或同一工作区已有任务正在运行，请稍后重试'
        : error.message,
      true
    );
  } finally {
    state.pendingApprovals.delete(sessionId);
    renderAll();
  }
}

async function exportForCodex() {
  if (!state.activeSession) return;
  const blocker = sessionActionBlocker(state.activeSession);
  if (blocker) return showToast(blocker, true);
  try {
    const response = await fetch('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/export?format=markdown', {
      headers: { 'x-relaydock-token': state.token }
    });
    if (!response.ok) throw new Error('导出失败');
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'relaydock-' + state.activeSession.id.slice(0, 8) + '.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('增量记录已导出，可交回 Codex');
  } catch (error) {
    showToast(error.message, true);
  }
}

function setBusy(value) {
  state.busy = value;
  renderHeader();
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

function modalNumberField(label, name, value, min, max, help = '') {
  const wrap = modalField(label, name, value, 'number', help);
  const input = wrap.querySelector('input');
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.required = true;
  return wrap;
}

function modalCheckbox(label, name, checked, help = '') {
  const wrap = node('label', 'form-check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = name;
  input.value = 'true';
  input.checked = Boolean(checked);
  const content = node('span', 'form-check-content');
  content.append(node('strong', '', label));
  if (help) content.append(node('small', '', help));
  wrap.append(input, content);
  return wrap;
}

function taskPolicyValues(values) {
  const maxSteps = Number(values.maxSteps);
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) {
    throw new Error('最大工具步数必须是 1 到 100 之间的整数。');
  }
  return {
    completeTaskFirst: values.completeTaskFirst === 'true',
    maxSteps
  };
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
  fields.push(modalField('任务名称', 'title', '新的接力任务'));
  const goal = modalField('任务目标', 'goal', '', 'textarea', '写清最终要交付的行为或结果。');
  fields.push(goal);
  fields.push(modalField('验收标准（每行一条）', 'acceptanceCriteria', '', 'textarea'));
  fields.push(modalField('约束（每行一条）', 'constraints', '', 'textarea'));
  const policy = node('div', 'task-policy-fields');
  policy.append(
    modalCheckbox(
      '完成优先',
      'completeTaskFirst',
      true,
      '需要未注册能力时，先申请受保护工具权限并继续推进，而不是提前结束任务。'
    ),
    modalNumberField('最大工具步数', 'maxSteps', 32, 1, 100, '默认 32，可按任务复杂度调整。')
  );
  fields.push(policy);
  openModal('新建会话', fields, '创建会话', async (values) => {
    const taskPolicy = taskPolicyValues(values);
    const session = await api('/api/sessions', {
      method: 'POST',
      body: {
        title: values.title,
        goal: values.goal,
        acceptanceCriteria: values.acceptanceCriteria.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        constraints: values.constraints.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        ...taskPolicy
      }
    });
    await loadOverview(false);
    await selectSession(session.id);
    showToast('会话已创建');
  });
}

async function openCodexImportModal() {
  setBusy(true);
  try {
    const data = await api('/api/codex/sessions?limit=30');
    const rollouts = data.rollouts || [];
    elements.modalTitle.textContent = '导入本机 Codex 会话';
    elements.modalForm.replaceChildren();
    elements.modalError.classList.add('hidden');
    elements.modalSubmitButton.classList.add('hidden');

    if (!rollouts.length) {
      elements.modalForm.append(node('p', '', '未在 ' + (data.sessionsRoot || '~/.codex/sessions') + ' 找到 rollout 文件。'));
    } else {
      const hint = node('p', '', '选择一条 Codex 本地记录，RelayDock 会自动抽取用户/助手消息并创建会话（跳过环境注入等噪音）。');
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
              '已导入 ' + result.imported.length + ' 条 Codex 消息'
              + (result.workspace ? '，会话工作区 ' + pathTail(result.workspace) : '')
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
    elements.modalTitle.textContent = '导入本机 Cursor 会话';
    elements.modalForm.replaceChildren();
    elements.modalError.classList.add('hidden');
    elements.modalSubmitButton.classList.add('hidden');

    if (!transcripts.length) {
      elements.modalForm.append(node('p', '', '未在 ' + (data.projectsRoot || '~/.cursor/projects') + ' 找到 agent-transcripts。'));
    } else {
      const hint = node('p', '', '选择一条 Cursor Agent 本地记录，RelayDock 会抽取用户提问与助手可见回复并创建会话（默认跳过 subagent）。');
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
          item.workspace ? ('工作区 ' + pathTail(item.workspace)) : '未识别工作区'
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
              '已导入 ' + result.imported.length + ' 条 Cursor 消息'
              + (result.workspace ? '，会话工作区 ' + pathTail(result.workspace) : '')
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
  fields.push(modalField('任务名称', 'title', contract.title || ''));
  fields.push(modalField('任务目标', 'goal', contract.goal || '', 'textarea'));
  fields.push(modalField('当前摘要', 'summary', contract.summary || '', 'textarea'));
  fields.push(modalField('验收标准（每行一条）', 'acceptanceCriteria', (contract.acceptanceCriteria || []).join('\n'), 'textarea'));
  fields.push(modalField('约束（每行一条）', 'constraints', (contract.constraints || []).join('\n'), 'textarea'));
  fields.push(modalField('关键决策（每行一条）', 'decisions', (contract.decisions || []).join('\n'), 'textarea'));
  fields.push(modalField('下一步（每行一条）', 'nextSteps', (contract.nextSteps || []).join('\n'), 'textarea'));
  const policy = node('div', 'task-policy-fields');
  policy.append(
    modalCheckbox(
      '完成优先',
      'completeTaskFirst',
      contract.completeTaskFirst !== false,
      '需要未注册能力时，先申请受保护工具权限并继续推进，而不是提前结束任务。'
    ),
    modalNumberField('最大工具步数', 'maxSteps', contract.maxSteps || 32, 1, 100, '默认 32，可按任务复杂度调整。')
  );
  fields.push(policy);
  openModal('编辑任务契约', fields, '保存契约', async (values) => {
    const lines = (value) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const taskPolicy = taskPolicyValues(values);
    await api('/api/sessions/' + encodeURIComponent(state.activeSession.id), {
      method: 'PATCH',
      body: {
        title: values.title,
        goal: values.goal,
        summary: values.summary,
        acceptanceCriteria: lines(values.acceptanceCriteria),
        constraints: lines(values.constraints),
        decisions: lines(values.decisions),
        nextSteps: lines(values.nextSteps),
        ...taskPolicy
      }
    });
    await refreshActive();
    showToast('任务契约已更新');
  });
}

function openProviderModal(provider) {
  const editing = Boolean(provider);
  const current = provider || { id: '', name: '', type: 'openai-compatible', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY', contextWindow: 64000, maxOutputTokens: 8192, enabled: true };
  const fields = [];
  fields.push(modalField('供应商 ID', 'id', current.id, 'text', '小写字母、数字和连字符。'));
  fields.push(modalField('显示名称', 'name', current.name));
  fields.push(modalField('兼容端点', 'baseUrl', current.baseUrl, 'text', 'OpenAI Chat Completions 兼容地址。'));
  const grid = node('div', 'form-grid');
  grid.append(modalField('模型 ID', 'model', current.model));
  grid.append(modalField('密钥环境变量', 'apiKeyEnv', current.apiKeyEnv || ''));
  fields.push(grid);
  const limits = node('div', 'form-grid');
  limits.append(modalField('上下文窗口', 'contextWindow', current.contextWindow, 'number'));
  limits.append(modalField('最大输出 Tokens', 'maxOutputTokens', current.maxOutputTokens, 'number'));
  fields.push(limits);
  fields.push(modalField('本次运行密钥', 'apiKey', '', 'password', '只保存在当前 RelayDock 进程内存；不会写入账本。留空则读取环境变量。'));
  openModal(editing ? '配置供应商' : '添加供应商', fields, '保存配置', async (values) => {
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
      showToast('供应商已保存，连接正常' + (result.modelCount ? ' · ' + result.modelCount + ' 个模型' : ''));
    } catch (error) {
      showToast('供应商已保存，但连接测试失败：' + error.message, true);
    }
  });
}

elements.newSessionButton.addEventListener('click', openSessionModal);
elements.importCodexButton.addEventListener('click', () => openCodexImportModal().catch((error) => showToast(error.message, true)));
if (elements.importCursorButton) {
  elements.importCursorButton.addEventListener('click', () => openCursorImportModal().catch((error) => showToast(error.message, true)));
}
elements.addProviderButton.addEventListener('click', () => openProviderModal(null));
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
  if (state.activeSession) refreshActive().catch(() => {});
}, 12000);

bootstrap();
