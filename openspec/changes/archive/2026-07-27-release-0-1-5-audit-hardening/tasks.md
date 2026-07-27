## 1. 失败回归与发布工具测试

- [x] 1.1 添加批量 failed-chunk 恢复部分失败时保留可恢复状态且不创建版本的测试
- [x] 1.2 参数化 runtime status、health report、diagnostic bundle 的事件循环响应测试
- [x] 1.3 添加 Bun/Cargo 锁文件、README、发布指南和 release notes 版本漂移的失败测试

## 2. 门禁与开发规范实现

- [x] 2.1 扩展 `check-versions.mjs` 解析锁文件和当前发布文档，使新增测试转绿
- [x] 2.2 在 `AGENTS.md` 沉淀共享任务转换、async 阻塞工作、活动态夹具和维护测试入口规则

## 3. 0.1.5 版本与文档

- [x] 3.1 统一 package、后端、Tauri、Docker、Compose、环境示例和锁文件版本为 `0.1.5`
- [x] 3.2 更新中英文 README、Changelog、发布指南并新增 `docs/releases/v0.1.5.md`
- [x] 3.3 更新 CI 文档，使前端单元和完整维护 E2E 门禁与工作流一致

## 4. 验证与归档

- [x] 4.1 运行聚焦测试、版本检查和 OpenSpec change 校验
- [x] 4.2 运行 backend、contract、frontend unit、typecheck、Web build、维护 E2E、Cargo、依赖审计、Docker 与开源就绪门禁
- [x] 4.3 检查敏感/生成文件、最终 diff 和版本一致性
- [x] 4.4 勾选全部任务、归档 change 并校验主 specs
