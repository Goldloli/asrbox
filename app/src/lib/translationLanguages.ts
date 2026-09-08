import type { TranslationLanguage } from './api';

export const translationLanguages = [
  ['zh-Hans', '简体中文', 'Simplified Chinese'], ['zh-Hant', '繁體中文', 'Traditional Chinese'],
  ['en', '英语 · English', 'English'], ['ja', '日语 · 日本語', 'Japanese'], ['ko', '韩语 · 한국어', 'Korean'],
  ['fr', '法语 · Français', 'French'], ['de', '德语 · Deutsch', 'German'], ['es', '西班牙语 · Español', 'Spanish'],
  ['pt', '葡萄牙语 · Português', 'Portuguese'], ['ru', '俄语 · Русский', 'Russian'], ['ar', '阿拉伯语 · العربية', 'Arabic'],
  ['hi', '印地语 · हिन्दी', 'Hindi'], ['th', '泰语 · ไทย', 'Thai'], ['vi', '越南语 · Tiếng Việt', 'Vietnamese'],
] as const;

export function validTranslationLanguage(value: TranslationLanguage, target = false): boolean {
  if (value.kind === 'auto') return !target;
  if (value.kind === 'preset') return translationLanguages.some(([code]) => code === value.code);
  const name = value.name.trim();
  return [...name].length >= 1 && [...name].length <= 80 && !/\p{C}/u.test(value.name);
}

export function sameTranslationLanguage(source: TranslationLanguage, target: TranslationLanguage): boolean {
  if (source.kind === 'auto' || source.kind !== target.kind) return false;
  if (source.kind === 'preset' && target.kind === 'preset') return source.code === target.code;
  return source.kind === 'custom' && target.kind === 'custom'
    && source.name.trim().normalize('NFKC').toLocaleLowerCase() === target.name.trim().normalize('NFKC').toLocaleLowerCase();
}

export function languageLabel(value: TranslationLanguage, locale: 'en' | 'zh') {
  if (value.kind === 'auto') return locale === 'zh' ? '自动（含混合语言）' : 'Auto (including mixed languages)';
  if (value.kind === 'custom') return value.name;
  return translationLanguages.find(([code]) => code === value.code)?.[locale === 'zh' ? 1 : 2] ?? value.code;
}
