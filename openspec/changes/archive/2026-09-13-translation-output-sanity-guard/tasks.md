# Tasks: translation-output-sanity-guard

## 1. 后端实现

- [x] 1.1 `backend/services/translation.py`：`make_batches` 增加 `local` 参数（本地 Ollama 原生协议 16 段/1600 字符，其余 100 段/6000 字符），`create_run` 按 `llm_compatibility.resolved(provider).protocol == "ollama"` 传入；`source_segments` 的单段 6000 字符上限不变。
- [x] 1.2 新增内容合理性校验：`parse_translations` 成功后对 ≥2 目标批检查相邻译文最长公共子串 ≥25 字符或整批译文总量 >2.2 倍源文且超出 200 字符，触发后与 `TRANSLATION_INVALID_RESPONSE` 走同一 `split_and_retry()`；单目标结果直接接受。
- [x] 1.3 `SYSTEM_PROMPT` 增加目标隔离要求（每条译文只翻译对应目标段，不重复上下文或其他目标段内容，长度贴近源段）。

## 2. 测试

- [x] 2.1 `backend/tests/test_translation_execution.py`：滑窗重叠响应 → 拆分后完成；整批膨胀响应 → 拆分；单段膨胀结果直接接受不拆分。
- [x] 2.2 Ollama 提供商初始批次 ≤16 段/1600 字符断言、非 Ollama 提供商保持 100 段/6000 字符断言（可断言 `make_batches` 或创建运行的批次形状）。
- [x] 2.3 运行 `node scripts/venv-python.mjs -m pytest backend/tests/test_translation_execution.py -q` 全绿，再跑 `npm run test:backend`。

## 3. 前端与文档

- [x] 3.1 翻译等待/超时文案按提供商协议显示 300/90 秒（`TranslationPanel.tsx` + `translationI18n.ts`），e2e `app/e2e/llm-translation.spec.ts` 覆盖 Ollama 300 秒与线上 90 秒两种显示；`npm run typecheck` 通过。
- [x] 3.2 `CHANGELOG.md` Unreleased → Fixed 增加条目（本地翻译批次收紧 + 内容错位自动拆批 + 时限显示修复）。
- [ ] 3.3 `openspec validate --changes translation-output-sanity-guard` 通过；实现完成后 `openspec archive translation-output-sanity-guard --yes` 并复核 `openspec validate --specs`。
