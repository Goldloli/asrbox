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

### Requirement: 任务中心分段编辑模式

任务中心的转写结果标题行 SHALL 提供与"转写结果"并列的"编辑字幕"模式入口，默认进入只读的转写结果。编辑字幕模式 SHALL 保持与只读转写相同的行布局（播放跳转、时间范围、说话人标识、文字）与播放联动，仅把分段文字替换为可编辑输入；不提供逐段时间/说话人编辑、字幕预览、查找替换或全文工具。存在未保存更改时，该标题行右侧 SHALL 显示放弃与保存操作，保存位于最右端。保存 SHALL 通过一次批量更新提交全部分段并创建恰好一个不可变 `edit` 版本；保存失败 SHALL 保留草稿并提示错误。

#### Scenario: 默认只读展示

- **WHEN** 用户在任务中心打开一个已完成任务
- **THEN** 转写结果以只读分段列表展示，不显示文字输入框，也不显示保存/放弃按钮，"编辑字幕"入口可见

#### Scenario: 编辑并保存

- **WHEN** 用户切换到"编辑字幕"模式、修改一个或多个分段文字并点击标题行右侧的保存
- **THEN** 系统通过一次批量请求提交全部分段（时间与说话人保持原值）、创建单个 `edit` 版本、提示保存成功并清空草稿，任务内容与导出反映新文本

#### Scenario: 保存失败保留草稿

- **WHEN** 批量保存被后端拒绝（如分段集合不匹配或时间非法）
- **THEN** 界面提示保存失败，未保存草稿保留在编辑字幕模式中，不产生新版本

#### Scenario: 切换任务丢弃未保存草稿

- **WHEN** 用户在编辑字幕模式中有未保存更改并切换到另一个任务
- **THEN** 草稿被丢弃，新任务以只读转写结果展示

#### Scenario: 编辑模式中播放联动保持一致

- **WHEN** 用户在编辑字幕模式中点击某分段左侧的播放跳转按钮
- **THEN** 内嵌播放器跳转并从该分段起点播放，行为与只读转写结果一致
