# MySQL 数据库连接应用使用说明

## 1. 应用概述

这是一个基于 ChatOS UI Apps 的 MySQL 数据库连接管理客户端，提供连接管理、SQL 执行、结构浏览、查询历史与数据导出能力，并支持紧凑视图（侧边栏/分割视图）与 MCP 工具调用。

## 2. 功能特性

- 连接管理：创建、编辑、删除、测试 MySQL 连接
- SQL 执行：多标签 SQL 编辑、快速执行、结果表格展示
- 数据浏览：数据库/表结构查看
- 查询历史：自动记录与快速载入
- 数据导出：查询结果导出 CSV
- 紧凑视图：侧边栏快速操作与状态查看
- MCP Server：通过 MCP 工具执行 SQL（使用应用中选定的连接与数据库，需打包依赖）

## 3. 安装和启动

### 本地开发（沙箱）

```bash
npm install
npm run dev
```

### 校验与打包

```bash
npm run validate
npm run pack
```

### 安装到本机 ChatOS

```bash
npm run install:chatos
```

> 注意：ChatOS 导入插件时默认排除 `node_modules/`。如启用 MCP Server/后端依赖（如 `mongodb`），需将其打包成单文件产物并在 `plugin.json` 中指向打包文件。

## 4. 使用指南

### 4.1 如何创建 MySQL 连接

1. 打开应用后在左侧「连接管理」点击「新建连接」。
2. 填写必填项：
   - 名称
   - 主机（host）
   - 端口（port）
   - 用户名（user）
3. 可选填写：密码、默认数据库、连接池参数（JSON）。
4. 点击「保存」完成创建。
5. 选择连接后可点击「测试连接」验证可用性。

### 4.2 如何执行 SQL 查询

1. 在中间「SQL 编辑器」中选择或新建标签。
2. 输入 SQL 语句。
3. 点击「执行 SQL」或使用 `Ctrl/Cmd + Enter`。
4. 结果在右侧「结果」面板中表格展示。

### 4.3 如何浏览数据库结构

1. 选择连接后切换到右侧「结构」面板。
2. 选择数据库（database）。
3. 点击表名称查看字段、类型、默认值等信息。

### 4.4 如何导出数据

1. 执行查询并得到结果。
2. 右侧「结果」面板点击「导出 CSV」。
3. 浏览器会下载 CSV 文件。

### 4.5 紧凑视图（Compact）

在侧边栏或分割视图中可使用紧凑视图：
- 查看连接状态
- 快速执行 SQL
- 查看最近查询历史
- 快捷测试/刷新连接

## 5. 配置说明

### 5.1 连接字段说明

- `name`：连接名称
- `host`：数据库地址
- `port`：端口（默认 3306）
- `user`：用户名
- `password`：密码
- `database`：默认数据库
- `options`：连接池与驱动参数（JSON）

### 5.2 常用连接池参数示例

```json
{
  "connectionLimit": 10,
  "waitForConnections": true,
  "queueLimit": 0,
  "connectTimeout": 10000
}
```

### 5.3 数据存储与安全

- 连接配置会存储在应用数据目录（`dataDir`）
- 连接配置采用简单加密保存
- 查询历史记录保存在本地

## 6. 常见问题

1. **连接测试失败**
   - 请检查 host/port/用户名/密码
   - 确认 MySQL 服务可达、防火墙未阻断
   - 需要时填写正确的数据库名称

2. **SQL 执行报错**
   - 检查 SQL 语法与权限
   - 确认当前连接用户有执行权限

3. **无结果或结果为空**
   - 确认查询条件
   - 确认数据库中存在数据

4. **导出 CSV 失败**
   - 确保查询结果非空
   - 尝试重新执行 SQL

5. **MCP 提示未选择连接/数据库**
   - 请先在应用内选择连接和数据库
   - 若连接未设置默认数据库，可在「结构」面板切换数据库

6. **MCP Server 无法使用**
   - 需将 MCP server 打包成单文件并配置 `plugin.json` 中 `ai.mcp.entry`
   - 确保 `@modelcontextprotocol/sdk` 及 `mysql2` 已正确打包

## 7. 开发说明

### 目录结构（关键文件）

- `plugin/backend/index.mjs`：后端服务（MySQL 连接管理）
- `plugin/apps/data-app/index.mjs`：主界面
- `plugin/apps/data-app/compact.mjs`：紧凑视图
- `plugin/apps/data-app/mcp-server.mjs`：MCP Server（需打包）

### 开发建议

- 本地使用 `npm run dev` 进行调试
- 提交前运行 `npm run validate`
- MCP server 需打包成单文件（ChatOS 导入会排除 `node_modules/`）
- 后端仅写入 `ctx.dataDir` 目录，避免写其他路径

---

如需更多功能或定制，请在此基础上扩展前后端逻辑与 UI。
