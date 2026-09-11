# Tasks: remove-keyboard-shortcuts

## 1. 解除挂载与监听

- [x] 1.1 `app/src/components/AppShell.tsx`：移除 `GlobalShortcuts`/`CommandPalette` 的 import 与挂载；验证：`npm run typecheck` 通过
- [x] 1.2 `app/src/components/GlobalSearch.tsx`：移除 `openGlobalSearchEvent` 常量与对应 `useEffect` 监听，保留顶栏按钮打开行为；验证：搜索按钮仍可打开对话框

## 2. 删除快捷键基础设施

- [x] 2.1 删除 `app/src/components/GlobalShortcuts.tsx`、`app/src/components/CommandPalette.tsx`、`app/src/lib/shortcuts.ts`、`app/src/lib/shortcuts.test.ts`；验证：全局 grep 无引用残留
- [x] 2.2 `app/src/stores/uiStore.ts`：移除 `shortcuts` 状态、默认值与 `setShortcut`；验证：`npm run typecheck` 通过
- [x] 2.3 `app/src/routes/SettingsPage.tsx`：删除快捷键卡片、相关 import/状态/常量，导出 payload 与导入处理去掉 shortcuts 字段；验证：设置页通用页签正常渲染，导出/导入可用

## 3. i18n 与测试清理

- [x] 3.1 `app/src/lib/i18n.ts`：删除 `settings.shortcut*` 6 个 key 与全部 `command.*` key（zh/en 同步）；验证：typecheck 通过（`DictionaryKey` 类型会暴露残留引用）
- [x] 3.2 全局搜索 `mod+`、`shortcut`、`CommandPalette`、`open-global-search`，同步删除/更新命中的测试与 e2e 断言；验证：`npm run test:frontend:unit` 通过

## 4. 验证

- [x] 4.1 `npm run typecheck` 与 `npm run build:web` 通过
- [x] 4.2 运行相关 Playwright 场景（设置页、全局搜索所在 spec）；验证：通过
- [x] 4.3 手动确认：设置页无快捷键卡片；mod+n/f/,/k 无任何响应；顶栏搜索按钮正常
