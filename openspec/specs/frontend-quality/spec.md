# frontend-quality Specification

## Purpose
规定前端质量基线：工作台工作流层级、响应式不重叠布局、可访问的交互状态、前端验证要求与活动任务停止控制。

## Requirements

### Requirement: Workbench workflow hierarchy
Each primary route SHALL present a clear main work area and visible next action appropriate to its state without requiring decorative or nested panels to explain the interface.

#### Scenario: Route has no content or backend is unavailable
- **WHEN** a user encounters an empty, loading, offline, or error state
- **THEN** the interface presents an understandable status and an actionable recovery or next step

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

### Requirement: Accessible interaction states
Navigation, buttons, icon controls, menus, dialogs, tabs, forms, disabled states, and status text SHALL provide readable contrast, visible keyboard focus, and accessible names where required.

#### Scenario: User navigates without a pointer
- **WHEN** keyboard focus moves through an interactive workflow
- **THEN** the focused control is visible, identifiable, and operable in the expected order

### Requirement: Frontend verification
User-visible frontend changes SHALL pass TypeScript checking, the production Web build, relevant automated browser scenarios, and the maintained frontend quality audit appropriate to the affected routes and states.

#### Scenario: Frontend behavior changes
- **WHEN** a change affects a maintained user workflow
- **THEN** automated verification covers the changed behavior and representative layout states before acceptance

### Requirement: Active task stop control
The primary transcription workspace SHALL provide an accessible, confirmed stop control for the selected active transcription and SHALL prevent duplicate cancellation requests while the action is pending.

#### Scenario: User stops a task from the transcription workspace
- **WHEN** the selected task is queued or running and the user confirms the stop action
- **THEN** the interface requests cancellation, refreshes active task state, and reports success or a diagnosable error

### Requirement: Resilient authenticated application events

The maintained frontend SHALL connect to the application event stream without placing the long-lived API token in the URL. It SHALL parse supported events, refresh affected queries, and automatically reconnect with bounded exponential backoff after initial connection failure or later disconnection until the component unmounts or connection settings change.

#### Scenario: Desktop sidecar is not ready on first event connection

- **WHEN** the frontend attempts to subscribe before the sidecar accepts requests
- **THEN** it retries after a bounded delay and begins processing events once the backend becomes available without requiring a page reload

#### Scenario: Authenticated event stream is opened

- **WHEN** the current server requires an API token
- **THEN** the stream request authenticates by Authorization header and the token is absent from its URL

### Requirement: Non-destructive settings and bounded comparison

Editing the server address SHALL not clear or replace the active connection token until the user explicitly applies the staged connection values. Version comparison SHALL bound memory use for large transcripts and provide a truthful truncated summary when a full line LCS would exceed that bound.

#### Scenario: User types a server address

- **WHEN** the user changes one or more characters in the server address field without applying
- **THEN** the active server URL, API token, queries, and event connection remain unchanged

#### Scenario: Very large versions are compared

- **WHEN** the product of previous and current transcript line counts exceeds the maintained diff-cell limit
- **THEN** the UI avoids allocating the full LCS matrix and labels or renders a bounded comparison summary

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

### Requirement: 统一的专业应用壳体

ASRbox SHALL 在转写、AI、模型和设置主路由中使用同一套应用壳体、页面标题、命令搜索、运行状态、主导航和底部任务状态结构。任务中心在桌面宽度 SHALL 保留同一主导航与主题体系，但 SHALL 使用沉浸式工作台：隐藏重复的命令搜索顶栏与底部任务状态条，把完整高度分配给任务列表、中央播放器与转写结果、右侧任务状态。新用户在桌面宽度首次启动时 SHALL 默认看到带文字的侧边导航；已经保存的侧边栏偏好 SHALL 保持不变，用户仍 SHALL 能切换为仅图标模式。窄屏 SHALL 使用适合触控且不遮挡主要操作的移动导航。

#### Scenario: 新用户首次打开桌面应用
- **WHEN** 没有已保存界面偏好的用户在桌面宽度打开转写、AI、模型或设置主路由
- **THEN** 应用显示带文字的主导航、可用的全局搜索、本地运行状态和当前页面标题，且主要内容不会被导航或状态栏遮挡

#### Scenario: 用户打开桌面任务中心
- **WHEN** 用户在桌面宽度打开任务中心
- **THEN** 应用保留主导航和一致主题，但不显示重复的命令搜索顶栏与底部任务状态条，三栏任务工作台占满剩余视口

#### Scenario: 已有用户保留侧边栏偏好
- **WHEN** 用户已经保存仅图标或展开的侧边栏偏好并再次启动应用
- **THEN** 应用沿用该偏好，且所有主路由仍保持一致的内容层级和操作位置规则

#### Scenario: 用户在窄屏切换页面
- **WHEN** 用户在维护的窄屏宽度访问主路由并使用移动导航
- **THEN** 当前页面和主操作均可到达，导航不会造成横向溢出或覆盖内容

### Requirement: 亮暗主题同构且表面连续

ASRbox SHALL 以亮色主题作为视觉基准，并为 system、light 与 dark 三种主题偏好提供完整的语义色彩映射。亮暗主题 SHALL 使用相同的布局、间距、圆角、层级和组件结构，只改变背景、前景、边框、状态与强调色。页面外壳、内容画布、浮层和详情工作区 SHALL 在各主题中形成连续表面，不得出现暗色外框包裹未适配亮色内容或反向组合造成的视觉割裂。

#### Scenario: 用户切换亮暗主题
- **WHEN** 用户在同一页面的 light 与 dark 主题之间切换
- **THEN** 页面布局和信息层级保持稳定，所有文本、边框、图标、状态和交互控件均具有可读对比度，且不存在未适配主题的孤立白色或黑色区域

#### Scenario: 用户选择跟随系统
- **WHEN** 主题偏好为 system 且操作系统主题发生变化
- **THEN** 应用切换到对应语义色彩，同时保留当前路由、滚动位置、编辑内容和界面布局

### Requirement: 用户可配置全局强调色

ASRbox SHALL 在通用设置中提供全局强调色选择，至少包含橙、蓝、紫、粉、红、绿、青和灰，且 SHALL 以橙色作为没有已保存偏好时的默认值。强调色 SHALL 统一作用于主要操作、当前导航／页签、选中状态、焦点环和非语义进度；成功、警告、错误、离线等语义状态色 SHALL 保持其固定含义，不得随强调色变化。强调色偏好 SHALL 本地持久化、支持现有设置导入／导出，并在 light、dark 与 system 主题中提供可读对比度。

#### Scenario: 新用户使用默认强调色
- **WHEN** 用户没有已保存的强调色偏好并首次打开应用
- **THEN** 应用使用橙色呈现主要操作、当前导航和焦点状态，成功与错误仍分别使用固定语义色

#### Scenario: 用户更换强调色
- **WHEN** 用户在通用设置选择蓝、紫、粉、红、绿、青或灰中的任一颜色
- **THEN** 当前应用壳体和已打开页面立即更新所有非语义强调元素，页面布局、编辑内容和语义状态颜色保持不变

#### Scenario: 强调色偏好跨启动保留
- **WHEN** 用户重启应用或导出后重新导入界面设置
- **THEN** 已选择的受支持强调色被恢复；未知或已失效的值安全回退到默认橙色

### Requirement: 主工作流采用内容优先的统一布局

转写首页 SHALL 采用命令工作台层级：文件选择、模型、语言、更多设置和单一开始转写动作构成主要输入区，最近任务使用可扫描的分隔行列表呈现。任务中心 SHALL 在桌面宽度采用左侧任务列表、中央音频播放器与转写结果、右侧任务状态与次要操作的三栏结构；左栏 SHALL NOT 提供导入操作，右栏 SHALL NOT 重复展示或编辑转写设置。AI、模型和设置及其全部子页签 SHALL 复用相同的页面标题、工具栏、分区、列表、表单、状态和反馈模式，不得依赖重复嵌套卡片来表达基本层级。

#### Scenario: 用户在首页创建转写
- **WHEN** 用户打开转写首页并选择待转写媒体
- **THEN** 文件、核心参数和开始转写动作在同一主要工作区内清晰可见，最近任务与创建流程层级分离但无需切换页面

#### Scenario: 用户在任务中心选择任务
- **WHEN** 用户在桌面宽度从左侧任务列表选择一个具有媒体和转写结果的任务
- **THEN** 中央显示该任务的音频播放器、波形和转写结果，右侧显示状态、时间、文件信息、导出以及可折叠的标签备注、版本诊断和危险操作，左侧不存在导入按钮且右侧不存在转写设置

#### Scenario: 用户在较窄宽度审阅任务详情
- **WHEN** 可用宽度不足以同时容纳任务详情的三个区域
- **THEN** 音频、转写结果、分段编辑和保存动作按内容优先顺序保持可见，任务列表和任务状态区通过堆叠、折叠或可达的切换控件呈现，且不产生页面级横向滚动

#### Scenario: 用户访问其它主路由和子页签
- **WHEN** 用户访问 AI、模型或设置中的任一维护页签
- **THEN** 页面使用与转写和任务工作流一致的标题、间距、表面、控件和反馈语言，同时保留该页签全部既有功能与状态

### Requirement: 音频播放与转写结果联动

任务中心中央工作区的播放按钮、波形进度、时间显示和转写分段 SHALL 使用同一播放位置。音频播放或拖动定位时，当前时间所属分段 SHALL 被清晰高亮并在必要时滚动到可见区域；用户点击分段播放入口或时间范围时 SHALL 将音频定位到该分段起点并开始或继续播放。联动 SHALL NOT 改写字幕内容、时间戳或字幕版本。

#### Scenario: 音频播放进入下一分段
- **WHEN** 播放位置跨入下一条转写分段的时间范围
- **THEN** 波形与时间显示同步更新，新的当前分段获得高亮，旧分段取消高亮，且当前分段在转写结果区域中可见

#### Scenario: 用户从转写结果开始播放
- **WHEN** 用户点击某条分段的播放入口或时间范围
- **THEN** 播放器定位到该分段起点并播放，波形游标和分段高亮同步到相同位置

#### Scenario: 用户拖动波形定位
- **WHEN** 用户拖动或点击波形跳转到新的播放位置
- **THEN** 时间显示和当前分段高亮立即对应新的位置，不创建字幕修改或新版本

### Requirement: 默认模型跨页面保持一致

模型管理页的“设为默认”、设置页的默认模型和转写首页的新任务默认模型 SHALL 使用同一权威 ASR 设置。任一入口成功修改默认本地模型后，其它入口 SHALL 在数据刷新后显示相同模型；将本地模型设为默认 SHALL 同时选择本地后端。转写首页对尚未被用户显式修改的新任务草稿 SHALL 使用最新默认值，但 SHALL NOT 覆盖用户已经为当前草稿手动选择的模型。

#### Scenario: 用户在模型管理页设为默认
- **WHEN** 用户把一个已下载且兼容的本地模型设为默认
- **THEN** 模型列表显示该模型为当前默认，设置页默认模型显示同一模型，之后打开或重置的首页新任务也预选该模型和本地后端

#### Scenario: 用户在设置页更换默认模型
- **WHEN** 用户在设置页保存另一个本地模型或提供商作为默认模型
- **THEN** 模型管理页和首页在数据刷新后反映同一权威默认值；若默认值不是本地目录模型，模型列表不错误标记任何本地模型为默认

#### Scenario: 当前草稿已有手动选择
- **WHEN** 用户已经在首页为当前未提交任务手动选择模型，随后其它入口修改全局默认模型
- **THEN** 当前草稿保持用户选择，下一次新建或重置任务时才采用新的全局默认值

### Requirement: 已知品牌使用正确图标

ASRbox SHALL 为 Ollama、Qwen、OpenAI 等已知提供商或模型显示与其身份匹配、来源可追溯且许可可用的品牌图标，并在亮暗主题中保持可识别。自定义或未知提供商 SHALL 使用明确的通用服务图标，不得使用其它品牌图标代替。

#### Scenario: 用户查看已知与自定义提供商
- **WHEN** 提供商或模型列表同时包含 Ollama、Qwen、OpenAI 和自定义服务
- **THEN** 三个已知品牌分别显示正确图标，自定义服务显示通用图标，图标不会因主题切换而消失或被错误着色

### Requirement: 全页面视觉回归验证

专业视觉系统的用户可见变更 SHALL 以 `测试音视频/渲染图/` 中用户已确认的产品图作为结构、层级、密度和风格验收基准，并在维护的桌面与窄屏尺寸覆盖转写、任务列表、任务详情、AI、模型、设置及全部设置子页签。亮色和暗色主题 SHALL 验证关键状态；桌面主流程截图 SHALL 使用足以呈现列表、详情、波形、模型状态或 AI 结果的代表性数据，不得以空态或加载失败状态代替目标工作流。验证 SHALL 同时覆盖键盘焦点、长文本、空态、加载态、离线态、错误态、禁用态和进行中状态，不得以删除或隐藏既有功能来通过布局检查。

#### Scenario: 视觉系统进入验收
- **WHEN** 全页面视觉重构准备验收
- **THEN** TypeScript 检查、生产 Web 构建、维护中的浏览器场景和前端质量审计通过，并有代表性的亮暗主题与桌面窄屏证据证明全部主路由和设置子页签没有遮挡、截断或页面级横向溢出

#### Scenario: 主流程生成视觉证据
- **WHEN** 验收脚本截取首页、任务中心、AI 工作台或模型管理的桌面证据
- **THEN** 截图包含对应产品图所需的代表性任务、详情、音频波形、AI 结果或模型状态，并能与产品图逐页比较结构和层级

#### Scenario: 页面包含长内容或非理想状态
- **WHEN** 文件名、模型名、字幕、错误信息或设置说明超出常规长度，或页面处于空、加载、离线、错误、禁用或进行中状态
- **THEN** 内容在所属区域内换行、截断或滚动，主要操作和诊断信息仍可识别并可到达

### Requirement: 真实桌面逐控件验收

专业视觉系统 SHALL 在最终桌面包中完成逐控件触达验收，而不是仅依赖静态截图或浏览器 fixture。每个可见页签、按钮、筛选、下拉框、开关、播放器、seek 和下载入口 SHALL 被实际操作并验证可观察结果；没有产品行为的控件 SHALL 被移除。破坏性操作 SHALL 只触达到确认层并取消，验收记录 SHALL 标明操作、预期和实测结果。

#### Scenario: 最终桌面包进入验收
- **WHEN** 候选 DMG 已构建并从挂载卷启动
- **THEN** 验收者按维护矩阵操作全部可见控件，记录每项结果，任何不可达、无反馈、错误反馈或被裁切的控件都会阻止 change 归档

#### Scenario: 控件没有实际产品行为
- **WHEN** 页面显示一个按钮或图标操作但操作后没有可识别的状态变化、导航、菜单、下载或其它产品结果
- **THEN** 该控件在交付前被接通到明确行为或从界面移除，不得仅以 hover/按下样式视为通过

#### Scenario: 大型模型存储仍在扫描
- **WHEN** 最终桌面包在包含大型模型与缓存目录的真实存储上请求模型状态或存储汇总
- **THEN** 目录扫描在线程池中执行，健康检查和其它事件循环请求仍能及时响应，应用不得长期停留在“启动中”

### Requirement: 受控工作区与结果窗口

首页参数栏和任务中心三栏 SHALL 在维护桌面视口保留完整的最右侧操作与安全间距，不得被页面边框裁切。首页主内容卡 SHALL 保持四角完整圆角并与下方结果卡一致，模型选择 SHALL 不显示无助于用户决策的设备实现提示。长转写结果 SHALL 在固定高度区域内部滚动。任务中心转写结果 SHALL 默认只读并与播放器联动；文字编辑 SHALL 只通过"编辑字幕"模式提供（见 transcript-editing-versioning 的"任务中心分段编辑模式"），不恢复旧版分段编辑页签、字幕预览格式切换、逐段时间/说话人表单、查找替换或全文工具。

#### Scenario: 首页显示长转写结果
- **WHEN** 用户选择包含长字幕的已完成任务
- **THEN** 正文在固定高度结果窗口内滚动，页面其余区域和 SRT/TXT 下载入口保持稳定可达

#### Scenario: 用户查看首页主内容卡
- **WHEN** 用户在维护桌面视口打开首页
- **THEN** 主内容卡四角与下方结果卡使用一致非零圆角，模型字段下不显示“实际使用的设备取决于当前电脑和可用运行时”等实现提示

#### Scenario: 用户打开任务中心
- **WHEN** 用户在维护桌面视口打开任意完成任务
- **THEN** 左侧筛选、中央播放器与转写结果、右侧状态与导出均完整可见且表面一致，默认显示只读转写结果而非旧版分段编辑表单，最右侧操作不被裁切

#### Scenario: 冻结桌面端播放外置卷媒体
- **WHEN** macOS 冻结后端为位于外置卷的真实任务媒体处理单区间 Range 请求
- **THEN** 接口在有界时间内返回正确的 `206`、`Content-Range`、`Content-Length` 和对应字节，播放器可继续播放与 seek，且不阻塞其它 API 请求

#### Scenario: 用户筛选任务
- **WHEN** 用户选择最近任务、进行中或已完成
- **THEN** 列表、计数、空态和选中指示同步更新，空态不会把内容压缩为不可读窄列

### Requirement: AI 模式与模型设置能力可达

字幕校对、字幕翻译和对话 SHALL 在相同工作台框架中保持完整可用，且工作台内容 SHALL 只在明确的列内滚动，不得无限扩大应用页面。本地 Ollama 校对 SHALL 使用适配本地推理速度的有界批次、紧凑响应和单请求期限，并在超时、截断、上下文过长或无效结构时拆分重试；排队与实际推理 SHALL 显示为不同状态。字幕翻译 SHALL 减少可避免的请求与结构化输出开销，同时继续验证每个目标段均有且仅有一条非空译文，异常批次 SHALL 自动拆分而不是发布不完整结果。校对修改原因 SHALL 使用创建运行时的界面语言，每条建议 SHALL 能播放其源字幕时间段并在段尾停止。对话 SHALL 支持选择一个字幕任务或明确不绑定。模型管理 SHALL 使用紧凑可扫描的行式布局并保留默认模型联动，标题和内容 SHALL 有一致的安全内边距。设置 Switch SHALL 保持固定紧凑尺寸，开启轨道 SHALL 使用当前强调色、关闭轨道 SHALL 使用中性控件底色；设置页签 SHALL 使用与应用其它页签一致的选中语义，页签头部与当前内容卡 SHALL 各自保持四角完整圆角。

#### Scenario: 用户切换 AI 模式
- **WHEN** 用户依次打开字幕校对、字幕翻译和对话
- **THEN** 每种模式的主要输入与开始/发送操作在固定视口或明确内部滚动中可达，当前页签选中态一致，错误状态提供诊断和重试

#### Scenario: AI 工作台包含大量历史和结果
- **WHEN** 任务列表、校对建议、翻译记录或会话消息超过一个桌面视口
- **THEN** 左、中、右列在各自受控区域内滚动，应用主页面与 document 高度保持视口边界，不出现可以无限向下滚动的空白或内容

#### Scenario: 用户使用本地 Ollama 校对长字幕
- **WHEN** 用户使用本地 Ollama 提供商校对数百段字幕，单个首轮批次超时、截断、超过上下文或返回无效结构
- **THEN** 校对以本地适配的有界批次、紧凑响应和期限执行，失败批次自动二分重试，排队与推理状态明确区分，成功结果完整保存且不会因一个过大的首批固定在零进度

#### Scenario: 校对原因跟随界面语言
- **WHEN** 用户在中文或英文界面创建字幕校对运行
- **THEN** 后端保存对应语言并要求所有修改原因使用该语言，拆分重试仍保持相同语言，旧客户端未传值时使用兼容默认值

#### Scenario: 用户试听一条校对意见
- **WHEN** 用户点击某条修改意见下方的播放按钮且源字幕包含有效起止时间
- **THEN** 全局播放器从该段开始时间播放同一任务音频，到达该段结束时间自动暂停，再次播放从片段起点重新开始

#### Scenario: 用户翻译长字幕
- **WHEN** 用户使用本地 Ollama 翻译包含大量短段的字幕
- **THEN** 系统使用紧凑有序响应减少输出冗余并以更大的安全首轮批次降低请求数；若数量、顺序或内容校验失败则自动拆分，绝不发布缺段或错位译文

#### Scenario: 用户选择对话依据
- **WHEN** 用户在对话中切换“不绑定”和一个可用字幕任务
- **THEN** 工作区与回答依据区同步显示选择，后续请求使用对应的明确上下文

#### Scenario: 用户管理默认模型与设置
- **WHEN** 用户在模型页设为默认并打开首页与转写默认值设置
- **THEN** 三处显示同一默认模型，模型页标题与列表保持一致安全内边距，模型列表保持紧凑可扫描，设置开关不会被行容器拉伸

#### Scenario: 用户切换设置开关
- **WHEN** 用户开启或关闭任一设置 Switch，或先更换界面强调色再开启开关
- **THEN** 开启轨道使用当前强调色且白色滑块位于开启侧，关闭轨道恢复中性底色，两个状态无需依赖文字即可明显区分

#### Scenario: 用户切换设置子页签
- **WHEN** 用户依次打开通用、转写默认值、显卡加速、线上平台、AI LLM 提供商、存储与诊断和关于
- **THEN** 页签头部卡与当前内容卡通过一致间距分离，所有可见卡片四角均为完整一致圆角，不出现相接处一边直角一边圆角的断层

### Requirement: 用户可见提示与界面语言一致

ASRbox SHALL 让所有用户可见提示使用设置中的当前界面语言，包括健康中心、运行时警告、错误、表单校验、空态、加载、排队、处理中状态、Toast 和确认对话框。后端或第三方返回的原始文本 SHALL NOT 直接作为主提示展示；维护中的稳定错误码、状态和运行时警告 SHALL 映射为中文和英文文案，未知动态错误 SHALL 使用本地化概括，并只在明确的技术详情区域保留原文。模型名、文件路径、环境变量、HTTP 状态、错误码和依赖包名 SHALL 保持原文。

#### Scenario: 中文界面显示健康中心警告
- **WHEN** 界面语言为中文，运行时检测到 `pyannote.audio` 已安装但未配置 `HF_TOKEN`
- **THEN** 健康中心以中文解释说话人分离尚未就绪及受影响范围，`pyannote.audio` 与 `HF_TOKEN` 保持原文，不直接显示整句英文警告

#### Scenario: 英文界面显示同一健康状态
- **WHEN** 界面语言为英文并显示相同运行时状态
- **THEN** 健康中心使用英文提示，语义和技术标识与中文界面一致

#### Scenario: 用户切换界面语言
- **WHEN** 页面已显示健康、错误、空态或处理状态提示，用户在设置中切换中文或英文
- **THEN** 已显示的主提示按新界面语言重新渲染，不要求重新请求后端，技术详情中的原始诊断保持不变

#### Scenario: 后端返回未知动态错误
- **WHEN** 后端或第三方返回没有维护中稳定映射的动态错误文本
- **THEN** 主界面显示当前语言的安全概括并提供技术详情入口，原始文本不作为主提示泄漏到另一种界面语言中
