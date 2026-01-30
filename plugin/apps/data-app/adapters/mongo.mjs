const MONGO_KEYWORDS = [
  'FIND',
  'AGGREGATE',
  'MATCH',
  'PROJECT',
  'GROUP',
  'SORT',
  'LIMIT',
  'SKIP',
  'INSERT',
  'UPDATE',
  'DELETE',
  'UPSERT',
  'LOOKUP',
  'UNWIND',
  'COUNT',
];

const MONGO_SUGGESTION_KEYWORDS = [
  'FIND',
  'AGGREGATE',
  'MATCH',
  'PROJECT',
  'GROUP',
  'SORT',
  'LIMIT',
  'SKIP',
  'LOOKUP',
  'UNWIND',
  'COUNT',
];

export const mongoAdapter = {
  id: 'mongo',
  label: 'MongoDB',
  defaults: {
    port: '27017',
  },
  ui: {
    title: 'MongoDB 数据库连接管理',
    queryLabel: '查询',
    editorTitle: '查询编辑器',
    runLabel: '执行查询',
    loadLabel: '载入查询',
    editorPlaceholder: '输入查询，Ctrl/Cmd + Enter 执行',
    editorHint: '提示: Ctrl/Cmd+Enter 执行 · Ctrl+Space 提示 · Tab 补全 · Enter 确认',
  },
  language: {
    kind: 'nosql',
    keywords: MONGO_KEYWORDS,
    suggestionKeywords: MONGO_SUGGESTION_KEYWORDS,
    functions: new Set(['COUNT']),
  },
  api: {
    connections: {
      list: 'connections.list',
      get: 'connections.get',
      create: 'connections.create',
      update: 'connections.update',
      delete: 'connections.delete',
      test: 'connections.test',
    },
    schema: {
      listDatabases: 'schema.listDatabases',
      listTables: 'schema.listTables',
      describeTable: 'schema.describeTable',
    },
    query: {
      execute: 'query.execute',
    },
    history: {
      list: 'history.list',
      clear: 'history.clear',
    },
    mcp: {
      selectionSet: 'mcp.selection.set',
      eventLatest: 'mcp.event.latest',
    },
  },
  schema: {
    columnHeaders: ['字段', '类型', '示例', '覆盖率'],
    getRowCells: (col) => {
      const types = Array.isArray(col.types) ? col.types.join(',') : col.type || col.types || '';
      const sample = col.sample ?? col.example ?? '';
      const coverage =
        col.coverage ??
        (col.count != null && col.total != null ? `${col.count}/${col.total}` : col.count ?? '');
      return [col.name, types, sample, coverage];
    },
  },
  mcp: {
    toolPrefix: 'mongo.',
    toolNames: {
      listTables: 'schema.listTables',
      executeQuery: 'query.execute',
    },
    messages: {
      listTables: (rowCount) => `MCP 已获取 ${rowCount ?? 0} 个集合`,
      executeQuery: (rowCount) => `MCP 已执行查询 · ${rowCount ?? '-'} 条`,
      default: 'MCP 已更新结果',
    },
  },
};
