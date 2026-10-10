# NeMo 引擎 CUDA 真机验证待办（asrbox-jwm 移交项）

`add-nemo-server-engine` 落地的引擎与契约已由单元/契约测试覆盖（stub 引擎，
`backend/tests/test_nemo_engine.py`、`backend/tests/test_model_registry.py`），
但仓库 CI 无 CUDA runner、开发机无 NVIDIA GPU，以下门禁**未执行**，需在有
NVIDIA GPU 的环境完成后方可宣称 NeMo 转写可用：

1. ~~`requirements-docker.lock` 再生成~~（已于 2026-10-10 随 v0.4.0 发布准备完成：
   `nemo-toolkit==3.0.0` 已进入 lock，torch 基线保持 `2.11.0+cpu`）。
2. Docker 镜像完整构建冒烟（`docker compose build`）。
3. 冻结/容器运行时 `nemo_available` 探针为 true。
4. 经 backend 真实分发路径各跑通一条真实转写：
   - `parakeet-tdt-0.6b-v3`（长音频单遍 + 词级时间戳）
   - `canary-1b-flash`（>10 分钟音频 VAD 分块 + 时间戳偏移）
   参照 `backend/real_tests/test_real_models.py` 的执行方式
   （`ASRBOX_RUN_REAL_MODELS=1`，`ASRBOX_REAL_MEDIA_DIR` 指向样本目录，
   `-k parakeet or canary`）。
5. 若 NeMo transcribe 返回结构与防御式归一假设不符（版本 3.0.0 之外），
   修复集中在 `backend/backends/local_asr.py` 的 `_nemo_transcribe_outputs`。

在此之前，两个模型条目的目录描述保持「需要 NVIDIA CUDA；尚未在 CUDA 真机验证」
的如实文案。
