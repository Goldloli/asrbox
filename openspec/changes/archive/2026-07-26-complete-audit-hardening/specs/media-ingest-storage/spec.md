## ADDED Requirements

### Requirement: 有界且稳健的媒体工具执行

媒体探测、规范化、音量分析与切片 SHALL 使用参数列表调用已解析的 ffprobe/ffmpeg，SHALL 具有与预期工作量匹配且可配置的总时限，并 SHALL 把超时作为可诊断的预处理或切片失败。ffprobe 的未知、非有限或负 duration SHALL 作为未知时长处理，而不是导致未捕获异常或伪造时长。

#### Scenario: ffprobe 返回未知时长

- **WHEN** ffprobe 对有效输入返回 `"N/A"`、非有限数或负 duration
- **THEN** 媒体元数据的 duration 为未知，其他可用流信息仍被保留

#### Scenario: ffmpeg 停止产生进展

- **WHEN** 媒体规范化、音量分析或切片进程超过其宽松总时限
- **THEN** 进程被终止，不完整目标被清理，任务收到现有错误体系内的可诊断失败
