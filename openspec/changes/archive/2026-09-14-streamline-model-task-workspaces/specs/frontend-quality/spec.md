## ADDED Requirements

### Requirement: 聚焦的转写结果与任务详情层级

转写首页 SHALL 保留所选任务的状态、只读转写结果和既有音频复核能力，但 SHALL NOT 在结果下方渲染完整字幕预览或分段编辑器。已完成任务的结果下方 SHALL 只提供 SRT 与 TXT 两个直接下载动作；其它格式、字幕预览、分段编辑、版本、诊断和任务管理能力 SHALL 保留在任务详情中。

任务详情 SHALL 采用内容优先顺序：固定可识别的任务标题、状态与关闭控制后，主要内容依次为音频播放器、字幕预览和可编辑分段。元数据、标签、备注、集合、完整格式导出、诊断、版本和危险操作 SHALL 继续可访问，但不得在完成任务的首屏中把音频复核或分段编辑推到其后。

#### Scenario: 用户在首页查看已完成转写

- **WHEN** 用户在转写首页选择一个已完成且包含结果的任务
- **THEN** 只读转写结果下方只显示 SRT 与 TXT 下载按钮，不显示字幕预览格式切换或分段编辑列表

#### Scenario: 用户下载首页快捷结果

- **WHEN** 用户在首页点击 SRT 或 TXT 下载按钮
- **THEN** 应用下载所选任务当前版本的对应文件，并提供可诊断的成功或失败反馈

#### Scenario: 用户打开已完成任务详情

- **WHEN** 用户从任务列表打开一个含音频和字幕分段的已完成任务
- **THEN** 任务标题与状态之后依次可见音频播放器、字幕预览和可编辑分段，现有保存／放弃编辑能力保持可用

#### Scenario: 用户访问次要任务能力

- **WHEN** 用户需要标签、备注、集合、完整格式导出、诊断、版本、重试、清理或删除能力
- **THEN** 这些能力仍可从任务详情的次要区域到达，而不与主要复核编辑区域争夺首屏层级

## MODIFIED Requirements

### Requirement: Responsive non-overlapping layout
Supported desktop and narrow viewports SHALL not introduce horizontal overflow, clipped labels, unreadable controls, or navigation and status surfaces that cover primary content or actions. The model ladder SHALL keep any necessary table overflow inside its expanded panel. The task detail SHALL use one viewport-bounded outer surface with a stable header and reachable scrolling content; it SHALL use a bounded wide-desktop width and the full available width on narrow screens. Transcript preview, waveform, segment rows, sorting controls, and download actions SHALL resize, stack, wrap, or scroll within their own assigned region without widening the application shell.

#### Scenario: Required viewport is rendered
- **WHEN** the workbench is displayed at maintained desktop or mobile-width smoke-test dimensions
- **THEN** interactive text fits, content remains reachable, and fixed UI does not occlude the active workflow

#### Scenario: 模型天梯在窄屏展开

- **WHEN** 用户在窄屏展开包含多列的模型天梯
- **THEN** 页面主体不产生横向溢出，排序控制可完整操作，表格仅在天梯内容区域内横向滚动

#### Scenario: 任务详情在桌面与窄屏打开

- **WHEN** 用户在维护的桌面宽度或 390px 窄屏打开任务详情并滚动主要与次要内容
- **THEN** 标题和关闭控制保持可用，音频、字幕与分段区域宽度协调，所有编辑及下载动作均可到达且不被应用底栏遮挡
