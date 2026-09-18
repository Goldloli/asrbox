export type UserMessageLocale = 'en' | 'zh';

export type LocalizedTechnicalMessage = {
  summary: string;
  detail: string;
};

type RuntimeWarningRule = {
  matches: (warning: string) => boolean;
  en: string;
  zh: string;
};

const startsWith = (prefix: string) => (value: string) => value.startsWith(prefix);

const runtimeWarningRules: RuntimeWarningRule[] = [
  {
    matches: (value) => value === 'pyannote.audio is installed but HF_TOKEN is not configured',
    en: 'pyannote.audio is installed, but speaker diarization is unavailable until HF_TOKEN is configured.',
    zh: '已安装 pyannote.audio，但尚未配置 HF_TOKEN，因此说话人分离暂不可用。',
  },
  {
    matches: startsWith('ffmpeg is not available:'),
    en: 'ffmpeg is unavailable. Media inspection and audio extraction may not work.',
    zh: 'ffmpeg 不可用，媒体检查和音频提取可能无法完成。',
  },
  {
    matches: startsWith('ffprobe is not available:'),
    en: 'ffprobe is unavailable. Media information may not be readable.',
    zh: 'ffprobe 不可用，可能无法读取媒体信息。',
  },
  {
    matches: startsWith('torch inspection failed:'),
    en: 'PyTorch runtime inspection failed. Some local models may be unavailable.',
    zh: 'PyTorch 运行时检测失败，部分本地模型可能不可用。',
  },
  {
    matches: startsWith('funasr import failed:'),
    en: 'FunASR could not be loaded. FunASR models are unavailable.',
    zh: '无法加载 FunASR，相关模型暂不可用。',
  },
  {
    matches: startsWith('torchaudio import failed:'),
    en: 'torchaudio could not be loaded. Audio features that depend on it are unavailable.',
    zh: '无法加载 torchaudio，依赖它的音频功能暂不可用。',
  },
  {
    matches: (value) => value === 'funasr requires torchaudio, but torchaudio is unavailable',
    en: 'FunASR requires torchaudio, which is currently unavailable.',
    zh: 'FunASR 依赖 torchaudio，但当前无法使用 torchaudio。',
  },
  {
    matches: startsWith('Qwen3-ASR import failed:'),
    en: 'Qwen3-ASR could not be loaded. Qwen3-ASR models are unavailable.',
    zh: '无法加载 Qwen3-ASR，相关模型暂不可用。',
  },
  {
    matches: startsWith('MOSS-Transcribe-Diarize import failed:'),
    en: 'MOSS-Transcribe-Diarize could not be loaded. Its transcription and diarization features are unavailable.',
    zh: '无法加载 MOSS-Transcribe-Diarize，相关转写与说话人分离功能暂不可用。',
  },
  {
    matches: startsWith('MLX Whisper import failed:'),
    en: 'MLX Whisper could not be loaded. MLX Whisper models are unavailable.',
    zh: '无法加载 MLX Whisper，相关模型暂不可用。',
  },
  {
    matches: startsWith('MLX import failed:'),
    en: 'MLX could not be loaded. Apple silicon MLX acceleration is unavailable.',
    zh: '无法加载 MLX，Apple 芯片的 MLX 加速暂不可用。',
  },
  {
    matches: startsWith('Runtime compatibility probe failed:'),
    en: 'The runtime compatibility check failed. Some capability results may be incomplete.',
    zh: '运行时兼容性检测失败，部分能力状态可能不完整。',
  },
  {
    matches: (value) => value === 'models directory disk usage is unavailable',
    en: 'Disk usage for the model storage location is unavailable.',
    zh: '无法读取模型存储位置的磁盘占用信息。',
  },
  {
    matches: (value) => value === 'Free disk space is below 5GB',
    en: 'Less than 5 GB of free disk space remains.',
    zh: '磁盘可用空间不足 5 GB。',
  },
];

export function localizeRuntimeWarning(warning: string, locale: UserMessageLocale): LocalizedTechnicalMessage {
  const rule = runtimeWarningRules.find(({ matches }) => matches(warning));
  return {
    summary: rule
      ? rule[locale]
      : locale === 'zh'
        ? '运行时检测发现问题，请查看技术详情。'
        : 'A runtime check found an issue. See technical details.',
    detail: warning,
  };
}

export function localizeTechnicalError(error: string, locale: UserMessageLocale): LocalizedTechnicalMessage {
  return {
    summary: locale === 'zh'
      ? '最近一次操作失败，请查看技术详情。'
      : 'The most recent operation failed. See technical details.',
    detail: error,
  };
}

const qualityWarningLabels: Record<string, Record<UserMessageLocale, string>> = {
  EMPTY_TRANSCRIPT: { en: 'The transcript is empty', zh: '转写结果为空' },
  REPETITIVE_TRANSCRIPT: { en: 'The transcript contains unusually repetitive text', zh: '转写结果中存在异常重复内容' },
  TIMELINE_OVERLAP: { en: 'Subtitle time ranges overlap', zh: '字幕时间范围存在重叠' },
  INVALID_SEGMENT_TIME: { en: 'A subtitle segment has an invalid time range', zh: '有字幕分段的时间范围无效' },
  TEXT_TOO_SHORT_FOR_DURATION: { en: 'The transcript text may be too short for the audio duration', zh: '相对于音频时长，转写文字可能过少' },
  SILENCE_WITH_LONG_TRANSCRIPT: { en: 'A long transcript was produced from mostly silent audio', zh: '主要为静音的音频却生成了较长转写结果' },
};

export function localizeQualityWarning(warning: string, locale: UserMessageLocale) {
  return qualityWarningLabels[warning]?.[locale]
    ?? (locale === 'zh' ? '检测到一项转写质量问题' : 'A transcription quality issue was detected');
}

const systemNoticeRules: RuntimeWarningRule[] = [
  {
    matches: (value) => value === 'network_filesystem',
    en: 'The target is on a network file system. Migration speed and reliability may be affected.',
    zh: '目标位于网络文件系统，迁移速度和可靠性可能受到影响。',
  },
  {
    matches: (value) => value === 'ffmpeg is not available' || value.startsWith('ffmpeg is not available for volume analysis'),
    en: 'ffmpeg is unavailable. Media processing cannot start.',
    zh: 'ffmpeg 不可用，无法开始媒体处理。',
  },
  {
    matches: (value) => value === 'ffprobe is not available',
    en: 'ffprobe is unavailable. Media information cannot be read.',
    zh: 'ffprobe 不可用，无法读取媒体信息。',
  },
  {
    matches: startsWith('Unsupported media format:'),
    en: 'This media format is not supported.',
    zh: '不支持该媒体格式。',
  },
  {
    matches: (value) => value === 'ffmpeg timed out during volume analysis',
    en: 'Audio analysis timed out. You can retry or use another file.',
    zh: '音频分析超时，可重试或更换文件。',
  },
  {
    matches: (value) => value === 'Uploads directory is not writable' || value === 'Check ASRBOX_DATA_DIR permissions',
    en: 'The upload directory is not writable. Check the ASRbox data directory permissions.',
    zh: '上传目录不可写，请检查 ASRbox 数据目录权限。',
  },
  {
    matches: (value) => value === 'Exports directory is not writable',
    en: 'The export directory is not writable. Check the ASRbox data directory permissions.',
    zh: '导出目录不可写，请检查 ASRbox 数据目录权限。',
  },
  {
    matches: (value) => value === 'Free disk space is below 1GB',
    en: 'Less than 1 GB of free disk space remains.',
    zh: '磁盘可用空间不足 1 GB。',
  },
  {
    matches: (value) => value === 'Could not inspect free disk space',
    en: 'Free disk space could not be checked.',
    zh: '无法检查磁盘可用空间。',
  },
];

export function localizeSystemNotice(notice: string, locale: UserMessageLocale): LocalizedTechnicalMessage {
  const rule = systemNoticeRules.find(({ matches }) => matches(notice));
  return {
    summary: rule
      ? rule[locale]
      : locale === 'zh'
        ? '系统检测到一项需要注意的问题，请查看详情。'
        : 'A system check found an issue that needs attention. See details.',
    detail: notice,
  };
}
