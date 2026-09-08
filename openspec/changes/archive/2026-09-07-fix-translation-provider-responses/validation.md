# 验证记录

- 实际失败任务：24 段，约 220 秒后 `TRANSLATION_INVALID_RESPONSE`。只读检查原数据库，未改任务、凭据和字幕。
- 旧请求复现：213.1 秒、结构校验失败，未保存正文。
- 中间验证：DeepSeek V4 非思考 JSON 请求 4.9 秒，23/24 段，最后一段缺失，严格校验正确拒绝。
- 修复后：明确目标 ID、数量及末段约束，同一份原字幕 4.5 秒返回 24/24，完整结构校验通过。结果只在内存检验，未写进用户历史。
- 聚焦 pytest：60 passed，含真实 HTTP 保活与慢响应头总超时、断连资源释放、下一请求成功、错误脱敏、模型参数隔离、漏段和围栏严格校验。
- 翻译 Playwright：8 passed；新增等待时间使用无时区 UTC 字段，检查计时、真实零进度、失败展示和显式续译。
- `npm run test:backend:contract`：9 passed。
- `npm run check:open-source`：通过，348 后端、15 前端单元、32 维护 E2E、18 Rust，类型检查、Web 构建、依赖完整性与第三方验证通过。
- 最终 `.app` 冻结后端 smoke（包含 MLX）：1 passed，17.26 秒。
- 包内后端隔离集成：本地合成提供商经实际 async HTTP 路径，24/24 段保存并成功导出含最后一段的双语 SRT。
- `npm run build:desktop` 成功构建后端、Web 和 `.app`，标准 DMG 脚本失败；清理本次失败镜像挂载后，以 `ditto` 复制同一 `.app`，用 macOS `hdiutil create` 创建含 Applications 链接的替代 DMG，未改打包源码。
- 最终测试包：`tauri/src-tauri/target/release/bundle/dmg/ASRbox_0.1.5_translation-fix1_aarch64.dmg`。`hdiutil verify` 通过，旁边提供 SHA-256 校验文件。
- 保留内部版本 0.1.5；未安装替换用户当前应用，未 commit、tag、push 或发布。
