# Tasks: llm-provider-model-fetch

## 1. 后端：探测端点

- [x] 1.1 `backend/services/llm_compatibility.py`：新增 `bounded_get`（复用 follow_redirects=False/timeout/字节上限/错误分类）；`backend/services/llm_providers.py`：新增 `fetch_models(db, payload)`（校验→key 解析含 provider_id 复用→/models→ollama 回退 /api/tags→去重上限 500）；验证：`test_llm_model_list.py` 服务层用例通过
- [x] 1.2 `backend/models.py`：`LLMProviderModelsRequest` / `LLMProviderModelsResponse`；`backend/routes/llm_providers.py`：`POST /llm-providers/models`（run_in_threadpool）；验证：路由测试断言 ok/items/error_code 与 key 不回显
- [x] 1.3 `backend/tests/test_contract.py`：路由清单 + 响应字段断言；验证：`npm run test:backend:contract` 通过

## 2. 前端：表单交互

- [x] 2.1 `app/src/lib/api.ts`：`LLMProviderModelsResult` 类型 + `fetchLLMProviderModels()`；验证：typecheck 通过
- [x] 2.2 `LLMProvidersPanel.tsx`：default_model 行加「拉取模型」按钮 + 结果 Select（`__none__` 哨兵）+ 空列表提示 + 失败 toast；切换 preset/base_url 清空列表；验证：typecheck + e2e 通过
- [x] 2.3 `i18n.ts`：双语 key（拉取按钮/进行中/选择占位/空列表/失败）；验证：界面双语完整

## 3. 验证

- [x] 3.1 `npm run test:backend`、`npm run typecheck`、`npm run build:web` 通过
- [x] 3.2 新增 `app/e2e/llm-provider-models.spec.ts` 并接入 `test:e2e:maintained`，运行通过
- [x] 3.3 文档检查：`docs/ai-proofreading.md` / `docs/ai-chat.md`（及 .en）如描述手填模型 ID 则同步；CHANGELOG 更新
