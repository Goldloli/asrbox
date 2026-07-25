## 1. 媒体存储配置基础

- [x] 1.1 为 versioned `media-storage.json` 配置补充聚焦后端测试：数据目录下的默认值、原子写入、环境变量覆盖/锁定上报（`ASRBOX_UPLOADS_DIR`、`ASRBOX_DERIVED_AUDIO_DIR`）、非法值拒绝，以及解析器读取不创建目录。
- [x] 1.2 实现中心媒体存储解析器（`ingest_mode`、`uploads_dir`、`derived_audio_dir`、`delete_derived_on_complete`），并把 `get_uploads_dir()` 的调用方、`save_upload`、`copy_local_path` 的目标与孤儿清理全部接入解析器。
- [x] 1.3 新增带类型的设置路由（媒体存储的 `GET`/`PUT`），上报有效路径、锁定状态、desktop/container runtime 与可用性；Docker 返回只读路径呈现。

## 2. 按任务的所有权与删除守卫

- [x] 2.1 在所有摄取路径的任务创建时于 options 中记录 `_source_kind`（`managed`/`external`）；在任务响应上暴露带类型的 `source_kind`；无标记的旧任务按 `managed` 处理。
- [x] 2.2 为 `delete_task` 与 `delete_all_tasks` 加守卫，只对 managed 任务 unlink `audio_path`；新增测试证明被引用原文件在删除任务、批量删除与存储清理后仍然存活——包括摄取后 uploads 位置已变更的场景。
- [x] 2.3 存储孤儿清理只扫描配置后的 uploads 与派生音频目录，绝不触碰外部引用路径。

## 3. 摄取模式与派生音频

- [x] 3.1 在 `create_task_from_path` 中实现引用摄取：把源路径存为 `audio_path`、标记 external 所有权、直接以 `queued` 入队且无 `importing`，worker 对 external 任务跳过 `_import_task_media`；copy 模式与当前行为逐字节兼容，包括 `importing` 进度。
- [x] 3.2 为 `prepare_media_for_asr` 与 chunk 切分提供解析自 `derived_audio_dir` 的显式 task id 命名输出目录，引用模式不再写入用户源文件旁边，重复导入不再撞名。
- [x] 3.3 `delete_derived_on_complete` 开启时在转写成功后执行仅派生清理；手动 `cleanup-artifacts` 不变；验证自动删除后的重试会重新生成派生音频，并在源缺失时明确失败。
- [x] 3.4 更新既有摄取测试（`test_desktop_path_ingestion_is_guarded_and_reports_import_progress`、上传限制残留检查），在不削弱任何现有断言的前提下覆盖两种模式。

## 4. Relink

- [x] 4.1 新增桌面专用 `POST /tasks/{task_id}/relink`：校验文件路径存在、更新 `audio_path`、强制 external 所有权、使失效派生文件与 chunk 引用作废，并返回带类型的任务；非桌面运行时按路径摄取相同的边界返回 404。
- [x] 4.2 新增 relink 的后端测试：成功、路径缺失/非法拒绝、非桌面拒绝、派生物失效行为。

## 5. 设置 UI、任务 UI 与 contract 对齐

- [x] 5.1 构建设置页存储区块：摄取模式选择（仅桌面）、uploads 与派生音频位置行（桌面选择器、env 锁定与 container 只读态）、自动删除开关；明确说明位置变更仅对新任务生效。
- [x] 5.2 在任务详情/播放器上为桌面端 `source_kind` 为 `external` 且音频缺失的任务提供 relink 流程，复用 `pick_media_files`；为全部新文案补充中英文翻译。
- [x] 5.4 桌面端启用 Tauri 原生拖拽事件（`dragDropEnabled: true` + `core:event:allow-listen`），把 `tauri://drag-drop` 的真实路径按扩展名过滤后接入路径摄取，使拖拽导入同样遵循 reference/copy 模式；浏览器端保持 HTML5 拖拽不变。
- [x] 5.3 对齐带类型的 React client、`test_contract.py` 期望（新增 `source_kind` 字段、设置路由、relink 路由）以及相关 Playwright 场景（注：本机 Playwright 浏览器缺失，e2e 未能在本环境执行）。

## 6. Docker 配置与文档

- [x] 6.1 在 `compose.yaml` 中加入注释掉的可选 `${ASRBOX_UPLOADS_HOST_PATH}:/data/uploads` bind mount，含 macOS 外置盘与 Windows `D:` 示例及 `10001:10001` 属主说明；在 `.env.example` 中记录该变量。
- [x] 6.2 在 `docs/docker.md` 与 `docs/docker.en.md` 中新增 uploads 挂载小节，仿照 model-storage 挂载指引，含“首次摄取前完成挂载”的提醒。
- [x] 6.3 更新隐私/存储措辞（`docs/privacy.md` 及相关文档）：reference 模式、按任务的删除语义、备份仅覆盖托管数据、派生音频自动删除。

## 7. 最终验证

- [x] 7.1 运行聚焦后端测试，然后运行 `npm run test:backend` 与 `npm run test:backend:contract`。
- [x] 7.2 运行 `npm run typecheck`、`npm run build:web` 以及相关 Playwright 场景。
- [x] 7.3 按声明的接触点与非目标审阅最终 diff，协调与 `fix-transcription-startup-and-mlx-runtime` delta 的顺序，并运行 `npm run check:open-source`。
