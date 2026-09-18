import { describe, expect, test } from 'bun:test';
import { localizeQualityWarning, localizeRuntimeWarning, localizeSystemNotice, localizeTechnicalError } from './userMessages';

describe('user-visible technical messages', () => {
  const pyannoteWarning = 'pyannote.audio is installed but HF_TOKEN is not configured';

  test('localizes the pyannote warning while preserving technical identifiers', () => {
    expect(localizeRuntimeWarning(pyannoteWarning, 'zh')).toEqual({
      summary: '已安装 pyannote.audio，但尚未配置 HF_TOKEN，因此说话人分离暂不可用。',
      detail: pyannoteWarning,
    });
    expect(localizeRuntimeWarning(pyannoteWarning, 'en')).toEqual({
      summary: 'pyannote.audio is installed, but speaker diarization is unavailable until HF_TOKEN is configured.',
      detail: pyannoteWarning,
    });
  });

  test('uses a localized summary and keeps unknown backend text as technical detail', () => {
    const raw = 'upstream runtime returned something unexpected';
    expect(localizeRuntimeWarning(raw, 'zh')).toEqual({
      summary: '运行时检测发现问题，请查看技术详情。',
      detail: raw,
    });
    expect(localizeRuntimeWarning(raw, 'en')).toEqual({
      summary: 'A runtime check found an issue. See technical details.',
      detail: raw,
    });
  });

  test('localizes maintained warning families without translating their raw details', () => {
    const raw = 'ffmpeg is not available: executable missing';
    expect(localizeRuntimeWarning(raw, 'zh')).toEqual({
      summary: 'ffmpeg 不可用，媒体检查和音频提取可能无法完成。',
      detail: raw,
    });
    expect(localizeRuntimeWarning(raw, 'en').summary).toBe(
      'ffmpeg is unavailable. Media inspection and audio extraction may not work.',
    );
  });

  test('localizes recent unknown errors instead of presenting raw English as the main message', () => {
    const raw = 'worker exited with code 137';
    expect(localizeTechnicalError(raw, 'zh')).toEqual({
      summary: '最近一次操作失败，请查看技术详情。',
      detail: raw,
    });
    expect(localizeTechnicalError(raw, 'en')).toEqual({
      summary: 'The most recent operation failed. See technical details.',
      detail: raw,
    });
  });

  test('localizes stable quality warning codes', () => {
    expect(localizeQualityWarning('EMPTY_TRANSCRIPT', 'zh')).toBe('转写结果为空');
    expect(localizeQualityWarning('EMPTY_TRANSCRIPT', 'en')).toBe('The transcript is empty');
    expect(localizeQualityWarning('TIMELINE_OVERLAP', 'zh')).toBe('字幕时间范围存在重叠');
  });

  test('localizes maintained system notices and preserves the raw detail', () => {
    expect(localizeSystemNotice('network_filesystem', 'zh')).toEqual({
      summary: '目标位于网络文件系统，迁移速度和可靠性可能受到影响。',
      detail: 'network_filesystem',
    });
    expect(localizeSystemNotice('ffmpeg is not available', 'en').summary).toBe(
      'ffmpeg is unavailable. Media processing cannot start.',
    );
  });
});
