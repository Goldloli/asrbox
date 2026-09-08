# export-formats Specification

## Purpose
规定受支持的字幕导出格式集合、带时间轴字幕的完整性约束，以及历史字幕版本的导出行为。

## Requirements

### Requirement: Supported export formats
ASRbox SHALL export transcript content in TXT, SRT, VTT, ASS, JSON, and Markdown using the current transcript segments and the semantics appropriate to each format.

#### Scenario: User exports a completed transcript
- **WHEN** a supported format is requested for a valid completed task
- **THEN** the system produces an export containing that task's current transcript content

### Requirement: Timed subtitle integrity
Timed subtitle exports SHALL preserve valid segment ordering, timing, text, and supported speaker information from the selected transcript version.

#### Scenario: Transcript contains timed speaker segments
- **WHEN** the user exports SRT, VTT, or ASS
- **THEN** the rendered cues remain ordered and represent the selected segments without substituting another version

### Requirement: Historical version export
The system SHALL allow supported export formats to be rendered from an immutable historical transcript version without first restoring it over the current transcript.

#### Scenario: User exports an older version
- **WHEN** a valid historical version and supported format are selected
- **THEN** the export represents that version and identifies version metadata where the format supports it

### Requirement: Safe batch archive entries

Every file entry in a batch export ZIP SHALL use a sanitized leaf filename derived from the user media name, a task identifier, and a fixed supported extension. User-controlled separators, traversal components, control characters, absolute-path prefixes, and platform drive syntax SHALL NOT create archive directories or extraction targets.

#### Scenario: Task filename contains traversal syntax

- **WHEN** a completed task named with `../`, backslashes, absolute-path text, control characters, or an empty stem is included in a batch export
- **THEN** each ZIP member remains a non-empty leaf filename inside the archive and retains the correct task id and format extension

### Requirement: 明确版本的译文与双语导出

系统 SHALL 对完整且已保存的译文版本提供 TXT、SRT、VTT、ASS、JSON、Markdown 单语译文及双语导出。双语 SHALL 使用该译文绑定的原字幕快照逐段配对，默认原文在前、译文在后并允许反向顺序，不以当前原字幕替换来源。现有原任务和历史原字幕导出语义 SHALL 保持不变。

#### Scenario: 用户导出指定译文版本
- **WHEN** 用户为一个已保存译文版本选择受支持格式和单语模式
- **THEN** 文件使用该版本译文，包含可识别的目标语言和版本文件名，不更改原字幕或任一历史版本

#### Scenario: 用户导出双语定时字幕
- **WHEN** 用户选择双语 SRT、VTT 或 ASS 及原译文顺序
- **THEN** 每个来源 cue 的时间与顺序保持不变，同一 cue 中包含按所选顺序排列的两种文字；ASS 使用合法 cue 内换行

#### Scenario: 用户导出双语文本或结构化结果
- **WHEN** 用户选择双语 TXT、Markdown 或 JSON
- **THEN** 文本格式保留逐段对应和语言顺序，JSON 以独立 source_text／translated_text 保存配对，并包含来源版本、译文版本和语言元数据

#### Scenario: 来源更新或选择历史译文
- **WHEN** 原任务字幕已经更新，或用户导出一份较早的译文修订
- **THEN** 产物使用所选译文及其固定来源，不混入最新原文或最新译文

#### Scenario: 用户尝试导出未完整或不匹配结果
- **WHEN** 请求指向部分批次、无完整版本、其他任务的运行／版本、非法模式或不支持格式
- **THEN** 明确拒绝导出，不以原文回填缺段或回退到任意其他版本

### Requirement: 多语言字幕输出完整性

翻译导出 SHALL 使用 UTF-8，保留有效 Unicode 和来源时间信息，并对各格式的控制语法和换行进行安全处理。长译文或双语过长 SHALL 不被静默截断、自动缩写或改动时间轴。文件名 SHALL 为清理后的叶名称，语言输入不得形成目录或路径。

#### Scenario: 字幕含 RTL 或格式控制文本
- **WHEN** 译文包含阿拉伯语、日语、换行、尖括号、ASS 标签或可能被解释为 cue 结构的文本
- **THEN** 导出保留可阅读文字和明确原译对应，不生成额外 cue、恶意样式控制或格式损坏

#### Scenario: 双语文字超过常规显示长度
- **WHEN** 原译文组合明显过长
- **THEN** 界面可提示用户人工精简，导出仍完整保留所选保存版本，不擅自删词或改时间

#### Scenario: 自定义语言名称包含路径分隔符
- **WHEN** 自定义语言显示名称包含不能用于文件名的字符
- **THEN** 下载使用安全标识和固定扩展名，不把用户语言名称作为路径
