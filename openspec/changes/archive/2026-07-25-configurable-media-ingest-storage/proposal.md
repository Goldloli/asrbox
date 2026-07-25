## 为什么

目前桌面端转写会在开始任何工作之前，把用户选择的每个媒体文件复制到 `data/uploads/`。在非 APFS 卷或跨卷导入时，这会让大型媒体文件占用双倍磁盘，并且复制带来的 `importing` 等待会推迟转写开始。用户希望桌面端改为引用原文件，同时保留托管复制选项、可配置托管文件与派生音频的存放位置，并保证删除任务时绝不删除用户的原始文件。

## 变更内容

- 新增桌面端媒体摄取模式设置：`reference`（新默认值，不复制，任务直接指向原文件）或 `copy`（现状行为：复制到 uploads 文件夹）。浏览器与移动端 Web 摄取保持仅 copy，因为它们无法访问本地路径。
- 按任务保证删除安全：每个任务记录其媒体是托管还是外部引用，删除任务只 unlink 托管文件。ASRbox 绝不删除、移动被引用的原始文件。
- uploads 文件夹位置在桌面端可配置（默认 `<data>/uploads`），仅对新摄取生效；已有文件保留在原位置，仍可播放和删除。Docker Web 只读展示容器内 uploads 路径，并通过文档引导可选的 Compose bind mount 挂到外置磁盘。
- 派生音频（16kHz normalized wav 与 chunk 文件）改为写入可配置的派生音频目录（默认在数据目录下），按 task id 命名，不再写到源文件旁边，因此引用模式绝不会写入用户自己的文件夹。新增可选设置：转写成功后自动删除派生音频。
- 新增桌面端 relink：当被引用的源文件被移动或删除后，用户可以把任务重新指向文件的新路径；派生音频随之失效并基于新源重新生成。
- 桌面端拖拽导入与文件选择器一致地走路径摄取：应用改用 Tauri 原生拖拽事件（携带真实文件路径），使拖入的媒体同样遵循 reference/copy 摄取模式；浏览器端保持 HTML5 拖拽的托管复制行为。
- 在 `compose.yaml` 注释、`.env.example` 以及中英文 Docker 维护文档中说明可选的 `/data/uploads` bind mount，并给出 macOS 与 Windows 外置磁盘示例。

## 能力（Capabilities）

### 新能力

- `media-ingest-storage`：定义摄取模式、按任务的媒体所有权、删除守卫、托管 uploads 与派生音频的位置配置、源文件缺失时的 relink 行为，以及 Docker 挂载呈现。

### 修改的能力

- `transcription-lifecycle`：`importing` 状态仅适用于托管复制摄取；引用任务直接进入队列，没有复制阶段。
- `storage-privacy-recovery`：被引用的媒体可以位于应用数据目录之外；备份、清理与删除必须区分托管文件与外部引用，且绝不触碰用户原始文件。
- `documentation-governance`：要求为摄取模式、存储位置、relink 和可选 uploads bind mount 维护桌面端与 Docker 文档。

## 影响

- 后端媒体存储配置与解析器、任务摄取与 worker 管线、派生音频路径解析、删除/清理守卫、带类型的 API model 与路由（包括新的 relink 端点和任务 `source_kind` 字段），以及 contract test。
- React 设置页存储区块（摄取模式、uploads 位置、派生音频位置、自动删除开关）、任务详情/播放器 relink 流程、翻译与 Playwright 覆盖。
- Tauri 复用现有原生文件选择器实现 relink，预计不需要新增 Tauri command。
- `compose.yaml`、`.env.example`、`docs/docker.md`、`docs/docker.en.md`，以及受影响的隐私/存储措辞。
- 与活动中的 change `fix-transcription-startup-and-mlx-runtime` 存在交互：其 delta 描述了托管复制前的 `importing`；本 change 把 `importing` 限定为 copy 模式，archive 时需要按顺序协调。
- 不引入新的第三方依赖、不变更数据库 schema（设置持久化在 versioned JSON 配置中；按任务的所有权使用内部 task options），也不迁移已有上传文件。
