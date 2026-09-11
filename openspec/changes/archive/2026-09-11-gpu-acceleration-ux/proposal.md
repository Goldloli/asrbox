# Proposal: gpu-acceleration-ux

## 为什么

用户在 RTX 2060s 机器上实测：未启用 CUDA 加速时面板显示「显卡检测不到、CUDA 加速不可用」，重启软件后才恢复正常。根因是 `backend/services/cuda_kit.py` 的 nvidia-smi 门控探测结果（含失败的 `False`）被永久缓存，前端「刷新」只是重新拉取接口，整个进程生命周期内不会重新探测。同时面板文案使用「重启后端」等内部术语、后端直出硬编码中文 reason、右栏三面板排版松散，且 macOS 客户端显示 CUDA 面板（右侧「检测中…」永远转圈）而非 Mac 实际可用的 Apple GPU 加速信息。

## 变更内容

- 修复探测缓存：新增显式重新探测能力（`POST /settings/cuda-acceleration/redetect`），前端「刷新」改为真正重新探测；套件下载完成后自动触发重新探测；`_reset_probe_cache()` 连带重置门控缓存。
- 状态负载新增机器可读 `reason_code`（`unsupported_platform`/`kit_version_mismatch`/`probe_failed`/`kit_not_injected`/`cuda_device_missing`），前端按语言本地化展示，原始 `reason` 保留为详情。
- 文案去内部术语：「重启后端」→「重启软件」；未检测到显卡时引导用户点击刷新重新检测（zh/en 同步）。
- CUDA 面板排版重构：左侧主面板 + 右侧三面板 → 紧凑的两区块布局（控制区 + 运行详情合并为定义行，说明文字收为底部小字）。
- macOS 桌面端的「显卡加速」页签改显 Apple GPU 状态面板：Apple Silicon/MPS/MLX 可用性 + 会自动使用 Apple GPU 的模型列表 + 「自动生效、无需设置」说明；非桌面/其它平台显示通用说明，不再出现永远「检测中…」的卡片。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `model-management`：新增「显卡检测可按需重新探测」requirement（探测失败不得被进程级钉死、用户可触发重探、套件事件后自动重探、原因码本地化）；新增「加速设置按平台呈现」requirement（Windows=CUDA 控制、macOS=Apple GPU 状态、其它=说明）。

## 影响

- 后端：`backend/services/cuda_kit.py`、`backend/routes/cuda_kit.py`（新端点）、`backend/models.py`（`reason_code` 字段，声明进 response_model）、`backend/tests/test_cuda_kit.py`、`backend/tests/test_contract.py`（路由+字段断言）。
- 前端：`app/src/components/settings/CudaAccelerationSettings.tsx`（重构）、新增 `AppleGpuAccelerationSettings`、`app/src/routes/SettingsPage.tsx`（平台分派）、`app/src/lib/api.ts`/`queries.ts`、`app/src/lib/i18n.ts`。
- e2e：`app/e2e/cuda-acceleration.spec.ts` 断言随文案/结构更新，新增 macOS 面板场景。
- API contract：新增 POST 路由 + additive 字段（非破坏）。
- 不改变：CUDA 套件下载/校验/注入流程、健康检查语义、CPU 回退行为。
