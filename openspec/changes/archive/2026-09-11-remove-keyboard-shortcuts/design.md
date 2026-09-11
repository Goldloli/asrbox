# Design: remove-keyboard-shortcuts

## Context

快捷键现状（已核实）：

- 绑定实现：`app/src/lib/shortcuts.ts`（默认映射 + normalize/matches/format 工具 + 可编辑控件守卫），`app/src/components/GlobalShortcuts.tsx`（capture 阶段 window keydown：mod+n 导航、mod+f 派发 `asrbox:open-global-search`、mod+, 导航），`app/src/components/CommandPalette.tsx:79-88`（mod+k 开关面板——面板唯一入口）。
- 挂载点：`app/src/components/AppShell.tsx:8-9,32-33`。
- 设置卡片：`app/src/routes/SettingsPage.tsx:429-449`；相关状态/常量/import 在 `:17,38,55,66`，导出 `:226`，导入 `:255-259`。
- 状态：`app/src/stores/uiStore.ts`（`shortcuts` 字段、默认值、`setShortcut`，zustand persist key `asrbox-ui`）。
- i18n：`settings.shortcut*` 6 个 key（en `i18n.ts:592-597` / zh `:1416-1421`），`command.*` 16 个 key（en `:40-55` / zh `:864-879`）。
- 测试：`app/src/lib/shortcuts.test.ts` 仅覆盖可编辑控件守卫。

## Goals / Non-Goals

**Goals:**

- 四个全局快捷键全部失效，设置卡片、命令面板、快捷键基础设施一并移除。
- 全局搜索保留顶栏按钮入口（`GlobalSearch.tsx:102-107`）。
- zh/en 词典 key 集合保持一致，typecheck 与前端单测通过。

**Non-Goals:**

- 不清理用户浏览器 localStorage 中已持久化的 `shortcuts` 残留键（读不到即无害）。
- 不为命令面板新增替代入口（功能随快捷键一起退役）。
- 不改动全局搜索、导航路由本身的行为。

## Decisions

### D1: 命令面板连带删除而非保留

命令面板唯一触发方式是 mod+k（无按钮、无菜单项）。保留它就必须新造入口，与「不需要快捷键」的产品判断矛盾。用户已确认全部移除。

### D2: 设置导出/导入同步去掉 shortcuts 字段

`SettingsPage.tsx` 导出 payload（`:226`）与导入处理（`:255-259`）移除 shortcuts；否则导出的 JSON 仍携带一个不可见、不可用的隐藏改键路径。旧导出文件被导入时多出的 shortcuts 字段被忽略（按字段读取，不做严格校验），无需兼容代码。

### D3: GlobalSearch 只删监听不删组件

仅移除 `openGlobalSearchEvent` 常量与 `useEffect` 监听（`GlobalSearch.tsx:8,36-40`），顶栏按钮打开搜索对话框的行为不变。

### D4: i18n 键删除范围

`settings.shortcuts`、`settings.shortcutsDescription`、`settings.shortcutNewTranscription`、`settings.shortcutGlobalSearch`、`settings.shortcutSettings`、`settings.shortcutCommandPalette` 与全部 `command.*`（命令面板专用）从两个 locale 删除。删除后全局 grep 确认无残留引用，避免运行时 undefined 文案。

## Risks / Trade-offs

- [删除了别人可能在用的功能] → 产品决策已由用户明确（「这个软件我认为不需要快捷键」）；全局搜索仍有按钮入口，无损核心功能。
- [测试或 e2e 引用快捷键/命令面板] → 实现时全局搜索 `mod+`、`shortcut`、`CommandPalette`、`open-global-search` 断言并同步删除/更新。
- [i18n 键删漏或误删仍被引用的键] → typecheck（`DictionaryKey` 字面量类型）会让残留引用直接编译失败，构成安全网。
