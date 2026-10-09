## 1. 本地批次上限回到 spec 区间

- [x] 1.1 把 `backend/services/translation.py` 的 `LOCAL_MAX_SEGMENTS`/`LOCAL_MAX_CHARACTERS` 恢复为 16/1600，注释改为说明实据（固定开销接近零、大批次在长字幕上更慢、代码需符合 spec），不再宣称"干净区间"；验证：`./.venv/bin/python -m pytest backend/tests/test_translation_service.py -q` 通过
- [x] 1.2 更新受影响的既有断言：`backend/tests/test_translation_service.py` 中 64/6000 的用例改为 16/1600，`backend/tests/test_translation_execution.py::test_create_run_uses_local_batch_limits_for_ollama_only` 的 40 段批次形状改为 `[16, 16, 8]`；验证：两个文件聚焦运行全绿

## 2. 内容合理性判据重写（按语料标定）

- [x] 2.1 把判定抽成可独立测试的纯函数（输入目标段与源文，输出命中集合），实现归一化相邻重叠判据：`shared >= max(6, 0.6 × min_len)` 且 `shared − source_shared >= max(3, 0.4 × min_len)`；验证：`test_sliding_window_batch_splits_deterministically_and_completes` 仍触发拆分并通过
- [x] 2.2 实现重复渲染判据（同一归一化译文出现在源文互不相同的多个段位，长度下限 4）、退化填充判据（单字符／非目标文字单字符重复／纯数字与转义填充／去边标点后为空，且源文长度达标）、逐条膨胀判据；验证：新增用例（第 3 组）与既有用例同时通过
- [x] 2.3 确认单目标接受与"批内命中只驱动 `split_and_retry()`、不改写模型文本"的语义未变；验证：`test_single_segment_bloat_is_accepted_without_split` 与 `test_repeated_source_lines_do_not_trigger_overlap_split` 通过
- [x] 2.4 用第 2 组判据对留档语料（`/tmp/asrbox-batch-experiment` 的逐次逐段数据）复算，确认在 55 次运行上零误报、对已知真漂移全覆盖；验证：复算脚本输出与实验报告一致（误报 0、R1 32 条／R2 34 条／R3 期望形态／R4 逐条 4 条），结果记入 change 说明

## 2b. 发布前作用域与定点重译

- [x] 2b.1 在 `execute_run` 组装完整结果之后、写译文版本之前，用同一套判据对全部目标段整体求值；验证：新增用例构造只在跨批次／跨拆分边界可见的重复，断言不发布并进入修复流程
- [x] 2b.2 实现有界一次的定点重译：命中段作为携带前后邻段上下文的单段目标走既有提供商调用路径，复验通过后发布；验证：用例断言命中段被重译且最终版本通过发布前校验
- [x] 2b.3 复验仍命中时以 `TRANSLATION_ALIGNMENT_UNVERIFIED` 失败、保留既有检查点、不创建译文版本；并让该错误码在界面上有本地化提示（`app/src/components/transcript/TranslationPanel.tsx` 的 `errorLabel` 分支 + `app/src/lib/translationI18n.ts` 中英文案，说明未发布任何译文版本、成功批次已保留、可显式重试）；验证：后端用例断言运行失败、`latest_version` 为空、检查点行仍在；前端 `npm run typecheck`、`npm run build:web` 通过且 `npm run test:e2e:maintained` 中的翻译场景仍绿

- [x] 2b.4 付费协议不自动重译：非本地 Ollama 协议首次运行命中发布前校验时直接失败、不发出额外请求，仅在用户显式续译（`attempt > 1`）后执行同一有界定点重译；验证：`test_remote_provider_repairs_only_after_explicit_resume` 断言首次运行只有原批次请求且运行失败、续译后出现命中段的单段请求并成功发布

## 3. 合成跨词 fixture 回归

- [x] 3.1 在 `backend/tests/test_translation_execution.py` 内建合成跨词 fixture（英文连续叙事按词/短语切段并跨句边界，全部源段互不相同、不引用任何用户字幕）；验证：fixture 可被用例直接复用且用例独立运行通过
- [x] 3.2 新增漂移形态用例（形态取自实验语料）：末段短句重复、整段回卷复用开篇、4–5 字短重复（`该资助项目` 类）、退化填充（单字符／`\n`／纯数字）、逐条膨胀（一段吐出超长元评论），各断言该批被判定为未通过校验、按确定性对半拆分、子批完成后发布与源段一一对应的正确译文；验证：`./.venv/bin/python -m pytest backend/tests/test_translation_execution.py -q` 全绿
- [x] 3.3 新增零误判反例用例（反例取自实验里被第一版判据误伤的样本）：源文相同的重复台词行、高频短译文（"是"）、合法中文两字词（`每次`／`所以`／`样品`）、占位符/非语音标签，各断言不触发拆分与重译、单次请求完成；验证：同上聚焦运行全绿
- [x] 3.4 确认新增用例被聚合命令覆盖、无需在工作流里另列文件清单；验证：`npm run test:backend` 全绿

## 4. 真机验证、文档与归档

- [x] 4.1 新增 `backend/real_tests/test_real_translation.py`：使用同一合成跨词 fixture 打真实本地提供商，沿用 `ASRBOX_RUN_REAL_MODELS=1` 门禁，缺少可用本地提供商时按能力探测明确跳过，断言运行完成、每段非空、已发布版本不含可检出漂移（重复渲染／归一化重叠／退化填充）；验证：本机 `npm run test:backend:real-models` 中该用例通过
- [x] 4.2 真机复核并留档：用本机本地模型跑 40 段与 137 段 fixture，记录请求数、耗时与漂移检出／修复结果，按既有约定写入 `backend/real_tests/results/`；验证：结果文件生成且数据支持"发布版本无可检出漂移"
- [x] 4.2b 把已完成的两轮对照实验结果（55 次真实运行：16/1600 vs 64/6000、单作用域 vs 双作用域、判据标定与定点重译收敛）整理成结果文件，按既有约定写入 `backend/real_tests/results/`，作为"不做速度优先开关、默认 16/1600"的决策留档；验证：结果文件生成，含 16 vs 64 的耗时倍数、漂移率、发布前作用域命中数与定点重译收敛数据
- [x] 4.2c 落地后真机对照验收（`16/1600 + 双作用域` 相对现状 64/6000，同一 fixture 与模型）：**精度**要求发布版本按本 change 四条判据零命中（现状基线 8/11 命中）；**速度**要求长字幕（≥100 段）耗时不超过现状 1.5×，短字幕（≤40 段）绝对增量不超过 5 秒，且不慢于同精度的 `64/6000 + 双作用域`（实验基线：后者贵 2.0–2.8×）。验证：结果文件更新并逐条对照上述三项阈值；任一不达标先报告再决定优化或调整口径，不得直接降级精度 —— 已测量并留档：精度达标（新配置 11 次运行中 10 次完成且全部零漂移），长字幕 1.10–1.24× 达标；**27B/40 段一格 +8.40 s 超过 5 秒阈值**，已上报，用户决定接受（代价是更小的批次与必要的重译，换来不再发布错位字幕；见 `backend/real_tests/results/asrbox-translation-alignment-20260924.md`）
- [x] 4.3 运行后端全量门禁；验证：`npm run test:backend` 与 `npm run test:backend:contract` 全绿（无合同变化）
- [x] 4.4 核对面向用户文档是否需同步（`docs/` 与 `README.md` 中涉及翻译批次与等待行为的部分；`CHANGELOG.md` 与发布要点归第 5 组）；验证：需要则更新，不需要则在该 change 的归档说明中记录"无面向用户文档变化" —— `docs/ai-proofreading.md`／`.en.md` 已更新（本地批次 16/1600 与新的对齐校验行为）
- [x] 4.5 归档 change：勾完 tasks 后执行 `openspec archive harden-translation-segment-alignment --yes`；验证：`openspec list --json` 不再列出该活动 change，`openspec validate --specs` 通过，主 spec `## Purpose` 无需补写 —— 已归档为 `2026-09-24-harden-translation-segment-alignment`，主 spec 的 `全量且严格对齐的译文` 已合并新文本，`validate --specs` 22/22 通过
- [x] 4.6 关闭 Beads 任务并记录验收结论；验证：`bd close asrbox-mc1` 后 `bd show asrbox-mc1` 显示已关闭且备注含真机验证数据

## 5. 版本号 0.3.4 与发布材料

- [x] 5.1 先在 `CHANGELOG.md` 的 `[Unreleased]` 下写好本 change 的条目（`version:bump` 会把该节提升为 `[0.3.4]`，先写后提避免空发布说明）；验证：`[Unreleased]` 下的条目与实际变更一致且无占位文字
- [x] 5.2 执行 `npm run version:bump -- 0.3.4`，同步五个版本 JSON、`tauri/src-tauri/Cargo.toml`、`backend/__init__.py`、`Dockerfile`、`compose.yaml`、`.env.example`、`README.md`／`README.en.md`、`docs/release.md`、`CHANGELOG.md`、`docs/releases/v0.3.4.md`，并重生成 `bun.lock`／`Cargo.lock`；验证：命令输出 `Version check passed.`，单独运行 `npm run check:versions` 亦通过（本机缺少 `bun`／`cargo` 时按脚本告警手动同步对应 lock）
- [x] 5.3 填写 `docs/releases/v0.3.4.md` 的发布要点（替换骨架中的 TODO），覆盖本次面向用户的修复行为；验证：文件无 TODO 占位，且与 `CHANGELOG.md` 的 0.3.4 条目一致，不夸大未验证的能力（纯位移仍不可检出要如实说明）
- [x] 5.4 确认无功能性位置残留旧版本号；验证：`grep -rn "0\.3\.3" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build` 仅剩历史 CHANGELOG／`docs/releases/v0.3.3.md` 等历史记录 —— 实测仅命中 gitignored 的 `tauri/src-tauri/target/` 构建产物与无关的 crate 版本号
- [x] 5.5 交付边界确认：本 change 只改版本与发布材料，不 commit、不打 tag、不 publish（如需发布由用户明确指示）；验证：`git status --short` 显示的全部为文件修改，无 tag／release 动作
