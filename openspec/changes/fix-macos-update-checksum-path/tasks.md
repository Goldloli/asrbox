## 1. 修复清单 contract 与发布生产链路

- [x] 1.1 新增可复用的 `SHA256SUMS.txt` basename 格式校验工具及 `scripts/*.test.mjs` fixture，覆盖 macOS/Windows 正常条目、`./` 前缀、目录路径、非法摘要、重复和缺失条目；用动态相邻版本资产名证明上一受维护客户端 contract 能解析下一 Release，且不写死具体产品版本号，并以 `npm run test:release-tools` 验证。
- [x] 1.2 移除 macOS、Windows 与 CUDA kit job 的分平台 checksum 片段，让 publish job 汇总全部资产后按确定性 basename 顺序一次生成最终 `SHA256SUMS.txt`，并让 `scripts/verify-release-assets.sh` 在文件哈希校验前调用格式校验器；用合成发布资产目录证明规范清单通过、带 `./` 的清单失败。
- [x] 1.3 扩充 `tauri/src-tauri/src/update.rs` 的 `parse_checksum` 测试，证明 DMG 与 NSIS 精确 basename 可匹配而路径前缀及非法摘要被拒绝，并运行 `cargo test --locked checksum_parser`。

## 2. 文档与整体验证

- [x] 2.1 更新 `docs/release.md`、`docs/ci.md` 与 `docs/troubleshooting.md`，说明最终清单由 publish job 在资产汇总后统一生成、必须使用 Release 根目录 basename、两个平台旧式 `./` 清单的诊断方式及当前版本恢复边界，并人工核对文档命令与实际 workflow 一致。
- [x] 2.2 运行 `npm run test:release-tools`、`cargo test --locked`、`openspec validate --changes fix-macos-update-checksum-path` 和 `npm run check:open-source`，确认发布工具、桌面边界、规格和开源门禁全部通过；若环境限制导致检查无法运行，准确记录未验证项。

## 3. 恢复已发布 v0.2.1

- [x] 3.1 在临时目录下载 v0.2.1 的 Release 元数据、现有清单、DMG 与 NSIS，把 macOS/Windows 校验工具产生的二进制标记或前导 `./` 统一规范化为双空格加 basename；确认摘要集合完全不变、两个安装包实算摘要匹配且新格式校验器通过。
- [ ] 3.2 仅在获得用户明确发布授权后替换 v0.2.1 的 `SHA256SUMS.txt`，随后从 GitHub Release API 重新获取并验证两个安装包都能按精确 basename 找到；未获授权时保持此任务未完成并明确报告现有 v0.2.0 客户端仍未恢复。
