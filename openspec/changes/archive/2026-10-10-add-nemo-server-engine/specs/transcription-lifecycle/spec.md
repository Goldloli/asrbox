# transcription-lifecycle Delta

## ADDED Requirements

### Requirement: NeMo 引擎行为

`nemo` 引擎 SHALL 以 `nemo_toolkit` 的 `ASRModel.restore_from` 加载 registry 管理下载的本地 `.nemo` 权重（不经 `from_pretrained` 的隐式网络缓存），推理设备按声明的 `cuda` 显式选择，不得落到 CPU 或未声明设备。`nemo_toolkit` 不可导入时 SHALL 以运行时探针缺失失败并给出本地化提示，不在转写中途崩溃。模型输出的文本与词级时间戳 SHALL 映射到 `TranscriptionResult` 契约（时间戳聚合为句段时间轴并透出词级数据，解析对 NeMo 版本间的返回结构差异做防御性处理）；超过模型官方单次输入上限的长音频 SHALL 经既有 fsmn-vad 切分并偏移时间戳。引擎与时间戳解析 SHALL 具备 stub 级单元与分发路径测试；真实 CUDA 转写验证（探针 true + 至少一条真实转写）SHALL 作为显式移交项在完成前保持条目的「未验证」标注，不得在未验证时宣称可用。

#### Scenario: restore_from 本地权重
- **WHEN** 在含 nemo-toolkit 与 CUDA 的运行时以 NeMo 模型发起转写
- **THEN** 引擎从 registry 下载目录加载 `.nemo` 权重，不触发隐式模型下载，输出映射到既有 TranscriptionResult 契约

#### Scenario: 超长音频
- **WHEN** 音频超过所选 NeMo 模型的官方单次输入上限
- **THEN** 经 fsmn-vad 切分逐块转写并按块偏移合并时间轴；VAD 不可用时给出可操作错误

#### Scenario: nemo_toolkit 缺失
- **WHEN** 运行时未安装 nemo_toolkit（如桌面二进制旁路调用）
- **THEN** 引擎以运行时缺失态失败并给出本地化提示，不产生半途崩溃或无诊断挂起
