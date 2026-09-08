## 为什么

合并前依赖审计发现 PostCSS 的间接依赖 nanoid 3.3.16 命中 [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)，使现有 CI 审计失败。3.3.18 是兼容的修复版本。

## 变更内容

- 在现有 package.json overrides 中约束 nanoid 3.3.18，并通过 Bun 重新生成锁文件。
- 重新验证依赖审计、冻结安装和项目门禁，记录到 CHANGELOG。

## 能力（Capabilities）

无产品能力或 API 行为变化。仅修复构建依赖，因此使用 skip_specs，不修改主 spec。

## 影响

接触点限于 package.json、bun.lock、CHANGELOG 和本 change 工件。保持字幕快照、翻译／校对协议、运行时、发布版本和测试规则。非目标为相邻依赖升级、新增产品功能或修改审计阈值；失败时停止合并，恢复本次依赖修改并另行选择兼容补丁。
