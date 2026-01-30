const HISTORY_LIMIT = 6;
const MCP_POLL_INTERVALS = [1500, 2500, 4000, 6000];
const MCP_POLL_IDLE_STEP = 3;

const ensureString = (value) => (value == null ? '' : String(value));

const parseBackendResponse = (response) => {
  if (response && typeof response === 'object') {
    if (response.ok === false) {
      throw new Error(response.message || '请求失败');
    }
    if (response.ok === true && Object.prototype.hasOwnProperty.call(response, 'data')) {
      return response.data;
    }
  }
  return response;
};

const formatDuration = (ms) => {
  if (ms == null || Number.isNaN(Number(ms))) return '-';
  return `${Number(ms)} ms`;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const createButton = (label, variant = '') => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = `mysql-compact-button${variant ? ` ${variant}` : ''}`;
  return button;
};

export function mount({ container, host }) {
  if (!container) throw new Error('container is required');

  const ctx = typeof host?.context?.get === 'function' ? host.context.get() : {};
  const cleanup = [];
  const backendAvailable = typeof host?.backend?.invoke === 'function';

  container.style.height = '100%';
  container.style.minHeight = '0';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.flex = '1';

  const style = document.createElement('style');
  style.textContent = `
    .mysql-compact-root {
      height: 100%;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      box-sizing: border-box;
      color: var(--ds-text, #1f1f1f);
      font-family: var(--ds-font, system-ui, -apple-system, Segoe UI, sans-serif);
      background: var(--ds-app-bg, #f5f5f5);
      overflow: auto;
      --ds-text-muted: rgba(0,0,0,0.65);
      --ds-text-subtle: rgba(0,0,0,0.45);
    }
    .mysql-compact-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .mysql-compact-title {
      font-size: 14px;
      font-weight: 700;
    }
    .mysql-compact-meta {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .mysql-compact-pill {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: var(--ds-subtle-bg, rgba(0,0,0,0.06));
    }
    .mysql-compact-pill.ok {
      background: rgba(16, 185, 129, 0.2);
      color: #047857;
    }
    .mysql-compact-pill.error {
      background: rgba(239, 68, 68, 0.2);
      color: #b91c1c;
    }
    .mysql-compact-pill.testing {
      background: rgba(59, 130, 246, 0.2);
      color: #1d4ed8;
    }
    .mysql-compact-section {
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 12px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--ds-panel-bg, rgba(255,255,255,0.9));
      min-height: 0;
    }
    .mysql-compact-section-grow {
      flex: 1;
      min-height: 0;
    }
    .mysql-compact-section-title {
      font-size: 12px;
      font-weight: 600;
    }
    .mysql-compact-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
    }
    .mysql-compact-row {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .mysql-compact-select,
    .mysql-compact-input,
    .mysql-compact-textarea {
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.14));
      background: var(--ds-subtle-bg, rgba(0,0,0,0.04));
      padding: 6px 8px;
      font-size: 12px;
      color: inherit;
      outline: none;
      box-sizing: border-box;
    }
    .mysql-compact-textarea {
      min-height: 80px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .mysql-compact-input::placeholder,
    .mysql-compact-textarea::placeholder {
      color: var(--ds-text-subtle, rgba(0,0,0,0.45));
    }
    .mysql-compact-button {
      padding: 5px 9px;
      border-radius: 10px;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.14));
      background: var(--ds-subtle-bg, rgba(0,0,0,0.04));
      font-size: 12px;
      font-weight: 600;
      color: inherit;
      cursor: pointer;
    }
    .mysql-compact-button.primary {
      background: var(--ds-accent-500, #3b82f6);
      color: #fff;
      border-color: transparent;
    }
    .mysql-compact-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .mysql-compact-history {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 160px;
      overflow: auto;
    }
    .mysql-compact-table-wrap {
      flex: 1;
      min-height: 0;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 10px;
      overflow: hidden;
      background: var(--ds-panel-bg, rgba(255,255,255,0.95));
    }
    .mysql-compact-table-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .mysql-compact-table {
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .mysql-compact-table th,
    .mysql-compact-table td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      text-align: left;
      vertical-align: top;
      max-width: 320px;
      word-break: break-word;
    }
    .mysql-compact-table th {
      position: sticky;
      top: 0;
      background: var(--ds-panel-bg, rgba(255,255,255,0.98));
      font-weight: 600;
      z-index: 1;
    }
    .mysql-compact-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--ds-text, #1f1f1f);
    }
    .mysql-compact-history-item {
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 6px 8px;
      background: var(--ds-subtle-bg, rgba(0,0,0,0.03));
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .mysql-compact-history-item:hover {
      border-color: var(--ds-accent-500, #3b82f6);
    }
    .mysql-compact-history-title {
      font-size: 11px;
      font-weight: 600;
    }
    .mysql-compact-history-meta {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .mysql-compact-message {
      font-size: 11px;
      text-align: right;
    }
    .mysql-compact-message.error {
      color: var(--ds-danger-500, #dc2626);
    }
    .mysql-compact-empty {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .mysql-compact-root[data-theme='dark'] {
      --ds-text: #e6e6e6;
      --ds-text-muted: rgba(255,255,255,0.85);
      --ds-text-subtle: rgba(255,255,255,0.7);
      --ds-app-bg: #0f1115;
      --ds-panel-bg: #161a22;
      --ds-panel-border: rgba(255,255,255,0.12);
      --ds-subtle-bg: rgba(255,255,255,0.06);
      --ds-accent-500: #3b82f6;
      --ds-danger-500: #ff7875;
    }
    .mysql-compact-root[data-theme='dark'] .mysql-compact-section {
      background: var(--ds-panel-bg, #161a22);
      border-color: var(--ds-panel-border, rgba(255,255,255,0.12));
    }
    .mysql-compact-root[data-theme='dark'] .mysql-compact-button {
      background: #1f2430;
      border-color: #303a49;
      color: #e6e6e6;
    }
    .mysql-compact-root[data-theme='dark'] .mysql-compact-button.primary {
      background: var(--ds-accent-500, #3b82f6);
      color: #fff;
    }
    .mysql-compact-root[data-theme='dark'] .mysql-compact-table-wrap {
      background: #151a22;
      border-color: var(--ds-panel-border, rgba(255,255,255,0.12));
    }
    .mysql-compact-root[data-theme='dark'] .mysql-compact-table th {
      background: #1f2430;
    }
  `;
  document.head.appendChild(style);
  cleanup.push(() => style.remove());

  const root = document.createElement('div');
  root.className = 'mysql-compact-root';
  container.appendChild(root);
  cleanup.push(() => root.remove());

  const header = document.createElement('div');
  header.className = 'mysql-compact-header';

  const title = document.createElement('div');
  title.className = 'mysql-compact-title';
  title.textContent = 'MySQL 快捷面板';

  const statusPill = document.createElement('div');
  statusPill.className = 'mysql-compact-pill';
  statusPill.textContent = '未测试';

  header.appendChild(title);
  header.appendChild(statusPill);

  const meta = document.createElement('div');
  meta.className = 'mysql-compact-meta';
  meta.textContent = `${ctx?.pluginId || ''}:${ctx?.appId || ''} · compact`;

  root.appendChild(header);
  root.appendChild(meta);

  const connectionSection = document.createElement('div');
  connectionSection.className = 'mysql-compact-section';
  const connectionTitle = document.createElement('div');
  connectionTitle.className = 'mysql-compact-section-title';
  connectionTitle.textContent = '连接状态';

  const connectionSelect = document.createElement('select');
  connectionSelect.className = 'mysql-compact-select';

  const databaseSelect = document.createElement('select');
  databaseSelect.className = 'mysql-compact-select';

  const connectionMeta = document.createElement('div');
  connectionMeta.className = 'mysql-compact-meta';

  const connectionActions = document.createElement('div');
  connectionActions.className = 'mysql-compact-row';
  const refreshButton = createButton('刷新');
  const testButton = createButton('测试');
  connectionActions.appendChild(refreshButton);
  connectionActions.appendChild(testButton);

  const connectionHeader = document.createElement('div');
  connectionHeader.className = 'mysql-compact-section-header';
  connectionHeader.appendChild(connectionTitle);
  connectionHeader.appendChild(connectionActions);

  connectionSection.appendChild(connectionHeader);
  connectionSection.appendChild(connectionSelect);
  connectionSection.appendChild(databaseSelect);
  connectionSection.appendChild(connectionMeta);

  const sqlSection = document.createElement('div');
  sqlSection.className = 'mysql-compact-section';
  const sqlTitle = document.createElement('div');
  sqlTitle.className = 'mysql-compact-section-title';
  sqlTitle.textContent = '快速执行 SQL';

  const sqlInput = document.createElement('textarea');
  sqlInput.className = 'mysql-compact-textarea';
  sqlInput.placeholder = '输入 SQL，Ctrl/Cmd + Enter 执行';

  const sqlActions = document.createElement('div');
  sqlActions.className = 'mysql-compact-row';
  const runButton = createButton('执行', 'primary');
  const clearButton = createButton('清空');
  sqlActions.appendChild(runButton);
  sqlActions.appendChild(clearButton);

  const sqlMeta = document.createElement('div');
  sqlMeta.className = 'mysql-compact-meta';
  sqlMeta.textContent = '尚未执行';

  sqlSection.appendChild(sqlTitle);
  sqlSection.appendChild(sqlInput);
  sqlSection.appendChild(sqlActions);
  sqlSection.appendChild(sqlMeta);

  const resultsSection = document.createElement('div');
  resultsSection.className = 'mysql-compact-section mysql-compact-section-grow';
  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'mysql-compact-row';
  resultsHeader.style.justifyContent = 'space-between';
  const resultsTitle = document.createElement('div');
  resultsTitle.className = 'mysql-compact-section-title';
  resultsTitle.textContent = '查询结果';
  const resultsMeta = document.createElement('div');
  resultsMeta.className = 'mysql-compact-meta';
  resultsMeta.textContent = '尚未执行';
  resultsHeader.appendChild(resultsTitle);
  resultsHeader.appendChild(resultsMeta);
  const resultsTableWrap = document.createElement('div');
  resultsTableWrap.className = 'mysql-compact-table-wrap';
  const resultsTableScroll = document.createElement('div');
  resultsTableScroll.className = 'mysql-compact-table-scroll';
  resultsTableWrap.appendChild(resultsTableScroll);
  resultsSection.appendChild(resultsHeader);
  resultsSection.appendChild(resultsTableWrap);

  const historySection = document.createElement('div');
  historySection.className = 'mysql-compact-section';
  const historyTitle = document.createElement('div');
  historyTitle.className = 'mysql-compact-section-title';
  historyTitle.textContent = '最近查询历史';

  const historyActions = document.createElement('div');
  historyActions.className = 'mysql-compact-row';
  const historyRefreshButton = createButton('刷新');
  historyActions.appendChild(historyRefreshButton);

  const historyList = document.createElement('div');
  historyList.className = 'mysql-compact-history';

  historySection.appendChild(historyTitle);
  historySection.appendChild(historyActions);
  historySection.appendChild(historyList);

  const message = document.createElement('div');
  message.className = 'mysql-compact-message';

  root.appendChild(connectionSection);
  root.appendChild(sqlSection);
  root.appendChild(resultsSection);
  root.appendChild(historySection);
  root.appendChild(message);

  const state = {
    connections: [],
    selectedConnectionId: '',
    selectedDatabase: '',
    databases: [],
    databasesLoading: false,
    status: 'idle',
    statusDetail: '',
    history: [],
    lastRun: null,
    results: null,
    busy: {
      connections: false,
      query: false,
      history: false,
      databases: false,
    },
    message: { text: '', type: 'info' },
  };
  let lastMcpSelectionKey = '';
  let lastMcpEventId = '';
  let mcpPollBusy = false;
  let mcpPollTimer = null;
  let mcpIdleCount = 0;

  const syncMcpSelection = async () => {
    if (!backendAvailable) return;
    const nextId = state.selectedConnectionId || '';
    const selected = state.connections.find((item) => item.id === nextId);
    const nextDatabase = ensureString(state.selectedDatabase || selected?.database).trim();
    const nextKey = `${nextId}::${nextDatabase}`;
    if (nextKey === lastMcpSelectionKey) return;
    try {
      await invokeBackend('mcp.selection.set', { connectionId: nextId, database: nextDatabase });
      lastMcpSelectionKey = nextKey;
    } catch (err) {
      console.warn('[data-app] failed to sync MCP selection', err);
    }
  };

  const getNextMcpPollDelay = (hasEvent) => {
    if (hasEvent) {
      mcpIdleCount = 0;
      return MCP_POLL_INTERVALS[0];
    }
    mcpIdleCount += 1;
    const step = Math.min(Math.floor(mcpIdleCount / MCP_POLL_IDLE_STEP), MCP_POLL_INTERVALS.length - 1);
    return MCP_POLL_INTERVALS[step];
  };

  const scheduleMcpPoll = (delay) => {
    if (!backendAvailable) return;
    if (mcpPollTimer) {
      clearTimeout(mcpPollTimer);
    }
    mcpPollTimer = setTimeout(pollMcpEvents, delay);
  };

  const applyMcpEvent = async (event) => {
    if (!event || typeof event !== 'object') return;
    if (event.error) {
      const message = ensureString(event.error.message || event.error || 'MCP 执行失败');
      setMessage(`MCP 执行失败: ${message}`, 'error');
      return;
    }
    const result = event.result && typeof event.result === 'object' ? event.result : null;
    if (result && Object.prototype.hasOwnProperty.call(result, 'rows')) {
      const rowCount = Number.isFinite(result.rowCount)
        ? result.rowCount
        : Array.isArray(result.rows)
          ? result.rows.length
          : 0;
      state.lastRun = { durationMs: result.durationMs, rowCount };
      state.results = {
        rows: result.rows,
        fields: result.fields,
        durationMs: result.durationMs,
        rowCount,
      };
      renderSqlMeta();
      renderResultsMeta();
      renderResults();
    }
    const tool = ensureString(event.tool).trim();
    if (tool.includes('listTables')) {
      setMessage(`MCP 已获取 ${result?.rowCount ?? 0} 张表`);
    } else if (tool.includes('query.execute')) {
      setMessage(`MCP 已执行查询 · ${result?.rowCount ?? '-'} 行`);
      await loadHistory();
    } else if (tool) {
      setMessage('MCP 已更新结果');
    }
  };

  const pollMcpEvents = async () => {
    if (!backendAvailable) return;
    if (mcpPollBusy) {
      scheduleMcpPoll(MCP_POLL_INTERVALS[0]);
      return;
    }
    mcpPollBusy = true;
    let hasEvent = false;
    try {
      const data = await invokeBackend('mcp.event.latest', { after: lastMcpEventId });
      const event = data?.event;
      if (event && typeof event === 'object') {
        const nextId = ensureString(event.id || event.at).trim();
        if (nextId && nextId !== lastMcpEventId) {
          lastMcpEventId = nextId;
          await applyMcpEvent(event);
          hasEvent = true;
        }
      }
    } catch (err) {
      console.warn('[data-app] failed to poll MCP events', err);
    } finally {
      mcpPollBusy = false;
      scheduleMcpPoll(getNextMcpPollDelay(hasEvent));
    }
  };

  const setTheme = (theme) => {
    root.dataset.theme = theme || 'light';
  };
  const initialTheme = typeof host?.theme?.get === 'function' ? host.theme.get() : ctx?.theme || 'light';
  setTheme(initialTheme);
  if (typeof host?.theme?.onChange === 'function') {
    const off = host.theme.onChange((theme) => setTheme(theme));
    if (typeof off === 'function') cleanup.push(() => off());
  }

  const setMessage = (text, type = 'info') => {
    state.message = { text, type };
    renderMessage();
    if (text) {
      clearTimeout(setMessage._timer);
      setMessage._timer = setTimeout(() => {
        state.message = { text: '', type: 'info' };
        renderMessage();
      }, 3500);
    }
  };

  const invokeBackend = async (method, params) => {
    if (!backendAvailable) throw new Error('后端桥接不可用');
    const response = await host.backend.invoke(method, params);
    return parseBackendResponse(response);
  };

  const setBusy = (key, value) => {
    state.busy[key] = value;
    updateButtons();
  };

  const updateButtons = () => {
    const hasConnection = Boolean(state.selectedConnectionId);
    refreshButton.disabled = !backendAvailable || state.busy.connections;
    testButton.disabled = !backendAvailable || !hasConnection || state.busy.connections;
    runButton.disabled = !backendAvailable || !hasConnection || state.busy.query || !ensureString(sqlInput.value).trim();
    clearButton.disabled = state.busy.query;
    historyRefreshButton.disabled = !backendAvailable || state.busy.history;
    databaseSelect.disabled = !backendAvailable || !hasConnection || state.busy.databases;
  };

  const renderStatus = () => {
    statusPill.className = 'mysql-compact-pill';
    if (state.status === 'ok') {
      statusPill.classList.add('ok');
      statusPill.textContent = '连接正常';
    } else if (state.status === 'error') {
      statusPill.classList.add('error');
      statusPill.textContent = '连接异常';
    } else if (state.status === 'testing') {
      statusPill.classList.add('testing');
      statusPill.textContent = '测试中';
    } else {
      statusPill.textContent = '未测试';
    }
    const selected = state.connections.find((item) => item.id === state.selectedConnectionId);
    if (!selected) {
      connectionMeta.textContent = '未选择连接';
      return;
    }
    const base = `${selected.user}@${selected.host}:${selected.port}`;
    const activeDatabase = ensureString(state.selectedDatabase || selected.database).trim();
    const databaseText = activeDatabase ? `/${activeDatabase}` : ' · 数据库未选择';
    connectionMeta.textContent = `${base}${databaseText}`;
    if (state.statusDetail) {
      connectionMeta.textContent += ` · ${state.statusDetail}`;
    }
  };

  const renderConnections = () => {
    connectionSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = state.connections.length === 0 ? '暂无连接' : '选择连接';
    connectionSelect.appendChild(placeholder);
    state.connections.forEach((conn) => {
      const option = document.createElement('option');
      option.value = conn.id;
      option.textContent = conn.name || `${conn.host}:${conn.port}`;
      if (conn.id === state.selectedConnectionId) option.selected = true;
      connectionSelect.appendChild(option);
    });
  };

  const renderDatabases = () => {
    databaseSelect.innerHTML = '';
    const hasConnection = Boolean(state.selectedConnectionId);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    if (!hasConnection) {
      placeholder.textContent = '请先选择连接';
    } else if (state.databasesLoading) {
      placeholder.textContent = '加载中...';
    } else if (state.databases.length === 0) {
      placeholder.textContent = '暂无数据库';
    } else {
      placeholder.textContent = '选择数据库';
    }
    databaseSelect.appendChild(placeholder);
    if (!state.selectedDatabase) {
      placeholder.selected = true;
    }

    const selected = ensureString(state.selectedDatabase).trim();
    if (selected && !state.databases.includes(selected)) {
      const currentOption = document.createElement('option');
      currentOption.value = selected;
      currentOption.textContent = selected;
      currentOption.selected = true;
      databaseSelect.appendChild(currentOption);
    }

    state.databases.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === state.selectedDatabase) option.selected = true;
      databaseSelect.appendChild(option);
    });
  };

  const loadDatabases = async () => {
    if (!backendAvailable || !state.selectedConnectionId) return;
    if (state.databasesLoading) return;
    state.databasesLoading = true;
    setBusy('databases', true);
    renderDatabases();
    try {
      const data = await invokeBackend('schema.listDatabases', { connectionId: state.selectedConnectionId });
      state.databases = Array.isArray(data.databases)
        ? data.databases.map((item) => ensureString(item?.name).trim()).filter((name) => name)
        : [];
      const selected = state.connections.find((item) => item.id === state.selectedConnectionId);
      if (state.selectedDatabase && !state.databases.includes(state.selectedDatabase)) {
        state.selectedDatabase = '';
      }
      if (!state.selectedDatabase && selected?.database && state.databases.includes(selected.database)) {
        state.selectedDatabase = selected.database;
      }
    } catch (err) {
      setMessage(`获取数据库失败: ${err.message}`, 'error');
    } finally {
      state.databasesLoading = false;
      setBusy('databases', false);
      renderDatabases();
      renderStatus();
    }
  };

  const switchDatabase = async (database) => {
    if (!database || !state.selectedConnectionId) return;
    const trimmed = ensureString(database).trim();
    if (!trimmed) return;
    const selected = state.connections.find((item) => item.id === state.selectedConnectionId);
    if (selected?.database === trimmed && state.selectedDatabase === trimmed) return;
    state.selectedDatabase = trimmed;
    renderDatabases();
    renderStatus();
    await syncMcpSelection();
    if (!backendAvailable) return;
    setBusy('databases', true);
    try {
      const data = await invokeBackend('connections.update', {
        connectionId: state.selectedConnectionId,
        patch: { database: trimmed },
      });
      state.connections = state.connections.map((item) => (item.id === data.connection.id ? data.connection : item));
      state.selectedDatabase = data.connection.database || trimmed;
      setMessage('数据库已切换');
    } catch (err) {
      setMessage(`切换数据库失败: ${err.message}`, 'error');
    } finally {
      setBusy('databases', false);
      renderDatabases();
      renderStatus();
      await syncMcpSelection();
    }
  };

  const formatResultValue = (value) => {
    if (value == null) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (_) {
        return String(value);
      }
    }
    return String(value);
  };

  const renderResults = () => {
    resultsTableScroll.innerHTML = '';
    if (!state.results) {
      const empty = document.createElement('div');
      empty.className = 'mysql-compact-empty';
      empty.textContent = '尚未执行查询';
      resultsTableScroll.appendChild(empty);
      return;
    }
    if (state.results.error) {
      const empty = document.createElement('div');
      empty.className = 'mysql-compact-empty';
      empty.textContent = state.results.error;
      resultsTableScroll.appendChild(empty);
      return;
    }
    const rows = state.results.rows;
    if (!Array.isArray(rows)) {
      const pre = document.createElement('pre');
      pre.className = 'mysql-compact-code';
      try {
        pre.textContent = JSON.stringify(rows, null, 2);
      } catch (_) {
        pre.textContent = String(rows);
      }
      resultsTableScroll.appendChild(pre);
      return;
    }
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mysql-compact-empty';
      empty.textContent = '无返回数据';
      resultsTableScroll.appendChild(empty);
      return;
    }
    const fields = Array.isArray(state.results.fields) ? state.results.fields : [];
    const firstRow = rows[0];
    const isRowArray = Array.isArray(firstRow);
    let columns = [];
    if (fields.length > 0) {
      columns = fields.map((field) => field.name);
    } else if (isRowArray) {
      columns = firstRow.map((_, index) => `列 ${index + 1}`);
    } else {
      columns = Object.keys(firstRow || {});
    }
    if (columns.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mysql-compact-empty';
      empty.textContent = '无可展示字段';
      resultsTableScroll.appendChild(empty);
      return;
    }
    const table = document.createElement('table');
    table.className = 'mysql-compact-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach((name) => {
      const th = document.createElement('th');
      th.textContent = name;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((name, index) => {
        const td = document.createElement('td');
        const value = isRowArray ? row[index] : row?.[name];
        td.textContent = formatResultValue(value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    resultsTableScroll.appendChild(table);
  };

  const renderResultsMeta = () => {
    if (!state.results) {
      resultsMeta.textContent = '尚未执行';
      return;
    }
    if (state.results.error) {
      resultsMeta.textContent = '执行失败';
      return;
    }
    resultsMeta.textContent = `耗时 ${formatDuration(state.results.durationMs)} · ${state.results.rowCount ?? 0} 行`;
  };

  const renderHistory = () => {
    historyList.innerHTML = '';
    if (state.history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mysql-compact-empty';
      empty.textContent = '暂无历史记录';
      historyList.appendChild(empty);
      return;
    }
    state.history.forEach((item) => {
      const entry = document.createElement('div');
      entry.className = 'mysql-compact-history-item';
      const title = document.createElement('div');
      title.className = 'mysql-compact-history-title';
      title.textContent = `${item.status === 'error' ? '失败' : '成功'} · ${formatDateTime(item.createdAt)}`;
      const metaLine = document.createElement('div');
      metaLine.className = 'mysql-compact-history-meta';
      metaLine.textContent = `${formatDuration(item.durationMs)} · ${item.rowCount ?? 0} 行`;
      const sqlLine = document.createElement('div');
      sqlLine.className = 'mysql-compact-history-meta';
      sqlLine.textContent = ensureString(item.sql).slice(0, 120);
      entry.appendChild(title);
      entry.appendChild(metaLine);
      entry.appendChild(sqlLine);
      entry.addEventListener('click', () => {
        sqlInput.value = item.sql || '';
        updateButtons();
        setMessage('已载入 SQL');
      });
      historyList.appendChild(entry);
    });
  };

  const renderMessage = () => {
    message.textContent = state.message.text;
    message.className = `mysql-compact-message${state.message.type === 'error' ? ' error' : ''}`;
  };

  const renderSqlMeta = () => {
    if (!state.lastRun) {
      sqlMeta.textContent = '尚未执行';
      return;
    }
    sqlMeta.textContent = `耗时 ${formatDuration(state.lastRun.durationMs)} · ${state.lastRun.rowCount ?? 0} 行`;
  };

  const loadConnections = async () => {
    if (!backendAvailable) return;
    setBusy('connections', true);
    try {
      const data = await invokeBackend('connections.list');
      state.connections = data.items || [];
      if (state.selectedConnectionId && !state.connections.some((item) => item.id === state.selectedConnectionId)) {
        state.selectedConnectionId = '';
      }
      if (!state.selectedConnectionId && state.connections.length > 0) {
        state.selectedConnectionId = state.connections[0].id;
      }
      const selected = state.connections.find((item) => item.id === state.selectedConnectionId);
      state.selectedDatabase = ensureString(selected?.database).trim();
      state.databases = [];
      state.lastRun = null;
      state.results = null;
      renderDatabases();
      await loadDatabases();
      await syncMcpSelection();
      renderConnections();
      renderStatus();
      await loadHistory();
    } catch (err) {
      setMessage(err.message, 'error');
    } finally {
      setBusy('connections', false);
    }
  };

  const testConnection = async () => {
    if (!backendAvailable || !state.selectedConnectionId) return;
    setBusy('connections', true);
    state.status = 'testing';
    state.statusDetail = '';
    renderStatus();
    try {
      const data = await invokeBackend('connections.test', { connectionId: state.selectedConnectionId });
      state.status = 'ok';
      state.statusDetail = data.serverVersion || '';
      setMessage('连接测试成功');
    } catch (err) {
      state.status = 'error';
      state.statusDetail = err.message;
      setMessage(`连接失败: ${err.message}`, 'error');
    } finally {
      setBusy('connections', false);
      renderStatus();
    }
  };

  const executeSql = async () => {
    if (!backendAvailable) return;
    const sql = ensureString(sqlInput.value).trim();
    if (!sql) {
      setMessage('请输入 SQL', 'error');
      return;
    }
    if (!state.selectedConnectionId) {
      setMessage('请选择连接', 'error');
      return;
    }
    setBusy('query', true);
    try {
      const data = await invokeBackend('query.execute', {
        connectionId: state.selectedConnectionId,
        sql,
      });
      state.lastRun = { durationMs: data.durationMs, rowCount: data.rowCount };
      state.results = {
        rows: data.rows,
        fields: data.fields,
        durationMs: data.durationMs,
        rowCount: data.rowCount,
      };
      renderSqlMeta();
      renderResultsMeta();
      renderResults();
      setMessage('执行成功');
      await loadHistory();
    } catch (err) {
      state.lastRun = { durationMs: null, rowCount: 0 };
      state.results = { error: err.message };
      renderSqlMeta();
      renderResultsMeta();
      renderResults();
      setMessage(`执行失败: ${err.message}`, 'error');
    } finally {
      setBusy('query', false);
    }
  };

  const loadHistory = async () => {
    if (!backendAvailable) return;
    setBusy('history', true);
    try {
      const data = await invokeBackend('history.list', {
        connectionId: state.selectedConnectionId || undefined,
        limit: HISTORY_LIMIT,
      });
      state.history = data.items || [];
      renderHistory();
    } catch (err) {
      setMessage(err.message, 'error');
    } finally {
      setBusy('history', false);
    }
  };

  connectionSelect.addEventListener('change', async () => {
    state.selectedConnectionId = connectionSelect.value;
    state.status = 'idle';
    state.statusDetail = '';
    const selected = state.connections.find((item) => item.id === state.selectedConnectionId);
    state.selectedDatabase = ensureString(selected?.database).trim();
    state.databases = [];
    state.lastRun = null;
    state.results = null;
    renderStatus();
    renderDatabases();
    renderSqlMeta();
    renderResultsMeta();
    renderResults();
    await loadDatabases();
    await syncMcpSelection();
    await loadHistory();
  });

  databaseSelect.addEventListener('focus', () => {
    if (state.selectedConnectionId) {
      loadDatabases();
    }
  });
  databaseSelect.addEventListener('change', async () => {
    await switchDatabase(databaseSelect.value);
  });

  refreshButton.addEventListener('click', () => loadConnections());
  testButton.addEventListener('click', () => testConnection());

  runButton.addEventListener('click', () => executeSql());
  clearButton.addEventListener('click', () => {
    sqlInput.value = '';
    updateButtons();
  });
  sqlInput.addEventListener('input', () => updateButtons());
  sqlInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      executeSql();
    }
  });

  historyRefreshButton.addEventListener('click', () => loadHistory());

  const init = async () => {
    if (!backendAvailable) {
      setMessage('后端未连接，部分功能不可用', 'error');
      updateButtons();
      return;
    }
    await loadConnections();
  };

  renderConnections();
  renderStatus();
  renderDatabases();
  renderHistory();
  renderSqlMeta();
  renderResultsMeta();
  renderResults();
  updateButtons();
  renderMessage();
  init().catch((err) => setMessage(err.message, 'error'));
  if (backendAvailable) {
    scheduleMcpPoll(0);
    cleanup.push(() => {
      if (mcpPollTimer) clearTimeout(mcpPollTimer);
    });
  }

  return () => {
    cleanup.forEach((fn) => fn());
  };
}
