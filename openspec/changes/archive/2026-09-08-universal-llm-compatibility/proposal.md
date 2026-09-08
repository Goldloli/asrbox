## 为什么

自定义 OpenAI-compatible 平台只保证基本接口相似，思考参数、结构化输出和流式支持并不统一。当前翻译仅适配 DeepSeek/Ollama，校对未共享这些规则，连接成功不代表字幕服务可用。

## 变更内容

- 为全部 LLM 提供商增加可保存的兼容设置：协议适配、思考模式、输出约束和流式传输；提供商预设与自定义 endpoint 均可覆盖。
- 翻译、校对共享有界请求、协议参数、SSE/JSON 解析、截断及错误识别；不在真实字幕失败后隐式重发。
- 增加显式“测试翻译与校对”：仅发送内置示例，最多六个请求、整体三分钟，自动尝试三档输出约束并分别验证两种业务格式，返回可应用的兼容设置。超时、鉴权、限流等不自动重试。
- 测试建议只在用户应用后保存；配置变化后失效。不能关闭思考或不支持 Chat Completions 的平台明确说明限制，不承诺模型语义质量。

## 能力（Capabilities）

- `llm-provider-management`：可保存的兼容设置与显式能力测试，支持流式 Chat Completions。
- `transcript-proofreading`：校对共享兼容设置、总时限、输出限制和完整响应校验。
- `transcript-translation`：翻译采用通用兼容设置，保留检查点与显式恢复。

## 影响

仅涉及 backend LLM 配置/model/migration/route、共享请求与校对/翻译调用，app 提供商设置/typed client/错误提示，聚焦测试与用户文档。增加一个配置 JSON 列与一条能力测试 API，contract 同步维护。无新依赖、不改变 endpoint 安全策略、字幕历史、转写与导出边界。
