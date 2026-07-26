## Context（背景）

已完成字幕的当前内容保存在 `transcription_tasks` 和有序的 `transcript_segments` 中。所有会改变内容的操作都会创建不可变的 `transcript_versions`；恢复操作会把旧快照复制到当前任务，并再创建一个版本。当前字幕导出读取当前分段，历史版本导出则读取用户选定的版本。

ASR 提供商是音频转写集成，拥有自己的队列、任务字段和设置界面。LLM 字幕校对是纯文本、可选的转写后流程，不能复用 ASR contract，也不能改变转写任务生命周期。

受支持的 LLM 预设均提供 OpenAI-compatible Chat Completions endpoint：

| 预设 | 默认 base URL | 凭据要求 |
| --- | --- | --- |
| MiniMax | `https://api.minimaxi.com/v1` | 必填 |
| Kimi | `https://api.moonshot.cn/v1` | 必填 |
| DeepSeek | `https://api.deepseek.com` | 必填 |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 必填 |
| GLM | `https://open.bigmodel.cn/api/paas/v4` | 必填 |
| Ollama | `http://localhost:11434/v1` | 不要求 |
| Custom | 用户提供 | 除 loopback URL 外均必填 |

这些默认值来自各厂商的官方兼容性文档。由于地域、workspace、代理和厂商 endpoint 可能变化，base URL 始终允许编辑。预设不硬编码模型名称；提供商必须显式配置默认模型后才能执行连接测试或校对。

兼容性参考：[MiniMax](https://platform.minimaxi.com/docs/api-reference/text-openai-api)、[Kimi](https://platform.kimi.com/docs/overview)、[DeepSeek](https://api-docs.deepseek.com/)、[Qwen](https://help.aliyun.com/en/model-studio/base-url)、[GLM](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) 和 [Ollama](https://docs.ollama.com/api/openai-compatibility)。

## Goals / Non-Goals（目标与非目标）

**Goals（目标）：**

- 让用户独立于 ASR 提供商配置 LLM，并清楚知道字幕文本是否会离开本机。
- 基于已完成字幕的不可变版本，生成保守的分段级文本建议。
- 持久化校对任务和建议，使审阅状态能够跨页面跳转和应用重启保留。
- 应用任何建议前，必须由用户明确选择。
- 原子地应用所选文本修改，并创建可审计的不可变字幕版本。
- 将失败、中断、过期结果和异常提供商输出与转写、恢复和导出行为隔离。
- 用独立、可扩展的 AI 工作区承载字幕核对，同时保持现有任务详情布局不变。

**Non-Goals（非目标）：**

- 向 LLM 发送音频、波形数据、本地路径、任务选项或 ASR 凭据。
- 自动应用建议、转写完成后自动后台校对或语义改写。
- 修改分段时间、顺序、边界、说话人标签或置信度。
- 模型发现、模型下载、提供商计费、token 预算 UI、prompt 自定义、流式输出或厂商特有的 reasoning 控制。
- 进程重启后恢复部分完成的校对任务。
- 新增导出格式，或改变现有 ASR 提供商 contract、任务状态和稳定事件类型。
- 首版 AI 问答、原生 Anthropic/Gemini 协议、取消或恢复运行中的校对、建议文本内联编辑、测速排名和不可用功能占位入口。

## Decisions（关键决策）

### 1. 使用独立的 LLM 提供商领域模型

新增 `llm_providers`，不扩展 `asr_providers`。一个 LLM 提供商保存 `id`、`name`、`preset`、`base_url`、可空的 `api_key_secret`、`default_model`、`enabled` 和时间戳。API 响应只暴露脱敏后的 key。

后端通过 `GET /llm-providers/presets` 维护带类型的预设目录，设置界面使用该目录预填字段。CRUD 和模型级连接测试放在 `/llm-providers` 下。连接测试发送固定且不包含用户内容的 prompt，绝不发送字幕。

备选方案：复用 `asr_providers`。不采用，因为其 builder、测试、队列语义、默认设置和 provider type 都以音频转写为前提。

### 2. 使用一个通用 Chat Completions HTTP adapter

adapter 使用现有 `requests` 依赖，把包含 `model` 和 `messages` 的非流式 JSON 请求发送到 `<base_url>/chat/completions`。它读取 `choices[0].message.content`，但不持久化或记录原始响应。

云端预设必须使用 HTTPS。只有 endpoint host 为 loopback address 时才允许明文 HTTP。请求不跟随 redirect，避免 bearer credential 被转发到其他 endpoint。adapter 将认证、限流、超时、连接、HTTP 和无效响应失败映射为 LLM 专用错误码；错误消息不得包含凭据、字幕文本或响应 body。

备选方案：引入 OpenAI SDK 和各厂商 SDK。不采用，因为首版只需要很小的公共 HTTP 子集，而新增 SDK 会增加依赖和打包工作，却不增加用户可见能力。

### 3. 将校对任务绑定到不可变来源版本并持久化

新增 `proofreading_runs`，包含 UUID 主键、`task_id`、`source_version_id`、可空的 `llm_provider_id`、提供商名称/预设/模型快照、生命周期状态、进度计数器、经过清理的错误字段和时间戳。新增 `proofreading_suggestions`，包含 `run_id`、`segment_id`、`original_text`、`suggested_text`、`reason` 和最终处理状态（`pending`、`applied` 或 `skipped`）。

只有具备当前字幕版本的已完成任务才能开始校对，并且同一任务最多只能有一个 `queued` 或 `running` 校对任务。worker 从 `source_version_id` 读取分段内容，绝不读取可变的当前分段行。删除提供商时清空实时提供商引用，但保留提供商和模型快照字段以供审计。删除任务时同步删除其建议和校对任务。

校对任务和建议保留到任务被删除为止。进程重启时，所有 `queued` 或 `running` 校对任务标记为 `interrupted`，用户可以重新发起校对。相比重建部分完成的外部请求，这种处理有意选择更简单、更安全的语义。

备选方案：只把建议保存在 React state 中。不采用，因为页面跳转或重启会丢失审阅内容，也无法可靠绑定字幕版本。

### 4. 在隔离的单 worker 队列中执行校对

创建校对后立即返回 `queued` 状态的任务。专用单 worker 队列执行 LLM 请求并更新校对进度；它不使用本地 ASR 或 provider ASR 队列，也不改变 `TranscriptionTask.status`、progress、error 或完成时间。前端轮询校对任务详情 endpoint，不新增稳定的全局事件类型。

worker 按分段数量和 payload 字符数上限，把目标分段确定性地拆成 batch。每批最多 500 个目标分段或 30,000 个字幕字符，先达到者分批；预期常见批次约为 300 至 500 行或 20,000 至 30,000 字符。batch 可以包含相邻分段作为只读上下文，但模型只能为目标分段 ID 返回建议。超长分段单独处理。任意 batch 失败都会让整个校对任务失败，不暴露任何可审阅的部分建议。

备选方案：把整份字幕放入一次请求。不采用，因为长字幕可能超过提供商上下文或超时限制。也不接受部分成功，因为用户可能把不完整的覆盖误认为完整校对。

### 5. 要求严格、保守的结构化建议

固定 system prompt 要求模型只修正明确的转写、拼写、标点和上下文文本错误；除非修正十分明确，否则保留原意、语言、语气、人名和数字；绝不合并、拆分、重排或重新计时分段。响应必须是 JSON object，其中每条建议都包含目标分段 ID、替换文本和简短原因。

后端使用结构化 schema 解析 JSON，并拒绝 code fence、未知或重复分段 ID、非目标 ID、空替换、无效字段以及会改变结构的输出。与原文相同的替换会被丢弃。无效输出会让整个任务失败，且不保存部分建议。

备选方案：接受自由文本或完整重写后的字幕，再在本地计算 diff。不采用，因为把修改映射回带时间轴的分段会产生歧义，并可能悄悄改变字幕结构。

### 6. 使用独立 AI 工作区进行显式审阅，应用只能执行一次

桌面侧栏和移动端底部导航新增 `AI` 入口。桌面使用左侧可核对任务列表、右侧字幕核对区的布局；窄屏改为先选任务、再显示核对区。任务列表只显示已完成且拥有字幕版本的任务，按最近完成排序并支持文件名搜索。任务详情不嵌入完整面板，只在成功字幕上显示“AI 字幕核对”轻入口并携带任务 ID 跳转。

首版 AI 工作区只显示“字幕核对”，不展示问答等不可用功能。没有可用提供商时引导前往设置页一级 `AI LLM提供商` tab；没有任务与存在任务但暂无可核对字幕使用不同空状态。提供商默认使用上次成功选择，首次使用时选择第一个已启用项。运行中的校对在切换任务或离开页面后继续执行，首版不提供取消操作。

结果按来源版本的字幕顺序组合。存在建议的分段显示时间、原文、建议文本、差异和原因；连续且没有建议的分段分别折叠为独立区间，按钮显示数量和时间范围，每个按钮只展开自己的区间。界面将这些区间描述为“未发现修改建议”，不声称模型证明其正确。建议初始均不选中；UI 支持单独选择、全选和取消全选。LLM 提供的文本与原因按纯文本渲染，不能在 AI 页面直接编辑。

应用前确认将采纳的数量，并说明未选建议会变为 `skipped`。应用成功后停留在 AI 页面，显示应用数量，并提供“查看新字幕”和“重新核对”。默认只展示最近一次结果，旧结果收进“历史核对”；过期结果可审阅但不可应用。

`POST /tasks/{task_id}/proofreading-runs/{run_id}/apply` 接收 suggestion ID。该操作只能执行一次：选中的建议变为 `applied`，未选中的建议变为 `skipped`，校对任务变为 `applied`。空选择会被拒绝。仅存在于本地或尚未保存的字幕 UI 修改会阻止启动和应用，因为校对任务始终以服务器持久化版本为目标。

备选方案：逐条应用建议。不采用，因为每次点击都会创建一个新字幕版本，使余下建议立刻过期，并产生嘈杂的版本历史。

### 7. 使用版本身份和单一事务保护应用操作

当任务不再是已完成状态，或最新字幕版本 ID 与校对任务的 `source_version_id` 不同时，校对任务响应将 `stale` 标记为 true。应用操作会在数据库写事务内重复该检查，并验证每个当前分段的文本都等于建议的 `original_text`。

校验通过后，只更新被选中的分段文本，根据全部当前分段重新计算任务级文本，更新时间戳，创建一个 `version_type="proofread"` 的不可变版本，记录建议处理结果，并在同一事务中把校对任务标记为已应用。版本服务必须支持由调用方管理事务，不能在该操作中途提交。

任何校验或写入失败都会回滚整个事务。恢复、编辑、后处理、重新转写或应用另一次校对始终会创建新的最新版本，因此会使较早且尚未应用的校对任务过期，即使可见文本碰巧一致。

备选方案：只比较字幕文本或 content hash。不采用，因为版本身份已经是产品中可审计的并发边界，并且能把恢复操作视为有意义的新状态。

### 8. API 和前端 contract 保持增量扩展

新增以下受维护路由：

- `GET /llm-providers/presets`
- `GET|POST /llm-providers`
- `PUT|DELETE /llm-providers/{provider_id}`
- `POST /llm-providers/{provider_id}/test`
- `POST|GET /tasks/{task_id}/proofreading-runs`
- `GET /tasks/{task_id}/proofreading-runs/{run_id}`
- `POST /tasks/{task_id}/proofreading-runs/{run_id}/apply`

所有请求和响应都有后端 Pydantic model 和对应的前端 TypeScript type。现有任务响应和任务状态不变。应用校对任务后，使 task、version 和 proofreading query 失效；之后现有的当前版本与历史版本导出路由无需修改 exporter 即可继续工作。

提供商 adapter 和校对任务保留稳定、经过清理的错误码，至少区分鉴权、限流、超时、连接不可用、模型或一般 HTTP 错误、上下文过长、无效或空响应、结构化建议错误、提供商缺失、进程中断和来源版本过期。前端把错误码映射为面向普通用户的说明和“重新核对”或“去设置”等动作，并在折叠详情中保留错误码及经过清理的技术信息。只有任务成功完成且建议数组为空时，才显示“未发现需要修改的内容”。

### 9. 如实扩展现有隐私和备份边界

loopback endpoint（`localhost` 或 loopback IP address）标记为本地；其他所有 endpoint 都标记为第三方，即使它来自 Ollama 预设。提供商选择区使用不阻塞操作的小字说明：第三方会接收分段文本及有限的相邻文本，但不会接收音频和路径；loopback endpoint 则说明字幕只在本机处理。启动操作不再弹出额外确认。

LLM key 沿用现有 ASR 凭据边界：以明文保存在本地 SQLite 数据库中，在 API/UI 响应中脱敏，不进入日志和诊断，并随数据库备份。校对任务和建议同样位于 SQLite 中，因此也会进入备份。诊断包不得包含 prompt、字幕 payload、原始响应、建议文本和 LLM key。

## Risks / Trade-offs（风险与取舍）

- [模型可能给出看似合理但实际错误的修正] -> 使用保守 prompt，并排显示原文、建议和原因，默认不选中，绝不自动应用。
- [不同 OpenAI-compatible 实现存在差异] -> 只使用公共的非流式 Chat Completions 子集，遇到异常输出时失败关闭。
- [长字幕需要多次付费请求] -> 确定性分批，在启动前披露第三方处理，并展示进度但不声称能够估算费用。
- [模型可能返回无效 JSON] -> 整个任务按失败处理并保留来源字幕；不从自然语言中勉强提取结果，也不应用部分输出。
- [并发编辑可能与应用操作竞争] -> 绑定 `source_version_id`，在写事务中重新检查，并比较分段原文。
- [提供商 endpoint 和模型可能变化] -> base URL 和模型保持可编辑，预设不硬编码模型 ID。
- [明文凭据仍是隐私限制] -> 与当前产品边界保持一致并清楚记录，所有响应均脱敏，并在备份文档中说明风险；Keychain 集成属于独立 change。
- [Ollama 可能被配置到远程主机] -> 根据实际 endpoint host 而不是预设名称决定披露方式。
- [应用回滚后仍会留下增量表] -> 旧版本会忽略这些表；数据保留到未来显式清理或任务/提供商删除。
- [来源版本的无建议字幕很多，完整渲染会产生长页面] -> 默认按连续区间独立折叠，并保留按需展开和移动端顺序浏览。

## Migration Plan（迁移计划）

1. 通过增量 schema migration 新增三张表和索引；不重写现有任务、分段、版本、ASR 提供商或设置。
2. migration 可用后注册新的提供商与校对路由。
3. 新增带类型的前端 consumer、独立 AI 工作区、导航入口、任务轻入口和一级 LLM 提供商设置 tab。
4. 启用该流程前更新隐私文档和 contract 测试。
5. 启动时把遗留的 `queued`/`running` 校对任务标记为 `interrupted`，且不触碰其转写任务。

回滚时移除 UI 和路由，但保留增量表，避免销毁任何字幕或提供商数据。现有版本与导出不需要回滚 migration。以后重新安装时，可以在 migration 运行后继续使用这些记录。

## Open Questions（待确认问题）

首版没有待确认问题。模型发现、prompt profile、取消/恢复、各提供商专属参数、token/费用估算和本地凭据加密如有需要，应通过独立 change 处理。
