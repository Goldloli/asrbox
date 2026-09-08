## 1. 数据模型和接口基础

- [x] 1.1 在 `backend/database/models.py`、`backend/database/migrations.py` 增加翻译运行、批次与不可变译文版本，以及活动运行／批次／版本唯一约束；用 `backend/tests/test_translation_foundations.py` 验证旧库升级、重复初始化、迁移中断恢复和旧任务／字幕／校对数据不变。
- [x] 1.2 在 `backend/models.py` 定义语言选择、运行状态、历史、修订与导出相关请求／响应；增加 language helper，以单元测试覆盖预设、简繁、自定义上限、自动源语言、同语种拒绝和 Unicode 字符计数。
- [x] 1.3 增加翻译路由及 service 的来源校验、锁内创建认领和 typed 响应投影，接入 router；在 lifespan 启动后建立测试状态，验证未完成任务、跨任务 source_version、无效时间、重复创建和 provider 无效时不调用 LLM。

## 2. 完整翻译和后台执行

- [x] 2.1 实现整份来源预检、确定性分批和有限上下文，默认 100 段／6,000 字、上下文不超过 1,000 字；用 `backend/tests/test_translation_service.py` 覆盖边界、超长单段提前拒绝、无空格语言和每个来源段恰好成为目标一次。
- [x] 2.2 实现固定翻译 prompt、语言数据输入和严格结构解析；验证非英语到非中文、混合源、简繁、原译相同、漏段／重复／未知 ID、空文本、结构变更和字幕内指令不被当作系统指令。
- [x] 2.3 复用 `llm_providers.chat_completion` 接入翻译 worker，添加翻译所需的可选响应大小限制并保留校对默认调用；使用 stub provider 验证 timeout／限流／上下文／超限响应分类、配置快照校验、逐批检查点和真实进度，不触发真实付费调用。
- [x] 2.4 实现完成前的全量段落校验及首份译文版本原子提交；用故障注入和重复 worker 测试证明不存在部分版本、重复首版或原任务／校对状态变化。

## 3. 取消、续译与数据生命周期

- [x] 3.1 实现 queued／running 取消、attempt 隔离、失败／取消／中断显式续译；用受控并发测试覆盖迟到响应、取消与完成竞争、重复 retry 和仅发送未完成批次。
- [x] 3.2 在启动恢复中把活动翻译标为 interrupted，增加翻译 worker 异常兜底及退出补位；验证重启保留检查点、不自动发请求、后续运行能够继续。
- [x] 3.3 纳入任务删除、批量删除及 provider 删除路径；验证任务删除与后台写回竞争不复活数据、provider 删除仍可读历史、endpoint／模型变化不能拼接续译、仅凭据轮换允许恢复。
- [x] 3.4 为所有翻译重型路由使用线程池，为所有状态认领使用共享转换锁；事件循环测试证明慢速生成／导出期间其他 coroutine 可运行，并确认网络等待期间锁可被其他操作获取。
- [x] 3.5 补齐 `backend/tests/test_translation_privacy.py`，验证请求不含媒体／文件名／路径、诊断不含 prompt／译文／原响应／secret，以及一致性备份恢复保存来源关系和全部译文历史。

## 4. 译文修订和导出

- [x] 4.1 实现原子文本修订与版本查询，返回明确来源及 `source_is_current`；测试多段一次保存、空修改不增版本、过期 base_version 冲突、故障回滚和原字幕更新后旧译文仍可读取。
- [x] 4.2 实现指定来源／译文版本的临时导出投影及六格式单语／双语输出，包含顺序选择、ASS 换行、格式转义和安全文件名；用 `backend/tests/test_translation_exports.py` 覆盖全部格式、RTL、换行／控制语法和 JSON 原译分离字段。
- [x] 4.3 增加导出来源、格式与完整性校验；验证部分批次不能导出、跨任务运行／版本不能读取、原文更新后仍严格匹配固定快照，以及已有原文与历史六格式导出保持兼容。

## 5. AI 翻译工作区

- [x] 5.1 扩展 `app/src/lib/api.ts` 和 `queries.ts`，接入运行／版本／动作等 typed consumer；同步补 `backend/tests/test_contract.py` 的准确路由和 response_model 字段断言，通过 contract 与 TypeScript 检查。
- [x] 5.2 为 AI 路由增加核对／翻译切换、task／run 定位和任务详情翻译轻入口；Playwright 验证旧核对链接保持原语义、刷新可恢复翻译、任务切换不串结果、已选任务临时活动仍能查看历史。
- [x] 5.3 实现来源版本、语言搜索／自定义、提供商配置与披露；单元测试和 Playwright 验证非英语源到非中文目标、简繁、混合语言提示、不符合条件时不可启动，以及切换页面不自动发送请求。
- [x] 5.4 实现状态／段落进度、取消、续译、分类错误和翻译历史；Playwright 覆盖页面离开返回、取消迟到结果、部分失败续译、provider 配置变化及来源已更新提示。
- [x] 5.5 实现全部原译文对照、搜索、复用媒体播放、译文编辑保存、修订历史和未保存提示；验证保存冲突不丢草稿、一次保存一个版本、丢失媒体不影响文本审阅和导出。
- [x] 5.6 实现单语／双语导出、顺序选择、中英文文案与移动端排版；Playwright 验证实际下载内容、导出所选保存版本、RTL 文本隔离、长文本和窄屏无横向溢出。

## 6. 集成验证与归档

- [x] 6.1 把新增前端单元测试放入 `test:frontend:unit` 覆盖范围，把 `app/e2e/llm-translation.spec.ts` 接入 `test:e2e:maintained`；运行两个聚合命令验证新旧 AI 流程均被维护门禁覆盖。
- [x] 6.2 更新 README 中英文、现有 AI 指南中英文、隐私／Docker 说明及 CHANGELOG；逐项核对真实语言能力说明、原文保留、取消／费用／续译、双语导出和降级边界与最终实现一致。
- [x] 6.3 运行聚焦翻译套件后执行 `npm run test:backend`、`npm run test:backend:contract`、`npm run typecheck`、`npm run build:web` 和 `npm run check:open-source`；记录真实命令结果及任何环境限制，不以 mock 通过声称语义翻译质量已验证。
- [x] 6.4 手动验证 macOS 桌面与 Docker Web 的选择版本、翻译历史、对照播放、保存和实际下载；使用合成短字幕验证可用本地 Ollama，只有在已有授权时验证一个远端 LLM，记录实际语言对与质量限制；无法运行的项目明确列为未验证。
- [x] 6.5 按声明接触点审阅 diff，确认已有模型设备标识改动完整保留；实现与验证全部完成后勾选任务并归档本 change，执行 `openspec list --json`、`openspec validate --specs` 确认主规格同步，且不自动 commit／publish。

验证命令、实际语言对、Docker 验收和原生窗口未验证限制见 [validation.md](validation.md)。
