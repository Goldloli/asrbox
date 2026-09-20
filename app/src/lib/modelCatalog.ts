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
  if (model.model_name === 'sensevoice-small') return zh ? '中文和中英混合场景友好，依赖 FunASR；时间轴为近似值。' : 'Good for Chinese and mixed Chinese-English audio, requires FunASR; timeline is approximate.';
  if (model.model_name === 'paraformer-zh') return zh ? '中文转写带原生字级时间戳，FunASR 生态成熟，适合中文字幕。' : 'Chinese ASR with native per-char timestamps on the mature FunASR stack; good for Chinese subtitles.';
  if (model.model_name === 'fun-asr-nano') return zh ? '通义 2025 新模型，多语种（含方言），依赖 FunASR；时间轴为近似值。' : 'Tongyi 2025 multilingual model (dialect-friendly) on FunASR; timeline is approximate.';
  if (model.model_name === 'faster-whisper-distil-large-v3') return zh ? '英文专用，速度约为 Large V3 的两倍、精度接近，适合英文批量转写。' : 'English-only at about twice the speed of Large V3 with near-Large quality; great for English batch jobs.';
  if (model.model_name === 'moss-transcribe-diarize') return zh
    ? '端到端转写 + 说话人分离一次完成，输出 [S01]/[S02] 标签；INTERSPEECH 2026 MLC-SLM 冠军模型，Apache 2.0。'
    : 'End-to-end transcription with speaker diarization in one pass, emitting [S01]/[S02] labels. INTERSPEECH 2026 MLC-SLM winner, Apache 2.0.';
  if (model.model_name.startsWith('qwen3-asr')) return zh ? '中文能力强但依赖较新，适合愿意调环境的用户；时间轴为近似值。' : 'Strong Chinese ASR, but needs newer dependencies; timeline is approximate.';
  if (model.engine === 'faster_whisper') return zh ? 'CTranslate2 运行，通常比标准 Whisper 更省资源。' : 'CTranslate2 runtime, usually lighter than standard Whisper.';
  if (model.engine === 'whisper_transformers') return zh ? '标准 Whisper 系列，兼容稳定，越大越准也越占资源。' : 'Standard Whisper family, stable compatibility, larger means heavier.';
  return zh ? '通用转写模型，请按语言和运行时选择。' : 'General transcription model. Choose by language and runtime.';
}

export type Tier = 'S' | 'A' | 'B' | 'C';

export interface ModelLadderEntry {
  speed: Tier;
  accuracy: Tier;
  languages: Tier;
}

export interface ModelLadderResult extends ModelLadderEntry {
  estimated: boolean;
}

// Grading rules, from the 2026-09-10 Windows + RTX 5080 + CUDA-kit measurement run
// (90-second Chinese clip, character agreement with large-v3):
//   speed:    S <=16s, A <=20s, B <=26s, C >26s
//   accuracy: S <=5%, A <=10%, B <=20%, C >20% (CER agreement with large-v3)
//   language coverage: whisper family and MOSS (50+ languages) S, qwen3-asr (13) A,
//   sensevoice (5) B.
// Phase-1 additions graded from the 2026-09-19 macOS Apple Silicon CPU run
// (90-second clips, agreement vs faster-whisper-large-v3-turbo; evidence:
// backend/real_tests/results/asrbox-real-video-benchmark-20260919*.md):
//   paraformer-zh 10.5s/8.3% CER (zh), fun-asr-nano 27.5s/6.8% CER (zh),
//   distil-large-v3 14.1s/4.8% WER on its English domain (18:05 real video).
export const MODEL_LADDER: Record<string, ModelLadderEntry> = {
  'sensevoice-small': { speed: 'S', accuracy: 'A', languages: 'B' }, // 15.3s, 8.4%
  'paraformer-zh': { speed: 'S', accuracy: 'A', languages: 'B' }, // 10.5s, 8.3% CER, timestamped
  'fun-asr-nano': { speed: 'C', accuracy: 'A', languages: 'B' }, // 27.5s, 6.8% CER
  'faster-whisper-distil-large-v3': { speed: 'S', accuracy: 'S', languages: 'B' }, // 14.1s, 2.9-4.8% WER (English domain)
  'faster-whisper-base': { speed: 'S', accuracy: 'C', languages: 'S' }, // 15.3s, 38.7%
  'whisper-base': { speed: 'A', accuracy: 'C', languages: 'S' }, // 18.4s, 40.2%
  'whisper-large-v3-turbo': { speed: 'A', accuracy: 'A', languages: 'S' }, // 18.4s, 7.4%
  'faster-whisper-small': { speed: 'A', accuracy: 'C', languages: 'S' }, // 18.4s, 24.8%
  'faster-whisper-large-v3-turbo': { speed: 'A', accuracy: 'A', languages: 'S' }, // 18.4s, 6.7%
  'qwen3-asr-0.6b': { speed: 'B', accuracy: 'A', languages: 'A' }, // 21.4s, 8.8%
  'whisper-small': { speed: 'B', accuracy: 'C', languages: 'S' }, // 21.5s, 28.4%
  'faster-whisper-medium': { speed: 'B', accuracy: 'C', languages: 'S' }, // 21.5s, 25.3%
  'qwen3-asr-1.7b': { speed: 'B', accuracy: 'A', languages: 'A' }, // 24.5s, 8.2%
  'whisper-medium': { speed: 'C', accuracy: 'B', languages: 'S' }, // 27.6s, 11.4%
  'faster-whisper-large-v3': { speed: 'C', accuracy: 'S', languages: 'S' }, // 27.6s, 0% (baseline)
  'moss-transcribe-diarize': { speed: 'C', accuracy: 'A', languages: 'S' }, // 27.6s, 8.4%
  'whisper-large-v3': { speed: 'C', accuracy: 'S', languages: 'S' }, // 30.7s, 2.1%
};

export function modelLadder(model: ModelStatus): ModelLadderResult {
  if (model.model_name === 'mlx-whisper-turbo') {
    // Not measurable on the Windows reference machine; same architecture as
    // faster-whisper-large-v3-turbo, so its grades are reused as an estimate.
    return { ...MODEL_LADDER['faster-whisper-large-v3-turbo'], estimated: true };
  }
  const entry = MODEL_LADDER[model.model_name];
  if (entry) return { ...entry, estimated: false };
  return estimateModelLadder(model);
}

function estimateModelLadder(model: ModelStatus): ModelLadderResult {
  const size = model.model_size.toLowerCase();
  const sizeSpeed = size.includes('tiny') ? 95 : size.includes('base') ? 86 : size.includes('small') ? 74 : size.includes('medium') ? 58 : 42;
  const runtimeBoost = model.runtime.toLowerCase().includes('mlx') || model.engine.toLowerCase().includes('faster') ? 10 : 0;
  const speedScore = Math.min(98, sizeSpeed + runtimeBoost);
  const speed: Tier = speedScore >= 90 ? 'S' : speedScore >= 80 ? 'A' : speedScore >= 65 ? 'B' : 'C';
  const sizeAccuracy = size.includes('large') ? 92 : size.includes('medium') ? 78 : size.includes('small') ? 64 : 52;
  const accuracyScore = Math.min(98, sizeAccuracy + (model.supports_word_timestamps ? 3 : 0) + (model.supports_diarization ? 3 : 0));
  const accuracy: Tier = accuracyScore >= 90 ? 'S' : accuracyScore >= 75 ? 'A' : accuracyScore >= 60 ? 'B' : 'C';
  const languages: Tier = model.engine === 'funasr'
    ? 'B'
    : model.engine === 'qwen3_asr' || model.model_name.startsWith('qwen3-asr')
      ? 'A'
      : model.languages.length >= 40
        ? 'S'
        : model.languages.length >= 10
          ? 'A'
          : 'B';
  return { speed, accuracy, languages, estimated: true };
}

export function isApproximateTimelineModel(modelName: string | null | undefined) {
  // Mirrors the registry's supports_timestamps=False local models: their cue times
  // are spread across each chunk's audio window instead of measured.
  return Boolean(modelName) && (modelName!.startsWith('qwen3-asr') || modelName === 'sensevoice-small' || modelName === 'fun-asr-nano');
}

export function modelBestFor(model: ModelStatus, locale: Locale) {
  const zh = locale === 'zh';
  if (model.model_name === 'moss-transcribe-diarize') return zh ? '多人会议、说话人区分' : 'meetings, speaker separation';
  if (model.model_name.includes('distil')) return zh ? '英文快速转写' : 'fast English transcription';
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
      limitations: ['时间轴为近似值：模型不输出时间戳，字幕时间按音频均摊', '依赖较新的 transformers'],
    },
    en: {
      capabilities: ['Multilingual recognition (strong on Chinese and Cantonese)', 'Automatic language detection'],
      languages: QWEN3_ASR_LANGUAGES.en,
      bestFor: ['Chinese and Cantonese audio', 'Scenarios that do not need timestamps'],
      limitations: ['Approximate timeline: the model emits no timestamps, so cue times are spread across the audio', 'Requires newer transformers dependencies'],
    },
  },
  'qwen3-asr-1.7b': {
    zh: {
      capabilities: ['多语言识别（中文与粤语较强）', '自动语言检测'],
      languages: QWEN3_ASR_LANGUAGES.zh,
      bestFor: ['中文与粤语内容', '更高精度需求'],
      limitations: ['时间轴为近似值：模型不输出时间戳，字幕时间按音频均摊', '体积较大（约 3.9 GB）', '依赖较新的 transformers'],
    },
    en: {
      capabilities: ['Multilingual recognition (strong on Chinese and Cantonese)', 'Automatic language detection'],
      languages: QWEN3_ASR_LANGUAGES.en,
      bestFor: ['Chinese and Cantonese audio', 'Higher accuracy needs'],
      limitations: ['Approximate timeline: the model emits no timestamps, so cue times are spread across the audio', 'Larger download (about 3.9 GB)', 'Requires newer transformers dependencies'],
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
      capabilities: ['中英混合识别', '自动语言检测'],
      languages: '自动检测 + 中（含粤语）、英、日、韩',
      bestFor: ['中文及中英混合内容', '快速本地转写'],
      limitations: ['时间轴为近似值：模型不输出时间戳，字幕时间按音频均摊', '语言覆盖较少（中、英、日、韩、粤语）', '依赖 FunASR 运行时'],
    },
    en: {
      capabilities: ['Mixed Chinese-English recognition', 'Automatic language detection'],
      languages: 'Auto-detect plus Chinese (including Cantonese), English, Japanese, and Korean',
      bestFor: ['Chinese and mixed Chinese-English audio', 'Fast local transcription'],
      limitations: ['Approximate timeline: the model emits no timestamps, so cue times are spread across the audio', 'Limited language coverage (Chinese, English, Japanese, Korean, Cantonese)', 'Requires the FunASR runtime'],
    },
  },
  'paraformer-zh': {
    zh: {
      capabilities: ['段级时间戳（由原生字级时间戳聚合）', '中文与英文识别'],
      languages: '中文、英文',
      bestFor: ['需要精确时间轴的中文字幕', '长音频（默认启用 VAD 切分）'],
      limitations: ['无词级时间戳', '标点依赖后处理，原始输出无标点', '依赖 FunASR 运行时'],
    },
    en: {
      capabilities: ['Segment timestamps (aggregated from native per-char timestamps)', 'Chinese and English recognition'],
      languages: 'Chinese and English',
      bestFor: ['Chinese subtitles that need a measured timeline', 'Long audio (VAD segmentation enabled by default)'],
      limitations: ['No word-level timestamps', 'Raw output has no punctuation; punctuation relies on post-processing', 'Requires the FunASR runtime'],
    },
  },
  'fun-asr-nano': {
    zh: {
      capabilities: ['多语言识别（含中文方言）'],
      languages: '中（含方言）、英、日、韩、粤语',
      bestFor: ['中文方言与多语种内容', '2025 通义新架构'],
      limitations: ['时间轴为近似值：模型不输出时间戳，字幕时间按音频均摊', '体积较大（约 2 GB）', '依赖 FunASR 运行时'],
    },
    en: {
      capabilities: ['Multilingual recognition (including Chinese dialects)'],
      languages: 'Chinese (with dialects), English, Japanese, Korean, and Cantonese',
      bestFor: ['Chinese dialects and multilingual audio', '2025 Tongyi architecture'],
      limitations: ['Approximate timeline: the model emits no timestamps, so cue times are spread across the audio', 'Larger download (about 2 GB)', 'Requires the FunASR runtime'],
    },
  },
  'faster-whisper-distil-large-v3': {
    zh: {
      capabilities: ['段级时间戳', '词级时间戳', '英文识别'],
      languages: '仅英文',
      bestFor: ['英文批量与长音频转写', '速度优先（约为 Large V3 两倍）'],
      limitations: ['仅支持英文，不能用于中文等其它语言', '精度略低于 Large V3'],
    },
    en: {
      capabilities: ['Segment timestamps', 'Word-level timestamps', 'English recognition'],
      languages: 'English only',
      bestFor: ['English batch and long-audio transcription', 'Speed first (about twice as fast as Large V3)'],
      limitations: ['English only; not usable for Chinese or other languages', 'Slightly less accurate than Large V3'],
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
