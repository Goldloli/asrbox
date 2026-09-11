# 任务：转写默认值选择（transcription-default-selection）

## 1. 设置页默认模型选择器

- [x] 1.1 在 `app/src/routes/SettingsPage.tsx` 转写板块新增默认模型 Select：选项合并 `useModelsQuery()` 本地模型与 `useProvidersQuery()` 已启用提供商，value 编码 `local:<model_name>` / `provider:<provider_id>`（禁用空字符串 value，另含 `__auto__` 哨兵项），从 settings 响应回显当前默认；`app/src/lib/i18n.ts` 补中英文案。验证：`npm run typecheck` 通过。
- [x] 1.2 保存联动：选中本地模型时一次 `updateSettings` 写 `default_backend='local'` + `default_model_name=<name>` + `default_provider_id=null`；选中线上接口时写 `default_backend='provider'` + `default_provider_id=<id>` + `default_model_name=null`；选 `__auto__`（不指定）时清空 `default_model_name`/`default_provider_id`（写 null，后端回退内置默认）。验证：保存后 `GET /settings/asr` 返回的四字段与选择一致。

## 2. 转写页初始化消费默认值

- [x] 2.1 `app/src/routes/TranscribePage.tsx` 新增"套用默认值"effect：settings 首次到达且对应控件 dirty ref 未置位时，用 `default_backend`/`default_model_name`/`default_provider_id`/`default_language`（经 `normalizeLanguageValue`）替换 `TranscribePage.tsx:39-42` 的硬编码初值；用户手动改动任一控件后该控件不再被套用。验证：`npm run typecheck` 通过，设置默认模型后重进转写页初始选中一致。
- [x] 2.2 失效兜底核对：默认模型被删除/未下载/不兼容、默认提供商被禁用/删除时，确认由既有兜底 effect（`TranscribePage.tsx:83-92`）切到第一个可用项且无错误状态，不新增兜底逻辑。验证：e2e 场景 3.2 覆盖。

## 3. e2e 覆盖

- [x] 3.1 新增 `app/e2e/transcription-defaults.spec.ts`：设置默认模型（本地）与默认语言 → 重新进入转写页，初始后端/模型/语言与设置一致。验证：该 spec 通过。
- [x] 3.2 同 spec 增加默认值失效场景：保存一个不存在/未启用的默认值后进入转写页，初始选中兜底为第一个可用项且无报错。验证：该 spec 通过。
- [x] 3.3 将新 spec 接入 `test:e2e:maintained` 聚合命令。验证：`npm run test:e2e:maintained` 聚合全绿且包含新 spec。

## 4. 验证与收官

- [x] 4.1 `npm run typecheck`、`npm run test:frontend:unit`、`npm run build:web` 全绿。
- [x] 4.2 真机验证：设置页选 qwen3-asr 为默认模型、语言选"自动识别"并保存 → 重启应用 → 转写页初始即为 qwen3-asr + 自动识别；改为线上接口默认后同样生效。
- [x] 4.3 `CHANGELOG.md` 0.1.9 补充本功能条目；tasks 全部勾选后归档 change。
