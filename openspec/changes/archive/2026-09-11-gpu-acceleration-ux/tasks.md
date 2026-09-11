# Tasks: gpu-acceleration-ux

## 1. 后端：重探与原因码

- [x] 1.1 `backend/services/cuda_kit.py`：新增门控缓存重置（`_gpu_detect_started/_gpu_detect_result`）并接入 `_reset_probe_cache()`；新增 `redetect_and_status()`（去重进行中的探测）；状态构建处（`:339,363,372,375,378`）附带 `reason_code`；验证：`test_cuda_kit.py` 新增用例——首次探测 False 后 redetect 能翻到 True
- [x] 1.2 `backend/routes/cuda_kit.py`：新增 `POST /settings/cuda-acceleration/redetect`；`backend/models.py`：`CudaAccelerationStatusResponse` 声明 `reason_code`；验证：API 测试断言端点与字段
- [x] 1.3 `backend/tests/test_contract.py`：路由清单 + 字段断言；验证：`npm run test:backend:contract` 通过

## 2. 前端：CUDA 面板重构与文案

- [x] 2.1 `app/src/lib/api.ts`：`CudaAccelerationStatus` 增加 `reason_code`，新增 `redetectCudaAcceleration()`；`queries.ts` 增加 mutation；验证：typecheck 通过
- [x] 2.2 `CudaAccelerationSettings.tsx`：刷新按钮改调 redetect + 轮询收敛；下载完成后自动 redetect；`reason_code` 映射 i18n（回退原文）；按 D5 重排为控制卡 + 详情卡两区块；验证：相关 e2e 更新后通过
- [x] 2.3 `i18n.ts`：zh/en 文案更新（重启后端→重启软件、未检测到引导重检、五个 reason_code 文案、关于/磁盘小字合并）；验证：词典 key 对齐，界面无「后端」字样

## 3. 前端：macOS Apple GPU 面板

- [x] 3.1 核对 `/runtime/status` 实际字段（platform 字符串格式、torch_mps/mlx 可用性字段），确定面板可展示的事实集；验证：以真实响应为准记录在设计变更注释
- [x] 3.2 新增 `AppleGpuAccelerationSettings` 组件（MPS/MLX 可用性 + 自动加速模型列表 + 说明）；`SettingsPage.tsx` 按平台分派（Windows/macOS/其它三分支）；验证：新增/更新 e2e 场景通过

## 4. 验证

- [x] 4.1 `npm run test:backend`、`npm run typecheck`、`npm run build:web` 通过
- [x] 4.2 `app/e2e/cuda-acceleration.spec.ts` 更新并纳入 `test:e2e:maintained` 运行通过
- [x] 4.3 手动过一遍：Windows 面板布局紧凑、刷新真正重探；macOS 显示 Apple GPU 面板；设置页无「重启后端」字样
