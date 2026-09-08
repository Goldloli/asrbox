## 背景

见 [proposal.md](proposal.md)。`backend/services/translation.py:execute_run` 以 90 秒调用 `chat_completion`，`backend/services/llm_providers.py:chat_completion` 的 requests 超时仅限制读空闲。当前 `parse_translations` 对 JSON 代码围栏也失败。`TranslationPanel.tsx` 仅显示批次计数。实际运行记录为 24 段、0 个检查点、约 220 秒后 `TRANSLATION_INVALID_RESPONSE`，没有保存响应正文，旧请求复现耗时 213.1 秒且仍结构失败；非思考 JSON 请求在 4.9 秒返回但漏第 24 段；加入明确目标 ID 列表、目标数量和不得漏掉末段的约束后，原 24 段在 4.5 秒完整通过。只输出耗时、段数与结构诊断，未记录正文。

## 目标 / 非目标

落实请求总时限及 DeepSeek 结构化翻译，保持批次检查点、严格完整性和隔离失败。仅修改有界翻译传输分支、解析器、等待提示及对应测试文档。不新增 API／数据库字段、不扩大提供商配置、不改变校对请求、不重试用户真实任务、不记录原文／凭据／模型思考或响应正文。

## 决策

- 复用运行时锁文件已有的 httpx，在同步翻译 worker 的有界请求分支使用异步客户端与 asyncio 总时限；async context 在超时后关闭响应和连接。普通校对 requests 路径保留。仅在 iter_content 中检查时钟无法打断正在阻塞的读取，后台线程超时则可能泄漏线程并卡住后续请求，均不采用。
- 1 MiB 上限按解码后字节增量检查，不改变不跟随重定向和错误分类；网络异常统一脱敏。
- 使用翻译专用参数开关，DeepSeek 预设启用 json_object，V4 模型关闭 thinking；不猜测其他提供商能力，不做自动兼容重试。提示词给出 JSON 示例。
- 仅规范化完整单层代码围栏，JSON 字段、重复 ID、缺失 ID、额外文字仍严格拒绝。避免任意截取大括号或修补 JSON。
- 单独的等待提示组件定时显示基于已存在 updated_at 的等待时长；worker 开始或续译时刷新该时间。前端处理后端无时区 UTC 日期，不改变 API contract。
- 聚焦验证：本地真实 HTTP 服务持续保活／慢响应／断连／超限，证明总时限和连接释放；严格格式正反例、DeepSeek 参数、旧代次取消和失败状态、Playwright 等待与错误提示。合并前使用 check:open-source；包通过 frozen binary smoke 和 DMG 校验。

## 风险

90 秒内远端无法完成会明确失败，用户可显式续译，远端仍可能计费；不将关闭思考描述为翻译质量保证。httpx 已存在于发布锁文件，冻结包需验证实际导入。历史失败任务保留，不能把新测试结果写进用户历史。

## 回滚

撤销该修复代码并重新打包即可，无数据迁移；旧版仍可读取原任务与全部历史。测试仅用临时数据，原失败任务由用户决定续译。
