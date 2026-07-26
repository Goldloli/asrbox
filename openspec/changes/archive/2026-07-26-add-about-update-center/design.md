## 背景

- `app/src/routes/SettingsPage.tsx:23-28` 将设置标签限制为 `general`、`transcription`、`providers`、`llm` 和 `storage`；同一文件负责前端设置的导入导出。
- `app/src/stores/uiStore.ts:19-65` 使用 Zustand `persist` 保存界面偏好，适合承载更新通道、自动检查和应用内通知开关。
- `app/src/App.tsx:15-19` 是桌面后端启动完成后的全局运行时入口；自动检查必须在这里以非阻塞方式启动，而不是绑定到关于页是否已渲染。
- `app/src/components/AppShell.tsx:120-167` 和 `app/src/components/TaskCenterDrawer.tsx` 已展示转写与模型下载的全局进度，可复用其进度与错误语言。
- `app/src/lib/desktopCapabilities.ts:19-39` 是共享 React UI 与 Tauri 命令之间的唯一桌面能力边界；Web 运行时必须继续显式降级。
- `tauri/src-tauri/src/main.rs:25-67` 注册 Tauri command 和进程级 state；更新查询、文件下载与取消应留在桌面 shell，不经过 FastAPI sidecar，也不得改变 loopback/token 不变量。
- `.github/workflows/release.yml:151-170` 已把一个版本化 DMG 和 `SHA256SUMS.txt` 发布到 GitHub Release；当前没有 updater artifact、更新签名私钥或 `latest.json`。
- `openspec/specs/release-readiness/spec.md:6-11` 要求继续诚实披露缺少签名、公证和自动更新。本 change 只提供自动检查和用户发起的下载，不自动安装。

## 目标 / 非目标

### 目标

- 提供中英文一致、跨桌面与 Web 可用的关于页。
- 让桌面端安全地检查 GitHub Release，并根据稳定版 / 预发布版偏好比较 SemVer。
- 让用户主动下载当前平台安装包，获得持续可见的进度、取消、重试和 SHA-256 校验。
- 让自动检查、应用内通知和更新通道成为可持久化、可导入导出的用户偏好。
- 把检查与下载失败隔离在更新能力内，不影响任何转写、模型或存储工作流。

### 非目标

- 不使用 Tauri Updater，不自动安装、替换、退出或重启 ASRbox。
- 不引入 Tauri updater 私钥、公钥、`latest.json`、Apple Developer ID 签名或公证。
- 不向 Web 后端下载桌面安装包。
- 不提供暂停、断点续传、后台静默下载或跨进程续传。
- 不新增后端 API 路由，也不改变受维护的 FastAPI contract。
- 不在本 change 发布 Windows/Linux 安装包；实现只为未来平台选择保留明确边界。

## 决策

### 1. 更新元数据和下载由 Tauri shell 负责

新增桌面 command，用带固定 `User-Agent` 和超时的 `reqwest::Client` 读取 `Goldloli/asrbox` GitHub Releases。command 返回受控的版本、发布日期、纯文本摘要和可下载状态；前端不能传入任意下载 URL，开始下载时由 Rust 按版本重新解析同一官方 Release。

选择该方案是因为 Rust 请求不需要扩大 WebView CSP，下载目标是本机文件系统，也能在同一信任边界完成 URL、平台资源和校验文件验证。备选方案是由 React 直接访问 GitHub API，但这需要扩大 `connect-src`，并把下载和文件校验分散到两侧；另一个备选是 FastAPI 路由，但会把桌面更新职责错误地带入 Web/容器后端。

### 2. 使用 GitHub Release、SemVer 和明确的通道规则

- 稳定版过滤 draft 和 prerelease，只比较正式 SemVer。
- 预发布版过滤 draft，但同时比较正式版与预发布版，选择版本号最高者。
- 默认稳定版；当前应用版本本身包含预发布标识时，首次默认预发布版。
- 用户偏好一旦保存就优先于版本推导。
- 手动检查始终绕过本地 24 小时节流；自动检查在桌面运行时就绪约 10 秒后执行，最多每 24 小时一次。

使用 `semver` crate 进行比较，避免手写字符串排序错误。GitHub API 限流或不可用时只报告可恢复错误，并保留 Releases 浏览器入口。

### 3. 设置偏好与瞬时更新状态分离

`uiStore` 增加 `updateChannel`、`autoCheckUpdates` 和 `updateNotifications`，默认值分别为稳定版、开启、开启；现有设置导入导出显式包含这些字段，并对旧设置文件采用安全默认值。

新增独立的应用更新 store 保存最近检查时间、检查结果和下载状态。最近检查时间可本地持久化，下载进度只存内存并由 Tauri command 查询恢复。关闭自动检查时停止后台访问 GitHub，但保留手动检查；通知开关在 UI 中置灰并保留原值。关闭通知仅禁止 Toast 和导航角标，不隐藏关于页中的结果。

备选方案是把所有状态塞入 `uiStore`，但瞬时进度和持久偏好生命周期不同，会污染设置导出并增加恢复歧义。

### 4. 全局运行时统一驱动检查、通知和下载事件

在 `ToastProvider` 内增加 `AppUpdateRuntime`：

- 桌面端订阅 Tauri 更新下载进度事件，并把状态写入更新 store；
- 按偏好调度一次非阻塞自动检查；
- 只有通知开启时，在发现新版本后显示应用内 Toast 和设置导航角标；
- 下载离开关于页后继续，底部任务栏与任务中心复用现有 `Progress` 组件展示状态。

关于页负责用户操作和详细结果，不自行拥有下载生命周期。Web 端不启动上述桌面检查，只显示构建版本和 Releases 链接。

### 5. 下载采用临时文件、单任务和完成后强校验

- 一次只允许一个应用更新下载。
- 目标为系统下载目录中的平台安装包；当前 macOS Apple Silicon 使用 `ASRbox_<version>_aarch64.dmg`。
- 传输写入同名 `.part`，定期发出已下载字节、总字节、百分比、速度和预计剩余时间。
- 取消、网络失败或校验失败清理 `.part`；不实现暂停或断点续传。
- 正式同版本文件存在时先按 Release 中的 `SHA256SUMS.txt` 校验，匹配则直接复用，不匹配则重新下载。
- 新文件完成后以流式 SHA-256 对照同一 Release 校验条目，匹配后原子改名；校验失败不得生成或打开正式文件。
- 起始 URL 和重定向后的 URL必须为 HTTPS，发布仓库、tag、资源名称和平台后缀必须符合固定规则。

`sha2` 用于进程内校验；`reqwest` 启用流式响应，`tokio` 启用异步文件 I/O。备选方案是调用系统 `shasum`，但会增加外部进程与跨平台差异。

### 6. 手动替换是明确的终止状态

下载成功后页面提供“打开 DMG”和“打开文件所在位置”。应用不提供专用退出按钮，避免仍有转写或模型下载时误退出；文案指导用户完成当前任务、正常退出并在安装器中替换。未签名、未公证和可能出现 Gatekeeper 提示的事实持续可见，并链接到故障排查文档。

按钮使用“打开文件所在位置”而不是 Finder 专属措辞。未来新增 Windows 安装包时，只替换平台资源选择与“打开安装包”文案，不改变状态模型。

### 7. 关于页使用现有设计语言并限制远程内容

关于页拆为聚焦组件，使用现有 `Panel`、`Badge`、`Field`、`Switch`、`Progress` 和按钮样式。页面包含：

- 应用图标、名称、一句话说明、版本、运行环境、公开测试版与平台状态；
- 更新结果、摘要、进度、错误与操作；
- 更新通道和两个偏好开关；
- 作者 `Goldloli 小卡塔克`、版权及 GitHub / 哔哩哔哩链接；
- 文档、Issues、隐私、许可和 Releases 入口。

Release Notes 只作为截断的纯文本展示，不渲染远程 HTML 或 Markdown。

## 风险

- [GitHub API 限流或网络不可用] → 自动检查按 24 小时节流，手动失败显示可重试错误和浏览器兜底，不影响其他功能。
- [发布资源命名变化导致无法匹配] → 在发布验证脚本和 Rust 单元测试中固定资源约定；缺失时禁止应用内下载并指向 Release 页面。
- [从同一 Release 下载校验和无法抵御 GitHub 账户整体被攻破] → 明确它主要保证传输完整性；自动安装仍留待未来使用独立更新签名的 change。
- [用户在下载时退出应用] → 不承诺跨进程续传；下次下载清理陈旧 `.part` 后重新开始，已校验正式文件保留。
- [速度和预计剩余时间短时抖动] → 对事件频率和速度采样做节流，无法获得总大小时退化为字节进度而不伪造百分比。
- [新增 Rust 依赖扩大审计面] → 从 `Cargo.toml` 更新 lock file，运行 Cargo 检查、测试和项目依赖/开源审计。
- [未签名 DMG 仍触发 Gatekeeper] → 关于页、完成状态和文档持续披露，不将应用内下载表述为已签名或自动更新。

## 回滚

移除关于/更新组件、全局运行时、更新 store、桌面 command 和新增 Rust 依赖，恢复设置标签与文档即可回滚。旧客户端无法识别的前端持久化字段会被忽略；已下载到用户下载目录且通过校验的 DMG 属于用户可见文件，回滚不主动删除。发布流水线和既有 DMG 不依赖本 change，因此无需迁移或重签发布资产。
