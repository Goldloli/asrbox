import type { ModelStatus } from './api';
import type { Locale } from '../stores/uiStore';

export type ModelCategory = 'recommended' | 'whisper' | 'faster' | 'apple' | 'chinese' | 'diarization';

export function modelCategory(model: ModelStatus): Exclude<ModelCategory, 'recommended'> {
  if (model.supports_diarization) return 'diarization';
  if (model.engine === 'mlx_whisper') return 'apple';
  if (model.engine === 'funasr' || model.model_name.startsWith('qwen3-asr')) return 'chinese';
  if (model.engine === 'faster_whisper') return 'faster';
  return 'whisper';
}

export function isRecommendedModel(model: ModelStatus) {
  return (
    model.model_name === 'whisper-base' ||
    model.model_name === 'faster-whisper-small' ||
    model.model_name === 'mlx-whisper-turbo' ||
    model.model_name === 'sensevoice-small'
  );
}

export function modelDescription(model: ModelStatus, locale: Locale) {
  const zh = locale === 'zh';
  if (model.model_name === 'whisper-base') return zh ? '入门首选，体积小，适合快速验证和短音频。' : 'Best starter model for quick checks and short audio.';
  if (model.model_name === 'faster-whisper-small') return zh ? '速度和效果比较均衡，适合日常转写。' : 'Balanced speed and quality for daily transcription.';
  if (model.model_name === 'mlx-whisper-turbo') return zh ? '苹果芯片优先选择，速度快，适合本机使用。' : 'Best first pick on Apple Silicon, fast for local work.';
  if (model.model_name === 'sensevoice-small') return zh ? '中文和中英混合场景友好，依赖 FunASR。' : 'Good for Chinese and mixed Chinese-English audio, requires FunASR.';
  if (model.model_name === 'moss-transcribe-diarize') return zh
    ? '端到端转写 + 说话人分离一次完成，输出 [S01]/[S02] 标签；INTERSPEECH 2026 MLC-SLM 冠军模型，Apache 2.0。'
    : 'End-to-end transcription with speaker diarization in one pass, emitting [S01]/[S02] labels. INTERSPEECH 2026 MLC-SLM winner, Apache 2.0.';
  if (model.model_name.startsWith('qwen3-asr')) return zh ? '中文能力强但依赖较新，适合愿意调环境的用户。' : 'Strong Chinese ASR, but needs newer dependencies.';
  if (model.engine === 'faster_whisper') return zh ? 'CTranslate2 运行，通常比标准 Whisper 更省资源。' : 'CTranslate2 runtime, usually lighter than standard Whisper.';
  if (model.engine === 'whisper_transformers') return zh ? '标准 Whisper 系列，兼容稳定，越大越准也越占资源。' : 'Standard Whisper family, stable compatibility, larger means heavier.';
  return zh ? '通用转写模型，请按语言和运行时选择。' : 'General transcription model. Choose by language and runtime.';
}

export function modelBestFor(model: ModelStatus, locale: Locale) {
  const zh = locale === 'zh';
  if (model.model_name === 'moss-transcribe-diarize') return zh ? '多人会议、说话人区分' : 'meetings, speaker separation';
  if (model.model_name.includes('large')) return zh ? '高精度、长音频' : 'high accuracy, long audio';
  if (model.model_name.includes('turbo')) return zh ? '速度优先' : 'speed first';
  if (model.engine === 'mlx_whisper') return zh ? 'Apple Silicon' : 'Apple Silicon';
  if (model.engine === 'funasr' || model.model_name.startsWith('qwen3-asr')) return zh ? '中文内容' : 'Chinese audio';
  if (model.model_size === 'base' || model.model_size === 'small') return zh ? '日常使用' : 'daily use';
  return zh ? '通用场景' : 'general use';
}

export interface ModelDetails {
  capabilities: string[];
  languages: string;
  bestFor: string[];
  limitations: string[];
}

type LocalizedModelDetails = { zh: ModelDetails; en: ModelDetails };

const WHISPER_CAPABILITIES = {
  zh: ['段级时间戳', '多语言识别', '自动语言检测'],
  en: ['Segment timestamps', 'Multilingual recognition', 'Automatic language detection'],
};
const FASTER_WHISPER_CAPABILITIES = {
  zh: ['段级时间戳', '词级时间戳', '多语言识别', '自动语言检测'],
  en: ['Segment timestamps', 'Word-level timestamps', 'Multilingual recognition', 'Automatic language detection'],
};
const WHISPER_LANGUAGES = {
  zh: '自动检测 + 中、英、日、韩、德、法、西等常用语言',
  en: 'Auto-detect plus common languages including Chinese, English, Japanese, Korean, German, French, and Spanish',
};
const QWEN3_ASR_LANGUAGES = {
  zh: '自动检测 + 中（含粤语）、英、日、韩、法、德、西、葡、俄、阿、意、泰、越',
  en: 'Auto-detect plus Chinese (including Cantonese), English, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Arabic, Italian, Thai, and Vietnamese',
};

const MODEL_DETAILS: Record<string, LocalizedModelDetails> = {
  'whisper-base': {
    zh: {
      capabilities: WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['快速验证与短音频', '低配设备'],
      limitations: ['精度有限，中文与长音频弱于大模型', '无词级时间戳'],
    },
    en: {
      capabilities: WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Quick checks and short audio', 'Low-spec machines'],
      limitations: ['Limited accuracy, weaker than larger models on Chinese and long audio', 'No word-level timestamps'],
    },
  },
  'whisper-small': {
    zh: {
      capabilities: WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['日常转写', '中英通用内容'],
      limitations: ['精度弱于 Medium / Large', '无词级时间戳'],
    },
    en: {
      capabilities: WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Daily transcription', 'Chinese and English content'],
      limitations: ['Less accurate than Medium / Large', 'No word-level timestamps'],
    },
  },
  'whisper-medium': {
    zh: {
      capabilities: WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['较高精度需求', '长音频'],
      limitations: ['体积较大（约 3 GB）', 'CPU 上较慢', '无词级时间戳'],
    },
    en: {
      capabilities: WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Higher accuracy needs', 'Long audio'],
      limitations: ['Larger download (about 3 GB)', 'Slow on CPU', 'No word-level timestamps'],
    },
  },
  'whisper-large-v3': {
    zh: {
      capabilities: WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['最高精度', '专业转写与长音频'],
      limitations: ['体积大（约 6.2 GB）', 'CPU 上很慢', '无词级时间戳'],
    },
    en: {
      capabilities: WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Maximum accuracy', 'Professional transcription and long audio'],
      limitations: ['Large download (about 6.2 GB)', 'Very slow on CPU', 'No word-level timestamps'],
    },
  },
  'whisper-large-v3-turbo': {
    zh: {
      capabilities: WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['接近 Large 精度且更快', '长音频与批量任务'],
      limitations: ['精度略低于 Large V3', '无词级时间戳'],
    },
    en: {
      capabilities: WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Near-Large quality at higher speed', 'Long audio and batch jobs'],
      limitations: ['Slightly less accurate than Large V3', 'No word-level timestamps'],
    },
  },
  'faster-whisper-base': {
    zh: {
      capabilities: FASTER_WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['快速验证', '低配设备'],
      limitations: ['精度有限，中文与长音频弱于大模型'],
    },
    en: {
      capabilities: FASTER_WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Quick checks', 'Low-spec machines'],
      limitations: ['Limited accuracy, weaker than larger models on Chinese and long audio'],
    },
  },
  'faster-whisper-small': {
    zh: {
      capabilities: FASTER_WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['日常转写', '速度与效果均衡'],
      limitations: ['长音频精度弱于 Large'],
    },
    en: {
      capabilities: FASTER_WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Daily transcription', 'Balanced speed and quality'],
      limitations: ['Less accurate than Large on long audio'],
    },
  },
  'faster-whisper-medium': {
    zh: {
      capabilities: FASTER_WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['较高精度需求', '批量转写'],
      limitations: ['CPU 上较慢'],
    },
    en: {
      capabilities: FASTER_WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Higher accuracy needs', 'Batch transcription'],
      limitations: ['Slow on CPU'],
    },
  },
  'faster-whisper-large-v3': {
    zh: {
      capabilities: FASTER_WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['高精度长音频', '批量任务'],
      limitations: ['体积大（约 3.1 GB）', '内存占用较高'],
    },
    en: {
      capabilities: FASTER_WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['High-accuracy long audio', 'Batch jobs'],
      limitations: ['Large download (about 3.1 GB)', 'Higher memory usage'],
    },
  },
  'faster-whisper-large-v3-turbo': {
    zh: {
      capabilities: FASTER_WHISPER_CAPABILITIES.zh,
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['速度优先', '接近 Large 精度'],
      limitations: ['精度略低于 Large V3'],
    },
    en: {
      capabilities: FASTER_WHISPER_CAPABILITIES.en,
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Speed first', 'Near-Large quality'],
      limitations: ['Slightly less accurate than Large V3'],
    },
  },
  'qwen3-asr-0.6b': {
    zh: {
      capabilities: ['多语言识别（中文与粤语较强）', '自动语言检测'],
      languages: QWEN3_ASR_LANGUAGES.zh,
      bestFor: ['中文与粤语内容', '不需要时间轴的场景'],
      limitations: ['无段级与词级时间戳', '依赖较新的 transformers'],
    },
    en: {
      capabilities: ['Multilingual recognition (strong on Chinese and Cantonese)', 'Automatic language detection'],
      languages: QWEN3_ASR_LANGUAGES.en,
      bestFor: ['Chinese and Cantonese audio', 'Scenarios that do not need timestamps'],
      limitations: ['No segment or word-level timestamps', 'Requires newer transformers dependencies'],
    },
  },
  'qwen3-asr-1.7b': {
    zh: {
      capabilities: ['多语言识别（中文与粤语较强）', '自动语言检测'],
      languages: QWEN3_ASR_LANGUAGES.zh,
      bestFor: ['中文与粤语内容', '更高精度需求'],
      limitations: ['无段级与词级时间戳', '体积较大（约 3.9 GB）', '依赖较新的 transformers'],
    },
    en: {
      capabilities: ['Multilingual recognition (strong on Chinese and Cantonese)', 'Automatic language detection'],
      languages: QWEN3_ASR_LANGUAGES.en,
      bestFor: ['Chinese and Cantonese audio', 'Higher accuracy needs'],
      limitations: ['No segment or word-level timestamps', 'Larger download (about 3.9 GB)', 'Requires newer transformers dependencies'],
    },
  },
  'moss-transcribe-diarize': {
    zh: {
      capabilities: ['端到端转写 + 说话人分离（单次完成）', '输出 [S01]/[S02] 说话人标签', '段级时间戳', '多语言识别', '自动语言检测'],
      languages: '50+ 种语言，含中、英、日、韩、法、德、西、葡、意、俄、泰、越等',
      bestFor: ['多人会议、访谈、播客', '需要区分说话人的转写', '单次最长约 90 分钟的音频'],
      limitations: ['无词级时间戳', '不支持流式', 'CPU 上处理长音频较慢', '单次最长约 90 分钟'],
    },
    en: {
      capabilities: ['End-to-end transcription + speaker diarization in one pass', 'Emits [S01]/[S02] speaker labels', 'Segment timestamps', 'Multilingual recognition', 'Automatic language detection'],
      languages: '50+ languages, including Chinese, English, Japanese, Korean, French, German, Spanish, Portuguese, Italian, Russian, Thai, and Vietnamese',
      bestFor: ['Multi-speaker meetings, interviews, and podcasts', 'Transcription that needs speaker attribution', 'Audio up to about 90 minutes per run'],
      limitations: ['No word-level timestamps', 'No streaming', 'Slow on CPU for long audio', 'Up to about 90 minutes of audio per run'],
    },
  },
  'mlx-whisper-turbo': {
    zh: {
      capabilities: [...FASTER_WHISPER_CAPABILITIES.zh, 'Apple Silicon 原生加速'],
      languages: WHISPER_LANGUAGES.zh,
      bestFor: ['Apple Silicon 设备', '速度优先的日常与长音频'],
      limitations: ['仅支持 Apple Silicon（macOS）'],
    },
    en: {
      capabilities: [...FASTER_WHISPER_CAPABILITIES.en, 'Native Apple Silicon acceleration'],
      languages: WHISPER_LANGUAGES.en,
      bestFor: ['Apple Silicon machines', 'Speed-first daily and long audio'],
      limitations: ['Apple Silicon (macOS) only'],
    },
  },
  'sensevoice-small': {
    zh: {
      capabilities: ['段级时间戳', '词级时间戳', '中英混合识别', '自动语言检测'],
      languages: '自动检测 + 中（含粤语）、英、日、韩',
      bestFor: ['中文及中英混合内容', '快速本地转写'],
      limitations: ['语言覆盖较少（中、英、日、韩、粤语）', '依赖 FunASR 运行时'],
    },
    en: {
      capabilities: ['Segment timestamps', 'Word-level timestamps', 'Mixed Chinese-English recognition', 'Automatic language detection'],
      languages: 'Auto-detect plus Chinese (including Cantonese), English, Japanese, and Korean',
      bestFor: ['Chinese and mixed Chinese-English audio', 'Fast local transcription'],
      limitations: ['Limited language coverage (Chinese, English, Japanese, Korean, Cantonese)', 'Requires the FunASR runtime'],
    },
  },
};

export function modelDetails(model: ModelStatus, locale: Locale): ModelDetails {
  const zh = locale === 'zh';
  const entry = MODEL_DETAILS[model.model_name];
  if (entry) return zh ? entry.zh : entry.en;
  const capabilities = [
    model.supports_timestamps ? (zh ? '段级时间戳' : 'Segment timestamps') : null,
    model.supports_word_timestamps ? (zh ? '词级时间戳' : 'Word-level timestamps') : null,
    model.supports_diarization ? (zh ? '说话人分离' : 'Speaker diarization') : null,
    model.supports_streaming ? (zh ? '流式识别' : 'Streaming') : null,
  ].filter((item): item is string => Boolean(item));
  return {
    capabilities,
    languages: model.languages.join(', '),
    bestFor: [modelBestFor(model, locale)],
    limitations: [],
  };
}
