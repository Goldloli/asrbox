# Tasks: add-nemo-server-engine

## 1. 引擎与注册

- [x] 1.1 `backend/backends/local_asr.py` 新增 `NemoASRBackend`：import 守护的 `nemo_toolkit` `ASRModel.restore_from`（registry 下载目录内 `.nemo`）、cuda 显式选择、防御性 transcribe 输出归一（str/dict.text、词级时间戳可选映射）、长音频 fsmn-vad 切分与时间戳偏移、`raw_result_summary`。
- [x] 1.2 `backend/backends/registry.py` 新增 `parakeet-tdt-0.6b-v3`（languages 按 25 欧洲语言官方清单、size_mb≈2509、CC-BY-4.0、attribution 署名文本、allow/required 锁 `*.nemo` 文件、supported_devices=["cuda"]）与 `canary-1b-flash`（en/de/fr/es、≈3541MB、CC-BY-4.0）；`get_all_model_configs` 在 `sys.frozen` 时过滤 `nemo` 引擎条目。
- [x] 1.3 `backend/services/platform.py` 新增 `nemo_available` 探针（import nemo.collections.asr 成功）；`backend/services/models.py` 接入探针分发与本地化缺失文案；设备能力呈现 cuda-only 不可用文案。

## 2. 依赖与打包边界

- [ ] 2.1 `requirements-docker.in` 已增加 `nemo-toolkit==3.0.0`（无 `[asr]` extra，见 design 决策 5），Python 3.13/3.14 容器 dry-run 解析冒烟通过；**剩余**：`requirements-docker.lock` 再生成（需完整 Docker 构建环境）、`docs/docker.md` 补镜像体积与 CUDA 说明。
- [x] 2.2 `backend/build_binary.py` 增加静态断言：nemo 相关模块不得进入桌面 hidden imports/collect；现有打包静态断言测试同步。

## 3. 声明与文档

- [x] 3.1 `THIRD_PARTY_NOTICES.md` 记录两个模型的 CC-BY-4.0 许可与署名义务、nemo-toolkit（Apache-2.0）仅 server/Docker。
- [x] 3.2 `docs/asr-models-roadmap.md` 阶段 4 状态更新（含 canary-qwen 与 indicparakeet 暂缓原因）；CHANGELOG Unreleased 增加 Added 条目（注明 server/Docker 专属与 CUDA 验证移交状态）。

## 4. 测试

- [x] 4.1 registry 测试：条目断言（设备 cuda-only、license/attribution、required 文件、frozen 过滤——monkeypatch sys.frozen 断言隐藏、非冻结可见）。
- [x] 4.2 引擎 stub 单测：monkeypatch nemo 模块对象，验证 restore_from 收到下载目录路径、cuda 显式选择、输出归一（字符串/dict/带时间戳三形态）、VAD 切分偏移；探针缺失态文案；经 backend 分发路径的行为测试（沿用既有本地模型测试模式）。
- [x] 4.3 聚焦测试与 `npm run test:backend` 全量通过（610 passed；typecheck 与前端单测 47/47 同过）。
- [ ] 4.4 Docker 构建冒烟：python:3.14 容器对 `nemo-toolkit==3.0.0` 的 dry-run 解析已通过；**剩余**：完整镜像构建（含 lock 再生成后）未执行，CUDA 真机转写未验证（移交项，见 5.1）。

## 5. 移交与归档

- [x] 5.1 Beads asrbox-jwm 记录 CUDA 真机验证移交项（探针 true + 真实转写），`backend/real_tests/` 增加 NeMo 待验证清单；完成前条目描述保持「需 CUDA、未在真机验证」如实文案。
- [x] 5.2 `openspec validate --changes add-nemo-server-engine` 通过；CUDA 验证移交状态在 proposal/design 已如实声明，归档不宣称已真机验证。
