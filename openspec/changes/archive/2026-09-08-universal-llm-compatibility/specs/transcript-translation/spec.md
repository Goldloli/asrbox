## MODIFIED Requirements

### Requirement: 翻译请求的有界等待和结构化输出

翻译的每个提供商请求 SHALL 在 90 秒总时限内完成，否则以 LLM_PROVIDER_TIMEOUT 失败；保活不得重置时限。界面 SHALL 展示实际等待及单批时限，完成进度仅来自有效检查点。翻译 SHALL 使用保存的共享兼容设置；默认 DeepSeek 请求 JSON（V4 关闭思考），默认 Ollama 请求非思考和 JSON Schema，其他协议按所选兼容设置执行。结构不合格、截断或拒答不得保存为成功，实际字幕请求不自动重发。

#### Scenario: 提供商持续保活但不完成响应
- **WHEN** 提供商持续发送保活或小片数据，单批到达总时限
- **THEN** 本地终止等待、释放请求资源，运行变为可显式续译的失败状态，后续排队任务可以继续

#### Scenario: DeepSeek V4 默认开启思考
- **WHEN** 用户选择 DeepSeek 预设的 V4 模型翻译字幕
- **THEN** 请求显式使用非思考和 JSON 输出模式，结果仍须覆盖所有目标段；校对共享兼容设置，连接测试不请求字幕结构约束

#### Scenario: 其他兼容提供商
- **WHEN** 用户使用除 DeepSeek／Ollama 外的预设或自定义 OpenAI 兼容服务翻译
- **THEN** 仅发送所选兼容协议对应的参数，不在格式失败后偷偷重发计费请求

#### Scenario: 本地 Ollama 思考模型翻译
- **WHEN** 用户使用 Ollama 预设进行字幕翻译
- **THEN** 请求使用服务支持的非思考模式和 JSON 输出，保留完整性校验及总时限，校对共享兼容设置，连接测试不请求字幕结构约束
