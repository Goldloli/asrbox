## 背景

动机见 proposal.md。bun.lock 中 PostCSS 8.5.23 依赖 nanoid ^3.3.16，当前解析为 3.3.16；package.json 已使用 overrides 固定安全的 PostCSS 范围。scripts/audit-dependencies.sh 对审计发现直接失败，CI 和发布复用该检查。

## 目标 / 非目标

目标为使用兼容的 nanoid 3.x 安全补丁并保持冻结安装可复现。接触点及非目标见 proposal.md，不改业务代码和现有门禁。

## 决策

在既有 overrides 添加 nanoid 3.3.18，由 bun install 更新锁文件；选定版本满足上游依赖范围。相比升级全部依赖或增加无直接使用的 runtime dependency，此方式范围小且与现有安全约束一致。相比仅手改 lock，声明来源可追踪并由包管理器校验 integrity。

## 风险

间接依赖补丁仍可能影响构建 → 检查锁文件差异、冻结安装、依赖审计并重跑完整本地门禁。CI 另验证 Linux Docker 路径。审计不可用或失败时保留错误，不跳过检查。

## 回滚

如兼容验证失败，恢复本次 package.json 和 bun.lock 修改并用冻结安装还原环境；不得将已知存在漏洞的版本宣称为通过审计。无数据 migration 或用户状态回滚。
