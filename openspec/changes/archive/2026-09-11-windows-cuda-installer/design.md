# 设计：Windows CUDA 加速套件（windows-cuda-installer）

## 背景

- 实测基线（本机 RTX 3080 Ti / 90 秒音频；证据 `data/tmp/bench-results-{cpu,cuda}.json`，按"证据与承诺分离"属单机日期化证据）：CPU-only 构建下 14 模型全 CPU（large-v3 329s）；`torch 2.11.0+cu128` 下 14 模型全 CUDA（large-v3 31s，10.7x），最大观测显存 ~6.7GB（whisper-large-v3），`pytest` 424 零回归。
- 设备自动选路已存在于 `backend/backends/local_asr.py:179-193`（cuda 可用即用），无需改引擎代码。
- 冻结后端为 PyInstaller onedir（`binaries/asrbox-server/` + `_internal/`），无 pip，不能直接安装 CUDA torch。
- 已有可复用模式：模型下载/进度/取消/校验框架（`backend/services/models.py`）、`restart_server` Tauri command 与前端服务器管理 UI、设置页（`app/src/components/settings/`）、运行时 probe+缓存（`backend/services/platform.py`，主 spec 要求重导入不进常驻进程）。
- 双安装器方案（已否决）的两点硬伤：CUDA 用户每次升级重下 ~2.5GB；GitHub Release 单资产 2GB 上限可能装不下 CUDA 安装器。

## 目标

- 单一 Windows 安装器（体积不变）；设置页"CUDA 加速"开关 + 按需一次性下载套件；选中即 GPU、取消即 CPU。
- 套件下载/校验/启停/失效全生命周期可审计；注入失败保持 CPU 并诚实报错。
- `/health` 的 `gpu_available` 如实反映运行环境。

## 非目标

- macOS/Docker 加速变体；ROCm/DirectML；运行时 pip 安装任意包；更新器变体维度（安装器保持单一资产）。
- macOS 既有行为零变化：`/health` 取值、运行时 probe 行为、设置页渲染、引擎选路结果均与现状逐项一致（见 D4 的保守取值与前端平台门控）。

## 决策

### D1：套件 = cu128 site-packages 快照 + manifest，注入经运行时钩子重定向
- 套件内容：`pip install --target` 产出的 `torch==2.11.0+cu128`（Windows cu128 wheel 无 `nvidia-*` 目录，CUDA DLL 全部捆绑在 `torch/lib`；其余包复用 `_internal` 既有副本，不打入套件——版本与 CPU 锁逐项一致，diff 核对记录）。
- manifest：kit 版本、绑定 torch 版本、逐文件相对路径 + SHA-256 + 大小；由 CI 生成并签名式钉入发布元数据（Release 资产 `cuda-kit-manifest.json`）。
- 注入（**spike 后修正**，结论见本节末）：新增 `backend/pyi_rth_cuda_kit.py` 作为**首个** PyInstaller runtime hook（`build_binary.py` 中排在 `pyi_rth_funasr` 之前）。Tauri 侧按开关状态注入 `ASRBOX_CUDA_KIT_DIR`；钩子校验 `<kit>/torch/__init__.py` 存在后：① `sys.path.insert(0, kit)`；② 在 `sys.meta_path` 首位安装 finder，把全部 `torch.*` 导入转交 `PathFinder`（即套件文件）；③ win32 下 `os.add_dll_directory(<kit>/torch/lib)`。worker 子进程继承同一 env。`backend/server.py` 的 `_maybe_inject_cuda_kit()` 保留同一 env 的 `sys.path.insert`，覆盖非冻结/dev 路径（那里没有 PyiFrozenImporter 与 funasr 预载，plain insert 足够）。
- 为什么纯 `sys.path.insert` 在冻结环境无效（spike 实测）：① `pyi_rth_funasr` 在 `main()` 之前预载全部 funasr 子模块并连带导入 torch，torch 已占 `sys.modules`；② exe 内嵌 PYZ 含完整 torch 副本（2137 条目），`PyiFrozenImporter` 在 `sys.meta_path` 中先于 `PathFinder`，`sys.path` 顺序对 torch 不生效。两个机制都必须绕开。
- 有效性判定：启动时对有界 probe（子进程 `import torch; torch.cuda.is_available()`，超时/异常 → 禁用并记录原因），结果写缓存；失败保持 CPU，`/health` 与设置页显示诚实状态。probe 附带诊断字段 `torch_file`/`torch_cuda_version`（`detect_runtime_in_process`，仅 CLI probe 输出；`RuntimeStatusResponse` 不声明这两字段，API 响应不变）。
- **Spike 结论（通过）**：对照组（无 env）`torch_file`→`_internal` CPU torch、`cuda_available=False`；实验组（注入套件）`torch_file`→套件、`torch 2.11.0+cu128`、`cuda_available=True`、RTX 3080 Ti（cap 8.6），funasr/torchaudio 在套件 torch 上正常导入；冻结后端 + 套件经 local worker 完成 whisper-large-v3 GPU 转写（90s 中文 wav，端到端 26s，CPU 基线纯转写 329s），输出合法。证据：`data/tmp/spike2-{ctrl,exp}-out.log`、`data/tmp/spike-worker-result.json`。
- 备选：PYTHONPATH 由 Tauri 注入——否决，bootloader 路径优先级不可控；备选：套件打进 `_internal` 覆盖 CPU torch——否决，破坏安装器单一基线且无法关闭回 CPU；备选：`module_collection_mode={'torch':'py'}` 迫使 torch 文件化——否决，会改变 macOS 冻结布局（runtime hook + finder 只影响 Windows 开关开启时的运行时行为，对 macOS 构建零接触）。

### D2：套件分发与校验
- CI 套件 job：自 CUDA 锁 `--target` 安装 → 裁剪（非 torch 包、`__pycache__`、`torch/include`、`torch/share`——实测 raw 4.03 GiB / 2285 文件）→ 压缩 → 生成 manifest + 每文件 SHA-256 → 作为 Release 资产发布。
- 实测体积：deflate zip 2.57 GiB，超 GitHub 单资产 2 GiB 上限；LZMA 重压缩实测收益不足且压缩耗时过长（否决）→ **定案字节分卷**：zip 按字节切分为 `asrbox-cuda-kit-windows-x64.zip.part1/.part2`（实测各 1.29 GiB），manifest 记录 `zip_sha256` + `parts[{name,size,sha256}]`；后端按序下载各分卷（各自 `.part` 临时文件与断点语义）、拼合校验 `zip_sha256` 后解压，再逐文件 SHA-256 复核，任一项不符即整体作废。全链路已在 `dist/cuda-kit/` 实测通过（分卷校验→拼合→zip 校验→解压→2285 文件逐文件校验）。
- 后端下载走自管 job（仿 `model_storage.py` relocation 的 `_job` + `_cancel_event` + 线程模式，进度/取消/重试；不新增全局事件类型，前端轮询仿 relocation 变速轮询）；落地 `<data_dir>/runtime/cuda-kit/`（zip 解压至其下 `kit/`，配置 `config.json`，下载暂存 `downloads/`）。
- 来源白名单：仅允许 `https://github.com/Goldloli/asrbox/releases/download/v<当前版本>/<固定资产名>`，HTTPS-only，拒绝重定向到非预期域（httpx 跟随重定向前校验最终 URL 域）。

### D3：开关与重启编排
- 设置项持久化为数据目录内的 JSON 配置（`<data_dir>/runtime/cuda-kit/config.json`，`{"enabled": bool}`，仿 media-storage 配置文件模式而非 SQLite——**Tauri 侧启动后端前必须能读到开关状态**，SQLite 对 Rust 不可达）。派生状态：未下载/下载中/就绪（已下载未启用）/已启用/启用失败/已失效，由 service 综合 config、套件文件、probe 缓存计算。typed client + `response_model` 声明 + API 测试断言。
- Tauri 注入：`start_server` 仿 `ffmpeg_env()` 新增 `cuda_kit_env(&app)`——Rust 侧解析 `app_data_dir/runtime/cuda-kit/config.json`，enabled 且 `<kit>/torch/__init__.py` 存在才注入 `ASRBOX_CUDA_KIT_DIR=<app_data_dir>/runtime/cuda-kit/kit`；路径完全由 Rust 自 app_data_dir 派生，WebView 不可传参（覆盖允许/拒绝路径测试）。后端桌面模式 data_dir 须与 app_data_dir 一致（实施时核实）。
- 切换流程：开启且套件就绪 → 写配置 → 调既有 `restart_server`；开启但无套件 → 先走下载流程再重启；关闭 → 写配置 → 重启（不再注入 env）。
- 版本绑定：后端启动核对套件 manifest 的 torch 版本与 `_internal` torch 版本，不匹配 → 状态 `已失效`，设置页提示重新下载（应用升级 bump torch 的场景）。

### D4：`gpu_available` 写实
- 复用运行时 probe 缓存（D1 probe 结果），`/health` 读缓存；probe 未跑过时为 `false`（保守不承诺）。不直接 import torch。
- 前端关于页/设置页展示加速状态（`gpu_available` + 套件状态），文案平台化（Windows: CUDA；macOS: Metal/MLX 既有表述不变）。

### D5：CI/CD 与文档
- release.yml 新增 `cuda-kit` job（windows-latest + CUDA 锁 + 打包脚本 + 上传 kit 资产与 manifest），Windows 安装器 job 不变；publish 合并资产，`SHA256SUMS.txt` 覆盖 kit；`verify-release-assets.sh` 与 `check-versions.mjs` 同步。
- `ci.yml` 不变（backend-windows 仍 CPU 锁）；套件注入路径由后端测试覆盖（构造假 kit 目录验证 sys.path 语义与失败回退）。
- README 双语 + v0.1.9 release notes + docs/ci.md + AGENTS.md 依赖规则段（CUDA 锁角色与套件再生成方式）。

## 风险

- ~~注入机制失败（关键未知）~~ **spike 已通过**（结论见 D1）：运行时钩子 + meta_path finder 方案在冻结后端实测有效，GPU 转写成功。残余风险：不同驱动/CUDA 环境的 DLL 解析差异由 `os.add_dll_directory` + 启动 probe 兜底；失败保持 CPU。
- **套件体积**：超 2GB 时的拆分/modelscope 决策见 D2；下载中断恢复复用 `.part`。
- **版本漂移**：torch bump 后旧套件失效语义已在 D3；CUDA 锁与 CPU 锁的非 torch 包漂移由 1.1 的 diff 核对防。
- **供应链**：pytorch 源故障影响套件构建；CI 缓存 + 全量冻结缓解。
- **误报 GPU**：probe 保守策略 + 设置页显示失败原因，杜绝"显示 GPU 实际 CPU"。

## 回滚

套件功能为纯增量：关闭开关即回 CPU；删除套件路由/设置项/CI job 与文档行即完整回退；`update.rs` 与单一安装器资产不变，无需回退。spike 失败时按 D1 风险节切换回双安装器方案（其工件已在本 change git 历史中完整存在过，可快速重建）。
