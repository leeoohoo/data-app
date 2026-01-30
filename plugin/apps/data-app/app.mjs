import {
  MAX_RENDER_ROWS,
  HISTORY_PAGE_SIZE,
  FORM_DATABASE_CUSTOM_OPTION,
  MCP_POLL_INTERVALS,
  MCP_POLL_IDLE_STEP,
  MAX_MCP_EVENTS,
} from './constants.mjs';
import {
  createId,
  isPlainObject,
  formatDateTime,
  formatTime,
  formatDuration,
  ensureString,
  parseBackendResponse,
  rowsToCsv,
} from './utils.mjs';
import { createButton, createIconButton, createField, createFilePicker } from './ui.mjs';
import { DATA_APP_STYLES } from './styles.mjs';
import { getAdapter, listAdapters } from './adapters/index.mjs';

export function mount({ container, host, slots }) {
  if (!container) throw new Error('container is required');
  if (!host || typeof host !== 'object') throw new Error('host is required');

  const ctx = typeof host?.context?.get === 'function' ? host.context.get() : { pluginId: '', appId: '', theme: 'light' };
  const adapter = getAdapter(ctx?.dbType || ctx?.databaseType || ctx?.adapter || 'mysql');
  const language = adapter?.language || {};
  const SQL_KEYWORDS = Array.isArray(language.keywords) ? language.keywords : [];
  const SQL_SUGGESTION_KEYWORDS = Array.isArray(language.suggestionKeywords)
    ? language.suggestionKeywords
    : SQL_KEYWORDS;
  const SQL_FUNCTIONS =
    language.functions instanceof Set
      ? language.functions
      : new Set(Array.isArray(language.functions) ? language.functions : []);
  const queryLabel = adapter?.ui?.queryLabel || (language.kind === 'sql' ? 'SQL' : '查询');
  const appTitle = adapter?.ui?.title || `${queryLabel} 数据库连接管理`;
  const editorTitleText = adapter?.ui?.editorTitle || `${queryLabel} 编辑器`;
  const editorRunLabel = adapter?.ui?.runLabel || `执行 ${queryLabel}`;
  const historyRunLabel = adapter?.ui?.historyRunLabel || editorRunLabel;
  const historyLoadLabel = adapter?.ui?.loadLabel || `载入 ${queryLabel}`;
  const editorPlaceholder = adapter?.ui?.editorPlaceholder || `输入 ${queryLabel}，Ctrl/Cmd + Enter 执行`;
  const editorHint =
    adapter?.ui?.editorHint || '提示: Ctrl/Cmd+Enter 执行 · Ctrl+Space 提示 · Tab 补全 · Enter 确认';
  const mysqlDefaultPort = getAdapter('mysql')?.defaults?.port || '3306';
  const api = adapter?.api || {};
  const apiConnections = api.connections || {};
  const apiSchema = api.schema || {};
  const apiQuery = api.query || {};
  const apiHistory = api.history || {};
  const apiMcp = api.mcp || {};
  const API_CONNECTIONS_LIST = apiConnections.list || 'connections.list';
  const API_CONNECTIONS_GET = apiConnections.get || 'connections.get';
  const API_CONNECTIONS_CREATE = apiConnections.create || 'connections.create';
  const API_CONNECTIONS_UPDATE = apiConnections.update || 'connections.update';
  const API_CONNECTIONS_DELETE = apiConnections.delete || 'connections.delete';
  const API_CONNECTIONS_TEST = apiConnections.test || 'connections.test';
  const API_SCHEMA_LIST_DATABASES = apiSchema.listDatabases || 'schema.listDatabases';
  const API_SCHEMA_LIST_TABLES = apiSchema.listTables || 'schema.listTables';
  const API_SCHEMA_DESCRIBE_TABLE = apiSchema.describeTable || 'schema.describeTable';
  const API_QUERY_EXECUTE = apiQuery.execute || 'query.execute';
  const API_HISTORY_LIST = apiHistory.list || 'history.list';
  const API_HISTORY_CLEAR = apiHistory.clear || 'history.clear';
  const API_MCP_SELECTION_SET = apiMcp.selectionSet || 'mcp.selection.set';
  const API_MCP_EVENT_LATEST = apiMcp.eventLatest || 'mcp.event.latest';
  const mcpConfig = adapter?.mcp || {};
  const mcpToolPrefix = ensureString(mcpConfig.toolPrefix || '');
  const knownMcpPrefixes = Array.from(
    new Set(
      [mcpToolPrefix, ...listAdapters().map((item) => item?.mcp?.toolPrefix)].filter((prefix) => prefix)
    )
  );
  const mcpToolNames = {
    listTables: mcpConfig.toolNames?.listTables || apiSchema.listTables || 'schema.listTables',
    executeQuery: mcpConfig.toolNames?.executeQuery || apiQuery.execute || 'query.execute',
  };
  const mcpMessages = mcpConfig.messages || {};
  const escapeRegExp = (value) => ensureString(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripMcpPrefix = (value) => {
    const raw = ensureString(value);
    if (knownMcpPrefixes.length === 0) return raw;
    const matched = knownMcpPrefixes.find((prefix) => raw.startsWith(prefix));
    if (!matched) return raw;
    return raw.replace(new RegExp(`^${escapeRegExp(matched)}`), '');
  };
  const defaultFormType = (() => {
    const raw = ensureString(ctx?.dbType || ctx?.databaseType || ctx?.adapter || 'mysql').toLowerCase();
    return raw === 'mongo' || raw === 'mongodb' ? 'mongo' : 'mysql';
  })();
  const headerSlot =
    slots?.header && typeof slots.header === 'object' && typeof slots.header.appendChild === 'function' ? slots.header : null;
  const cleanup = [];

  const style = document.createElement('style');
  style.textContent = DATA_APP_STYLES;
  document.head.appendChild(style);
  cleanup.push(() => style.remove());

  const root = document.createElement('div');
  root.className = 'data-app-root';
  container.appendChild(root);
  cleanup.push(() => root.remove());

  const header = document.createElement('div');
  header.className = 'data-app-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'data-app-header-left';

  const title = document.createElement('div');
  title.className = 'data-app-title';
  title.textContent = appTitle;
  headerLeft.appendChild(title);

  const headerCenter = document.createElement('div');
  headerCenter.className = 'data-app-header-center';

  const headerConnectionField = document.createElement('div');
  headerConnectionField.className = 'data-app-header-field';
  const headerConnectionLabel = document.createElement('div');
  headerConnectionLabel.className = 'data-app-header-label';
  headerConnectionLabel.textContent = '连接';
  const headerConnectionSelect = document.createElement('select');
  headerConnectionSelect.className = 'data-app-select data-app-header-select';
  headerConnectionField.appendChild(headerConnectionLabel);
  headerConnectionField.appendChild(headerConnectionSelect);

  const headerDatabaseField = document.createElement('div');
  headerDatabaseField.className = 'data-app-header-field';
  const headerDatabaseLabel = document.createElement('div');
  headerDatabaseLabel.className = 'data-app-header-label';
  headerDatabaseLabel.textContent = '数据库';
  const headerDatabaseSelect = document.createElement('select');
  headerDatabaseSelect.className = 'data-app-select data-app-header-select';
  headerDatabaseField.appendChild(headerDatabaseLabel);
  headerDatabaseField.appendChild(headerDatabaseSelect);

  headerCenter.appendChild(headerConnectionField);
  headerCenter.appendChild(headerDatabaseField);

  const headerRight = document.createElement('div');
  headerRight.className = 'data-app-header-right';
  const mcpStatusPill = document.createElement('div');
  mcpStatusPill.className = 'data-app-pill';
  mcpStatusPill.textContent = 'MCP 空闲';
  const connectionStatusPill = document.createElement('div');
  connectionStatusPill.className = 'data-app-pill';
  connectionStatusPill.textContent = '连接未测试';
  headerRight.appendChild(mcpStatusPill);
  headerRight.appendChild(connectionStatusPill);

  header.appendChild(headerLeft);
  header.appendChild(headerCenter);
  header.appendChild(headerRight);
  if (headerSlot) {
    headerSlot.appendChild(header);
    cleanup.push(() => header.remove());
  } else {
    root.appendChild(header);
  }

  const main = document.createElement('div');
  main.className = 'data-app-main';
  root.appendChild(main);

  const statusBar = document.createElement('div');
  statusBar.className = 'data-app-status';
  root.appendChild(statusBar);

  const statusConnection = document.createElement('div');
  const statusExecution = document.createElement('div');
  const statusMessage = document.createElement('div');
  statusMessage.className = 'data-app-status-message';
  const statusMessageText = document.createElement('div');
  statusMessageText.className = 'data-app-status-text';
  const statusMessageDetails = document.createElement('pre');
  statusMessageDetails.className = 'data-app-status-details';
  statusBar.appendChild(statusConnection);
  statusBar.appendChild(statusExecution);
  statusMessage.appendChild(statusMessageText);
  statusMessage.appendChild(statusMessageDetails);
  statusBar.appendChild(statusMessage);

  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'data-app-modal-backdrop';
  const modalCard = document.createElement('div');
  modalCard.className = 'data-app-modal';
  modalCard.setAttribute('role', 'dialog');
  modalCard.setAttribute('aria-modal', 'true');
  const modalHeader = document.createElement('div');
  modalHeader.className = 'data-app-modal-header';
  const modalTitle = document.createElement('div');
  modalTitle.className = 'data-app-modal-title';
  const modalCloseButton = createIconButton('close', '关闭');
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(modalCloseButton);
  const modalBody = document.createElement('div');
  modalBody.className = 'data-app-modal-body';
  modalCard.appendChild(modalHeader);
  modalCard.appendChild(modalBody);
  modalBackdrop.appendChild(modalCard);
  root.appendChild(modalBackdrop);
  cleanup.push(() => modalBackdrop.remove());

  const state = {
    connections: [],
    selectedConnectionId: '',
    connectionStatus: 'idle',
    connectionStatusDetail: '',
    formOpen: false,
    formMode: 'create',
    formType: defaultFormType,
    formData: {
      name: '',
      host: '',
      port: mysqlDefaultPort,
      user: '',
      password: '',
      authType: 'password',
      ssl: {
        mode: 'keypair',
        caPath: '',
        certPath: '',
        keyPath: '',
        pfxPath: '',
        passphrase: '',
        rejectUnauthorized: true,
      },
      proxy: {
        type: 'none',
        host: '',
        port: '',
        username: '',
        password: '',
      },
      database: '',
      options: '',
    },
    mongoFormData: {
      name: '',
      hosts: '',
      user: '',
      password: '',
      authSource: '',
      authMechanism: '',
      replicaSet: '',
      tls: {
        enabled: false,
        caPath: '',
        certPath: '',
        keyPath: '',
        passphrase: '',
        rejectUnauthorized: true,
      },
      database: '',
      options: '',
    },
    formDatabasesByType: {
      mysql: [],
      mongo: [],
    },
    formCustomDatabasesByType: {
      mysql: [],
      mongo: [],
    },
    formDatabaseSelectedByType: {
      mysql: '',
      mongo: '',
    },
    tabs: [],
    activeTabId: '',
    tabCounter: 1,
    results: null,
    history: [],
    historyScope: 'selected',
    schema: {
      databases: [],
      tables: [],
      columns: [],
      selectedDatabase: '',
      selectedTable: '',
      tableColumns: {},
      tableColumnsLoading: {},
    },
    mcpEvents: [],
    view: 'results',
    busy: {
      connections: false,
      query: false,
      history: false,
      schema: false,
      formDatabases: false,
    },
    lastRun: null,
    message: { text: '', type: 'info', details: '' },
  };

  let schemaModalOpen = false;
  let connectionModalOpen = false;
  let openConnectionModal = () => {};
  let closeConnectionModal = () => {};
  const openSchemaModal = () => {
    schemaModalOpen = true;
    modalBackdrop.style.display = 'flex';
    renderSchemaModal();
  };
  const closeSchemaModal = () => {
    schemaModalOpen = false;
    modalBackdrop.style.display = 'none';
  };

  modalCloseButton.addEventListener('click', closeSchemaModal);
  modalBackdrop.addEventListener('click', (event) => {
    if (event.target === modalBackdrop) closeSchemaModal();
  });
  const handleModalKeydown = (event) => {
    if (event.key !== 'Escape') return;
    if (schemaModalOpen) {
      closeSchemaModal();
    }
    if (connectionModalOpen) {
      closeConnectionModal();
    }
  };
  window.addEventListener('keydown', handleModalKeydown);
  cleanup.push(() => window.removeEventListener('keydown', handleModalKeydown));

  const backendAvailable = typeof host?.backend?.invoke === 'function';

  const setTheme = (theme) => {
    root.dataset.theme = theme || 'light';
  };
  const initialTheme = typeof host?.theme?.get === 'function' ? host.theme.get() : ctx?.theme || 'light';
  setTheme(initialTheme);
  if (typeof host?.theme?.onChange === 'function') {
    const off = host.theme.onChange((theme) => setTheme(theme));
    if (typeof off === 'function') cleanup.push(() => off());
  }

  let editorStatus;
  const editorStatusDefault = editorHint;
  const updateEditorStatus = (text) => {
    if (!editorStatus) return;
    editorStatus.textContent = text || editorStatusDefault;
  };

  const getErrorDetails = (err) => {
    if (!err || typeof err !== 'object') return '';
    if (typeof err.stack === 'string') return err.stack;
    if (err.details && typeof err.details === 'object') {
      if (typeof err.details.stack === 'string') return err.details.stack;
      try {
        return JSON.stringify(err.details, null, 2);
      } catch (_) {
        return '';
      }
    }
    return '';
  };

  const setMessage = (input, type = 'info', options = {}) => {
    const text =
      input && typeof input === 'object' && typeof input.message === 'string'
        ? input.message
        : ensureString(input);
    const details = typeof options.details === 'string' ? options.details : getErrorDetails(input);
    const autoClear = options.autoClear !== false && !(type === 'error' && details);
    state.message = { text, type, details };
    renderStatus();
    updateEditorStatus(text);
    clearTimeout(setMessage._timer);
    if (text && autoClear) {
      setMessage._timer = setTimeout(() => {
        state.message = { text: '', type: 'info', details: '' };
        renderStatus();
        updateEditorStatus('');
      }, 4000);
    }
  };

  const setErrorMessage = (err, prefix = '') => {
    const message =
      err && typeof err === 'object' && typeof err.message === 'string'
        ? err.message
        : ensureString(err || '请求失败');
    const text = prefix ? `${prefix}${message}` : message;
    setMessage(text, 'error', { details: getErrorDetails(err), autoClear: false });
  };

  const invokeBackend = async (method, params) => {
    if (!backendAvailable) throw new Error('后端桥接不可用');
    const response = await host.backend.invoke(method, params);
    return parseBackendResponse(response);
  };

  let lastMcpSelectionKey = '';
  const syncMcpSelection = async () => {
    if (!backendAvailable) return;
    const nextId = state.selectedConnectionId || '';
    const nextDatabase = ensureString(getActiveDatabase()).trim();
    const nextKey = `${nextId}::${nextDatabase}`;
    if (nextKey === lastMcpSelectionKey) return;
    try {
      await invokeBackend(API_MCP_SELECTION_SET, { connectionId: nextId, database: nextDatabase });
      lastMcpSelectionKey = nextKey;
    } catch (err) {
      console.warn('[data-app] failed to sync MCP selection', err);
    }
  };

  let renderHeaderControls = () => {};
  let renderMcpActivity = () => {};
  let renderSchemaModal = () => {};

  let lastMcpEventId = '';
  let mcpPollBusy = false;
  let mcpPollTimer = null;
  let mcpIdleCount = 0;

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
  const applyMcpEvent = (event) => {
    if (!event || typeof event !== 'object') return;
    const normalizedEvent = {
      ...event,
      at: event.at || new Date().toISOString(),
    };
    state.mcpEvents.unshift(normalizedEvent);
    state.mcpEvents = state.mcpEvents.slice(0, MAX_MCP_EVENTS);
    renderMcpActivity();
    renderHeaderControls();
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
      state.results = {
        rows: result.rows,
        fields: result.fields,
        durationMs: result.durationMs,
        rowCount,
        warnings: undefined,
      };
      state.lastRun = { durationMs: result.durationMs, rowCount };
      state.view = 'results';
      renderView();
      renderResults();
      renderStatus();
    }
    const tool = ensureString(event.tool).trim();
    const normalizedTool = stripMcpPrefix(tool);
    if (normalizedTool === mcpToolNames.listTables && Array.isArray(result?.rows)) {
      state.schema.tables = result.rows;
      state.schema.selectedTable = '';
      state.schema.columns = [];
      renderSchema();
    }
    if (normalizedTool === mcpToolNames.listTables) {
      const mcpListMessage = mcpMessages.listTables || mcpMessages.default;
      if (typeof mcpListMessage === 'function') {
        setMessage(mcpListMessage(result?.rowCount));
      } else if (typeof mcpListMessage === 'string') {
        setMessage(mcpListMessage);
      } else {
        setMessage(`MCP 已获取 ${result?.rowCount ?? 0} 张表`);
      }
    } else if (normalizedTool === mcpToolNames.executeQuery) {
      const mcpExecuteMessage = mcpMessages.executeQuery || mcpMessages.execute || mcpMessages.default;
      if (typeof mcpExecuteMessage === 'function') {
        setMessage(mcpExecuteMessage(result?.rowCount));
      } else if (typeof mcpExecuteMessage === 'string') {
        setMessage(mcpExecuteMessage);
      } else {
        setMessage(`MCP 已执行 ${queryLabel} · ${result?.rowCount ?? '-'} 行`);
      }
    } else {
      const defaultMessage = mcpMessages.default;
      if (typeof defaultMessage === 'function') {
        setMessage(defaultMessage(event));
      } else if (typeof defaultMessage === 'string') {
        setMessage(defaultMessage);
      } else {
        setMessage('MCP 已更新结果');
      }
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
      const data = await invokeBackend(API_MCP_EVENT_LATEST, { after: lastMcpEventId });
      const event = data?.event;
      if (event && typeof event === 'object') {
        const nextId = ensureString(event.id || event.at).trim();
        if (nextId && nextId !== lastMcpEventId) {
          lastMcpEventId = nextId;
          applyMcpEvent(event);
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

  if (backendAvailable) {
    scheduleMcpPoll(0);
    cleanup.push(() => {
      if (mcpPollTimer) clearTimeout(mcpPollTimer);
    });
  }

  const leftPanel = document.createElement('section');
  leftPanel.className = 'data-app-panel data-app-panel-left';
  main.appendChild(leftPanel);

  const leftHeader = document.createElement('div');
  leftHeader.className = 'data-app-panel-header';
  leftPanel.appendChild(leftHeader);

  const leftTitle = document.createElement('div');
  leftTitle.textContent = '连接管理';
  leftTitle.style.fontWeight = '600';

  const leftHeaderActions = document.createElement('div');
  leftHeaderActions.className = 'data-app-icon-group';
  const newConnectionButton = createIconButton('plus', '新建连接');
  const refreshConnectionsButton = createIconButton('refresh', '刷新连接');
  leftHeaderActions.appendChild(newConnectionButton);
  leftHeaderActions.appendChild(refreshConnectionsButton);
  leftHeader.appendChild(leftTitle);
  leftHeader.appendChild(leftHeaderActions);

  const leftBody = document.createElement('div');
  leftBody.className = 'data-app-panel-body';
  leftPanel.appendChild(leftBody);

  const connectionList = document.createElement('div');
  connectionList.className = 'data-app-list';

  const connectionForm = document.createElement('div');
  connectionForm.className = 'data-app-section';
  connectionForm.style.display = 'none';

  const formTitle = document.createElement('div');
  formTitle.className = 'data-app-modal-title';
  formTitle.textContent = '新建连接';

  const nameInput = document.createElement('input');
  nameInput.className = 'data-app-input';
  nameInput.placeholder = '连接名称';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'data-app-select';
  const typeMysqlOption = document.createElement('option');
  typeMysqlOption.value = 'mysql';
  typeMysqlOption.textContent = 'MySQL';
  const typeMongoOption = document.createElement('option');
  typeMongoOption.value = 'mongo';
  typeMongoOption.textContent = 'MongoDB';
  typeSelect.appendChild(typeMysqlOption);
  typeSelect.appendChild(typeMongoOption);

  const hostInput = document.createElement('input');
  hostInput.className = 'data-app-input';
  hostInput.placeholder = '数据库地址';

  const portInput = document.createElement('input');
  portInput.className = 'data-app-input';
  portInput.placeholder = '端口';

  const userInput = document.createElement('input');
  userInput.className = 'data-app-input';
  userInput.placeholder = '用户名';

  const authTypeSelect = document.createElement('select');
  authTypeSelect.className = 'data-app-select';
  const authPasswordOption = document.createElement('option');
  authPasswordOption.value = 'password';
  authPasswordOption.textContent = '用户名密码';
  const authCertOption = document.createElement('option');
  authCertOption.value = 'certificate';
  authCertOption.textContent = '证书登录';
  authTypeSelect.appendChild(authPasswordOption);
  authTypeSelect.appendChild(authCertOption);

  const passwordInput = document.createElement('input');
  passwordInput.className = 'data-app-input';
  passwordInput.type = 'password';
  passwordInput.placeholder = '密码（编辑时留空保持不变）';

  const sslModeSelect = document.createElement('select');
  sslModeSelect.className = 'data-app-select';
  const sslModeKeypairOption = document.createElement('option');
  sslModeKeypairOption.value = 'keypair';
  sslModeKeypairOption.textContent = '证书 + 私钥（PEM）';
  const sslModePfxOption = document.createElement('option');
  sslModePfxOption.value = 'pfx';
  sslModePfxOption.textContent = '证书文件（PFX/P12）';
  sslModeSelect.appendChild(sslModeKeypairOption);
  sslModeSelect.appendChild(sslModePfxOption);

  const sslCaInput = document.createElement('input');
  sslCaInput.className = 'data-app-input';
  sslCaInput.placeholder = 'CA 证书路径（可选）';

  const sslCertInput = document.createElement('input');
  sslCertInput.className = 'data-app-input';
  sslCertInput.placeholder = '客户端证书路径';

  const sslKeyInput = document.createElement('input');
  sslKeyInput.className = 'data-app-input';
  sslKeyInput.placeholder = '客户端私钥路径';

  const sslPfxInput = document.createElement('input');
  sslPfxInput.className = 'data-app-input';
  sslPfxInput.placeholder = '证书文件路径（.pfx/.p12）';

  const sslPassphraseInput = document.createElement('input');
  sslPassphraseInput.className = 'data-app-input';
  sslPassphraseInput.type = 'password';
  sslPassphraseInput.placeholder = '证书口令（可选，留空保持不变）';

  const sslVerifySelect = document.createElement('select');
  sslVerifySelect.className = 'data-app-select';
  const sslVerifyOn = document.createElement('option');
  sslVerifyOn.value = 'true';
  sslVerifyOn.textContent = '校验证书';
  const sslVerifyOff = document.createElement('option');
  sslVerifyOff.value = 'false';
  sslVerifyOff.textContent = '忽略校验';
  sslVerifySelect.appendChild(sslVerifyOn);
  sslVerifySelect.appendChild(sslVerifyOff);

  const sslFieldGroup = document.createElement('div');
  sslFieldGroup.className = 'data-app-field-group';
  sslFieldGroup.style.display = 'none';
  const sslModeField = createField('证书方式', sslModeSelect);
  const sslKeypairGroup = document.createElement('div');
  sslKeypairGroup.className = 'data-app-field-group';
  const sslPfxGroup = document.createElement('div');
  sslPfxGroup.className = 'data-app-field-group';
  const sslCommonGroup = document.createElement('div');
  sslCommonGroup.className = 'data-app-field-group';
  const sslCaField = createField(
    'CA 证书（可选）',
    createFilePicker(sslCaInput, { accept: '.pem,.crt,.cer,.key' })
  );
  const sslCertField = createField(
    '客户端证书',
    createFilePicker(sslCertInput, { accept: '.pem,.crt,.cer' })
  );
  const sslKeyField = createField(
    '客户端私钥',
    createFilePicker(sslKeyInput, { accept: '.key,.pem' })
  );
  const sslPfxField = createField(
    '证书文件',
    createFilePicker(sslPfxInput, { accept: '.pfx,.p12,.pem' })
  );
  const sslPassField = createField('证书口令', sslPassphraseInput);
  const sslVerifyField = createField('证书校验', sslVerifySelect);
  sslKeypairGroup.appendChild(sslCaField);
  sslKeypairGroup.appendChild(sslCertField);
  sslKeypairGroup.appendChild(sslKeyField);
  sslPfxGroup.appendChild(sslPfxField);
  sslCommonGroup.appendChild(sslPassField);
  sslCommonGroup.appendChild(sslVerifyField);
  sslFieldGroup.appendChild(sslModeField);
  sslFieldGroup.appendChild(sslKeypairGroup);
  sslFieldGroup.appendChild(sslPfxGroup);
  sslFieldGroup.appendChild(sslCommonGroup);

  const proxyTypeSelect = document.createElement('select');
  proxyTypeSelect.className = 'data-app-select';
  const proxyNoneOption = document.createElement('option');
  proxyNoneOption.value = 'none';
  proxyNoneOption.textContent = '不使用代理';
  const proxyHttpOption = document.createElement('option');
  proxyHttpOption.value = 'http';
  proxyHttpOption.textContent = 'HTTP CONNECT';
  const proxySocksOption = document.createElement('option');
  proxySocksOption.value = 'socks5';
  proxySocksOption.textContent = 'SOCKS5';
  proxyTypeSelect.appendChild(proxyNoneOption);
  proxyTypeSelect.appendChild(proxyHttpOption);
  proxyTypeSelect.appendChild(proxySocksOption);

  const proxyHostInput = document.createElement('input');
  proxyHostInput.className = 'data-app-input';
  proxyHostInput.placeholder = '代理地址';

  const proxyPortInput = document.createElement('input');
  proxyPortInput.className = 'data-app-input';
  proxyPortInput.placeholder = '代理端口';

  const proxyUserInput = document.createElement('input');
  proxyUserInput.className = 'data-app-input';
  proxyUserInput.placeholder = '代理用户名（可选）';

  const proxyPasswordInput = document.createElement('input');
  proxyPasswordInput.className = 'data-app-input';
  proxyPasswordInput.type = 'password';
  proxyPasswordInput.placeholder = '代理密码（可选，留空保持不变）';

  const proxyFieldGroup = document.createElement('div');
  proxyFieldGroup.className = 'data-app-field-group';
  proxyFieldGroup.style.display = 'none';
  proxyFieldGroup.appendChild(createField('代理地址', proxyHostInput));
  proxyFieldGroup.appendChild(createField('代理端口', proxyPortInput));
  proxyFieldGroup.appendChild(createField('代理用户名', proxyUserInput));
  proxyFieldGroup.appendChild(createField('代理密码', proxyPasswordInput));

  const mongoHostsInput = document.createElement('input');
  mongoHostsInput.className = 'data-app-input';
  mongoHostsInput.placeholder = '主机列表，例如: host1:27017,host2:27017';

  const mongoReplicaSetInput = document.createElement('input');
  mongoReplicaSetInput.className = 'data-app-input';
  mongoReplicaSetInput.placeholder = '副本集名称（可选）';

  const mongoUserInput = document.createElement('input');
  mongoUserInput.className = 'data-app-input';
  mongoUserInput.placeholder = '用户名（可选）';

  const mongoPasswordInput = document.createElement('input');
  mongoPasswordInput.className = 'data-app-input';
  mongoPasswordInput.type = 'password';
  mongoPasswordInput.placeholder = '密码（可选，编辑时留空保持不变）';

  const mongoAuthSourceInput = document.createElement('input');
  mongoAuthSourceInput.className = 'data-app-input';
  mongoAuthSourceInput.placeholder = '认证库（authSource，可选）';

  const mongoAuthMechanismSelect = document.createElement('select');
  mongoAuthMechanismSelect.className = 'data-app-select';
  const mongoAuthMechanismAuto = document.createElement('option');
  mongoAuthMechanismAuto.value = '';
  mongoAuthMechanismAuto.textContent = '自动选择';
  const mongoAuthMechanismSha1 = document.createElement('option');
  mongoAuthMechanismSha1.value = 'SCRAM-SHA-1';
  mongoAuthMechanismSha1.textContent = 'SCRAM-SHA-1';
  const mongoAuthMechanismSha256 = document.createElement('option');
  mongoAuthMechanismSha256.value = 'SCRAM-SHA-256';
  mongoAuthMechanismSha256.textContent = 'SCRAM-SHA-256';
  const mongoAuthMechanismX509 = document.createElement('option');
  mongoAuthMechanismX509.value = 'MONGODB-X509';
  mongoAuthMechanismX509.textContent = 'MONGODB-X509';
  mongoAuthMechanismSelect.appendChild(mongoAuthMechanismAuto);
  mongoAuthMechanismSelect.appendChild(mongoAuthMechanismSha1);
  mongoAuthMechanismSelect.appendChild(mongoAuthMechanismSha256);
  mongoAuthMechanismSelect.appendChild(mongoAuthMechanismX509);

  const mongoTlsSelect = document.createElement('select');
  mongoTlsSelect.className = 'data-app-select';
  const mongoTlsOffOption = document.createElement('option');
  mongoTlsOffOption.value = 'false';
  mongoTlsOffOption.textContent = '不启用 TLS';
  const mongoTlsOnOption = document.createElement('option');
  mongoTlsOnOption.value = 'true';
  mongoTlsOnOption.textContent = '启用 TLS';
  mongoTlsSelect.appendChild(mongoTlsOffOption);
  mongoTlsSelect.appendChild(mongoTlsOnOption);

  const mongoTlsCaInput = document.createElement('input');
  mongoTlsCaInput.className = 'data-app-input';
  mongoTlsCaInput.placeholder = 'CA 证书路径（可选）';

  const mongoTlsCertInput = document.createElement('input');
  mongoTlsCertInput.className = 'data-app-input';
  mongoTlsCertInput.placeholder = '客户端证书路径';

  const mongoTlsKeyInput = document.createElement('input');
  mongoTlsKeyInput.className = 'data-app-input';
  mongoTlsKeyInput.placeholder = '客户端私钥路径';

  const mongoTlsPassphraseInput = document.createElement('input');
  mongoTlsPassphraseInput.className = 'data-app-input';
  mongoTlsPassphraseInput.type = 'password';
  mongoTlsPassphraseInput.placeholder = '证书口令（可选，留空保持不变）';

  const mongoTlsVerifySelect = document.createElement('select');
  mongoTlsVerifySelect.className = 'data-app-select';
  const mongoTlsVerifyOn = document.createElement('option');
  mongoTlsVerifyOn.value = 'true';
  mongoTlsVerifyOn.textContent = '校验证书';
  const mongoTlsVerifyOff = document.createElement('option');
  mongoTlsVerifyOff.value = 'false';
  mongoTlsVerifyOff.textContent = '忽略校验';
  mongoTlsVerifySelect.appendChild(mongoTlsVerifyOn);
  mongoTlsVerifySelect.appendChild(mongoTlsVerifyOff);

  const mongoTlsDetailsGroup = document.createElement('div');
  mongoTlsDetailsGroup.className = 'data-app-field-group';
  mongoTlsDetailsGroup.style.display = 'none';
  mongoTlsDetailsGroup.appendChild(
    createField('CA 证书（可选）', createFilePicker(mongoTlsCaInput, { accept: '.pem,.crt,.cer,.key' }))
  );
  mongoTlsDetailsGroup.appendChild(
    createField('客户端证书', createFilePicker(mongoTlsCertInput, { accept: '.pem,.crt,.cer' }))
  );
  mongoTlsDetailsGroup.appendChild(
    createField('客户端私钥', createFilePicker(mongoTlsKeyInput, { accept: '.key,.pem' }))
  );
  mongoTlsDetailsGroup.appendChild(createField('证书口令', mongoTlsPassphraseInput));
  mongoTlsDetailsGroup.appendChild(createField('证书校验', mongoTlsVerifySelect));

  const formDatabaseSelect = document.createElement('select');
  formDatabaseSelect.className = 'data-app-select';

  const fetchDatabasesButton = createButton('获取数据库');

  const databaseFieldRow = document.createElement('div');
  databaseFieldRow.className = 'data-app-field-row';
  databaseFieldRow.appendChild(formDatabaseSelect);
  databaseFieldRow.appendChild(fetchDatabasesButton);

  const databaseFieldGroup = document.createElement('div');
  databaseFieldGroup.className = 'data-app-field-group';
  databaseFieldGroup.appendChild(databaseFieldRow);

  const optionsInput = document.createElement('textarea');
  optionsInput.className = 'data-app-textarea';
  optionsInput.placeholder = '连接池参数（JSON，可选）';

  const authTypeField = createField('认证方式', authTypeSelect);
  const passwordField = createField('密码', passwordInput);
  const proxyTypeField = createField('代理类型', proxyTypeSelect);
  const typeField = createField('连接类型', typeSelect);
  const nameField = createField('名称', nameInput);
  const databaseField = createField('数据库', databaseFieldGroup);
  const optionsField = createField('连接池参数', optionsInput);

  const mysqlFieldsWrap = document.createElement('div');
  mysqlFieldsWrap.className = 'data-app-field-group';

  const mongoFieldsWrap = document.createElement('div');
  mongoFieldsWrap.className = 'data-app-field-group';
  mongoFieldsWrap.style.display = 'none';

  const formButtons = document.createElement('div');
  formButtons.className = 'data-app-toolbar';
  const saveConnectionButton = createButton('保存', 'primary');
  const cancelConnectionButton = createButton('取消', 'ghost');
  formButtons.appendChild(saveConnectionButton);
  formButtons.appendChild(cancelConnectionButton);

  mysqlFieldsWrap.appendChild(createField('主机', hostInput));
  mysqlFieldsWrap.appendChild(createField('端口', portInput));
  mysqlFieldsWrap.appendChild(createField('用户名', userInput));
  mysqlFieldsWrap.appendChild(authTypeField);
  mysqlFieldsWrap.appendChild(passwordField);
  mysqlFieldsWrap.appendChild(sslFieldGroup);
  mysqlFieldsWrap.appendChild(proxyTypeField);
  mysqlFieldsWrap.appendChild(proxyFieldGroup);

  mongoFieldsWrap.appendChild(createField('主机列表', mongoHostsInput));
  mongoFieldsWrap.appendChild(createField('副本集名称', mongoReplicaSetInput));
  mongoFieldsWrap.appendChild(createField('用户名', mongoUserInput));
  mongoFieldsWrap.appendChild(createField('密码', mongoPasswordInput));
  mongoFieldsWrap.appendChild(createField('认证库', mongoAuthSourceInput));
  mongoFieldsWrap.appendChild(createField('认证机制', mongoAuthMechanismSelect));
  mongoFieldsWrap.appendChild(createField('TLS', mongoTlsSelect));
  mongoFieldsWrap.appendChild(mongoTlsDetailsGroup);

  connectionForm.appendChild(typeField);
  connectionForm.appendChild(nameField);
  connectionForm.appendChild(mysqlFieldsWrap);
  connectionForm.appendChild(mongoFieldsWrap);
  connectionForm.appendChild(formButtons);

  const connectionModalBackdrop = document.createElement('div');
  connectionModalBackdrop.className = 'data-app-modal-backdrop';
  const connectionModalCard = document.createElement('div');
  connectionModalCard.className = 'data-app-modal data-app-connection-modal';
  connectionModalCard.setAttribute('role', 'dialog');
  connectionModalCard.setAttribute('aria-modal', 'true');
  const connectionModalHeader = document.createElement('div');
  connectionModalHeader.className = 'data-app-modal-header';
  const connectionModalCloseButton = createIconButton('close', '关闭');
  connectionModalHeader.appendChild(formTitle);
  connectionModalHeader.appendChild(connectionModalCloseButton);
  const connectionModalBody = document.createElement('div');
  connectionModalBody.className = 'data-app-modal-body';
  connectionModalBody.appendChild(connectionForm);
  connectionModalCard.appendChild(connectionModalHeader);
  connectionModalCard.appendChild(connectionModalBody);
  connectionModalBackdrop.appendChild(connectionModalCard);
  root.appendChild(connectionModalBackdrop);
  cleanup.push(() => connectionModalBackdrop.remove());

  openConnectionModal = () => {
    connectionModalOpen = true;
    connectionModalBackdrop.style.display = 'flex';
    connectionForm.style.display = 'flex';
  };

  closeConnectionModal = () => {
    connectionModalOpen = false;
    state.formOpen = false;
    connectionModalBackdrop.style.display = 'none';
    connectionForm.style.display = 'none';
  };

  connectionModalCloseButton.addEventListener('click', () => closeConnectionModal());
  connectionModalBackdrop.addEventListener('click', (event) => {
    if (event.target === connectionModalBackdrop) closeConnectionModal();
  });

  const connectionListWrap = document.createElement('div');
  connectionListWrap.className = 'data-app-list-wrap';
  connectionListWrap.appendChild(connectionList);

  leftBody.appendChild(connectionListWrap);

  const centerPanel = document.createElement('section');
  centerPanel.className = 'data-app-panel data-app-panel-center';
  main.appendChild(centerPanel);

  const centerHeader = document.createElement('div');
  centerHeader.className = 'data-app-panel-header';
  centerPanel.appendChild(centerHeader);

  const centerTitle = document.createElement('div');
  centerTitle.textContent = editorTitleText;
  centerTitle.style.fontWeight = '600';

  const addTabButton = createButton('新建标签');
  centerHeader.appendChild(centerTitle);
  centerHeader.appendChild(addTabButton);

  const centerBody = document.createElement('div');
  centerBody.className = 'data-app-panel-body';
  centerPanel.appendChild(centerBody);

  const tabsRow = document.createElement('div');
  tabsRow.className = 'data-app-tabs';

  const editorToolbar = document.createElement('div');
  editorToolbar.className = 'data-app-toolbar';

  const runButton = createButton(editorRunLabel, 'primary');
  const clearButton = createButton('清空');
  editorToolbar.appendChild(runButton);
  editorToolbar.appendChild(clearButton);

  const editorWrap = document.createElement('div');
  editorWrap.className = 'data-app-editor-wrap';
  const editorGutter = document.createElement('div');
  editorGutter.className = 'data-app-editor-gutter';
  const editorGutterInner = document.createElement('div');
  editorGutterInner.className = 'data-app-editor-gutter-inner';
  editorGutter.appendChild(editorGutterInner);
  const editorArea = document.createElement('div');
  editorArea.className = 'data-app-editor-area';
  const editorScroll = document.createElement('div');
  editorScroll.className = 'data-app-editor-scroll';
  const editorHighlight = document.createElement('pre');
  editorHighlight.className = 'data-app-editor-highlight';
  const sqlEditor = document.createElement('textarea');
  sqlEditor.className = 'data-app-editor-input data-app-editor';
  sqlEditor.placeholder = editorPlaceholder;
  const editorSuggest = document.createElement('div');
  editorSuggest.className = 'data-app-editor-suggest';
  editorSuggest.style.display = 'none';
  editorScroll.appendChild(editorHighlight);
  editorScroll.appendChild(sqlEditor);
  editorArea.appendChild(editorScroll);
  editorArea.appendChild(editorSuggest);
  editorWrap.appendChild(editorGutter);
  editorWrap.appendChild(editorArea);

  centerBody.appendChild(tabsRow);
  centerBody.appendChild(editorToolbar);
  centerBody.appendChild(editorWrap);
  editorStatus = document.createElement('div');
  editorStatus.className = 'data-app-editor-status';
  updateEditorStatus('');
  centerBody.appendChild(editorStatus);

  const rightPanel = document.createElement('section');
  rightPanel.className = 'data-app-panel data-app-panel-right';
  main.appendChild(rightPanel);

  const rightBody = document.createElement('div');
  rightBody.className = 'data-app-panel-body';
  rightPanel.appendChild(rightBody);

  const resultsView = document.createElement('div');
  resultsView.className = 'data-app-section data-app-section-grow';

  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'data-app-section-header';
  const resultsTitle = document.createElement('div');
  resultsTitle.className = 'data-app-section-title';
  resultsTitle.textContent = '结果';

  const resultsToolbar = document.createElement('div');
  resultsToolbar.className = 'data-app-toolbar';
  const resultsSummary = document.createElement('div');
  resultsSummary.className = 'data-app-meta';
  const exportButton = createButton('导出 CSV');
  resultsToolbar.appendChild(resultsSummary);
  resultsToolbar.appendChild(exportButton);

  const resultsTableWrap = document.createElement('div');
  resultsTableWrap.className = 'data-app-table-wrap data-app-results-table-wrap';

  resultsHeader.appendChild(resultsTitle);
  resultsHeader.appendChild(resultsToolbar);
  resultsView.appendChild(resultsHeader);
  resultsView.appendChild(resultsTableWrap);

  const historyView = document.createElement('div');
  historyView.className = 'data-app-section data-app-section-grow';

  const historyHeader = document.createElement('div');
  historyHeader.className = 'data-app-section-header';
  const historyTitle = document.createElement('div');
  historyTitle.className = 'data-app-section-title';
  historyTitle.textContent = '查询历史';
  const historyHeaderActions = document.createElement('div');
  historyHeaderActions.className = 'data-app-icon-group';

  const historyRefreshButton = createIconButton('refresh', '刷新历史');
  const historyClearButton = createIconButton('trash', '清空历史', 'danger');
  historyHeaderActions.appendChild(historyRefreshButton);
  historyHeaderActions.appendChild(historyClearButton);
  historyHeader.appendChild(historyTitle);
  historyHeader.appendChild(historyHeaderActions);

  const historyToolbar = document.createElement('div');
  historyToolbar.className = 'data-app-toolbar';
  const historyScopeSelect = document.createElement('select');
  historyScopeSelect.className = 'data-app-select';
  const scopeOptionSelected = document.createElement('option');
  scopeOptionSelected.value = 'selected';
  scopeOptionSelected.textContent = '当前连接';
  const scopeOptionAll = document.createElement('option');
  scopeOptionAll.value = 'all';
  scopeOptionAll.textContent = '全部连接';
  historyScopeSelect.appendChild(scopeOptionSelected);
  historyScopeSelect.appendChild(scopeOptionAll);

  historyToolbar.appendChild(historyScopeSelect);

  const historyList = document.createElement('div');
  historyList.className = 'data-app-list';

  const historyListWrap = document.createElement('div');
  historyListWrap.className = 'data-app-list-wrap';
  historyListWrap.appendChild(historyList);

  historyView.appendChild(historyHeader);
  historyView.appendChild(historyToolbar);
  historyView.appendChild(historyListWrap);

  const schemaView = document.createElement('div');
  schemaView.className = 'data-app-section data-app-section-grow data-app-schema-view';

  const schemaHeader = document.createElement('div');
  schemaHeader.className = 'data-app-section-header';
  const schemaTitle = document.createElement('div');
  schemaTitle.className = 'data-app-section-title';
  schemaTitle.textContent = '结构';

  const schemaToolbar = document.createElement('div');
  schemaToolbar.className = 'data-app-toolbar';
  const databaseSelect = document.createElement('select');
  databaseSelect.className = 'data-app-select';
  const schemaRefreshButton = createIconButton('refresh', '刷新结构');
  schemaToolbar.appendChild(databaseSelect);
  schemaToolbar.appendChild(schemaRefreshButton);

  const schemaSection = document.createElement('div');
  schemaSection.className = 'data-app-schema-section';

  const tablesList = document.createElement('div');
  tablesList.className = 'data-app-list';
  const tablesListWrap = document.createElement('div');
  tablesListWrap.className = 'data-app-list-wrap';
  tablesListWrap.appendChild(tablesList);
  const schemaResizer = document.createElement('div');
  schemaResizer.className = 'data-app-schema-resizer';
  const columnsWrap = document.createElement('div');
  columnsWrap.className = 'data-app-table-wrap data-app-schema-columns';

  schemaSection.appendChild(tablesListWrap);
  schemaSection.appendChild(schemaResizer);
  schemaSection.appendChild(columnsWrap);

  const schemaModalEnabled = true;
  if (schemaModalEnabled) {
    schemaSection.classList.add('data-app-schema-modal');
  }

  schemaHeader.appendChild(schemaTitle);
  schemaHeader.appendChild(schemaToolbar);
  schemaView.appendChild(schemaHeader);
  schemaView.appendChild(schemaSection);

  const mcpView = document.createElement('div');
  mcpView.className = 'data-app-section data-app-section-grow';
  const mcpHeader = document.createElement('div');
  mcpHeader.className = 'data-app-section-header';
  const mcpTitle = document.createElement('div');
  mcpTitle.className = 'data-app-section-title';
  mcpTitle.textContent = 'MCP 活动';
  mcpHeader.appendChild(mcpTitle);
  const mcpList = document.createElement('div');
  mcpList.className = 'data-app-list';
  const mcpListWrap = document.createElement('div');
  mcpListWrap.className = 'data-app-list-wrap';
  mcpListWrap.appendChild(mcpList);
  mcpView.appendChild(mcpHeader);
  mcpView.appendChild(mcpListWrap);

  if (!schemaModalEnabled) {
    const SCHEMA_MIN_LEFT = 180;
    const SCHEMA_MIN_RIGHT = 280;

    const clampSchemaLeft = (value) => {
      const sectionRect = schemaSection.getBoundingClientRect();
      const resizerWidth = schemaResizer.getBoundingClientRect().width || 0;
      const maxLeft = Math.max(SCHEMA_MIN_LEFT, sectionRect.width - SCHEMA_MIN_RIGHT - resizerWidth);
      return Math.min(maxLeft, Math.max(SCHEMA_MIN_LEFT, value));
    };

    const setSchemaLeft = (value) => {
      schemaSection.style.setProperty('--data-app-schema-left', `${Math.round(value)}px`);
    };

    const handleSchemaResize = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startLeft = tablesListWrap.getBoundingClientRect().width;

      const onMove = (moveEvent) => {
        const nextLeft = clampSchemaLeft(startLeft + (moveEvent.clientX - startX));
        setSchemaLeft(nextLeft);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const normalizeSchemaWidth = () => {
      if (!schemaView.isConnected || schemaView.offsetParent === null) return;
      const currentLeft = tablesListWrap.getBoundingClientRect().width;
      const nextLeft = clampSchemaLeft(currentLeft);
      if (Math.round(nextLeft) !== Math.round(currentLeft)) {
        setSchemaLeft(nextLeft);
      }
    };

    schemaResizer.addEventListener('mousedown', handleSchemaResize);
    cleanup.push(() => schemaResizer.removeEventListener('mousedown', handleSchemaResize));
    window.addEventListener('resize', normalizeSchemaWidth);
    cleanup.push(() => window.removeEventListener('resize', normalizeSchemaWidth));
  }

  centerBody.appendChild(resultsView);
  leftBody.appendChild(historyView);
  rightBody.appendChild(schemaView);
  rightBody.appendChild(mcpView);

  const setBusy = (key, value) => {
    state.busy[key] = value;
    updateButtons();
  };

  const updateButtons = () => {
    const hasConnection = Boolean(state.selectedConnectionId);
    newConnectionButton.disabled = !backendAvailable || state.busy.connections;
    refreshConnectionsButton.disabled = !backendAvailable || state.busy.connections;
    saveConnectionButton.disabled = !backendAvailable || state.busy.connections;
    fetchDatabasesButton.disabled = !backendAvailable || state.busy.formDatabases;
    fetchDatabasesButton.textContent = state.busy.formDatabases ? '获取中...' : '获取数据库';
    headerConnectionSelect.disabled = !backendAvailable || state.busy.connections;
    headerDatabaseSelect.disabled = !backendAvailable || !hasConnection || state.busy.schema;
    runButton.disabled = !backendAvailable || !hasConnection || state.busy.query || !ensureString(sqlEditor.value).trim();
    clearButton.disabled = state.busy.query;
    addTabButton.disabled = state.busy.query;
    exportButton.disabled = !state.results || !Array.isArray(state.results.rows) || state.results.rows.length === 0;
    historyRefreshButton.disabled = !backendAvailable || state.busy.history;
    historyClearButton.disabled = !backendAvailable || state.busy.history;
    schemaRefreshButton.disabled = !backendAvailable || state.busy.schema || !hasConnection;
  };

  const editorState = {
    suggestions: [],
    activeIndex: 0,
    open: false,
    lineCount: 0,
  };

  const sqlMirror = document.createElement('div');
  sqlMirror.style.position = 'absolute';
  sqlMirror.style.top = '0';
  sqlMirror.style.left = '-9999px';
  sqlMirror.style.visibility = 'hidden';
  sqlMirror.style.whiteSpace = 'pre-wrap';
  sqlMirror.style.wordBreak = 'break-word';
  sqlMirror.style.boxSizing = 'border-box';
  document.body.appendChild(sqlMirror);
  cleanup.push(() => sqlMirror.remove());

  const updateMirrorStyles = () => {
    const style = window.getComputedStyle(sqlEditor);
    sqlMirror.style.width = `${sqlEditor.clientWidth}px`;
    sqlMirror.style.font = style.font;
    sqlMirror.style.padding = style.padding;
    sqlMirror.style.border = style.border;
    sqlMirror.style.lineHeight = style.lineHeight;
    sqlMirror.style.letterSpacing = style.letterSpacing;
  };

  const escapeHtml = (value) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const sqlKeywordPattern = SQL_KEYWORDS.join('|');
  const sqlTokenRegex = new RegExp(
    '(--[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|\\\'(?:\\\\\\\'|[^\\\'])*\\\'|"(?:\\\\"|[^"])*"|`(?:\\\\`|[^`])*`|\\b\\d+(?:\\.\\d+)?\\b|\\b(?:' +
      sqlKeywordPattern +
      ')\\b)',
    'gi',
  );

  const highlightSql = (value) => {
    if (!value) return '';
    let result = '';
    let lastIndex = 0;
    for (const match of value.matchAll(sqlTokenRegex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      result += escapeHtml(value.slice(lastIndex, start));
      const token = match[0];
      let className = 'data-app-sql-keyword';
      if (token.startsWith('--') || token.startsWith('/*') || token.startsWith('#')) {
        className = 'data-app-sql-comment';
      } else if (token.startsWith("'") || token.startsWith('"')) {
        className = 'data-app-sql-string';
      } else if (token.startsWith('`')) {
        className = 'data-app-sql-identifier';
      } else if (/^[0-9]/.test(token)) {
        className = 'data-app-sql-number';
      }
      result += `<span class="${className}">${escapeHtml(token)}</span>`;
      lastIndex = end;
    }
    result += escapeHtml(value.slice(lastIndex));
    return result;
  };

  const updateHighlight = () => {
    const html = highlightSql(sqlEditor.value || '');
    editorHighlight.innerHTML = html || ' ';
  };

  const updateLineNumbers = () => {
    const lineCount = Math.max(1, (sqlEditor.value || '').split('\n').length);
    if (lineCount === editorState.lineCount) return;
    editorState.lineCount = lineCount;
    editorGutterInner.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (let i = 1; i <= lineCount; i += 1) {
      const line = document.createElement('div');
      line.textContent = String(i);
      fragment.appendChild(line);
    }
    editorGutterInner.appendChild(fragment);
  };

  const syncEditorScroll = () => {
    const scrollTop = sqlEditor.scrollTop;
    const scrollLeft = sqlEditor.scrollLeft;
    editorHighlight.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    editorGutterInner.style.transform = `translateY(${-scrollTop}px)`;
    if (editorState.open) {
      positionSuggestions();
    }
  };

  const updateEditorView = () => {
    updateHighlight();
    updateLineNumbers();
    syncEditorScroll();
  };

  const getTokenAtCursor = (value, cursor) => {
    const left = value.slice(0, cursor);
    const right = value.slice(cursor);
    const leftMatch = left.match(/[A-Za-z0-9_]+$/);
    const rightMatch = right.match(/^[A-Za-z0-9_]+/);
    const start = leftMatch ? cursor - leftMatch[0].length : cursor;
    const end = rightMatch ? cursor + rightMatch[0].length : cursor;
    const token = value.slice(start, end);
    const beforeChar = left.slice(-1);
    return { token, start, end, beforeChar };
  };

  const getLineBeforeCursor = (value, cursor) => {
    const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
    return {
      text: value.slice(lineStart, cursor),
      lineStart,
    };
  };

  const isCompleteExpression = (lineText) => {
    const trimmed = ensureString(lineText).trim();
    if (!trimmed) return false;
    const stack = [];
    for (let i = 0; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        i += 1;
        for (; i < trimmed.length; i += 1) {
          if (trimmed[i] === '\\') {
            i += 1;
            continue;
          }
          if (trimmed[i] === quote) break;
        }
        continue;
      }
      if (ch === '(') {
        stack.push(')');
      } else if (ch === '[') {
        stack.push(']');
      } else if (ch === '{') {
        stack.push('}');
      } else if (stack.length > 0 && ch === stack[stack.length - 1]) {
        stack.pop();
      }
    }
    if (stack.length > 0) return false;
    if (/\.\s*$/.test(trimmed)) return false;
    if (/[\s(]*[=<>!+\-*/%&|^~]\s*$/i.test(trimmed)) return false;
    if (/\b(and|or)\s*$/i.test(trimmed)) return false;
    return true;
  };

  const normalizeIdentifier = (value) => {
    const trimmed = ensureString(value).trim();
    if (!trimmed) return '';
    return trimmed.replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/[;,)]$/g, '');
  };

  const normalizeTableName = (value) => {
    const normalized = normalizeIdentifier(value);
    if (!normalized) return '';
    const parts = normalized.split('.');
    return normalizeIdentifier(parts[parts.length - 1]);
  };

  const sanitizeSql = (value) =>
    ensureString(value)
      .replace(/--[^\n]*/g, (match) => ' '.repeat(match.length))
      .replace(/#[^\n]*/g, (match) => ' '.repeat(match.length))
      .replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length))
      .replace(/'(?:\\'|[^'])*'/g, (match) => ' '.repeat(match.length))
      .replace(/"(?:\\"|[^"])*"/g, (match) => ' '.repeat(match.length))
      .replace(/`(?:\\`|[^`])*`/g, (match) => ' '.repeat(match.length));

  const getSqlScope = (value, cursor) => {
    const slice = value.slice(0, cursor);
    const stack = [];
    for (let i = 0; i < slice.length; i += 1) {
      const ch = slice[i];
      if (ch === '(') {
        stack.push(i);
      } else if (ch === ')' && stack.length) {
        stack.pop();
      }
    }
    const start = stack.length ? stack[stack.length - 1] + 1 : 0;
    return slice.slice(start);
  };

  const parseTableAliases = (segment) => {
    const aliasMap = {};
    const tables = [];
    const addTable = (rawTable, rawAlias) => {
      const tableName = normalizeTableName(rawTable);
      if (!tableName) return;
      const alias = normalizeIdentifier(rawAlias);
      if (!tables.includes(tableName)) tables.push(tableName);
      aliasMap[tableName] = tableName;
      if (alias) aliasMap[alias] = tableName;
    };

    const parseTableRef = (part) => {
      const trimmed = ensureString(part).trim();
      if (!trimmed || trimmed.startsWith('(')) return;
      const tokens = trimmed.split(/\s+/);
      if (tokens.length === 0) return;
      const tableToken = tokens[0];
      let aliasToken = '';
      if (tokens.length > 1) {
        if (tokens[1].toLowerCase() === 'as') {
          aliasToken = tokens[2] || '';
        } else {
          aliasToken = tokens[1];
        }
      }
      addTable(tableToken, aliasToken);
    };

    const fromMatch = segment.match(/\bfrom\b([\s\S]*)/i);
    if (fromMatch) {
      const afterFrom = fromMatch[1];
      const stopMatch = afterFrom.match(/\b(where|group|order|having|limit|union|join)\b/i);
      const fromSection = stopMatch ? afterFrom.slice(0, stopMatch.index) : afterFrom;
      fromSection.split(',').forEach((part) => parseTableRef(part));
    }

    const joinRegex = /\bjoin\s+([A-Za-z0-9_`."$]+)(?:\s+(?:as\s+)?([A-Za-z0-9_`."$]+))?/gi;
    let match;
    while ((match = joinRegex.exec(segment)) !== null) {
      addTable(match[1], match[2]);
    }

    return { aliasMap, tables };
  };

  const getQualifierAtCursor = (value, cursor) => {
    const before = value.slice(0, cursor);
    const match = before.match(/([A-Za-z0-9_`"]+)\.\s*([A-Za-z0-9_]*)$/);
    if (!match) return null;
    return {
      qualifier: normalizeIdentifier(match[1]),
      partial: match[2] || '',
    };
  };

  const getLastKeyword = (segment) => {
    const keywordRegex = /\b(select|from|join|where|on|and|or|having|group|order|by|limit|update|into|set)\b/gi;
    let match;
    let last = '';
    while ((match = keywordRegex.exec(segment)) !== null) {
      last = match[1].toUpperCase();
    }
    return last;
  };

  const getSuggestionContext = (value, cursor) => {
    const sanitized = sanitizeSql(value);
    const scope = getSqlScope(sanitized, cursor);
    const aliasInfo = parseTableAliases(scope);
    const qualifierInfo = getQualifierAtCursor(value, cursor);
    const lastKeyword = getLastKeyword(scope);
    const lineInfo = getLineBeforeCursor(value, cursor);
    const lineComplete = isCompleteExpression(lineInfo.text);
    const isConditional = ['WHERE', 'ON', 'AND', 'OR', 'HAVING'].includes(lastKeyword);
    let type = 'default';
    let preferColumns = false;

    if (qualifierInfo?.qualifier) {
      type = 'column';
      preferColumns = true;
    } else if (['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE', 'DESCRIBE', 'USE'].includes(lastKeyword)) {
      type = 'table';
    } else if (['WHERE', 'ON', 'AND', 'OR', 'HAVING', 'SET'].includes(lastKeyword)) {
      type = 'column';
      preferColumns = true;
    } else if (['SELECT', 'BY', 'GROUP', 'ORDER'].includes(lastKeyword)) {
      type = 'column';
    }

    return {
      type,
      qualifier: qualifierInfo?.qualifier || '',
      partial: qualifierInfo?.partial || '',
      aliasMap: aliasInfo.aliasMap,
      tables: aliasInfo.tables,
      preferColumns,
      lineComplete,
      isConditional,
    };
  };

  const isFuzzyMatch = (text, query) => {
    if (!query) return true;
    let index = 0;
    for (const char of query) {
      index = text.indexOf(char, index);
      if (index === -1) return false;
      index += 1;
    }
    return true;
  };

  const shouldSuppressConditionalSuggestions = (tokenInfo, context) => {
    if (!context.isConditional || !context.lineComplete) return false;
    if (context.qualifier) return false;
    if (tokenInfo.token) return false;
    return true;
  };

  let refreshSuggestions = () => {};

  const getColumnsForTable = (tableName) => {
    if (!tableName) return [];
    const cached = state.schema.tableColumns[tableName];
    if (Array.isArray(cached) && cached.length > 0) return cached;
    if (tableName === state.schema.selectedTable) {
      return state.schema.columns.map((col) => col.name).filter(Boolean);
    }
    return [];
  };

  const ensureTableColumns = async (tableName) => {
    if (!backendAvailable || !state.selectedConnectionId || !tableName) return;
    if (state.schema.tableColumns[tableName] || state.schema.tableColumnsLoading[tableName]) return;
    state.schema.tableColumnsLoading[tableName] = true;
    try {
      const data = await invokeBackend(API_SCHEMA_DESCRIBE_TABLE, {
        connectionId: state.selectedConnectionId,
        database: state.schema.selectedDatabase || getActiveDatabase(),
        table: tableName,
      });
      state.schema.tableColumns[tableName] = Array.isArray(data.columns)
        ? data.columns.map((col) => col.name).filter(Boolean)
        : [];
    } catch (_) {
      state.schema.tableColumns[tableName] = [];
    } finally {
      delete state.schema.tableColumnsLoading[tableName];
      refreshSuggestions();
    }
  };

  const buildSuggestions = (prefix, context) => {
    const query = prefix.toLowerCase();
    const results = [];
    const seen = new Set();
    const addCandidate = (label, type, priority) => {
      const key = `${type}:${label}`;
      if (seen.has(key)) return;
      const lower = label.toLowerCase();
      if (query) {
        if (!lower.startsWith(query) && !isFuzzyMatch(lower, query)) return;
      }
      const score = lower.startsWith(query) ? 0 : 1;
      results.push({ label, type, score, priority });
      seen.add(key);
    };

    const aliasMap = context.aliasMap || {};
    const tableList =
      context.tables && context.tables.length > 0
        ? context.tables
        : state.schema.tables.map((table) => table.name).filter(Boolean);
    const keywords = context.type === 'default' && !query ? SQL_SUGGESTION_KEYWORDS : SQL_KEYWORDS;

    const addColumnsForTable = (tableName, prefixLabel, priority) => {
      const columns = getColumnsForTable(tableName);
      if (columns.length === 0) {
        void ensureTableColumns(tableName);
      }
      columns.forEach((name) => addCandidate(prefixLabel ? `${prefixLabel}${name}` : name, 'column', priority));
    };

    if (context.type === 'table') {
      tableList.forEach((name) => addCandidate(name, 'table', 0));
      keywords.forEach((name) => addCandidate(name, 'keyword', 1));
    } else if (context.type === 'column') {
      const qualifier = context.qualifier;
      if (qualifier) {
        const tableName = aliasMap[qualifier] || normalizeTableName(qualifier);
        addColumnsForTable(tableName, '', 0);
      } else if (tableList.length === 1) {
        addColumnsForTable(tableList[0], '', 0);
      } else {
        const aliasEntries = Object.entries(aliasMap);
        if (aliasEntries.length > 0) {
          aliasEntries.forEach(([alias, tableName]) => {
            addColumnsForTable(tableName, `${alias}.`, 0);
          });
        } else {
          tableList.forEach((tableName) => addColumnsForTable(tableName, `${tableName}.`, 0));
        }
      }
      keywords.forEach((name) => addCandidate(name, 'keyword', context.preferColumns ? 2 : 1));
      tableList.forEach((name) => addCandidate(name, 'table', 3));
    } else {
      keywords.forEach((name) => addCandidate(name, 'keyword', 0));
      tableList.forEach((name) => addCandidate(name, 'table', 1));
      state.schema.columns.map((col) => col.name).filter(Boolean).forEach((name) => addCandidate(name, 'column', 2));
    }

    results.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.score !== b.score) return a.score - b.score;
      if (a.label.length !== b.label.length) return a.label.length - b.label.length;
      return a.label.localeCompare(b.label);
    });
    return results.slice(0, 50);
  };

  const getSuggestionTypeLabel = (type) => {
    if (type === 'table') return '表';
    if (type === 'column') return '字段';
    return '关键字';
  };

  const closeSuggestions = () => {
    editorState.open = false;
    editorState.suggestions = [];
    editorSuggest.style.display = 'none';
    editorSuggest.innerHTML = '';
  };

  const renderSuggestions = () => {
    editorSuggest.innerHTML = '';
    editorState.suggestions.forEach((item, index) => {
      const entry = document.createElement('div');
      entry.className = `data-app-editor-suggest-item${index === editorState.activeIndex ? ' active' : ''}`;
      const label = document.createElement('span');
      label.textContent = item.label;
      const type = document.createElement('span');
      type.className = 'data-app-editor-suggest-type';
      type.textContent = getSuggestionTypeLabel(item.type);
      entry.appendChild(label);
      entry.appendChild(type);
      entry.addEventListener('mousedown', (event) => {
        event.preventDefault();
        applySuggestion(item);
      });
      editorSuggest.appendChild(entry);
    });
  };

  const getCaretCoordinates = () => {
    const cursor = sqlEditor.selectionStart;
    updateMirrorStyles();
    sqlMirror.textContent = '';
    sqlMirror.textContent = sqlEditor.value.slice(0, cursor);
    const marker = document.createElement('span');
    marker.textContent = sqlEditor.value.slice(cursor, cursor + 1) || '\u200b';
    sqlMirror.appendChild(marker);
    const mirrorRect = sqlMirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    return {
      top: markerRect.top - mirrorRect.top - sqlEditor.scrollTop,
      left: markerRect.left - mirrorRect.left - sqlEditor.scrollLeft,
    };
  };

  const positionSuggestions = () => {
    if (!editorState.open) return;
    const coords = getCaretCoordinates();
    const style = window.getComputedStyle(sqlEditor);
    const lineHeight = Number.parseFloat(style.lineHeight) || 18;
    let top = coords.top + lineHeight;
    let left = coords.left;
    editorSuggest.style.display = 'block';
    const maxLeft = Math.max(0, editorArea.clientWidth - editorSuggest.offsetWidth - 8);
    const maxTop = Math.max(0, editorArea.clientHeight - editorSuggest.offsetHeight - 8);
    if (left > maxLeft) left = maxLeft;
    if (top > maxTop) {
      top = Math.max(0, coords.top - editorSuggest.offsetHeight - 4);
    }
    editorSuggest.style.top = `${Math.max(0, top)}px`;
    editorSuggest.style.left = `${Math.max(0, left)}px`;
  };

  const updateSuggestions = (force = false) => {
    const value = sqlEditor.value || '';
    const cursor = sqlEditor.selectionStart;
    const tokenInfo = getTokenAtCursor(value, cursor);
    const context = getSuggestionContext(value, cursor);
    const prefix = context.qualifier ? context.partial : tokenInfo.token;
    if (shouldSuppressConditionalSuggestions(tokenInfo, context)) {
      closeSuggestions();
      return;
    }
    if (!force && !tokenInfo.token && context.type === 'default') {
      closeSuggestions();
      return;
    }
    const items = buildSuggestions(prefix, context);
    if (items.length === 0) {
      closeSuggestions();
      return;
    }
    const sameItems =
      editorState.open &&
      editorState.suggestions.length === items.length &&
      items.every((item, index) => {
        const prev = editorState.suggestions[index];
        return prev && prev.label === item.label && prev.type === item.type;
      });
    editorState.suggestions = items;
    if (!sameItems) {
      editorState.activeIndex = 0;
    } else {
      editorState.activeIndex = Math.min(editorState.activeIndex, items.length - 1);
    }
    editorState.open = true;
    renderSuggestions();
    positionSuggestions();
  };

  refreshSuggestions = () => {
    if (editorState.open) updateSuggestions(true);
  };

  const moveSuggestion = (offset) => {
    if (!editorState.open) return;
    const total = editorState.suggestions.length;
    if (total === 0) return;
    editorState.activeIndex = (editorState.activeIndex + offset + total) % total;
    renderSuggestions();
    const active = editorSuggest.children[editorState.activeIndex];
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  };

  const formatCompletion = (label, type, afterText) => {
    const upper = label.toUpperCase();
    let text = label;
    let cursorOffset = label.length;
    if (type === 'keyword') {
      if (SQL_FUNCTIONS.has(upper)) {
        text = `${upper}()`;
        cursorOffset = upper.length + 1;
      } else {
        text = upper;
        cursorOffset = text.length;
      }
    }
    const needsSpace = !afterText || !/^[\s,;)]/.test(afterText);
    if (needsSpace) {
      text += ' ';
    }
    return { text, cursorOffset };
  };

  const applySuggestion = (item) => {
    const value = sqlEditor.value || '';
    const cursor = sqlEditor.selectionStart;
    const tokenInfo = getTokenAtCursor(value, cursor);
    const before = value.slice(0, tokenInfo.start);
    const after = value.slice(tokenInfo.end);
    const completion = formatCompletion(item.label, item.type, after);
    const nextValue = before + completion.text + after;
    const nextCursor = before.length + completion.cursorOffset;
    setEditorValue(nextValue, { cursor: nextCursor, suppressSuggestions: true });
    closeSuggestions();
    sqlEditor.focus();
  };

  const setEditorValue = (value, options = {}) => {
    sqlEditor.value = value;
    if (options.cursor != null) {
      sqlEditor.setSelectionRange(options.cursor, options.cursor);
    }
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (active) active.sql = value;
    updateEditorView();
    updateButtons();
    if (!options.suppressSuggestions) {
      updateSuggestions();
    } else {
      closeSuggestions();
    }
    if (options.focus) sqlEditor.focus();
  };

  const formatConnectionHost = (connection) => {
    const host = ensureString(connection?.host || connection?.hosts || connection?.uri || '').trim();
    const port = ensureString(connection?.port || '').trim();
    if (host && port) return `${host}:${port}`;
    return host || port || '-';
  };

  const getSchemaAdapter = () => {
    const type = getActiveConnection()?.type || state.formType || defaultFormType;
    return getAdapter(type);
  };

  const getSchemaColumnHeaders = () => {
    const schemaConfig = getSchemaAdapter()?.schema;
    return Array.isArray(schemaConfig?.columnHeaders)
      ? schemaConfig.columnHeaders
      : ['字段', '类型', '可空', '默认值', '索引', '备注'];
  };

  const getSchemaRowCells = (col) => {
    const schemaConfig = getSchemaAdapter()?.schema;
    if (typeof schemaConfig?.getRowCells === 'function') {
      return schemaConfig.getRowCells(col);
    }
    return [col.name, col.type, col.isNullable, col.defaultValue, col.columnKey, col.comment];
  };

  const renderStatus = () => {
    const connection = state.connections.find((item) => item.id === state.selectedConnectionId);
    const connectionName = connection ? `${connection.name || '未命名'} (${formatConnectionHost(connection)})` : '未选择';
    const databaseName = connection ? ensureString(getActiveDatabase()).trim() : '';
    const databaseText = connection ? ` · 数据库 ${databaseName || '未选择'}` : '';
    const statusText = (() => {
      if (state.connectionStatus === 'testing') return '测试中…';
      if (state.connectionStatus === 'ok') return '连接正常';
      if (state.connectionStatus === 'error') return '连接异常';
      return '未测试';
    })();
    statusConnection.innerHTML = `<strong>连接</strong> ${connectionName}${databaseText} · ${statusText}`;
    if (state.lastRun) {
      statusExecution.innerHTML = `<strong>执行</strong> ${formatDuration(state.lastRun.durationMs)} · ${state.lastRun.rowCount ?? '-'} 行`;
    } else {
      statusExecution.innerHTML = '<strong>执行</strong> 尚未执行';
    }
    const details = ensureString(state.message.details).trim();
    statusMessageText.textContent = state.message.text || '';
    statusMessageDetails.textContent = details;
    statusMessageDetails.style.display = details ? 'block' : 'none';
    statusMessage.className = `data-app-status-message${state.message.type === 'error' ? ' error' : ''}${
      details ? ' has-details' : ''
    }`;
    renderHeaderControls();
  };

  renderHeaderControls = () => {
    headerConnectionSelect.innerHTML = '';
    const connectionPlaceholder = document.createElement('option');
    connectionPlaceholder.value = '';
    connectionPlaceholder.disabled = true;
    connectionPlaceholder.textContent = state.connections.length > 0 ? '选择连接' : '暂无连接';
    headerConnectionSelect.appendChild(connectionPlaceholder);
    if (!state.selectedConnectionId) {
      connectionPlaceholder.selected = true;
    }
    state.connections.forEach((conn) => {
      const option = document.createElement('option');
      option.value = conn.id;
      option.textContent = conn.name || conn.host || '未命名连接';
      if (conn.id === state.selectedConnectionId) option.selected = true;
      headerConnectionSelect.appendChild(option);
    });

    headerDatabaseSelect.innerHTML = '';
    const hasConnection = Boolean(state.selectedConnectionId);
    const schemaNames = Array.isArray(state.schema.databases)
      ? state.schema.databases
          .map((db) => ensureString(db?.name).trim())
          .filter((name) => name)
      : [];
    const activeConnection = getActiveConnection();
    const connectionNames = Array.isArray(activeConnection?.availableDatabases)
      ? activeConnection.availableDatabases.map((name) => ensureString(name).trim()).filter((name) => name)
      : [];
    const databaseNames = schemaNames.length > 0 ? schemaNames : connectionNames;
    const activeDatabase = ensureString(getActiveDatabase()).trim();
    const databasePlaceholder = document.createElement('option');
    databasePlaceholder.value = '';
    databasePlaceholder.disabled = true;
    databasePlaceholder.textContent = !hasConnection
      ? '请先选择连接'
      : databaseNames.length > 0
      ? '选择数据库'
      : '暂无数据库';
    headerDatabaseSelect.appendChild(databasePlaceholder);
    if (!activeDatabase) databasePlaceholder.selected = true;

    if (activeDatabase && !databaseNames.includes(activeDatabase)) {
      const currentOption = document.createElement('option');
      currentOption.value = activeDatabase;
      currentOption.textContent = activeDatabase;
      currentOption.selected = true;
      headerDatabaseSelect.appendChild(currentOption);
    }
    databaseNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === activeDatabase) option.selected = true;
      headerDatabaseSelect.appendChild(option);
    });

    if (!hasConnection) {
      connectionStatusPill.textContent = '未选择连接';
      connectionStatusPill.className = 'data-app-pill';
    } else {
      const statusMap = {
        ok: { text: '连接正常', className: 'ok' },
        error: { text: '连接异常', className: 'error' },
        testing: { text: '连接中…', className: 'warn' },
        idle: { text: '连接未测试', className: '' },
      };
      const status = statusMap[state.connectionStatus] || statusMap.idle;
      connectionStatusPill.textContent = status.text;
      connectionStatusPill.className = `data-app-pill${status.className ? ` ${status.className}` : ''}`;
    }

    const latestEvent = state.mcpEvents[0];
    if (latestEvent) {
      const toolLabel = stripMcpPrefix(latestEvent.tool);
      mcpStatusPill.textContent = `MCP ${toolLabel || '完成'}`;
      mcpStatusPill.className = `data-app-pill${latestEvent.error ? ' error' : ' ok'}`;
    } else {
      mcpStatusPill.textContent = 'MCP 空闲';
      mcpStatusPill.className = 'data-app-pill';
    }
  };

  const normalizeFormType = (value) => {
    const raw = ensureString(value).trim().toLowerCase();
    if (raw === 'mongo' || raw === 'mongodb') return 'mongo';
    return 'mysql';
  };

  const getFormType = () => normalizeFormType(typeSelect?.value || state.formType);

  const ensureFormDatabaseState = (type) => {
    const key = normalizeFormType(type);
    if (!state.formDatabasesByType[key]) state.formDatabasesByType[key] = [];
    if (!state.formCustomDatabasesByType[key]) state.formCustomDatabasesByType[key] = [];
    if (!state.formDatabaseSelectedByType[key]) state.formDatabaseSelectedByType[key] = '';
    return key;
  };

  const getFormDatabaseState = (type) => {
    const key = ensureFormDatabaseState(type);
    return {
      type: key,
      databases: state.formDatabasesByType[key],
      custom: state.formCustomDatabasesByType[key],
      selected: state.formDatabaseSelectedByType[key],
    };
  };

  const getSelectedFormDatabase = () => {
    const value = ensureString(formDatabaseSelect.value).trim();
    if (value === FORM_DATABASE_CUSTOM_OPTION) return '';
    return value;
  };

  const renderFormDatabaseOptions = (selectedValue = '', type) => {
    const currentValue = ensureString(selectedValue).trim();
    const { databases, custom, type: formType } = getFormDatabaseState(type || getFormType());
    const names = new Set();
    formDatabaseSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    const hasOptions = databases.length > 0 || custom.length > 0;
    placeholder.value = '';
    placeholder.textContent = hasOptions ? '请选择数据库' : '默认数据库（可选）';
    formDatabaseSelect.appendChild(placeholder);

    const appendOption = (name) => {
      const trimmed = ensureString(name).trim();
      if (!trimmed || names.has(trimmed)) return;
      names.add(trimmed);
      const option = document.createElement('option');
      option.value = trimmed;
      option.textContent = trimmed;
      formDatabaseSelect.appendChild(option);
    };

    [...databases, ...custom].forEach((name) => appendOption(name));
    if (currentValue && !names.has(currentValue)) {
      appendOption(currentValue);
    }

    const manualOption = document.createElement('option');
    manualOption.value = FORM_DATABASE_CUSTOM_OPTION;
    manualOption.textContent = '手动输入...';
    formDatabaseSelect.appendChild(manualOption);

    formDatabaseSelect.value = currentValue || '';
    state.formDatabaseSelectedByType[formType] = currentValue;
  };

  const updateAuthFieldsVisibility = () => {
    if (getFormType() !== 'mysql') return;
    const authType = authTypeSelect.value;
    const useCert = authType === 'certificate';
    passwordField.style.display = useCert ? 'none' : 'flex';
    sslFieldGroup.style.display = useCert ? 'flex' : 'none';
    if (useCert) {
      updateSslFieldsVisibility();
    }
  };

  const updateSslFieldsVisibility = () => {
    if (getFormType() !== 'mysql') return;
    const mode = sslModeSelect.value || 'keypair';
    const usePfx = mode === 'pfx';
    sslKeypairGroup.style.display = usePfx ? 'none' : 'flex';
    sslPfxGroup.style.display = usePfx ? 'flex' : 'none';
  };

  const updateProxyFieldsVisibility = () => {
    if (getFormType() !== 'mysql') return;
    const proxyType = proxyTypeSelect.value;
    const enabled = proxyType && proxyType !== 'none';
    proxyFieldGroup.style.display = enabled ? 'flex' : 'none';
  };

  const updateMongoTlsFieldsVisibility = () => {
    if (getFormType() !== 'mongo') return;
    const enabled = mongoTlsSelect.value === 'true';
    mongoTlsDetailsGroup.style.display = enabled ? 'flex' : 'none';
  };

  const attachCommonFields = (type) => {
    const formType = normalizeFormType(type);
    if (formType === 'mysql') {
      if (databaseField.parentElement !== mysqlFieldsWrap) {
        mysqlFieldsWrap.insertBefore(databaseField, proxyTypeField);
      }
      if (optionsField.parentElement !== mysqlFieldsWrap) {
        mysqlFieldsWrap.appendChild(optionsField);
      }
    } else if (formType === 'mongo') {
      if (databaseField.parentElement !== mongoFieldsWrap) {
        mongoFieldsWrap.appendChild(databaseField);
      }
      if (optionsField.parentElement !== mongoFieldsWrap) {
        mongoFieldsWrap.appendChild(optionsField);
      }
    }
  };

  const updateFormVisibility = () => {
    const formType = getFormType();
    mysqlFieldsWrap.style.display = formType === 'mysql' ? 'flex' : 'none';
    mongoFieldsWrap.style.display = formType === 'mongo' ? 'flex' : 'none';
    attachCommonFields(formType);
    updateAuthFieldsVisibility();
    updateSslFieldsVisibility();
    updateProxyFieldsVisibility();
    updateMongoTlsFieldsVisibility();
  };

  const resetForm = () => {
    const formType = normalizeFormType(state.formType);
    typeSelect.value = formType;
    if (formType === 'mongo') {
      const mongoData = state.mongoFormData;
      nameInput.value = mongoData.name;
      mongoHostsInput.value = mongoData.hosts;
      mongoReplicaSetInput.value = mongoData.replicaSet;
      mongoUserInput.value = mongoData.user;
      mongoPasswordInput.value = '';
      mongoAuthSourceInput.value = mongoData.authSource || '';
      mongoAuthMechanismSelect.value = mongoData.authMechanism || '';
      mongoTlsSelect.value = mongoData.tls?.enabled ? 'true' : 'false';
      mongoTlsCaInput.value = mongoData.tls?.caPath || '';
      mongoTlsCertInput.value = mongoData.tls?.certPath || '';
      mongoTlsKeyInput.value = mongoData.tls?.keyPath || '';
      mongoTlsPassphraseInput.value = mongoData.tls?.passphrase || '';
      mongoTlsVerifySelect.value = mongoData.tls?.rejectUnauthorized === false ? 'false' : 'true';
      renderFormDatabaseOptions(mongoData.database, formType);
      optionsInput.value = mongoData.options;
    } else {
      nameInput.value = state.formData.name;
      hostInput.value = state.formData.host;
      portInput.value = state.formData.port || mysqlDefaultPort;
      userInput.value = state.formData.user;
      passwordInput.value = '';
      authTypeSelect.value = state.formData.authType || 'password';
      sslModeSelect.value =
        state.formData.ssl?.mode || (state.formData.ssl?.pfxPath ? 'pfx' : 'keypair');
      sslCaInput.value = state.formData.ssl?.caPath || '';
      sslCertInput.value = state.formData.ssl?.certPath || '';
      sslKeyInput.value = state.formData.ssl?.keyPath || '';
      sslPfxInput.value = state.formData.ssl?.pfxPath || '';
      sslPassphraseInput.value = state.formData.ssl?.passphrase || '';
      sslVerifySelect.value = state.formData.ssl?.rejectUnauthorized === false ? 'false' : 'true';
      proxyTypeSelect.value = state.formData.proxy?.type || 'none';
      proxyHostInput.value = state.formData.proxy?.host || '';
      proxyPortInput.value = state.formData.proxy?.port || '';
      proxyUserInput.value = state.formData.proxy?.username || '';
      proxyPasswordInput.value = state.formData.proxy?.password || '';
      renderFormDatabaseOptions(state.formData.database, formType);
      optionsInput.value = state.formData.options;
    }
    updateFormVisibility();
  };

  const captureMysqlFormData = () => {
    const authType = authTypeSelect.value || 'password';
    const sslEnabled = authType === 'certificate';
    const sslMode = sslModeSelect.value || 'keypair';
    const ssl = sslEnabled
      ? sslMode === 'pfx'
        ? {
            mode: 'pfx',
            pfxPath: ensureString(sslPfxInput.value).trim(),
            passphrase: ensureString(sslPassphraseInput.value),
            rejectUnauthorized: sslVerifySelect.value !== 'false',
          }
        : {
            mode: 'keypair',
            caPath: ensureString(sslCaInput.value).trim(),
            certPath: ensureString(sslCertInput.value).trim(),
            keyPath: ensureString(sslKeyInput.value).trim(),
            passphrase: ensureString(sslPassphraseInput.value),
            rejectUnauthorized: sslVerifySelect.value !== 'false',
          }
      : {
          mode: 'keypair',
          caPath: '',
          certPath: '',
          keyPath: '',
          pfxPath: '',
          passphrase: '',
          rejectUnauthorized: true,
        };
    const proxyType = proxyTypeSelect.value || 'none';
    const proxy =
      proxyType === 'none'
        ? { type: 'none' }
        : {
            type: proxyType,
            host: ensureString(proxyHostInput.value).trim(),
            port: ensureString(proxyPortInput.value).trim(),
            username: ensureString(proxyUserInput.value).trim(),
            password: ensureString(proxyPasswordInput.value),
          };
    return {
      name: ensureString(nameInput.value).trim(),
      host: ensureString(hostInput.value).trim(),
      port: ensureString(portInput.value).trim() || mysqlDefaultPort,
      user: ensureString(userInput.value).trim(),
      password: ensureString(passwordInput.value),
      authType,
      ssl,
      proxy,
      database: getSelectedFormDatabase(),
      options: ensureString(optionsInput.value),
    };
  };

  const captureMongoFormData = () => ({
    name: ensureString(nameInput.value).trim(),
    hosts: ensureString(mongoHostsInput.value).trim(),
    user: ensureString(mongoUserInput.value).trim(),
    password: ensureString(mongoPasswordInput.value),
    authSource: ensureString(mongoAuthSourceInput.value).trim(),
    authMechanism: ensureString(mongoAuthMechanismSelect.value).trim(),
    replicaSet: ensureString(mongoReplicaSetInput.value).trim(),
    tls: {
      enabled: mongoTlsSelect.value === 'true',
      caPath: ensureString(mongoTlsCaInput.value).trim(),
      certPath: ensureString(mongoTlsCertInput.value).trim(),
      keyPath: ensureString(mongoTlsKeyInput.value).trim(),
      passphrase: ensureString(mongoTlsPassphraseInput.value),
      rejectUnauthorized: mongoTlsVerifySelect.value !== 'false',
    },
    database: getSelectedFormDatabase(),
    options: ensureString(optionsInput.value),
  });

  const storeActiveFormData = (typeOverride) => {
    const formType = normalizeFormType(typeOverride || getFormType());
    if (formType === 'mongo') {
      state.mongoFormData = captureMongoFormData();
    } else {
      state.formData = captureMysqlFormData();
    }
  };

  const openForm = (mode, data) => {
    state.formOpen = true;
    state.formMode = mode;
    const nextType = normalizeFormType(data?.type || data?.adapter || data?.dbType || state.formType || 'mysql');
    state.formType = nextType;
    if (nextType === 'mongo') {
      const tlsConfig = data?.tls && typeof data.tls === 'object' ? data.tls : {};
      state.mongoFormData = {
        name: data?.name || '',
        hosts: data?.hosts || data?.host || '',
        user: data?.user || data?.username || '',
        password: data?.password || '',
        authSource: data?.authSource || '',
        authMechanism: data?.authMechanism || '',
        replicaSet: data?.replicaSet || '',
        tls: {
          enabled: Boolean(tlsConfig.enabled || tlsConfig.caPath || tlsConfig.certPath || tlsConfig.keyPath),
          caPath: tlsConfig.caPath || '',
          certPath: tlsConfig.certPath || '',
          keyPath: tlsConfig.keyPath || '',
          passphrase: '',
          rejectUnauthorized: tlsConfig.rejectUnauthorized !== false,
        },
        database: data?.database || '',
        options: data?.options ? JSON.stringify(data.options, null, 2) : '',
      };
      const { type: formType } = getFormDatabaseState(nextType);
      state.formDatabasesByType[formType] = [];
      state.formCustomDatabasesByType[formType] = state.mongoFormData.database ? [state.mongoFormData.database] : [];
      state.formDatabaseSelectedByType[formType] = state.mongoFormData.database;
    } else {
      const sslConfig = data?.ssl && typeof data.ssl === 'object' ? data.ssl : {};
      const proxyConfig = data?.proxy && typeof data.proxy === 'object' ? data.proxy : {};
      const sslMode = sslConfig.mode || (sslConfig.pfxPath ? 'pfx' : 'keypair');
      const inferredAuthType =
        data?.authType ||
        (sslConfig.certPath || sslConfig.keyPath || sslConfig.pfxPath ? 'certificate' : 'password');
      state.formData = {
        name: data?.name || '',
        host: data?.host || '',
        port: data?.port ? String(data.port) : mysqlDefaultPort,
        user: data?.user || '',
        password: data?.password || '',
        authType: inferredAuthType,
        ssl: {
          mode: sslMode,
          caPath: sslConfig.caPath || '',
          certPath: sslConfig.certPath || '',
          keyPath: sslConfig.keyPath || '',
          pfxPath: sslConfig.pfxPath || '',
          passphrase: '',
          rejectUnauthorized: sslConfig.rejectUnauthorized !== false,
        },
        proxy: {
          type: proxyConfig.type || 'none',
          host: proxyConfig.host || '',
          port: proxyConfig.port ? String(proxyConfig.port) : '',
          username: proxyConfig.username || '',
          password: '',
        },
        database: data?.database || '',
        options: data?.options ? JSON.stringify(data.options, null, 2) : '',
      };
      const { type: formType } = getFormDatabaseState(nextType);
      state.formDatabasesByType[formType] = [];
      state.formCustomDatabasesByType[formType] = state.formData.database ? [state.formData.database] : [];
      state.formDatabaseSelectedByType[formType] = state.formData.database;
    }
    formTitle.textContent = mode === 'edit' ? '编辑连接' : '新建连接';
    typeSelect.disabled = mode === 'edit';
    resetForm();
    if (schemaModalOpen) {
      closeSchemaModal();
    }
    openConnectionModal();
  };

  const closeForm = () => {
    state.formOpen = false;
    closeConnectionModal();
  };

  const parseOptionsInput = () => {
    const optionsRaw = ensureString(optionsInput.value).trim();
    let options = {};
    if (optionsRaw) {
      try {
        const parsed = JSON.parse(optionsRaw);
        if (!isPlainObject(parsed)) throw new Error('连接池参数必须是 JSON 对象');
        options = parsed;
      } catch (err) {
        throw new Error(`连接池参数解析失败: ${err.message}`);
      }
    }
    return options;
  };

  const getFormPayload = (options = {}) => {
    const formType = getFormType();
    const includeStoredPassword = options.includeStoredPassword === true;
    if (formType === 'mongo') {
      const typedPassword = ensureString(mongoPasswordInput.value);
      const resolvedPassword = typedPassword || (includeStoredPassword ? state.mongoFormData.password : '');
      const tlsEnabled = mongoTlsSelect.value === 'true';
      const tls = tlsEnabled
        ? {
            enabled: true,
            caPath: ensureString(mongoTlsCaInput.value).trim(),
            certPath: ensureString(mongoTlsCertInput.value).trim(),
            keyPath: ensureString(mongoTlsKeyInput.value).trim(),
            passphrase: ensureString(mongoTlsPassphraseInput.value),
            rejectUnauthorized: mongoTlsVerifySelect.value !== 'false',
          }
        : { enabled: false };
      return {
        type: 'mongo',
        name: ensureString(nameInput.value).trim(),
        hosts: ensureString(mongoHostsInput.value).trim(),
        user: ensureString(mongoUserInput.value).trim(),
        password: resolvedPassword,
        authSource: ensureString(mongoAuthSourceInput.value).trim(),
        authMechanism: ensureString(mongoAuthMechanismSelect.value).trim(),
        replicaSet: ensureString(mongoReplicaSetInput.value).trim(),
        tls,
        database: getSelectedFormDatabase(),
        options: parseOptionsInput(),
      };
    }
    const authType = authTypeSelect.value || 'password';
    const sslEnabled = authType === 'certificate';
    const typedPassword = ensureString(passwordInput.value);
    const resolvedPassword = sslEnabled
      ? ''
      : typedPassword || (includeStoredPassword ? state.formData.password : '');
    const sslMode = sslModeSelect.value || 'keypair';
    const ssl = sslEnabled
      ? sslMode === 'pfx'
        ? {
            mode: 'pfx',
            pfxPath: ensureString(sslPfxInput.value).trim(),
            passphrase: ensureString(sslPassphraseInput.value),
            rejectUnauthorized: sslVerifySelect.value !== 'false',
          }
        : {
            mode: 'keypair',
            caPath: ensureString(sslCaInput.value).trim(),
            certPath: ensureString(sslCertInput.value).trim(),
            keyPath: ensureString(sslKeyInput.value).trim(),
            passphrase: ensureString(sslPassphraseInput.value),
            rejectUnauthorized: sslVerifySelect.value !== 'false',
          }
      : null;
    const proxyType = proxyTypeSelect.value || 'none';
    const proxy =
      proxyType === 'none'
        ? { type: 'none' }
        : {
            type: proxyType,
            host: ensureString(proxyHostInput.value).trim(),
            port: ensureString(proxyPortInput.value).trim(),
            username: ensureString(proxyUserInput.value).trim(),
            password: ensureString(proxyPasswordInput.value),
          };
    return {
      type: 'mysql',
      name: ensureString(nameInput.value).trim(),
      host: ensureString(hostInput.value).trim(),
      port: ensureString(portInput.value).trim() || mysqlDefaultPort,
      user: ensureString(userInput.value).trim(),
      password: resolvedPassword,
      authType,
      ssl,
      proxy,
      database: getSelectedFormDatabase(),
      options: parseOptionsInput(),
    };
  };

  const getConnectionById = (id) => state.connections.find((item) => item.id === id);

  const normalizeConnection = (conn, previous = {}) => ({
    ...conn,
    type: normalizeFormType(conn?.type || conn?.adapter || conn?.dbType || previous.type || 'mysql'),
    currentDatabase: previous.currentDatabase ?? conn.database ?? '',
    availableDatabases: Array.isArray(previous.availableDatabases) ? previous.availableDatabases : [],
    databasesLoaded: Boolean(previous.databasesLoaded),
    databasesLoading: Boolean(previous.databasesLoading),
  });

  const updateConnectionState = (id, updater) => {
    state.connections = state.connections.map((conn) => (conn.id === id ? updater(conn) : conn));
  };

  const getActiveConnection = () => getConnectionById(state.selectedConnectionId);

  const getActiveDatabase = () => {
    const conn = getActiveConnection();
    return conn?.currentDatabase || conn?.database || state.schema.selectedDatabase || '';
  };

  const syncTabDatabases = (database) => {
    state.tabs.forEach((tab) => {
      tab.database = database || '';
    });
    renderTabs();
  };

  const resolveDatabase = (preferred, databases, fallback) => {
    if (preferred && databases.includes(preferred)) return preferred;
    if (fallback && databases.includes(fallback)) return fallback;
    return databases[0] || '';
  };

  const updateConnectionDatabases = (id, databases) => {
    updateConnectionState(id, (conn) => {
      const nextDatabase = resolveDatabase(conn.currentDatabase, databases, conn.database);
      return {
        ...conn,
        availableDatabases: databases,
        databasesLoaded: true,
        databasesLoading: false,
        currentDatabase: nextDatabase,
      };
    });
  };

  const ensureTab = () => {
    if (state.tabs.length === 0) {
      const id = createId();
      state.tabs.push({ id, title: `${queryLabel} ${state.tabCounter}`, sql: '', database: getActiveDatabase() });
      state.tabCounter += 1;
      state.activeTabId = id;
    }
  };

  const setActiveTab = (id) => {
    const tab = state.tabs.find((item) => item.id === id);
    if (!tab) return;
    state.activeTabId = id;
    if (!tab.database) {
      tab.database = getActiveDatabase();
    }
    setEditorValue(tab.sql || '', { suppressSuggestions: true });
    renderTabs();
  };

  const addTab = () => {
    const id = createId();
    state.tabs.push({ id, title: `${queryLabel} ${state.tabCounter}`, sql: '', database: getActiveDatabase() });
    state.tabCounter += 1;
    setActiveTab(id);
  };

  const removeTab = (id) => {
    const index = state.tabs.findIndex((item) => item.id === id);
    if (index === -1) return;
    state.tabs.splice(index, 1);
    if (state.activeTabId === id) {
      if (state.tabs.length > 0) {
        setActiveTab(state.tabs[Math.max(0, index - 1)].id);
      } else {
        ensureTab();
        setActiveTab(state.activeTabId);
      }
    } else {
      renderTabs();
    }
  };

  const renderTabs = () => {
    tabsRow.innerHTML = '';
    state.tabs.forEach((tab) => {
      const tabButton = document.createElement('div');
      tabButton.className = `data-app-tab${tab.id === state.activeTabId ? ' active' : ''}`;
      const label = document.createElement('span');
      label.textContent = tab.database ? `${tab.title} (${tab.database})` : tab.title;
      const close = document.createElement('span');
      close.textContent = '×';
      close.className = 'data-app-tab-close';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        removeTab(tab.id);
      });
      tabButton.appendChild(label);
      tabButton.appendChild(close);
      tabButton.addEventListener('click', () => setActiveTab(tab.id));
      tabsRow.appendChild(tabButton);
    });
  };

  const loadConnectionDatabases = async (connectionId) => {
    if (!backendAvailable || !connectionId) return;
    const conn = getConnectionById(connectionId);
    if (!conn || conn.databasesLoading) return;
    if (conn.databasesLoaded) return;
    updateConnectionState(connectionId, (item) => ({ ...item, databasesLoading: true }));
    renderConnections();
    try {
      const data = await invokeBackend(API_SCHEMA_LIST_DATABASES, { connectionId });
      const databases = Array.isArray(data.databases)
        ? data.databases.map((item) => ensureString(item?.name).trim()).filter((name) => name)
        : [];
      updateConnectionDatabases(connectionId, databases);
      renderConnections();
      if (connectionId === state.selectedConnectionId) {
        const active = getConnectionById(connectionId);
        if (active?.currentDatabase) {
          state.schema.selectedDatabase = active.currentDatabase;
          syncTabDatabases(active.currentDatabase);
        }
      }
    } catch (err) {
      updateConnectionState(connectionId, (item) => ({ ...item, databasesLoading: false }));
      renderConnections();
      setErrorMessage(err, '加载数据库失败: ');
    }
  };

  const switchConnectionDatabase = async (connectionId, database) => {
    if (!connectionId || !database) return;
    const conn = getConnectionById(connectionId);
    const previousDatabase = conn?.currentDatabase || conn?.database || '';
    if (previousDatabase === database) return;
    updateConnectionState(connectionId, (item) => ({ ...item, currentDatabase: database }));
    if (connectionId === state.selectedConnectionId) {
      state.schema.selectedDatabase = database;
      syncTabDatabases(database);
    }
    renderConnections();
    if (!backendAvailable) {
      if (connectionId === state.selectedConnectionId) {
        await loadTables(database);
      }
      await syncMcpSelection();
      return;
    }
    if (connectionId === state.selectedConnectionId) {
      setBusy('schema', true);
    }
    try {
      const data = await invokeBackend(API_CONNECTIONS_UPDATE, {
        connectionId,
        patch: { database },
      });
      state.connections = state.connections.map((item) =>
        item.id === data.connection.id ? normalizeConnection(data.connection, item) : item
      );
      if (connectionId === state.selectedConnectionId) {
        await loadTables(database);
      }
      renderConnections();
      renderStatus();
      await syncMcpSelection();
    } catch (err) {
      updateConnectionState(connectionId, (item) => ({ ...item, currentDatabase: previousDatabase }));
      if (connectionId === state.selectedConnectionId) {
        state.schema.selectedDatabase = previousDatabase;
        syncTabDatabases(previousDatabase);
        await loadTables(previousDatabase);
      }
      renderConnections();
      await syncMcpSelection();
      setErrorMessage(err, '切换数据库失败: ');
    } finally {
      if (connectionId === state.selectedConnectionId) {
        setBusy('schema', false);
      }
    }
  };

  const renderConnections = () => {
    connectionList.innerHTML = '';
    if (state.connections.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '暂无连接，点击上方新增。';
      connectionList.appendChild(empty);
      renderHeaderControls();
      return;
    }
    state.connections.forEach((conn) => {
      const item = document.createElement('div');
      item.className = `data-app-list-item${conn.id === state.selectedConnectionId ? ' active' : ''}`;
      const headerRow = document.createElement('div');
      headerRow.className = 'data-app-list-item-header';
      const titleEl = document.createElement('div');
      titleEl.className = 'data-app-list-item-title';
      titleEl.textContent = conn.name || '未命名连接';

      const actions = document.createElement('div');
      actions.className = 'data-app-icon-group';
      const testBtn = createIconButton('play', '测试连接');
      const editBtn = createIconButton('edit', '编辑连接');
      const deleteBtn = createIconButton('trash', '删除连接', 'danger');
      actions.appendChild(testBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      testBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await testConnection(conn.id);
      });
      editBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await editConnection(conn.id);
      });
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await deleteConnection(conn.id);
      });

      const metaEl = document.createElement('div');
      metaEl.className = 'data-app-list-meta';
      const hostText = formatConnectionHost(conn);
      const userText = ensureString(conn.user || conn.username || '').trim();
      metaEl.textContent = userText ? `${userText}@${hostText}` : hostText;
      const dbMeta = document.createElement('div');
      dbMeta.className = 'data-app-list-meta';
      dbMeta.textContent = `数据库：${conn.currentDatabase || conn.database || '未选择'}`;
      const authMeta = document.createElement('div');
      authMeta.className = 'data-app-list-meta';
      const authLabel = conn.authType === 'certificate' ? '证书' : '密码';
      const proxyInfo = conn.proxy && conn.proxy.type && conn.proxy.type !== 'none'
        ? `${conn.proxy.type.toUpperCase()} ${conn.proxy.host || '-'}:${conn.proxy.port || '-'}`
        : '无';
      authMeta.textContent = `认证：${authLabel} · 代理：${proxyInfo}`;

      item.addEventListener('click', () => selectConnection(conn.id));
      headerRow.appendChild(titleEl);
      headerRow.appendChild(actions);
      item.appendChild(headerRow);
      item.appendChild(metaEl);
      item.appendChild(dbMeta);
      item.appendChild(authMeta);
      connectionList.appendChild(item);
    });
    renderHeaderControls();
  };

  const renderResults = () => {
    resultsTableWrap.innerHTML = '';
    if (!state.results) {
      resultsSummary.textContent = '尚未执行查询';
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = `执行 ${queryLabel} 后显示结果。`;
      resultsTableWrap.appendChild(empty);
      return;
    }
    resultsSummary.textContent = `耗时 ${formatDuration(state.results.durationMs)} · 返回 ${state.results.rowCount ?? '-'} 行`;
    const rows = state.results.rows;
    if (!Array.isArray(rows)) {
      const pre = document.createElement('pre');
      pre.className = 'data-app-code';
      pre.textContent = JSON.stringify(rows, null, 2) || '无结果';
      resultsTableWrap.appendChild(pre);
      return;
    }
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '查询结果为空。';
      resultsTableWrap.appendChild(empty);
      return;
    }
    const tableScroll = document.createElement('div');
    tableScroll.className = 'data-app-table-scroll';
    const table = document.createElement('table');
    table.className = 'data-app-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    let columns = [];
    if (Array.isArray(state.results.fields) && state.results.fields.length > 0) {
      columns = state.results.fields.map((field) => field.name);
    } else if (Array.isArray(rows[0])) {
      columns = rows[0].map((_, index) => `col_${index + 1}`);
    } else if (isPlainObject(rows[0])) {
      columns = Object.keys(rows[0]);
    }

    columns.forEach((name) => {
      const th = document.createElement('th');
      th.textContent = name;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const rowsToRender = rows.slice(0, MAX_RENDER_ROWS);
    rowsToRender.forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((name, index) => {
        const td = document.createElement('td');
        let value;
        if (Array.isArray(row)) {
          value = row[index];
        } else if (row && typeof row === 'object') {
          value = row[name];
        } else {
          value = row;
        }
        if (value instanceof Date) {
          td.textContent = value.toISOString();
        } else if (typeof value === 'bigint') {
          td.textContent = value.toString();
        } else if (typeof value === 'object' && value !== null) {
          td.textContent = JSON.stringify(value);
        } else {
          td.textContent = ensureString(value);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableScroll.appendChild(table);

    if (rows.length > MAX_RENDER_ROWS) {
      const note = document.createElement('div');
      note.className = 'data-app-meta';
      note.textContent = `已显示前 ${MAX_RENDER_ROWS} 行（共 ${rows.length} 行）。`;
      tableScroll.appendChild(note);
    }
    resultsTableWrap.appendChild(tableScroll);
  };

  const renderHistory = () => {
    historyList.innerHTML = '';
    if (state.history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '暂无历史记录。';
      historyList.appendChild(empty);
      return;
    }
    state.history.forEach((item) => {
      const entry = document.createElement('div');
      entry.className = 'data-app-list-item';
      const headerRow = document.createElement('div');
      headerRow.className = 'data-app-list-item-header';
      const titleEl = document.createElement('div');
      titleEl.className = 'data-app-list-item-title';
      titleEl.textContent = `${formatDateTime(item.createdAt)} · ${item.status === 'error' ? '失败' : '成功'} · ${item.rowCount ?? 0} 行`;

      const actions = document.createElement('div');
      actions.className = 'data-app-icon-group';
      const loadBtn = createIconButton('load', historyLoadLabel);
      const runBtn = createIconButton('play', historyRunLabel);
      actions.appendChild(loadBtn);
      actions.appendChild(runBtn);

      const sqlEl = document.createElement('div');
      sqlEl.className = 'data-app-list-meta';
      sqlEl.textContent = ensureString(item.sql).slice(0, 120);
      loadBtn.addEventListener('click', () => {
        const active = state.tabs.find((tab) => tab.id === state.activeTabId);
        if (active) {
          active.sql = item.sql || '';
          setEditorValue(active.sql, { suppressSuggestions: true, focus: true });
          setMessage(`已载入 ${queryLabel}`);
        }
      });
      runBtn.addEventListener('click', async () => {
        const active = state.tabs.find((tab) => tab.id === state.activeTabId);
        if (active) {
          active.sql = item.sql || '';
          setEditorValue(active.sql, { suppressSuggestions: true });
        }
        await executeSql();
      });
      headerRow.appendChild(titleEl);
      headerRow.appendChild(actions);
      entry.appendChild(headerRow);
      entry.appendChild(sqlEl);
      historyList.appendChild(entry);
    });
  };

  renderMcpActivity = () => {
    mcpList.innerHTML = '';
    if (state.mcpEvents.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '暂无 MCP 活动。';
      mcpList.appendChild(empty);
      return;
    }
    state.mcpEvents.forEach((event) => {
      const entry = document.createElement('div');
      entry.className = 'data-app-list-item';
      const headerRow = document.createElement('div');
      headerRow.className = 'data-app-list-item-header';
      const titleEl = document.createElement('div');
      titleEl.className = 'data-app-list-item-title';
      const toolLabel = stripMcpPrefix(event.tool);
      titleEl.textContent = `${formatTime(event.at)} · ${toolLabel || 'mcp'}`;
      headerRow.appendChild(titleEl);

      const metaEl = document.createElement('div');
      metaEl.className = 'data-app-list-meta';
      if (event.error) {
        metaEl.textContent = `错误: ${ensureString(event.error.message || event.error).trim()}`;
      } else if (event.result) {
        const rowCount = Number.isFinite(event.result.rowCount) ? event.result.rowCount : '-';
        const durationText = formatDuration(event.result.durationMs);
        const sqlText = ensureString(event.sql).trim();
        metaEl.textContent = sqlText ? `${sqlText.slice(0, 80)} · ${rowCount} 行 · ${durationText}` : `${rowCount} 行 · ${durationText}`;
      } else {
        metaEl.textContent = '已完成';
      }
      entry.appendChild(headerRow);
      entry.appendChild(metaEl);
      mcpList.appendChild(entry);
    });
  };

  renderSchemaModal = () => {
    if (!schemaModalOpen) return;
    const selectedTable = state.schema.selectedTable;
    modalTitle.textContent = selectedTable ? `表结构 · ${selectedTable}` : '表结构';
    modalBody.innerHTML = '';

    if (!selectedTable) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '请选择表查看字段。';
      modalBody.appendChild(empty);
      return;
    }

    if (state.schema.tableColumnsLoading[selectedTable]) {
      const loading = document.createElement('div');
      loading.className = 'data-app-empty';
      loading.textContent = '字段加载中...';
      modalBody.appendChild(loading);
      return;
    }

    if (!Array.isArray(state.schema.columns) || state.schema.columns.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '暂无字段信息。';
      modalBody.appendChild(empty);
      return;
    }

    const summary = document.createElement('div');
    summary.className = 'data-app-meta';
    summary.textContent = `共 ${state.schema.columns.length} 个字段`;
    modalBody.appendChild(summary);

    const table = document.createElement('table');
    table.className = 'data-app-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const columnHeaders = getSchemaColumnHeaders();
    columnHeaders.forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    state.schema.columns.forEach((col) => {
      const tr = document.createElement('tr');
      const cells = getSchemaRowCells(col);
      (Array.isArray(cells) ? cells : []).forEach((value) => {
        const td = document.createElement('td');
        td.textContent = ensureString(value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'data-app-table-wrap';
    tableWrap.appendChild(table);
    modalBody.appendChild(tableWrap);
  };

  const renderSchema = () => {
    databaseSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '选择数据库';
    databaseSelect.appendChild(defaultOption);

    state.schema.databases.forEach((db) => {
      const option = document.createElement('option');
      option.value = db.name;
      option.textContent = db.name;
      if (db.name === state.schema.selectedDatabase) {
        option.selected = true;
      }
      databaseSelect.appendChild(option);
    });
    renderHeaderControls();

    tablesList.innerHTML = '';
    if (!state.schema.selectedDatabase) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '请选择数据库。';
      tablesList.appendChild(empty);
    } else if (state.schema.tables.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '暂无表。';
      tablesList.appendChild(empty);
    } else {
      state.schema.tables.forEach((table) => {
        const item = document.createElement('div');
        item.className = `data-app-list-item${table.name === state.schema.selectedTable ? ' active' : ''}`;
        const titleEl = document.createElement('div');
        titleEl.className = 'data-app-list-item-title';
        titleEl.textContent = table.name;
        const metaEl = document.createElement('div');
        metaEl.className = 'data-app-list-meta';
        metaEl.textContent = `${table.type || ''}${table.rows != null ? ` · ${table.rows} 行` : ''}`;
        item.appendChild(titleEl);
        item.appendChild(metaEl);
        item.addEventListener('click', () => selectTable(table.name));
        tablesList.appendChild(item);
      });
    }

    columnsWrap.innerHTML = '';
    if (schemaModalEnabled) {
      const hint = document.createElement('div');
      hint.className = 'data-app-empty';
      hint.textContent = state.schema.selectedTable ? '字段已在弹窗中展示。' : '点击表名查看字段。';
      columnsWrap.appendChild(hint);
      renderSchemaModal();
      return;
    }
    if (!state.schema.selectedTable) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '请选择表查看字段。';
      columnsWrap.appendChild(empty);
      renderSchemaModal();
      return;
    }
    if (state.schema.columns.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'data-app-empty';
      empty.textContent = '暂无字段信息。';
      columnsWrap.appendChild(empty);
      renderSchemaModal();
      return;
    }
    const table = document.createElement('table');
    table.className = 'data-app-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const columnHeaders = getSchemaColumnHeaders();
    columnHeaders.forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    state.schema.columns.forEach((col) => {
      const tr = document.createElement('tr');
      const cells = getSchemaRowCells(col);
      (Array.isArray(cells) ? cells : []).forEach((value) => {
        const td = document.createElement('td');
        td.textContent = ensureString(value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    columnsWrap.appendChild(table);
    renderSchemaModal();
  };

  const renderView = () => {
    resultsView.style.display = 'flex';
    historyView.style.display = 'flex';
    schemaView.style.display = 'flex';
    mcpView.style.display = 'flex';
  };

  const updateStateAfterSelect = async () => {
    renderConnections();
    renderStatus();
    state.view = 'schema';
    renderView();
    await syncMcpSelection();
    if (state.selectedConnectionId) {
      await loadSchema();
      await loadHistory();
    }
  };

  const loadConnections = async () => {
    if (!backendAvailable) {
      setMessage('后端不可用，无法加载连接', 'error');
      return;
    }
    setBusy('connections', true);
    try {
      const data = await invokeBackend(API_CONNECTIONS_LIST);
      const previousById = new Map(state.connections.map((item) => [item.id, item]));
      const items = data.items || [];
      state.connections = items.map((item) => normalizeConnection(item, previousById.get(item.id)));
      if (state.selectedConnectionId && !state.connections.some((item) => item.id === state.selectedConnectionId)) {
        state.selectedConnectionId = '';
      }
      if (!state.selectedConnectionId && state.connections.length > 0) {
        state.selectedConnectionId = state.connections[0].id;
      }
      await syncMcpSelection();
      renderConnections();
      renderStatus();
    } catch (err) {
      setErrorMessage(err);
    } finally {
      setBusy('connections', false);
    }
  };

  const selectConnection = async (id) => {
    state.selectedConnectionId = id;
    state.connectionStatus = 'idle';
    state.connectionStatusDetail = '';
    state.view = 'schema';
    await updateStateAfterSelect();
  };

  const editConnection = async (id) => {
    if (!backendAvailable) return;
    setBusy('connections', true);
    try {
      const data = await invokeBackend(API_CONNECTIONS_GET, { connectionId: id, includePassword: true });
      const conn = data.connection;
      openForm('edit', conn);
    } catch (err) {
      setErrorMessage(err);
    } finally {
      setBusy('connections', false);
    }
  };

  const deleteConnection = async (id) => {
    if (!backendAvailable) return;
    const confirmed = window.confirm('确定要删除该连接吗？');
    if (!confirmed) return;
    setBusy('connections', true);
    try {
      await invokeBackend(API_CONNECTIONS_DELETE, { connectionId: id });
      state.connections = state.connections.filter((item) => item.id !== id);
      if (state.selectedConnectionId === id) {
        state.selectedConnectionId = state.connections[0]?.id || '';
      }
      await syncMcpSelection();
      setMessage('连接已删除');
      renderConnections();
      renderStatus();
    } catch (err) {
      setErrorMessage(err);
    } finally {
      setBusy('connections', false);
    }
  };

  const testConnection = async (id = state.selectedConnectionId) => {
    if (!backendAvailable) return;
    if (!id) {
      setMessage('请选择连接', 'error');
      return;
    }
    setBusy('connections', true);
    state.connectionStatus = 'testing';
    renderStatus();
    try {
      const data = await invokeBackend(API_CONNECTIONS_TEST, { connectionId: id });
      state.connectionStatus = 'ok';
      state.connectionStatusDetail = data.serverVersion || '';
      setMessage(`连接成功 ${data.serverVersion ? `(${data.serverVersion})` : ''}`);
    } catch (err) {
      state.connectionStatus = 'error';
      state.connectionStatusDetail = err.message;
      setErrorMessage(err, '连接失败: ');
    } finally {
      setBusy('connections', false);
      renderStatus();
    }
  };

  const fetchFormDatabases = async () => {
    if (!backendAvailable) return;
    setBusy('formDatabases', true);
    try {
      const formType = getFormType();
      const config = getFormPayload({ includeStoredPassword: true });
      if (formType === 'mongo') {
        if (!config.hosts) {
          throw new Error('主机列表为必填项');
        }
      } else if (!config.host || !config.user) {
        throw new Error('主机和用户名为必填项');
      }
      if (!config.name) {
        if (formType === 'mongo') {
          config.name = config.user ? `${config.user}@${config.hosts}` : config.hosts;
        } else {
          config.name = `${config.user}@${config.host}`;
        }
      }
      config.database = '';
      const selectedValue = getSelectedFormDatabase();
      await invokeBackend(API_CONNECTIONS_TEST, { config });
      const data = await invokeBackend(API_SCHEMA_LIST_DATABASES, { config });
      const databases = Array.isArray(data.databases)
        ? data.databases.map((item) => ensureString(item?.name).trim()).filter((name) => name)
        : [];
      const { type: dbType } = getFormDatabaseState(formType);
      state.formDatabasesByType[dbType] = databases;
      renderFormDatabaseOptions(selectedValue, formType);
      setMessage(databases.length > 0 ? `已获取 ${databases.length} 个数据库` : '未获取到数据库');
    } catch (err) {
      setErrorMessage(err, '获取数据库失败: ');
    } finally {
      setBusy('formDatabases', false);
    }
  };

  const saveConnection = async () => {
    if (!backendAvailable) return;
    setBusy('connections', true);
    try {
      const payload = getFormPayload();
      if (payload.type === 'mongo') {
        if (!payload.name || !payload.hosts) {
          throw new Error('名称、主机列表为必填项');
        }
      } else if (!payload.name || !payload.host || !payload.user) {
        throw new Error('名称、主机、用户名为必填项');
      }
      if (state.formMode === 'create') {
        const data = await invokeBackend(API_CONNECTIONS_CREATE, { config: payload });
        state.connections.push(normalizeConnection(data.connection));
        state.selectedConnectionId = data.connection.id;
        setMessage('连接已创建');
      } else {
        const patch = { ...payload };
        if (patch.type === 'mongo') {
          if (!patch.password) {
            delete patch.password;
          }
          if (patch.tls && typeof patch.tls === 'object' && !patch.tls.passphrase) {
            delete patch.tls.passphrase;
          }
        } else {
          if (patch.authType !== 'certificate' && !patch.password) {
            delete patch.password;
          }
          if (patch.ssl && typeof patch.ssl === 'object' && !patch.ssl.passphrase) {
            delete patch.ssl.passphrase;
          }
          if (patch.proxy && typeof patch.proxy === 'object' && !patch.proxy.password) {
            delete patch.proxy.password;
          }
        }
        const data = await invokeBackend(API_CONNECTIONS_UPDATE, {
          connectionId: state.selectedConnectionId,
          patch,
        });
        state.connections = state.connections.map((item) =>
          item.id === data.connection.id ? normalizeConnection(data.connection, item) : item
        );
        setMessage('连接已更新');
      }
      await syncMcpSelection();
      closeForm();
      renderConnections();
      renderStatus();
      await loadSchema();
    } catch (err) {
      setErrorMessage(err);
    } finally {
      setBusy('connections', false);
    }
  };

  const loadHistory = async () => {
    if (!backendAvailable) return;
    setBusy('history', true);
    try {
      const params = { limit: HISTORY_PAGE_SIZE };
      if (state.historyScope === 'selected' && state.selectedConnectionId) {
        params.connectionId = state.selectedConnectionId;
      }
      const data = await invokeBackend(API_HISTORY_LIST, params);
      state.history = data.items || [];
      renderHistory();
    } catch (err) {
      setErrorMessage(err);
    } finally {
      setBusy('history', false);
    }
  };

  const loadSchema = async () => {
    if (!backendAvailable || !state.selectedConnectionId) return;
    setBusy('schema', true);
    setMessage('正在加载架构...');
    state.schema.tableColumns = {};
    state.schema.tableColumnsLoading = {};
    try {
      const data = await invokeBackend(API_SCHEMA_LIST_DATABASES, { connectionId: state.selectedConnectionId });
      const databases = data.databases || [];
      const databaseNames = databases
        .map((item) => ensureString(item?.name).trim())
        .filter((name) => name);
      state.schema.databases = databases;
      setMessage(`已加载 ${state.schema.databases.length} 个数据库`);
      const activeConnection = getActiveConnection();
      const nextDatabase = resolveDatabase(activeConnection?.currentDatabase, databaseNames, activeConnection?.database);
      if (activeConnection) {
        updateConnectionDatabases(activeConnection.id, databaseNames);
      }
      state.schema.selectedDatabase = nextDatabase;
      syncTabDatabases(nextDatabase);
      await syncMcpSelection();
      await loadTables(state.schema.selectedDatabase);
      renderConnections();
      renderSchema();
    } catch (err) {
      setErrorMessage(err, '加载架构失败: ');
    } finally {
      setBusy('schema', false);
    }
  };

  const loadTables = async (database) => {
    if (!backendAvailable || !state.selectedConnectionId || !database) {
      state.schema.tables = [];
      state.schema.columns = [];
      state.schema.selectedTable = '';
      state.schema.tableColumns = {};
      state.schema.tableColumnsLoading = {};
      if (schemaModalEnabled) {
        closeSchemaModal();
      }
      renderSchema();
      return;
    }
    state.schema.tableColumns = {};
    state.schema.tableColumnsLoading = {};
    try {
      const data = await invokeBackend(API_SCHEMA_LIST_TABLES, {
        connectionId: state.selectedConnectionId,
        database,
      });
      state.schema.selectedDatabase = database;
      const activeConnection = getActiveConnection();
      if (activeConnection) {
        updateConnectionState(activeConnection.id, (conn) => ({ ...conn, currentDatabase: database }));
      }
      syncTabDatabases(database);
      state.schema.tables = data.tables || [];
      state.schema.selectedTable = '';
      state.schema.columns = [];
      if (schemaModalEnabled) {
        closeSchemaModal();
      }
      renderSchema();
      renderConnections();
    } catch (err) {
      state.schema.tables = [];
      state.schema.columns = [];
      state.schema.selectedTable = '';
      if (schemaModalEnabled) {
        closeSchemaModal();
      }
      renderSchema();
      setErrorMessage(err);
    }
  };

  const selectTable = async (table) => {
    if (!backendAvailable || !state.selectedConnectionId || !state.schema.selectedDatabase) return;
    setBusy('schema', true);
    try {
      state.schema.selectedTable = table;
      state.schema.columns = [];
      state.schema.tableColumnsLoading[table] = true;
      renderSchema();
      if (schemaModalEnabled) {
        openSchemaModal();
      }
      const data = await invokeBackend(API_SCHEMA_DESCRIBE_TABLE, {
        connectionId: state.selectedConnectionId,
        database: state.schema.selectedDatabase,
        table,
      });
      state.schema.columns = data.columns || [];
      state.schema.tableColumns[table] = state.schema.columns.map((col) => col.name).filter(Boolean);
      delete state.schema.tableColumnsLoading[table];
      renderSchema();
      renderSchemaModal();
    } catch (err) {
      delete state.schema.tableColumnsLoading[table];
      setErrorMessage(err);
      renderSchemaModal();
    } finally {
      setBusy('schema', false);
    }
  };

  const executeSql = async () => {
    if (!backendAvailable) return;
    const sql = ensureString(sqlEditor.value).trim();
    if (!sql) {
      setMessage(`请输入 ${queryLabel}`, 'error');
      return;
    }
    if (!state.selectedConnectionId) {
      setMessage('请选择连接', 'error');
      return;
    }
    setBusy('query', true);
    try {
      const data = await invokeBackend(API_QUERY_EXECUTE, {
        connectionId: state.selectedConnectionId,
        sql,
      });
      state.results = {
        rows: data.rows,
        fields: data.fields,
        durationMs: data.durationMs,
        rowCount: data.rowCount,
        warnings: data.warnings,
      };
      state.lastRun = { durationMs: data.durationMs, rowCount: data.rowCount };
      setMessage(`${queryLabel} 执行成功`);
      state.view = 'results';
      renderView();
      renderResults();
      renderStatus();
      await loadHistory();
    } catch (err) {
      state.lastRun = { durationMs: null, rowCount: 0 };
      setErrorMessage(err, '执行失败: ');
      renderStatus();
    } finally {
      setBusy('query', false);
    }
  };

  const exportCsv = () => {
    if (!state.results || !Array.isArray(state.results.rows) || state.results.rows.length === 0) {
      setMessage('没有可导出的结果', 'error');
      return;
    }
    const csv = rowsToCsv(state.results.rows, state.results.fields);
    if (!csv) {
      setMessage('导出失败：无法生成 CSV', 'error');
      return;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `query-result-${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('已导出 CSV');
  };

  const insertEditorText = (text, options = {}) => {
    const value = sqlEditor.value || '';
    const start = sqlEditor.selectionStart;
    const end = sqlEditor.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const nextValue = before + text + after;
    const nextCursor = before.length + text.length + (options.cursorOffset || 0);
    setEditorValue(nextValue, { cursor: nextCursor, suppressSuggestions: options.suppressSuggestions });
  };

  const handleEditorInput = () => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (active) active.sql = sqlEditor.value;
    updateEditorView();
    updateButtons();
    updateSuggestions();
  };

  const insertIndentedNewline = (value, cursor) => {
    const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
    const indentMatch = value.slice(lineStart, cursor).match(/^[\t ]+/);
    const indent = indentMatch ? indentMatch[0] : '';
    insertEditorText(`\n${indent}`, { suppressSuggestions: true });
  };

  const handleEditorKeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      executeSql();
      return;
    }

    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();
      updateSuggestions(true);
      return;
    }

    if (event.key === 'Enter') {
      const value = sqlEditor.value || '';
      const cursor = sqlEditor.selectionStart;
      const tokenInfo = getTokenAtCursor(value, cursor);
      const context = getSuggestionContext(value, cursor);
      if (shouldSuppressConditionalSuggestions(tokenInfo, context)) {
        event.preventDefault();
        closeSuggestions();
        insertIndentedNewline(value, cursor);
        return;
      }
    }

    if (editorState.open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSuggestion(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSuggestion(-1);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const item = editorState.suggestions[editorState.activeIndex];
        if (item) applySuggestion(item);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = editorState.suggestions[editorState.activeIndex];
        if (item) applySuggestion(item);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSuggestions();
        return;
      }
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      updateSuggestions(true);
      if (editorState.open) {
        const item = editorState.suggestions[editorState.activeIndex];
        if (item) {
          applySuggestion(item);
          return;
        }
      }
      insertEditorText('  ', { suppressSuggestions: true });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const value = sqlEditor.value || '';
      const cursor = sqlEditor.selectionStart;
      insertIndentedNewline(value, cursor);
      return;
    }

    const pairs = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
      '`': '`',
    };
    if (Object.prototype.hasOwnProperty.call(pairs, event.key)) {
      event.preventDefault();
      const value = sqlEditor.value || '';
      const start = sqlEditor.selectionStart;
      const end = sqlEditor.selectionEnd;
      const closing = pairs[event.key];
      if (start !== end) {
        const selected = value.slice(start, end);
        const nextValue = value.slice(0, start) + event.key + selected + closing + value.slice(end);
        setEditorValue(nextValue, { cursor: end + 1, suppressSuggestions: true });
        return;
      }
      const nextValue = value.slice(0, start) + event.key + closing + value.slice(start);
      setEditorValue(nextValue, { cursor: start + 1, suppressSuggestions: true });
      return;
    }

    if ([')', ']', '}', '"', "'", '`'].includes(event.key)) {
      const nextChar = sqlEditor.value[sqlEditor.selectionStart];
      if (nextChar === event.key) {
        event.preventDefault();
        const nextPos = sqlEditor.selectionStart + 1;
        sqlEditor.setSelectionRange(nextPos, nextPos);
      }
    }
  };

  const handleEditorResize = () => {
    updateMirrorStyles();
    positionSuggestions();
  };

  newConnectionButton.addEventListener('click', () => openForm('create'));
  cancelConnectionButton.addEventListener('click', () => closeForm());
  saveConnectionButton.addEventListener('click', () => saveConnection());
  fetchDatabasesButton.addEventListener('click', () => fetchFormDatabases());
  formDatabaseSelect.addEventListener('change', () => {
    const formType = getFormType();
    const { custom, databases, selected } = getFormDatabaseState(formType);
    const value = formDatabaseSelect.value;
    if (value !== FORM_DATABASE_CUSTOM_OPTION) {
      state.formDatabaseSelectedByType[formType] = value;
      return;
    }
    const input = window.prompt('请输入数据库名称', selected || '');
    if (input == null) {
      formDatabaseSelect.value = selected || '';
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      state.formDatabaseSelectedByType[formType] = '';
      formDatabaseSelect.value = '';
      return;
    }
    if (!custom.includes(trimmed) && !databases.includes(trimmed)) {
      state.formCustomDatabasesByType[formType].push(trimmed);
    }
    renderFormDatabaseOptions(trimmed, formType);
  });
  authTypeSelect.addEventListener('change', () => {
    updateAuthFieldsVisibility();
  });
  sslModeSelect.addEventListener('change', () => {
    updateSslFieldsVisibility();
  });
  proxyTypeSelect.addEventListener('change', () => {
    updateProxyFieldsVisibility();
  });
  mongoTlsSelect.addEventListener('change', () => {
    updateMongoTlsFieldsVisibility();
  });
  typeSelect.addEventListener('change', () => {
    const previousType = state.formType;
    storeActiveFormData(previousType);
    state.formType = normalizeFormType(typeSelect.value);
    resetForm();
  });
  refreshConnectionsButton.addEventListener('click', () => loadConnections());

  headerConnectionSelect.addEventListener('change', async () => {
    const nextId = headerConnectionSelect.value;
    if (nextId && nextId !== state.selectedConnectionId) {
      await selectConnection(nextId);
    }
  });
  headerDatabaseSelect.addEventListener('focus', () => {
    if (state.selectedConnectionId) loadConnectionDatabases(state.selectedConnectionId);
  });
  headerDatabaseSelect.addEventListener('change', async () => {
    if (!state.selectedConnectionId) return;
    await switchConnectionDatabase(state.selectedConnectionId, headerDatabaseSelect.value);
  });

  addTabButton.addEventListener('click', () => addTab());
  clearButton.addEventListener('click', () => {
    setEditorValue('', { suppressSuggestions: true, focus: true });
  });
  runButton.addEventListener('click', () => executeSql());
  sqlEditor.addEventListener('input', handleEditorInput);
  sqlEditor.addEventListener('keydown', handleEditorKeydown);
  sqlEditor.addEventListener('scroll', syncEditorScroll);
  sqlEditor.addEventListener('click', () => updateSuggestions());
  sqlEditor.addEventListener('focus', () => updateSuggestions());
  sqlEditor.addEventListener('blur', () => closeSuggestions());
  sqlEditor.addEventListener('keyup', (event) => {
    if (['ArrowUp', 'ArrowDown'].includes(event.key) && editorState.open) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      updateSuggestions();
    }
  });
  window.addEventListener('resize', handleEditorResize);
  cleanup.push(() => window.removeEventListener('resize', handleEditorResize));

  exportButton.addEventListener('click', () => exportCsv());

  historyScopeSelect.addEventListener('change', async () => {
    state.historyScope = historyScopeSelect.value;
    await loadHistory();
  });
  historyRefreshButton.addEventListener('click', () => loadHistory());
  historyClearButton.addEventListener('click', async () => {
    if (!backendAvailable) return;
    const confirmed = window.confirm('确定要清空历史记录吗？');
    if (!confirmed) return;
    setBusy('history', true);
    try {
      await invokeBackend(API_HISTORY_CLEAR, {
        connectionId: state.historyScope === 'selected' ? state.selectedConnectionId : undefined,
      });
      setMessage('历史已清空');
      await loadHistory();
    } catch (err) {
      setErrorMessage(err);
    } finally {
      setBusy('history', false);
    }
  });

  databaseSelect.addEventListener('change', async () => {
    await switchConnectionDatabase(state.selectedConnectionId, databaseSelect.value);
  });
  schemaRefreshButton.addEventListener('click', () => loadSchema());

  const init = async () => {
    ensureTab();
    setActiveTab(state.activeTabId);
    state.view = 'schema';
    renderView();
    renderResults();
    renderMcpActivity();
    if (!backendAvailable) {
      setMessage('后端未连接，部分功能不可用', 'error');
      updateButtons();
      return;
    }
    await loadConnections();
    closeForm();
    if (state.selectedConnectionId) {
      await loadSchema();
      await loadHistory();
    }
  };

  init().catch((err) => setErrorMessage(err));

  updateButtons();
  renderStatus();

  return () => {
    cleanup.forEach((fn) => fn());
  };
}
