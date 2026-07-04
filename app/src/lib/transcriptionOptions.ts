import type { Locale } from '../stores/uiStore';
import type { TranscriptionTask } from './api';

export type TranscriptionLanguage = 'zh-Hans' | 'en' | 'zh-Hant' | 'mixed' | 'auto';

const languageLabels: Record<Locale, Record<TranscriptionLanguage, string>> = {
  zh: {
    'zh-Hans': '中文简体',
    en: '英文',
    'zh-Hant': '中文繁体',
    mixed: '中英混合',
    auto: '自动识别',
  },
  en: {
    'zh-Hans': 'Chinese Simplified',
    en: 'English',
    'zh-Hant': 'Chinese Traditional',
    mixed: 'Chinese + English',
    auto: 'Auto detect',
  },
};

export function languageOptions(locale: Locale) {
  return (['zh-Hans', 'en', 'zh-Hant', 'mixed', 'auto'] as TranscriptionLanguage[]).map((value) => ({
    value,
    label: languageLabels[locale][value],
  }));
}

export function normalizeLanguageValue(value?: string | null): TranscriptionLanguage {
  if (value === 'en') return 'en';
  if (value === 'zh-Hant' || value === 'zh-TW' || value === 'traditional') return 'zh-Hant';
  if (value === 'mixed') return 'mixed';
  if (value === 'auto') return 'auto';
  return 'zh-Hans';
}

export function languageLabel(value: string | null | undefined, locale: Locale) {
  return languageLabels[locale][normalizeLanguageValue(value)];
}

export function backendLanguage(value: TranscriptionLanguage): string {
  if (value === 'en') return 'en';
  if (value === 'auto' || value === 'mixed') return 'auto';
  return 'zh';
}

export function postprocessOptions(value: TranscriptionLanguage) {
  return {
    postprocessMode: 'safe',
    traditionalToSimplified: value === 'zh-Hans',
  };
}

export function getTaskOutputFormats(task?: TranscriptionTask, fallback: string[] = ['txt', 'srt']) {
  const value = task?.options?.output_formats;
  if (Array.isArray(value) && value.length > 0) return value.map(String);
  return fallback;
}
