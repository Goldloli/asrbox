## 1. 失败回归测试

- [x] 1.1 添加活动任务 chunk retry/cleanup/relink 返回 409、文件与行保持不变的 API 测试
- [x] 1.2 添加并发 chunk retry 单次执行、取消优先、失败 chunk 限制和事件循环保持响应的测试
- [x] 1.3 添加校对应用与任务转换互斥、worker 线程退出回收补员测试
- [x] 1.4 添加 ticket idle/absolute expiry、runtime 路由线程池等待测试
- [x] 1.5 添加切片部分失败清理和递归 orphan 保留引用/删除未引用文件测试
- [x] 1.6 添加 CI/release 必须运行前端单元与完整维护 E2E 命令的发布工具测试

## 2. 任务与校对生命周期实现

- [x] 2.1 提取共享任务状态转换锁
- [x] 2.2 实现 failed chunk 短事务认领、单次执行、部分恢复和最终单版本合并
- [x] 2.3 在线程池运行 chunk retry 并统一映射活动/状态冲突为 409
- [x] 2.4 让 cleanup-artifacts 与 relink 在同一转换边界内拒绝活动任务并原子提交
- [x] 2.5 让校对建议应用共享转换锁，校对 worker 退出后回收并补员

## 3. 有界资源与发布门禁实现

- [x] 3.1 为 resource ticket 增加不可续期 absolute expiry 并对齐 `expires_at`
- [x] 3.2 将 runtime status、health report 与诊断包同步工作移出事件循环
- [x] 3.3 清理切片调用的部分输出并递归清理未引用 orphan WAV
- [x] 3.4 让 GitHub CI/release 运行前端单元测试与 `test:e2e:maintained`

## 4. 验证与归档

- [x] 4.1 运行聚焦后端与发布工具测试、OpenSpec 校验
- [x] 4.2 运行完整后端、contract、前端单元、typecheck、Web build、维护 E2E、Cargo 与开源就绪门禁
- [x] 4.3 审阅最终 diff 和功能兼容性，更新必要文档
- [x] 4.4 勾选任务、归档 change、校验主 specs，并关闭 Beads 任务
