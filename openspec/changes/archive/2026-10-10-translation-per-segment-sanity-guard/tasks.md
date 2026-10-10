# Tasks: translation-per-segment-sanity-guard

## 1. 判据实现

- [x] 1.1 在 `backend/services/translation.py` 新增常量（`ALIGNMENT_ECHO_MIN_CHARS`、元评论标记与括注重则、占位符模式）与目标语言→主文字系统映射函数；保持"零误报校准"注释风格并在注释中记录三类判据的实验来源。
- [x] 1.2 在 `alignment_hits` 逐段循环中实现未翻译回显（归一化相等 + 长度下限 + 文字系统不兼容）、模型元评论（括注 + 标记词 + 长度下限）、占位符（整段匹配）三条判据；`alignment_hits` 增加可选 `target_language` 参数，默认 `None` 时跳过回显判定。
- [x] 1.3 将 `run.target_language` 经 `_content_misaligned` 与 `_repair_alignment` 调用链传入判据层（含 `_repair_alignment` 定点重译后的复验路径），不改函数对外行为签名以外的 contract。

## 2. 测试

- [x] 2.1 在 `backend/tests/test_translation_execution.py` 沿用 `drifting_guard` 模式新增三类污染注入用例：跨词 fixture 上注入回显/元评论/占位符，断言请求序列（拆批或定点重译）、发布干净译文或以 `TRANSLATION_ALIGNMENT_UNVERIFIED` 失败且 `TranslationVersion.count() == 0`。
- [x] 2.2 新增零误报反例用例：长专名/`[music]` 标签/已是目标语言整段原样返回、「（笑）」「(laughs)」台词括注、裸 `N/A`、中文两字词——均不触发拆分或失败。
- [x] 2.3 `alignment_hits` 单元级直测（新判据命中与边界，含 `target_language=None` 跳过回显）。

## 3. 规格与归档

- [x] 3.1 `openspec validate --changes translation-per-segment-sanity-guard` 通过；聚焦运行 `pytest backend/tests/test_translation_execution.py backend/tests/test_translation_service.py`。
- [x] 3.2 `npm run test:backend` 通过；`git diff --check` 干净。
- [x] 3.3 勾选全部任务后 `openspec archive translation-per-segment-sanity-guard --yes` 并复核 `openspec validate --specs`。
