## MODIFIED Requirements

### Requirement: 翻译请求的有界等待和结构化输出

翻译的每个提供商请求 SHALL 在 90 秒总时限内完成，否则以 `LLM_PROVIDER_TIMEOUT` 失败；保活空行或持续小片数据不得重置总时限。等待期间界面 SHALL 展示实际已等待时间和单批时限说明，完成进度仍仅来自有效检查点。DeepSeek 预设的翻译请求 SHALL 启用 JSON 输出；支持切换的 V4 模型 SHALL 显式关闭思考模式，Ollama 预设的翻译 SHALL 请求非思考和约束字段、目标 ID 与数量的 JSON Schema 输出。不更改用户配置和其他 LLM 功能。

#### Scenario: 提供商持续保活但不完成响应
- **WHEN** 提供商持续发送保活或小片数据，单批到达总时限
- **THEN** 本地终止等待、释放请求资源，运行变为可显式续译的失败状态，后续排队任务可以继续

#### Scenario: DeepSeek V4 默认开启思考
- **WHEN** 用户选择 DeepSeek 预设的 V4 模型翻译字幕
- **THEN** 请求显式使用非思考和 JSON 输出模式，结果仍须覆盖所有目标段；校对和连接测试不继承这些翻译专用参数

#### Scenario: 其他兼容提供商
- **WHEN** 用户使用除 DeepSeek／Ollama 外的预设或自定义 OpenAI 兼容服务翻译
- **THEN** 不发送 DeepSeek 专用参数，也不在格式失败后偷偷重发计费请求

#### Scenario: 本地 Ollama 思考模型翻译
- **WHEN** 用户使用 Ollama 预设进行字幕翻译
- **THEN** 请求使用服务支持的非思考模式和 JSON 输出，保留完整性校验及总时限，其他 LLM 功能不继承这些翻译专用参数
