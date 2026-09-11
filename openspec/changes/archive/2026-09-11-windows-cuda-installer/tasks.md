# 任务：Windows CUDA 加速套件（windows-cuda-installer）

## 1. 注入机制 spike（关键路径，先行）

- [x] 1.1 最小补丁：`ASRBOX_CUDA_KIT_DIR` 注入（spike 后定为 `pyi_rth_cuda_kit.py` 首运行时钩子 + meta_path finder 重定向 torch.*；`server.py` 保留 dev 路径 plain insert）；手工 `pip install --target` 构造 cu128 套件（4.3GB，`data/tmp/cuda-kit`）
- [x] 1.2 冻结验证：`build-server.sh` 打包后对照组 CPU / 实验组 `cuda_available=True`（`torch_file` 指向套件，RTX 3080 Ti），local worker 完成 whisper-large-v3 GPU 转写（90s 片段端到端 26s vs CPU 329s）；证据 `data/tmp/spike2-*`、`data/tmp/spike-worker-result.json`
- [x] 1.3 spike 结论写回 design D1（通过判据/机制修正：PYZ 内 torch 副本 + funasr 预载抢先，纯 sys.path.insert 在冻结环境无效）

## 2. CUDA 锁与套件打包

- [x] 2.1 自 cu128 venv 生成 `requirements-windows-cuda.lock`（头部 `--extra-index-url` cu128 源 + 角色说明）；diff 核对非 torch 包与 CPU 锁一致（全部一致，唯一预期差异 `torch==2.11.0+cu128`；setuptools 为 torch 声明依赖、打包时裁剪，已记于锁头部）
- [x] 2.2 `scripts/build-cuda-kit.py`：`--target` 安装 → 裁剪（非 torch 包/`__pycache__`/`torch/include`/`torch/share`）→ zip + manifest（kit 版本、torch 版本、逐文件 SHA-256）→ 实测 raw 4.03GiB/zip 2.57GiB 超 2GiB 上限 → 定案字节分卷 part1/part2（各 1.29GiB，LZMA 否决），manifest 记录 `zip_sha256`+`parts[]`
- [x] 2.3 全新环境按锁复现套件构建（脚本化 fresh `--target` 安装）→ 全链路校验通过：分卷 SHA-256 → 拼合 zip SHA-256 → 解压 → 2285 文件逐文件校验（`build/kit-verify2`）；裁剪后套件经冻结后端 probe 复核 CUDA 可用

## 3. 后端套件管理

- [x] 3.1 套件 service + 路由：状态查询/下载（进度/取消/重试，`.part` 语义）/启停/失效检测；新端点字段全部声明 `response_model` 并加 API 测试断言
- [x] 3.2 设置存储新增 `cuda_acceleration` 开关与派生状态（未下载/下载中/已启用/启用失败/已失效）
- [x] 3.3 解压后逐文件 SHA-256 复核 + 来源白名单（固定 Release 资产名或固定 modelscope 仓库，HTTPS-only）；校验失败整体作废
- [x] 3.4 启动 probe：有界子进程验证套件 torch 可导入且 CUDA 可用，结果缓存；失败保持 CPU 并记录原因

## 4. `gpu_available` 与前端

- [x] 4.1 `health.py` 读 probe 缓存写实 `gpu_available`（缓存未填充时保守 false，绝不触发 probe 子进程）；API 测试 mock 两种取值（`test_health_gpu_available_follows_probe_cache` / `..._conservative_without_probe_cache`）
- [x] 4.2 设置页 CUDA 加速开关（Windows + N GPU 才可用，其余置灰说明）+ 套件下载进度/状态/失败重试/失效重下 UI，复用模型下载交互与 typed client（review 修复：`current_part` 契约对齐后端 `string | null`，进度文案改按分卷序号渲染；typecheck/单测/e2e 全绿）
- [x] 4.3 开关切换调 `restart_server` 生效；关于页加速状态展示平台化（Tauri 侧 `cuda_kit_env`：Rust 自 app_data_dir 派生路径注入 `ASRBOX_CUDA_KIT_DIR`，仅 Windows，允许/拒绝路径测试通过；真机开/关双向切换均验证）
- [x] 4.4 CUDA 加速独立设置板块：设置页新增"加速"标签页（位于"转写"之后），卡片从存储页迁入；新增显卡信息（检测状态/设备名/CUDA 运行时）、套件信息（版本/torch/占用/安装路径/卸载按钮）、功能说明三个面板；新增 `app/e2e/cuda-acceleration.spec.ts`（web 不支持态 + desktop mock 丰富内容态）并接入 `test:e2e:maintained`

## 5. CI/CD

- [x] 5.1 release.yml 新增 `cuda-kit` job（CUDA 锁 + `scripts/build-cuda-kit.py` + `--verify-parts` 回放校验 + 上传 part1/part2 与 manifest）；publish 合并 `SHA256SUMS.cuda-kit.txt`，发布文件清单覆盖 kit 资产
- [x] 5.2 `verify-release-assets.sh` 同步 kit 资产断言（分卷存在/单卷 <2GiB/manifest/SHA256SUMS 行数与逐条 grep，mock 资产正负向实测）；`check-versions.mjs` 新增 CUDA 锁与 CPU 锁 torch 基线 parity 门禁 + 测试；`npm run test:release-tools` 通过

## 6. 文档

- [x] 6.1 README 双语：CUDA 加速开关说明（硬件前提、一次性下载体积、开关语义、失效重下）
- [x] 6.2 `docs/releases/v0.1.9.md`：套件功能 + 14 模型实机矩阵（2026-09-10 单机日期化证据措辞，含显存峰值与 1x 边界说明）；`docs/ci.md`（cuda-kit job 与锁 parity）与 `AGENTS.md` 依赖规则段（CUDA 锁角色与套件再生成方式）已同步

## 7. 全量验证

- [x] 7.1 `npm run check:open-source` 全绿（后端 471 通过/2 跳过，cargo 19 通过，e2e maintained 40 通过；期间修复一处负载竞态 flake：`test_local_queue_limits_concurrency...` 在断言前加有界等待，被测行为不变）
- [x] 7.2 真机端到端：全量重建 `build:desktop` → NSIS 静默安装 → 预置套件+`config.json` 后启动应用，`/health` 断言 `gpu_available=true`（两轮 20s/25s）→ 关配置重启断言稳定 `false`（75s+）→ 安装版 sidecar worker 跑 whisper-large-v3 GPU 转写 90s 片段，30.5s 端到端、40 段完整（CPU 基线 329s）。偏差说明：真实 GitHub Release 下载链路未测——v0.1.9 Release 尚未发布，白名单 URL 预期 404；下载/校验/安装全链路已由 fake-fetcher 后端测试覆盖，真实下载待 Release 发布后最终确认；设置页 UI 开关点击留人工冒烟
- [x] 7.3 `openspec validate --changes windows-cuda-installer` 通过，tasks 全勾选后按流程归档（先确认 `windows-desktop-support` 已归档）
