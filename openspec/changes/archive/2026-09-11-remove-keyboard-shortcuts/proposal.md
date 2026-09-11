# Proposal: remove-keyboard-shortcuts

## 为什么

这个转写工具的交互以按钮和表单为主，全局快捷键（mod+n 新建转写、mod+f 全局搜索、mod+, 打开设置、mod+k 命令面板）对产品形态是多余的：维护成本高（可编辑控件/IME 守卫、设置卡片、导出导入字段），用户价值低。产品决策：移除全部快捷键；命令面板只能由 mod+k 打开、没有其它入口，随快捷键一并移除。

## 变更内容

- **BREAKING（用户可见行为移除）**：删除全部全局快捷键及其绑定——mod+n、mod+f、mod+,、mod+k 不再生效。
- 删除设置页「快捷键」卡片及其 i18n 文案。
- 删除命令面板组件（`app/src/components/CommandPalette.tsx`）及其入口；全局搜索保留顶栏按钮入口，仅移除其 mod+f 事件监听。
- 删除快捷键基础设施：`app/src/lib/shortcuts.ts` 及其测试、`GlobalShortcuts.tsx`、uiStore 中的 shortcuts 状态与设置导出/导入中的 shortcuts 字段。
- 既有持久化本地存储中残留的 shortcuts 键自然失效，不做迁移清理。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `frontend-quality`：requirement「Non-destructive settings and shortcuts」中的全局快捷键条款及「User types inside an editor」scenario 移除；服务器地址暂存与版本对比内存上限两个条款保持行为不变，迁移到更名后的 requirement 承接。

## 影响

- 前端删除：`app/src/lib/shortcuts.ts`、`app/src/lib/shortcuts.test.ts`、`app/src/components/GlobalShortcuts.tsx`、`app/src/components/CommandPalette.tsx`。
- 前端修改：`app/src/components/AppShell.tsx`（卸载两个组件）、`app/src/components/GlobalSearch.tsx`（移除 `asrbox:open-global-search` 监听）、`app/src/routes/SettingsPage.tsx`（卡片、状态、导出/导入字段）、`app/src/stores/uiStore.ts`（shortcuts 状态）、`app/src/lib/i18n.ts`（`settings.shortcut*` 与 `command.*` key 清理）。
- 不涉及后端、API contract、持久化数据。
- 全局搜索功能本身保留（顶栏按钮），仅失去快捷键触发。
