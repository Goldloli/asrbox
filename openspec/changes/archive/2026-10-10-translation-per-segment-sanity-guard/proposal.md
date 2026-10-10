# translation-per-segment-sanity-guard

## 为什么

asrbox-mc1 的对照实验（55 次真实运行，真实管线 + 本机 Ollama）证明：结构校验与现有四条批量判据（相邻重叠、重复渲染、退化填充、异常膨胀）全部通过时，发布版本仍可能出现三类逐段污染——整段回显源文（run10 段 36-40）、模型元评论外泄（run6 段 34-40、run23 出现 235-350 字符的「（Note: …）」）、占位符文本（run0 段 31-32 的「（无翻译）」）。现有判据都是"段间集体特征"，而这三类污染各段内容互不相同、长度正常，结构上看不见。主 spec `openspec/specs/transcript-translation/spec.md` 已明确记录该缺口（"也不覆盖原样回显源文、模型元评论与占位符文本"），本 change 补齐为已声明的待办。

## 变更内容

- **新增三条逐段判据**（`backend/services/translation.py` 的 `alignment_hits`，保持纯函数）：
  - **未翻译回显**：译文归一化后等于源文、长度达到下限（放行名称/符号等短原样返回），且译文字符系统与运行目标语言的主字符系统不兼容（放行"已是目标语言的文本被原样返回"的合法情形）；
  - **模型元评论**：译文核心文本中的括注包含指向翻译指令/要求的标记模式（「（注意：根据要求…）」「(Note: …)」等），正常台词括注（「（笑）」「(laughs)」）不触发；
  - **占位符**：整段译文就是占位模式（「（无翻译）」「(no translation)」等），源字幕的符号标签（`[music]` 等）原样返回不触发。
- **判据接入既有两作用域**：批内作用域经 `_content_misaligned` 自动获得确定性对半拆批重试（多目标批）；发布前作用域经 `_repair_alignment` 自动获得有界一次定点重译与复验，复验不过以 `TRANSLATION_ALIGNMENT_UNVERIFIED` 失败并保留检查点。不引入新错误码，UI 零改动。
- **目标语言传入判据层**：`alignment_hits` 及其调用链增加目标语言参数（内存传递，不改任何 API/持久化 contract），用于回显判据的字符系统判定。
- **Spec 同步**：`transcript-translation` 的「全量且严格对齐的译文」requirement 整段重写——删除"不覆盖原样回显源文、模型元评论与占位符文本"的缺口声明，描述三条新判据及其误伤边界，新增对应 scenario，保留全部现有 scenario 与"名称/符号/目标语言原样返回合法"的既有边界。

## 能力（Capabilities）

### 新增能力

（无）

### 修改的能力

- `transcript-translation`：Requirement「全量且严格对齐的译文」新增三条逐段内容判据（回显/元评论/占位符）及其误伤边界 scenario。

## 影响

- 代码：`backend/services/translation.py`（`alignment_hits` 新判据与常量、`_content_misaligned`/`_repair_alignment` 调用链传入目标语言）。
- 测试：`backend/tests/test_translation_execution.py` 新增三类污染注入用例（沿用 `drifting_guard` 模式，断言请求序列与发布结果）与零误报反例（专有名词原样返回、已是目标语言段落、正常台词括注、`[music]` 标签、中文两字词）。
- 不改 API 路由、响应字段、错误码、前端、依赖与持久化数据。
- 风险：回显判据在源/目标同字符系统的语言对（如英→西）上保守不判定（避免把合法原样返回误判为回显），该形态维持既有缺口，记录于 design 非目标。
