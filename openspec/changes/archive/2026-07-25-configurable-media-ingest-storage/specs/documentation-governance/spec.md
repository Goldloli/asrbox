## ADDED Requirements

### Requirement: 受维护的媒体摄取与存储文档
用户文档 SHALL 描述桌面端摄取模式、托管 uploads 与派生音频的位置配置、派生音频的自动删除、源缺失 relink、按任务的删除语义，以及可选的 Docker uploads bind mount；在同时维护中英文版本的文档中，两种语言都 SHALL 更新。

#### Scenario: 产品行为影响用户
- **WHEN** 摄取模式、存储位置、relink 或 Docker 挂载行为发布
- **THEN** 受维护的用户文档、`.env.example`、Compose 注释与隐私措辞在同一个 change 中更新
