# transcript-editing-versioning Specification

## Purpose
规定字幕段落编辑、不可变字幕版本快照、可审计的版本恢复与可审计的校对应用。

## Requirements

### Requirement: Editable transcript segments

Users SHALL be able to edit supported transcript segment text and structure while retaining finite non-negative timing, valid ordering, and a coherent task-level transcript. Saving edits SHALL persist all segment changes and exactly one immutable `edit` version in one database transaction; a single save action never produces a version per segment, and a version-write failure SHALL leave both current segments and version history unchanged. The bulk update SHALL reject payloads whose segment id set differs from the task's current segments (structural changes use the dedicated create/delete/split/merge endpoints), SHALL reject non-finite timing, and SHALL reject invalid timing (`start < 0` or `end <= start`). Every segment mutation, postprocess, or version restore SHALL reject an active task with a conflict response so the task worker remains the only transcript writer. The task-level flat transcript is a derived read-only projection of the segments; free-form whole-text editing SHALL NOT be offered as a persistence path.

#### Scenario: Segment text is edited

- **WHEN** a user saves a valid segment edit on a terminal task
- **THEN** the current transcript reflects the edit and remains exportable

#### Scenario: Multiple segment edits are saved together

- **WHEN** a user saves staged edits to several segments' text, speaker, or timestamps in one action
- **THEN** all edits and exactly one new `edit` version commit atomically, the task text is recomputed, and exports reflect the saved content

#### Scenario: Version creation fails during save

- **WHEN** creating the immutable edit version fails after segment changes have been staged
- **THEN** the transaction rolls back and neither current segments nor version history changes

#### Scenario: Bulk edit with mismatched segment set

- **WHEN** a bulk save carries a segment id set that differs from the task's current segments
- **THEN** the request fails with a clear client error and no segment or version is written

#### Scenario: Bulk edit with invalid timing

- **WHEN** a bulk save carries NaN, infinity, a negative start, or an end that is not after its start
- **THEN** the request fails as a client error identifying invalid input and no change is persisted

#### Scenario: Edit an active task

- **WHEN** a segment mutation, postprocess, or restore targets an active task
- **THEN** it fails with a conflict response and the worker-owned transcript state remains untouched

### Requirement: Immutable transcript versions
Transcription, retranscription, editing, post-processing, and restore operations that change transcript content SHALL create immutable version snapshots rather than rewriting historical versions.

#### Scenario: Transcript is changed
- **WHEN** an operation commits changed transcript content
- **THEN** the prior snapshot remains available and a new auditable version records the resulting content

### Requirement: Auditable restore
Restoring a historical transcript version SHALL copy that version into the current task state and create a new restore version.

#### Scenario: User restores an older version
- **WHEN** a valid historical version is selected for restore
- **THEN** its text and segments become current without deleting or mutating any existing version

### Requirement: 可审计的校对应用
应用 LLM 字幕校对建议 SHALL 创建一个不可变的 `proofread` 字幕版本，其中包含最终完整文本和分段，同时不修改或删除来源版本及任何其他历史版本。

#### Scenario: 应用选中的校对建议
- **WHEN** 当前有效的校对任务应用一条或多条用户选中的文本建议
- **THEN** 之前的快照仍然可用，并新增一个记录完整最终字幕的 `proofread` 版本

#### Scenario: 恢复 proofread 版本
- **WHEN** 用户恢复一个历史 `proofread` 版本
- **THEN** 现有可审计恢复行为会把该版本复制到当前状态，并创建一个新的 restore 版本

### Requirement: 独立且不可变的译文版本

完整翻译和人工译文修订 SHALL 产生绑定来源原字幕版本的独立不可变译文版本，SHALL 不修改原任务的当前字幕、原字幕最新版本、历史恢复或校对过期判断。人工修改 SHALL 仅改变译文文本，保存一次 SHALL 原子创建一份完整修订，所有时间、段 ID、顺序和说话人保持来源映射。响应 SHALL 通过带类型字段暴露来源和译文版本信息。

#### Scenario: 翻译成功发布首版
- **WHEN** 所有批次通过完整性校验并提交成功
- **THEN** 恰好一份完整译文版本与完成状态共同保存，原字幕最新版本和校对可应用状态不因此改变

#### Scenario: 用户一次保存多段译文修改
- **WHEN** 原任务已完成，用户基于当前译文版本提交有效且有变化的完整文本集合
- **THEN** 一次保存只创建一份完整 edit 译文快照，先前译文和来源原字幕不变；没有文字变化时不产生冗余修订

#### Scenario: 保存失败或并发编辑
- **WHEN** 保存发生数据库故障、包含无效／缺失／重复段 ID 或空译文，或基准版本已被另一保存更新
- **THEN** 整个保存失败，不留下部分修改；过期基准返回冲突，用户可重新加载后处理修改

#### Scenario: 用户查看较早译文修订
- **WHEN** 同一次翻译存在多个已保存译文版本
- **THEN** 用户可以查看和导出任意历史版本，不需要把译文恢复成原字幕或重写其他版本
