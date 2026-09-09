## 为什么

本地 ASR 模型当前只展示引擎和运行时名称，用户无法在选择或下载前判断模型会使用 CPU 还是可用的 GPU，容易在 CPU 回退后把正常但缓慢的推理误认为卡死。需要把各模型真实支持的推理设备作为受维护元数据，并在两个关键决策页面直接说明。

## 变更内容

- 为本地模型目录和 `/models/status` 响应增加结构化的推理设备支持信息，区分 CPU、CUDA、MPS 与 MLX。
- 在转写运行参数的模型选择器中显示紧凑的 CPU / GPU 支持摘要，并说明最终设备取决于当前机器和运行时。
- 在模型下载页的模型列表、详情与推荐卡片中展示设备支持和平台限定，避免把“模型支持 GPU”误解为“当前设备一定会使用 GPU”。
- 增加后端 registry、API contract 与前端展示测试，并同步中英文用户文案。

## 能力（Capabilities）

### 新增能力

无。

### 修改能力

- `model-management`：模型目录和模型管理界面需要公开每个模型受维护的推理设备支持信息，并在选择、下载和查看详情时提供一致说明。

## 影响

- 后端：`backend/backends/registry.py`、`backend/models.py`、`backend/services/models.py` 及相关 registry/API 测试。
- 前端：`app/src/lib/api.ts`、模型设备展示辅助逻辑、`TranscribePage`、`ModelsPage`/`ModelManagement` 与中英文 i18n。
- Contract：`GET /models/status` 新增必需响应字段，保持现有字段和路由不变。
- 文档与规格：`model-management` 主规格及受影响的用户文档。
- 不新增依赖，不改变模型下载、设备选择或推理回退逻辑。
