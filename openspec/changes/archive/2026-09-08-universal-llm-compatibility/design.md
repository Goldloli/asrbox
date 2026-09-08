## 背景

`backend/services/llm_providers.py:chat_completion` 仅有两个预设分支；`backend/services/proofreading.py:execute_run` 仍用同步 requests 的读超时。`app/src/components/settings/LLMProvidersPanel.tsx` 保存后仅测试 OK 回答。LLM 表目前没有兼容配置。接口事实参考 Ollama OpenAI compatibility、智谱 thinking-mode、阿里云 deep-thinking 官方文档；平台协议不同于模型名称。

## 目标 / 非目标

目标是在 OpenAI-compatible Chat Completions 范围内提供共享、可配置、可验证的适配。非目标：支持 Anthropic/Responses 等其他 API、自动发现所有私有参数、保证模型质量、修改时间轴、自动修补或重发用户字幕、改变校对原子应用和翻译检查点、依赖升级或立即替换用户正在运行的应用。

## 决策

- 增加 `LLMCompatibility` 强类型配置：protocol（auto/openai/deepseek/ollama/qwen/glm）、thinking（auto/default/disabled）、output_format（auto/json_schema/json_object/prompt）、transport（json/sse）。不开放任意 JSON 注入、URL、headers 或密钥覆盖。auto 使用提供商预设；自定义仅按已知精确官方 hostname 识别，否则采用基础 OpenAI 协议。显式设置优先。保留已有 DeepSeek/Ollama 默认翻译行为，并将适配共享给校对。
- `llm_providers.compatibility_json` 加法 migration，旧行按默认配置读取，不改凭据或字幕数据。API response_model 与 typed client 同步增加 compatibility。update 支持可选 expected_updated_at，应用能力测试建议通过数据库 compare-and-swap 拒绝陈旧结果。
- 全部调用复用现有 httpx 有界通道。JSON/SSE 总时限不被保活续期、响应总字节受限、禁止 redirect。SSE 只聚合首 choice 的 content，不拼入 reasoning；要求完成信号，拒绝截断/工具调用/拒答/异常结构。仅去除完整包裹的 JSON markdown fence，不抽取任意正文，不把错误输出回传 UI。
- 新增 POST /llm-providers/{provider_id}/test-capabilities，显式用户操作才触发。使用内置二段翻译、一段明显错字校对，调用真实 prompt/schema/parser，分别验证业务结构及基本示例结果（不宣称语义质量）。最多 json_schema→json_object→prompt 三种候选；每种最多两个请求，总预算 180 秒、每请求上限 90 秒。只有格式拒绝或结构不合格尝试下一候选；鉴权/限流/超时/连接/其他错误立即停止。输出具体尝试数、各业务状态、经过清理的错误和建议配置，绝不返回原始响应。候选不持久化，只有用户点应用后保存。测试失败仍可保存配置并调整协议/传输；用户配置被更新后旧测试不能覆盖。
- 两个测试 route 放入线程池，等待模型不阻塞事件循环。提供商配置在一次操作中取快照；没有新增任务转换写入。真实字幕使用已保存设置且只发一次，不强制测试才能运行。

## 风险

纯思考模型可能不能禁用、代理可能忽略参数 → 允许保留默认思考与 SSE，明确测试边界；不保证任意服务。短示例通过不代表长文速度或翻译准确 → 界面/文档明确说明。探测会计费 → 在按钮旁说明内置示例、最多六请求及三分钟总限；不自动随保存执行能力测试。数据并发 → 建议绑定 updated_at 并在写入时原子校验。测试和诊断不记录密钥或用户数据。

## 回滚

恢复旧代码即可忽略新增列；保留配置数据，不删除列。已生成译文和校对版本遵守原有读取方式，不受兼容设置回滚影响。

## 验证

使用合成 provider HTTP fixtures 覆盖协议/参数优先级、JSON/SSE/推理分离、截断/断流/keepalive 总时限、6 请求预算、错误不重试、真实业务严格校验、测试期间事件循环响应、migration 幂等/老配置、脱敏与陈旧建议 CAS。维护 API contract、提供商设置 Playwright、全部开源门禁；真实付费平台只有存在明确授权时测试，当前用本地 Ollama 和 mock 验证。

## 验证结果

2026-09-08：开源总门禁通过（后端 379 项、Rust 18 项、维护端到端 33 项，以及类型检查、Web 构建和审计）。新增提供商界面场景验证兼容设置持久化、显式双业务测试、应用建议和并发编辑后的 409 拒绝。API contract 验证新增响应字段实际序列化、配置 round-trip、非法兼容字段拒绝和陈旧建议保护。

真实本地验证使用临时内存数据库创建 custom 提供商，指向用户本地 Ollama，指定 qwen3.8:27b-mtp-bf16，协议 Ollama、SSE 传输。内置翻译与校对示例均通过，共 2 次请求，推荐非思考和 JSON Schema；未读写用户字幕或正式提供商配置。GLM、Qwen 等云端协议使用模拟 HTTP 验证，未进行付费云端实测。当前已安装桌面应用未替换，以上变更位于开发分支。
