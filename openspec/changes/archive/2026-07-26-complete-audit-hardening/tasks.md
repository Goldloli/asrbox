## 1. 失败回归测试

- [x] 1.1 为真实 task worker 逃逸后继续处理、线程退出补员和并发 retry 单入队添加测试
- [x] 1.2 为活动任务字幕写保护、非有限时间值、编辑/restore/postprocess 事务回滚及 create/delete/split 端点添加测试
- [x] 1.3 为 resource ticket 限路径/过期、敏感 query 日志净化、非 loopback 容器空 token 门禁添加测试
- [x] 1.4 为 SQLite 在线备份并发完整性、ffprobe 未知时长、媒体 timeout 与 ZIP 叶子条目添加测试
- [x] 1.5 为 Tauri bundle 符号链接、健康/关停决策和更新 idle timeout 的可测试边界添加 Rust 测试
- [x] 1.6 为 SSE 首连重试、无 token URL、设置草稿、快捷键输入豁免和有界 diff 添加前端覆盖

## 2. 后端一致性与安全实现

- [x] 2.1 线性化任务状态转换并实现 worker 存活计数回收与按目标补员
- [x] 2.2 将字幕编辑、postprocess 与 restore 的当前状态和版本快照合并到单事务，并拒绝活动写入
- [x] 2.3 实现限路径短命 resource ticket、敏感 query 净化及维护下载/SSE 所需的鉴权 contract
- [x] 2.4 为支持的容器发布地址实现 fail-closed token 门禁并同步 Docker 配置文档
- [x] 2.5 使用 SQLite online backup 快照，增加媒体工具有界执行和安全 duration 解析
- [x] 2.6 净化批量 ZIP 条目并修正审计测试中的无效断言
- [x] 2.7 将重运行时兼容性导入隔离到有界短命探测进程并缓存结构化结果

## 3. 前端可靠性实现

- [x] 3.1 将 SSE 改为 Authorization fetch 流并实现指数退避重连
- [x] 3.2 将导出和诊断下载改为 Authorization 请求，将音频改为限路径 ticket URL
- [x] 3.3 暂存并显式应用服务器连接设置，避免击键清 token 与重复重连
- [x] 3.4 让全局快捷键避开编辑/IME，并为大型版本 diff 设置内存上限

## 4. 桌面与发布加固

- [x] 4.1 canonicalize Tauri 打开目标，移除宽 shell 配置和生产 CSP 的开发源
- [x] 4.2 为健康检查、关停和已有 sidecar 决策增加有界且可诊断行为
- [x] 4.3 为更新元数据、checksum 与下载 chunk 增加 connect/response/idle timeout
- [x] 4.4 统一 Docker/Compose/env 版本并扩展版本一致性测试，接入遗漏的维护 E2E 命令

## 5. 验证、文档与归档

- [x] 5.1 运行聚焦 pytest、contract、TypeScript/Web、Playwright 与 Cargo 检查
- [x] 5.2 运行完整后端、OpenSpec、版本、开源就绪及适用发布门禁并记录无法执行项
- [x] 5.3 更新隐私、Docker、排障与变更说明，明确兼容路径和剩余非目标
- [x] 5.4 勾选任务、归档 change、校验主 specs，并关闭 Beads 任务
