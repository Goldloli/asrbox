## 为什么

用户要求使用本机 Ollama 的 qwen3.8:27b-mtp-bf16 完成已有外文字幕翻译。提供商已配置且连接成功，但实际 25 段翻译因默认思考超过 90 秒时限；现有翻译专用参数仅覆盖 DeepSeek。

## 变更内容

- Ollama 预设的翻译请求显式使用其支持的 reasoning_effort=none 和 带字幕字段、ID 和数量约束的 JSON Schema 输出，减少推理等待并约束结构。
- 保持指定模型、90 秒总时限、完整性校验和显式续译；不改变校对、连接测试或其他提供商。
- 完成真实本地模型、桌面运行及 SRT 导出验证。

## 能力（Capabilities）

### Modified Capabilities
- `transcript-translation`: 补充 Ollama 翻译参数隔离行为。

## 影响

仅涉及 translation 的输出 schema、llm_providers 的翻译参数分支、现有参数隔离测试、中英文 AI 指南及 CHANGELOG。无 API、数据库、依赖、版本或模型文件变更。原字幕及历史不变，不自动重试错误。聚焦 pytest、总门禁和冻结包验证后，以桌面实际操作完成用户翻译；无需提交发布。
