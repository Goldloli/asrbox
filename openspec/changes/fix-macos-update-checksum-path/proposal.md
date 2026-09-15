## 为什么

macOS 与 Windows Release 任务分别把 DMG 和 NSIS 安装包的校验条目写成带 `./` 的路径，而桌面更新器只接受不带路径前缀的精确资产名，导致上一版本客户端在两个受维护平台上都无法通过应用内更新下载新版本。需要同时恢复当前受影响 Release，并从发布链路上保证每个新版本都能被上一受维护版本的客户端正常下载和校验。

## 变更内容

- 保持桌面更新器只接受安装包精确 basename 的安全边界，并补充回归测试证明带路径前缀及非法 SHA-256 不能授权安装包。
- publish job 汇总全部平台资产后统一生成一次只包含 basename 的最终 `SHA256SUMS.txt`，不再合并平台各自生成的清单片段。
- 发布资产验证增加“应用可解析校验清单”的断言，覆盖 macOS DMG 与 Windows NSIS 安装包，避免仅靠 `shasum -c` 成功而漏过客户端不兼容格式。
- 发布兼容性验证使用不绑定具体版本号的“上一受维护版本客户端 → 下一版本 Release”场景；任一平台无法发现、下载或校验对应安装包时阻止发布。
- 为已发布 v0.2.1 准备最小化修复与验证步骤；替换 GitHub Release 资产属于外部发布操作，必须获得明确授权后执行。

## 能力（Capabilities）

### 新增能力

无。

### 修改能力

- `release-readiness`：要求各平台发布清单使用应用可解析的规范 basename，并由发布门禁验证。

## 影响

- 桌面更新 Rust 回归测试：`tauri/src-tauri/src/update.rs`；不改变运行时接受的清单格式。
- Release 生成与门禁：`.github/workflows/release.yml`、`scripts/verify-release-assets.sh` 及其聚焦测试或 fixture。
- 发布与故障排查文档：`docs/release.md`、`docs/troubleshooting.md`。
- 已发布 v0.2.1 的即时恢复需要在代码变更之外替换该 Release 的 `SHA256SUMS.txt`；不会改动安装包字节或摘要，也不会在未授权时执行。
- 不改变前端/后端 API、下载目标、受信 GitHub 域、安装包命名、哈希算法、手动安装流程或签名状态；不引入新依赖。
