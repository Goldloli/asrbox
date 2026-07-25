## 背景

目前两条摄取路径都会把媒体落盘为 `data/uploads/{task_id}{ext}`。浏览器摄取通过 HTTP 上传字节（`save_upload`，`backend/services/uploads.py:49`），必须保持如此。桌面端路径摄取（`POST /transcriptions/path` → `create_task_from_path`，`backend/services/tasks.py:351`）通过 `importing` 状态进行复制（`_import_task_media`，`tasks.py:389`；`copy_local_path`，`uploads.py:86`），随后把原始路径从任务 options 中抹掉。派生音频写在托管副本旁边（`prepare_media_for_asr`，`backend/services/media.py:69`；chunk 切分在 `audio_path.parent` 下，`tasks.py:544`）。删除（`delete_task`，`tasks.py:1104`）无条件 unlink `audio_path`——这只有在所有任务文件都是托管文件时才安全。

`config.to_storage_path`/`resolve_storage_path`（`backend/config.py:131-145`）已经为数据目录之外的文件持久化绝对路径，因此引用外部源文件不需要改动存储层。model-storage 功能已经确立了用户可选位置的模式：稳定数据目录下的 versioned JSON 配置 + 原子写入、环境变量覆盖/锁定、桌面端经由现有 Tauri 能力边界的原生选择器，以及 Docker 的只读容器呈现。

实现必须保持桌面端 loopback/token 边界，浏览器摄取不变，绝不删除用户原始文件，绝不写入用户文件夹。

## 目标 / 非目标

**目标：**

- 桌面端摄取默认引用原文件，不复制、无 `importing` 阶段。
- 托管复制模式仍然可用，行为与现状完全一致，包括 `importing` 进度状态。
- uploads 与派生音频位置在桌面端可配置、仅对新任务生效，在 Docker 上由 operator 控制的挂载决定。
- 删除任务、批量删除与存储清理只触碰 ASRbox 托管文件。
- 派生音频绝不落在被引用源文件旁边，并可选在成功后自动删除。
- 被引用源文件缺失时给出明确状态，并提供桌面端 relink 操作。

**非目标：**

- 位置变更时迁移或移动已有上传文件。
- 媒体文件的去重、引用计数或跨任务共享。
- 浏览器/Web 访问宿主机文件系统路径；Web 摄取保持托管复制。
- 变更导出、备份归档格式或数据库 schema。
- 对作为摄取或存储位置的网络文件系统提供可靠性保证。
- 移除 `importing` 状态本身；它仍是 copy 模式的 contract。

## 决策

### 单一 versioned 媒体存储配置 + 中心解析器

在稳定数据目录下新增 `media-storage.json`，持久化四个相互独立的设置，采用与 model storage 相同的 mkstemp-fsync-replace 原子写入模式：

- `ingest_mode`：`"reference"`（默认）或 `"copy"`。仅在桌面模式下生效；浏览器与 Docker Web 请求忽略它，始终摄取为托管副本。
- `uploads_dir`：托管摄取的目标目录，绝对路径；默认 `<data>/uploads`。
- `derived_audio_dir`：normalized wav 与 chunk 文件的目录，绝对路径；默认 `<data>/derived-audio`。
- `delete_derived_on_complete`：布尔值，默认 `false`。

环境变量 `ASRBOX_UPLOADS_DIR` 与 `ASRBOX_DERIVED_AUDIO_DIR` 覆盖并锁定对应路径（以 `*_locked` 上报，仿照 `model_storage_root_is_locked`）。中心解析器返回有效路径但不创建目录；只有真实写入才创建。上传保存、本地路径复制目标、派生音频输出与孤儿清理都经由解析器，而不是零散的 `get_uploads_dir()` 调用。

被否决的替代方案：在 `asr_settings` 表中加列。否决原因：路径设置需要校验、环境变量锁定与可用性语义，model-storage 的 JSON 模式已经提供这些能力，且可以完全避免一次 schema migration。

### 创建时按任务记录媒体所有权

每个新任务在创建时于其 task options 中记录内部 `_source_kind`（`"managed"` 或 `"external"`）；前端代码不读取内部 option key。本 change 之前创建的任务没有该标记，按 `managed` 处理——这与它们的磁盘现实一致。带类型的任务响应新增受维护的 `source_kind` 字段，使前端无需触碰内部 key 即可正确呈现删除与 relink 行为。

`delete_task` 与 `delete_all_tasks` 只对 `managed` 任务 unlink `audio_path`；对 `external` 任务只删除派生音频、chunk 与数据库行，绝不触碰源路径。存储孤儿清理扫描配置后的 uploads 目录（而不是硬编码目录），并且永远不会把被引用的用户文件当作孤儿，因为派生文件由任务持有、随任务删除。

被否决的替代方案：根据解析后的路径是否位于当前 uploads 目录之下来推断所有权。否决原因：uploads 位置可以变更、外置磁盘可能离线，推断恰恰在删除安全最要紧的时候最不可靠。

### 引用摄取跳过复制管线

在桌面 reference 模式下，`create_task_from_path` 校验源文件（`is_file`、严格 resolve、记录大小），经由 `to_storage_path` 把源路径存为 `audio_path`（数据目录外为绝对路径），标记 `_source_kind="external"`，并直接以 `queued` 入队——无 `importing` 状态、无 `_ingest_source_path` 暂存、无复制进度。worker 对 external 任务跳过 `_import_task_media`，直接进入 preprocessing。copy 模式完整保留现有管线，包括 `importing` 进度与 clone-or-copy，复制目标解析到配置后的 uploads 目录。

播放（`GET /tasks/{id}/audio`）本就按 `audio_path` 的解析结果流式输出，因此被引用文件原地播放；源文件缺失时返回现有的明确 404，前端将其转化为 relink 入口。

### 派生音频按任务持有、按任务命名、位置可配

`prepare_media_for_asr` 与 chunk 切分获得显式输出目录：配置后的派生音频目录，文件名基于 task id 而不是源文件名。这保证被引用源文件所在目录不被写入；同一源文件被重复导入时不会撞名（静默允许是既定行为）；每个派生文件都有唯一属主任务。`normalized_audio_path` 与 chunk 路径继续使用 `to_storage_path`，因此派生文件无论位于数据目录内外都能解析。

当 `delete_derived_on_complete` 开启时，worker 在转写成功后执行与 `cleanup_task_artifacts` 相同的仅派生清理（normalized wav 与 chunk 文件；绝不触碰 `audio_path`）。手动的 `POST /tasks/{id}/cleanup-artifacts` 路由不变。自动删除后重试或重转写会从源文件重新生成派生音频，因此被引用源缺失时会明确失败。

### Relink 把任务重新绑定到新的源路径

新增桌面专用的带类型端点 `POST /tasks/{task_id}/relink`：接受绝对路径，校验其为存在的文件；非桌面运行时按路径摄取路由同样的边界返回 404。成功后把 `audio_path` 更新为新源、强制 `_source_kind="external"`、删除失效的派生文件、清空 `normalized_audio_path` 与 chunk 文件引用，并返回带类型的任务。relink 不重新转写，也不改动字幕版本。

前端在桌面端、播放或准备报告源缺失、且 `source_kind` 为 `external` 时提供 relink，复用现有 `pick_media_files` Tauri command（单选）——不需要新增 Tauri 能力。uploads 挂载不可用的托管任务沿用现有的存储不可用呈现，其 relink 不在本 change 范围内。

### 桌面端拖拽导入同样走路径摄取

HTML5 拖拽只提供 web `File` 对象（无真实路径），若沿用则拖拽会绕过路径摄取、始终经 multipart 复制——这正是本 change 必须消除的桌面行为分叉。桌面壳改为启用 Tauri 原生拖拽事件（`tauri.conf.json` 的 `dragDropEnabled: true`，并授予 `core:event:allow-listen`）：`tauri://drag-drop` 负载携带真实文件路径，前端按与文件选择器相同的扩展名过滤映射为桌面媒体文件，经 `/transcriptions/path` 走 reference/copy 摄取。原生事件启用后 HTML5 拖拽事件在桌面端不再触发；浏览器运行时不受影响，继续使用 HTML5 拖拽与 multipart 上传。拖拽事件是 Tauri 内置能力，不需要新增 Rust command。

被否决的替代方案：保留 HTML5 拖拽并在 UI 提示“拖拽将以复制方式导入”。否决原因：桌面用户的默认动作就是拖拽，提示无法挽回双倍磁盘占用这一核心问题。

### 位置变更仅对新任务生效

修改 `uploads_dir` 或 `derived_audio_dir` 不移动已有文件。先前摄取的文件继续通过其持久化的存储路径解析（数据目录内为相对路径，目录外为绝对路径），仍可播放与删除。设置 UI 明确说明这一点。Docker 只读呈现 uploads 路径，并引导 bind-mount `/data/uploads`；容器内不提供位置调整。

### Docker 获得可选的 uploads bind mount，并有文档

`compose.yaml` 在现有 model-storage 示例旁新增注释掉的 `${ASRBOX_UPLOADS_HOST_PATH}:/data/uploads` 可选 bind mount，注释建议使用外置磁盘（macOS `/Volumes/...`、Windows `D:/...`）并保留现有的 `10001:10001` 属主要求。`.env.example` 记录新变量。`docs/docker.md` 与 `docs/docker.en.md` 各新增一节，仿照 model-storage 挂载指引，并包含“必须在首次摄取前完成挂载，否则已复制媒体会留在 named volume”的提醒。

## 风险 / 取舍

- **误删用户原始文件将是灾难性的** -> 所有权在创建时按任务记录；旧任务默认按安全的 managed 解释；删除路径有聚焦测试覆盖，包括外置磁盘离线的场景。
- **被引用的源文件随时可能消失** -> 播放、重试与重转写以明确的源缺失错误失败；源变更后派生物视为失效；relink 提供文档化的恢复路径。
- **摄取模式可能出现两份真相而漂移** -> 模式是创建时读取的单一持久化设置；任务创建后的行为取决于已记录的 `_source_kind`，而非当前全局模式。
- **作为 uploads/派生位置的外置磁盘可能离线** -> 设置面板报告可用性，写入明确失败，不回退到系统盘，与 model-storage 语义一致。
- **备份不包含外部引用的媒体** -> 这是引用模式的固有属性；隐私与 Docker 文档明确说明备份仅覆盖数据目录下的托管数据。
- **与 `fix-transcription-startup-and-mlx-runtime` 的 spec 交互** -> 其 `importing` delta 描述的是 copy 模式摄取；本 change 的 delta 定义最终行为，archive 顺序上必须先应用那个 change。

## 迁移计划

1. 落地媒体存储配置、解析器与带类型的设置 API，默认值与当前磁盘行为一致（数据目录下的等价位置，reference 作为新的默认摄取模式）。
2. 记录按任务的所有权，加入删除与清理守卫，派生音频改走可配置目录并按 task id 命名。
3. 实现引用摄取、relink 端点与 worker 的派生音频自动删除。
4. 构建设置页存储 UI（模式、位置、自动删除、Docker 只读呈现）与任务级 relink 流程及翻译。
5. 补充 Compose 注释、`.env.example` 与中英文文档更新，包括隐私与备份措辞。
6. 验证聚焦后端测试、contract test、typecheck、web 构建、相关 Playwright 场景与开源就绪门禁。

回滚仅涉及配置：恢复默认值或删除 `media-storage.json` 即可把所有路径还原到数据目录；已摄取的任务不受影响，因为所有权与路径都按任务持久化。

## 待解决问题

无。用户已确认：reference 为默认且可选 copy 模式；uploads 与派生音频位置可配置且不迁移；派生音频自动删除为可选开关；源缺失时手动 relink；重复导入静默允许；Docker 只读呈现加文档化 bind mount；本 change 遵循 OpenSpec 工作流。
