## 1. 后端模型目录与 contract

- [x] 1.1 先为各 ASR 引擎的设备支持矩阵和 `/models/status` 必需字段增加失败测试
- [x] 1.2 在模型 registry、Pydantic 响应模型和状态 service 中实现 `supported_devices`

## 2. 前端设备说明

- [x] 2.1 先为设备摘要/详细标签辅助逻辑与两个页面的用户可见展示增加失败测试
- [x] 2.2 更新 TypeScript contract、中英文文案、模型选择器、模型下载列表/详情与推荐卡片

## 3. 文档与验证

- [x] 3.1 更新受影响的用户文档并通过 OpenSpec change 校验
- [x] 3.2 运行聚焦测试、后端 contract、前端类型检查/构建及开源就绪门禁，审阅最终 diff
