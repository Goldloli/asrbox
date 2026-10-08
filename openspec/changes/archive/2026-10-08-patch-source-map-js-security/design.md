## 背景

动机见 proposal.md。bun.lock 中 postcss 8.5.28 与 @tailwindcss/node 4.3.3 均以 `^1.2.1` 依赖 source-map-js，当前解析为 1.2.1；package.json 已使用 overrides 固定安全的 nanoid 与 postcss 范围。scripts/audit-dependencies.sh 对审计发现直接失败，CI 和发布复用该检查，当前 main 与在开的 Dependabot PR（#38、#39）都被该发现阻塞。

## 目标 / 非目标

目标为使用兼容的 source-map-js 1.2.2 安全补丁并保持冻结安装可复现。接触点及非目标见 proposal.md，不改业务代码和现有门禁。

## 决策

在既有 overrides 添加 `source-map-js: ^1.2.2`，由 bun install 更新锁文件；选定版本满足上游 `^1.2.1` 范围。相比新增根级直接依赖（`bun update source-map-js` 的默认行为，会把它声明为应用直接使用），override 表达"仅约束间接依赖"，与 nanoid 先例一致；相比升级全部依赖，此方式范围最小且可审计。

## 风险

间接依赖补丁仍可能影响构建 → 检查锁文件差异、冻结安装、依赖审计并运行 typecheck、前端单测与 build:web 门禁。CI 另验证 Linux Docker 路径。审计不可用或失败时保留错误，不跳过检查。

## 回滚

如兼容验证失败，恢复本次 package.json 和 bun.lock 修改并用冻结安装还原环境；不得将已知存在漏洞的版本宣称为通过审计。无数据 migration 或用户状态回滚。
