import type { ModelStatus } from './api';
import type { Locale } from '../stores/uiStore';

export type ModelCategory = 'recommended' | 'whisper' | 'faster' | 'apple' | 'chinese';

export function modelCategory(model: ModelStatus): Exclude<ModelCategory, 'recommended'> {
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
  if (model.model_name.startsWith('qwen3-asr')) return zh ? '中文能力强但依赖较新，适合愿意调环境的用户。' : 'Strong Chinese ASR, but needs newer dependencies.';
  if (model.engine === 'faster_whisper') return zh ? 'CTranslate2 运行，通常比标准 Whisper 更省资源。' : 'CTranslate2 runtime, usually lighter than standard Whisper.';
  if (model.engine === 'whisper_transformers') return zh ? '标准 Whisper 系列，兼容稳定，越大越准也越占资源。' : 'Standard Whisper family, stable compatibility, larger means heavier.';
  return zh ? '通用转写模型，请按语言和运行时选择。' : 'General transcription model. Choose by language and runtime.';
}

export function modelBestFor(model: ModelStatus, locale: Locale) {
  const zh = locale === 'zh';
  if (model.model_name.includes('large')) return zh ? '高精度、长音频' : 'high accuracy, long audio';
  if (model.model_name.includes('turbo')) return zh ? '速度优先' : 'speed first';
  if (model.engine === 'mlx_whisper') return zh ? 'Apple Silicon' : 'Apple Silicon';
  if (model.engine === 'funasr' || model.model_name.startsWith('qwen3-asr')) return zh ? '中文内容' : 'Chinese audio';
  if (model.model_size === 'base' || model.model_size === 'small') return zh ? '日常使用' : 'daily use';
  return zh ? '通用场景' : 'general use';
}
