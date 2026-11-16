'use strict';

const state = {
  token: null,
  workspace: null,
  sessions: [],
  providers: [],
  activeSession: null,
  timeline: [],
  approvals: [],
  packet: null,
  diff: null,
  tab: 'checkpoint',
  modalMode: null,
  busy: false
};

const elements = {};
for (const id of [
  'healthBadge', 'workspaceLabel', 'refreshButton', 'newSessionButton', 'sessionList',
  'addProviderButton', 'providerList', 'activeTitle', 'activeMeta', 'leaseBadge', 'approvalCount',
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
    elements.workspaceLabel.textContent = shortPath(state.workspace);
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
  state.leases = data.leases;
  renderSessions();
  renderProviders();
  if (!state.activeSession && (selectFirst || state.sessions.length)) {
    if (state.sessions.length) await selectSession(state.sessions[0].id);
  } else if (state.activeSession) {
    const current = state.sessions.find((item) => item.id === state.activeSession.id);
    if (current) state.activeSession = current;
  }
  renderHeader();
  renderTimeline();
  renderInspector();
}

async function selectSession(sessionId) {
  state.activeSession = state.sessions.find((item) => item.id === sessionId) || null;
  const data = await api('/api/sessions/' + encodeURIComponent(sessionId));
  state.activeSession = data.session;
  state.approvals = data.approvals || [];
  state.timeline = (await api('/api/sessions/' + encodeURIComponent(sessionId) + '/timeline')).events;
  state.packet = null;
  state.diff = null;
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

function renderSessions() {
  elements.sessionList.replaceChildren();
  if (!state.sessions.length) {
    const empty = node('div', 'empty-inspector', '还没有任务会话。新建一个会话后，从 Codex 记录目标并创建 Checkpoint。');
    elements.sessionList.append(empty);
    return;
  }
  for (const session of state.sessions) {
    const button = node('button', 'session-item' + (state.activeSession && state.activeSession.id === session.id ? ' active' : ''));
    button.type = 'button';
    button.append(node('span', 'session-item-title', session.title));
    button.append(node('span', 'session-item-excerpt', session.lastMessage ? session.lastMessage.excerpt : '尚未记录消息'));
    const meta = node('span', 'session-item-meta');
    meta.append(node('span', '', session.counts.messages + ' 消息'));
    meta.append(node('span', '', session.counts.checkpoints + ' 快照'));
    meta.append(node('span', '', formatDate(session.updatedAt)));
    button.append(meta);
    button.addEventListener('click', () => selectSession(session.id).catch((error) => showToast(error.message, true)));
    elements.sessionList.append(button);
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
    elements.leaseBadge.textContent = '无写锁';
    elements.leaseBadge.className = 'status-pill neutral';
    elements.approvalCount.textContent = '0 审批';
    elements.sendButton.disabled = true;
    return;
  }
  elements.activeTitle.textContent = session.title;
  const goal = session.contract && session.contract.goal ? session.contract.goal : '尚未填写任务目标';
  elements.activeMeta.textContent = goal;
  const lease = (state.leases || []).find((item) => item.sessionId === session.id);
  elements.leaseBadge.textContent = lease ? lease.providerId + ' 持有写锁' : '无写锁';
  elements.leaseBadge.className = 'status-pill ' + (lease ? 'warning' : 'neutral');
  const count = state.approvals.length;
  elements.approvalCount.textContent = count + ' 审批';
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
  if (event.type === 'checkpoint.created') return 'checkpoint';
  if (event.type.startsWith('tool.')) return 'tool';
  if (event.type.startsWith('handoff.')) return 'handoff';
  if (event.type.startsWith('approval.')) return 'approval';
  return event.origin_provider;
}

function renderTimeline() {
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
  if (!state.timeline.length) {
    elements.timeline.append(node('div', 'empty-state', '当前会话还没有事件。'));
    return;
  }
  for (const event of state.timeline) {
    if (['packet.previewed', 'write_lease.acquired', 'write_lease.released'].includes(event.type)) continue;
    const entry = node('article', 'timeline-entry');
    const sequence = node('div', 'timeline-seq', '#' + event.sequence);
    const card = node('div', 'event-card ' + eventClass(event));
    const head = node('div', 'event-head');
    const author = node('div', 'event-author');
    const badge = node('span', 'event-source ' + eventClass(event), sourceLabel(event));
    author.append(badge, node('span', '', event.type));
    head.append(author, node('span', 'event-time', formatDate(event.created_at)));
    card.append(head);

    const payload = event.payload || {};
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
  state.diff = await api('/api/diff');
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
  info.append(node('h3', '', '写操作审批'), node('p', '', '批准后才执行，并在执行前检查工作区冲突。'));
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
    item.append(node('h4', '', approval.actionType === 'write_file' ? '文件写入' : '命令执行'));
    item.append(node('div', 'approval-preview', approval.summary + '\n' + approval.preview));
    const actions = node('div', 'approval-actions');
    const reject = node('button', 'secondary-button', '拒绝');
    reject.type = 'button';
    reject.addEventListener('click', () => resolveApproval(approval.approvalId, 'reject'));
    const approve = node('button', 'primary-button', '批准并继续');
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
  info.append(node('h3', '', '工作区 Diff'), node('p', '', '写入前用于检查未提交改动和潜在冲突。'));
  const refresh = node('button', 'secondary-button', '刷新');
  refresh.type = 'button';
  refresh.addEventListener('click', () => loadDiff().catch((error) => showToast(error.message, true)));
  heading.append(info, refresh);
  elements.inspectorBody.append(heading);
  if (!state.diff) {
    elements.inspectorBody.append(node('div', 'empty-inspector', '正在读取 Git 状态…'));
    return;
  }
  elements.inspectorBody.append(node('pre', 'diff-panel', state.diff.diff || state.diff.status || '没有未提交改动。'));
}

async function createCheckpoint() {
  if (!state.activeSession) return;
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
  if (!state.activeSession) return;
  const providerId = elements.providerSelect.value;
  if (!providerId) return showToast('请先配置模型供应商', true);
  setBusy(true);
  try {
    const result = await api('/api/sessions/' + encodeURIComponent(state.activeSession.id) + '/turn', {
      method: 'POST',
      body: { providerId, instruction: elements.composerText.value.trim(), maxSteps: 4 }
    });
    elements.composerText.value = '';
    await refreshActive();
    if (result.status === 'approval_required') {
      state.tab = 'approvals';
      setActiveTab('approvals');
      renderInspector();
      showToast('模型请求执行写操作，请审批');
    } else {
      showToast('模型回合已完成');
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
      body: { decision, continueTurn: decision === 'approve', maxSteps: 4 }
    });
    await refreshActive();
    state.tab = 'approvals';
    setActiveTab('approvals');
    showToast(decision === 'approve' ? '操作已批准并继续执行' : '操作已拒绝');
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
  openModal('新建会话', fields, '创建会话', async (values) => {
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
    showToast('会话已创建');
  });
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
  openModal('编辑任务契约', fields, '保存契约', async (values) => {
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
elements.addProviderButton.addEventListener('click', () => openProviderModal(null));
elements.refreshButton.addEventListener('click', () => refreshActive().catch((error) => showToast(error.message, true)));
elements.contractButton.addEventListener('click', openContractModal);
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

bootstrap();
