## ADDED Requirements

### Requirement: 可审计的校对应用
应用 LLM 字幕校对建议 SHALL 创建一个不可变的 `proofread` 字幕版本，其中包含最终完整文本和分段，同时不修改或删除来源版本及任何其他历史版本。

#### Scenario: 应用选中的校对建议
- **WHEN** 当前有效的校对任务应用一条或多条用户选中的文本建议
- **THEN** 之前的快照仍然可用，并新增一个记录完整最终字幕的 `proofread` 版本

#### Scenario: 恢复 proofread 版本
- **WHEN** 用户恢复一个历史 `proofread` 版本
- **THEN** 现有可审计恢复行为会把该版本复制到当前状态，并创建一个新的 restore 版本
