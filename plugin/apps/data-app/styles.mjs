export const DATA_APP_STYLES = `
    .data-app-root {
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      box-sizing: border-box;
      color: var(--ds-text, #1f1f1f);
      font-family: var(--ds-font, system-ui, -apple-system, Segoe UI, sans-serif);
      background: var(--ds-app-bg, #f5f5f5);
      --ds-text-muted: rgba(0,0,0,0.65);
      --ds-text-subtle: rgba(0,0,0,0.45);
    }
    .data-app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 12px;
      background: var(--ds-panel-bg, #fff);
      flex-wrap: wrap;
    }
    .data-app-header-left,
    .data-app-header-center,
    .data-app-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .data-app-header-center {
      flex: 1;
      min-width: 240px;
    }
    .data-app-header-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 160px;
    }
    .data-app-header-label {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .data-app-header-select {
      min-width: 160px;
    }
    .data-app-title {
      font-size: 18px;
      font-weight: 700;
    }
    .data-app-meta {
      font-size: 12px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .data-app-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid #91caff;
      background: #e6f4ff;
      color: #1677ff;
    }
    .data-app-pill.ok {
      border-color: #b7eb8f;
      background: #f6ffed;
      color: #52c41a;
    }
    .data-app-pill.warn {
      border-color: #ffe58f;
      background: #fffbe6;
      color: #faad14;
    }
    .data-app-pill.error {
      border-color: #ffccc7;
      background: #fff2f0;
      color: #ff4d4f;
    }
    .data-app-main {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr) 340px;
      grid-template-areas: "left center right";
      gap: 16px;
    }
    .data-app-panel-left {
      grid-area: left;
    }
    .data-app-panel-center {
      grid-area: center;
    }
    .data-app-panel-right {
      grid-area: right;
    }
    .data-app-panel {
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 12px;
      background: var(--ds-panel-bg, #fff);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .data-app-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      background: var(--ds-subtle-bg, rgba(0,0,0,0.02));
    }
    .data-app-panel-body {
      flex: 1;
      min-height: 0;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: auto;
    }
    .data-app-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      min-height: 0;
    }
    .data-app-section-grow {
      flex: 1;
      min-height: 0;
    }
    .data-app-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .data-app-section-title {
      font-size: 14px;
      font-weight: 600;
    }
    .data-app-button {
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #d9d9d9;
      background: #fafafa;
      color: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .data-app-button.primary {
      background: #1677ff;
      color: #fff;
      border-color: transparent;
    }
    .data-app-button.danger {
      background: #ff4d4f;
      color: #fff;
      border-color: transparent;
    }
    .data-app-button.ghost {
      background: #fff;
    }
    .data-app-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .data-app-icon-button {
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 8px;
      border: 1px solid #d9d9d9;
      background: #fff;
      color: #595959;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .data-app-icon-button.danger {
      color: #ff4d4f;
      border-color: #ffccc7;
      background: #fff1f0;
    }
    .data-app-icon-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .data-app-icon {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .data-app-icon-fill {
      fill: currentColor;
      stroke: none;
    }
    .data-app-input,
    .data-app-textarea,
    .data-app-select {
      width: 100%;
      box-sizing: border-box;
      border-radius: 10px;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.14));
      background: var(--ds-subtle-bg, rgba(0,0,0,0.04));
      padding: 8px 10px;
      color: inherit;
      font-size: 12px;
      outline: none;
    }
    .data-app-textarea {
      min-height: 80px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .data-app-input::placeholder,
    .data-app-textarea::placeholder {
      color: var(--ds-text-subtle, rgba(0,0,0,0.45));
    }
    .data-app-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .data-app-field-label {
      font-size: 12px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .data-app-field-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .data-app-field-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .data-app-field-row .data-app-input,
    .data-app-field-row .data-app-select {
      width: auto;
      flex: 1;
      min-width: 0;
    }
    .data-app-file-picker {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .data-app-file-picker .data-app-input {
      flex: 1;
      min-width: 0;
    }
    .data-app-file-button {
      white-space: nowrap;
    }
    .data-app-file-input {
      display: none;
    }
    .data-app-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .data-app-list-item {
      border: 1px solid #d9d9d9;
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      cursor: pointer;
      background: #fafafa;
    }
    .data-app-list-item.active {
      border-color: #1677ff;
      background: rgba(22,119,255,0.08);
    }
    .data-app-list-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .data-app-list-item-header .data-app-list-item-title {
      flex: 1;
    }
    .data-app-list-item-title {
      font-weight: 600;
      font-size: 13px;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .data-app-list-title {
      font-weight: 600;
      font-size: 13px;
    }
    .data-app-list-meta {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .data-app-list-actions,
    .data-app-icon-group {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .data-app-connection-db {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .data-app-connection-db-label {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .data-app-connection-db-select {
      flex: 1;
      min-width: 0;
    }
    .data-app-tabs {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .data-app-tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.14));
      background: var(--ds-subtle-bg, rgba(0,0,0,0.03));
      cursor: pointer;
      font-size: 12px;
    }
    .data-app-tab.active {
      background: var(--ds-accent-500, #3b82f6);
      color: #fff;
      border-color: transparent;
    }
    .data-app-tab-close {
      font-weight: 700;
      opacity: 0.7;
    }
    .data-app-toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .data-app-editor {
      flex: 1;
      min-height: 0;
      resize: none;
      font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .data-app-editor-wrap {
      flex: 0 0 240px;
      min-height: 200px;
      display: grid;
      grid-template-columns: auto 1fr;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.14));
      border-radius: 10px;
      background: var(--ds-subtle-bg, rgba(0,0,0,0.02));
      overflow: hidden;
    }
    .data-app-editor-gutter {
      padding: 8px 6px;
      background: var(--ds-subtle-bg, rgba(0,0,0,0.04));
      border-right: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      color: var(--ds-text-subtle, rgba(0,0,0,0.45));
      font-size: 11px;
      line-height: 1.5;
      text-align: right;
      user-select: none;
      min-width: 36px;
      height: 100%;
      box-sizing: border-box;
    }
    .data-app-editor-gutter-inner {
      position: relative;
    }
    .data-app-editor-area {
      position: relative;
      min-width: 0;
      overflow: hidden;
      height: 100%;
    }
    .data-app-editor-scroll {
      position: relative;
      height: 100%;
    }
    .data-app-editor-highlight {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      margin: 0;
      padding: 8px 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 100%;
      box-sizing: border-box;
      pointer-events: none;
    }
    .data-app-editor-input {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
      margin: 0;
      padding: 8px 10px;
      background: transparent;
      color: transparent;
      caret-color: var(--ds-text, #1f1f1f);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      line-height: 1.5;
      resize: none;
      overflow: auto;
      box-sizing: border-box;
    }
    .data-app-editor-input:focus {
      outline: none;
    }
    .data-app-editor-input::placeholder {
      color: var(--ds-text-subtle, rgba(0,0,0,0.45));
    }
    .data-app-editor-suggest {
      position: absolute;
      z-index: 5;
      min-width: 200px;
      max-width: 320px;
      max-height: 220px;
      overflow: auto;
      background: var(--ds-panel-bg, rgba(255,255,255,0.98));
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      font-size: 12px;
    }
    .data-app-editor-suggest-item {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .data-app-editor-suggest-item.active {
      background: var(--ds-accent-500, #3b82f6);
      color: #fff;
    }
    .data-app-editor-suggest-type {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.6));
    }
    .data-app-editor-suggest-item.active .data-app-editor-suggest-type {
      color: rgba(255,255,255,0.9);
    }
    .data-app-editor-status {
      font-size: 11px;
      color: var(--ds-text-muted, rgba(0,0,0,0.6));
    }
    .data-app-sql-keyword {
      color: #2563eb;
      font-weight: 600;
    }
    .data-app-sql-string {
      color: #16a34a;
    }
    .data-app-sql-number {
      color: #9333ea;
    }
    .data-app-sql-comment {
      color: #64748b;
      font-style: italic;
    }
    .data-app-sql-identifier {
      color: #0f766e;
    }
    .data-app-view-tabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .data-app-view-btn.active {
      background: var(--ds-accent-500, #3b82f6);
      color: #fff;
      border-color: transparent;
    }
    .data-app-table-wrap {
      flex: 1;
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 10px;
    }
    .data-app-results-table-wrap {
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .data-app-table-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      max-width: 100%;
    }
    .data-app-table-scroll .data-app-table {
      width: max-content;
      min-width: 100%;
    }
    .data-app-list-wrap {
      flex: 1;
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 10px;
    }
    .data-app-schema-section > .data-app-list-wrap,
    .data-app-schema-section > .data-app-table-wrap {
      min-width: 0;
    }
    .data-app-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .data-app-table th,
    .data-app-table td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      text-align: left;
      vertical-align: top;
      max-width: 400px;
      word-break: break-word;
    }
    .data-app-table th {
      position: sticky;
      top: 0;
      background: var(--ds-panel-bg, rgba(255,255,255,0.9));
      font-weight: 600;
      z-index: 1;
    }
    .data-app-status {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 10px;
      background: #fff;
      font-size: 12px;
    }
    .data-app-status strong {
      font-weight: 600;
    }
    .data-app-status-message {
      flex: 1;
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }
    .data-app-status-message.has-details {
      text-align: left;
      align-items: stretch;
    }
    .data-app-status-message.error {
      color: var(--ds-danger-500, #dc2626);
    }
    .data-app-status-text {
      word-break: break-word;
    }
    .data-app-status-details {
      margin: 0;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      background: var(--ds-subtle-bg, rgba(0,0,0,0.04));
      font-size: 11px;
      line-height: 1.4;
      white-space: pre-wrap;
      max-height: 180px;
      overflow: auto;
      color: inherit;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .data-app-empty {
      font-size: 12px;
      color: var(--ds-text-muted, rgba(0,0,0,0.65));
    }
    .data-app-schema-view {
      flex: 1;
      min-height: 0;
    }
    .data-app-schema-section {
      --data-app-schema-left: 200px;
      display: grid;
      grid-template-columns: var(--data-app-schema-left, 200px) 10px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      grid-auto-rows: minmax(0, 1fr);
      gap: 0;
      flex: 1;
      min-height: 0;
    }
    .data-app-schema-resizer {
      cursor: col-resize;
      position: relative;
      touch-action: none;
    }
    .data-app-schema-resizer::before {
      content: '';
      position: absolute;
      top: 10px;
      bottom: 10px;
      left: 50%;
      width: 2px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: var(--ds-panel-border, rgba(0,0,0,0.2));
    }
    .data-app-schema-resizer:hover::before,
    .data-app-schema-resizer:active::before {
      background: var(--ds-accent-500, #3b82f6);
    }
    .data-app-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
    }
    .data-app-schema-modal {
      grid-template-columns: minmax(0, 1fr);
    }
    .data-app-schema-modal .data-app-schema-resizer,
    .data-app-schema-modal .data-app-schema-columns {
      display: none;
    }
    .data-app-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 1000;
    }
    .data-app-modal {
      width: min(860px, 92vw);
      max-height: 85vh;
      background: var(--ds-panel-bg, #fff);
      border: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      border-radius: 12px;
      box-shadow: 0 20px 48px rgba(0,0,0,0.24);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .data-app-connection-modal {
      width: min(720px, 92vw);
    }
    .data-app-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--ds-panel-border, rgba(0,0,0,0.12));
      background: var(--ds-subtle-bg, rgba(0,0,0,0.02));
    }
    .data-app-modal-title {
      font-size: 14px;
      font-weight: 600;
    }
    .data-app-modal-body {
      flex: 1;
      min-height: 0;
      padding: 12px 16px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .data-app-root[data-theme='dark'] {
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
    .data-app-root[data-theme='dark'] .data-app-header,
    .data-app-root[data-theme='dark'] .data-app-panel,
    .data-app-root[data-theme='dark'] .data-app-status {
      background: var(--ds-panel-bg, #161a22);
      border-color: var(--ds-panel-border, rgba(255,255,255,0.12));
    }
    .data-app-root[data-theme='dark'] .data-app-panel-header {
      background: rgba(255,255,255,0.04);
    }
    .data-app-root[data-theme='dark'] .data-app-modal-backdrop {
      background: rgba(0,0,0,0.6);
    }
    .data-app-root[data-theme='dark'] .data-app-button {
      background: #1f2430;
      border-color: #303a49;
      color: #e6e6e6;
    }
    .data-app-root[data-theme='dark'] .data-app-button.ghost {
      background: #141a22;
    }
    .data-app-root[data-theme='dark'] .data-app-icon-button {
      background: #1b202a;
      border-color: #303a49;
      color: #c5cbd6;
    }
    .data-app-root[data-theme='dark'] .data-app-icon-button.danger {
      background: rgba(255,77,79,0.12);
      border-color: rgba(255,77,79,0.4);
      color: #ff7875;
    }
    .data-app-root[data-theme='dark'] .data-app-input,
    .data-app-root[data-theme='dark'] .data-app-textarea,
    .data-app-root[data-theme='dark'] .data-app-select {
      background: #1b202a;
      border-color: #303a49;
      color: #e6e6e6;
    }
    .data-app-root[data-theme='dark'] .data-app-list-item {
      background: #1b202a;
      border-color: #2f3948;
    }
    .data-app-root[data-theme='dark'] .data-app-list-item.active {
      background: rgba(22,119,255,0.18);
    }
    .data-app-root[data-theme='dark'] .data-app-table th,
    .data-app-root[data-theme='dark'] .data-app-table td {
      border-bottom-color: rgba(255,255,255,0.12);
    }
    .data-app-root[data-theme='dark'] .data-app-table th {
      background: #1f2430;
    }
    .data-app-root[data-theme='dark'] .data-app-table-wrap,
    .data-app-root[data-theme='dark'] .data-app-list-wrap {
      border-color: rgba(255,255,255,0.12);
    }
    .data-app-root[data-theme='dark'] .data-app-editor-wrap {
      background: #151a22;
      border-color: rgba(255,255,255,0.12);
    }
    .data-app-root[data-theme='dark'] .data-app-editor-gutter {
      background: rgba(255,255,255,0.06);
      border-right-color: rgba(255,255,255,0.12);
      color: var(--ds-text-subtle, rgba(255,255,255,0.7));
    }
    .data-app-root[data-theme='dark'] .data-app-editor-highlight {
      color: #e6e6e6;
    }
    .data-app-root[data-theme='dark'] .data-app-editor-input::placeholder {
      color: var(--ds-text-subtle, rgba(255,255,255,0.7));
    }
    .data-app-root[data-theme='dark'] .data-app-editor-suggest {
      background: #1b202a;
      border-color: rgba(255,255,255,0.12);
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .data-app-root[data-theme='dark'] .data-app-sql-keyword {
      color: #60a5fa;
    }
    .data-app-root[data-theme='dark'] .data-app-sql-string {
      color: #4ade80;
    }
    .data-app-root[data-theme='dark'] .data-app-sql-number {
      color: #c084fc;
    }
    .data-app-root[data-theme='dark'] .data-app-sql-comment {
      color: #94a3b8;
    }
    .data-app-root[data-theme='dark'] .data-app-sql-identifier {
      color: #2dd4bf;
    }
    .data-app-root[data-theme='dark'] .data-app-meta,
    .data-app-root[data-theme='dark'] .data-app-field-label,
    .data-app-root[data-theme='dark'] .data-app-header-label,
    .data-app-root[data-theme='dark'] .data-app-list-meta,
    .data-app-root[data-theme='dark'] .data-app-editor-status,
    .data-app-root[data-theme='dark'] .data-app-empty {
      color: var(--ds-text-muted, rgba(255,255,255,0.85));
      opacity: 1;
    }
    @media (max-width: 1080px) {
      .data-app-main {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) minmax(0, 320px) minmax(0, 320px);
        grid-template-areas:
          "center"
          "left"
          "right";
      }
    }
    @media (max-width: 860px) {
      .data-app-main {
        grid-template-rows: minmax(0, 1fr) minmax(0, 280px) minmax(0, 280px);
      }
    }
    @media (max-width: 720px) {
      .data-app-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .data-app-panel-header {
        flex-wrap: wrap;
      }
      .data-app-schema-section {
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .data-app-schema-resizer {
        display: none;
      }
    }
  `;
