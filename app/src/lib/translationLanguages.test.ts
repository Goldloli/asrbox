import { describe, expect, test } from 'bun:test';
import { languageLabel, sameTranslationLanguage, validTranslationLanguage } from './translationLanguages';

describe('translation languages', () => {
  test('auto is source-only, script variants stay distinct', () => {
    expect(validTranslationLanguage({ kind: 'auto' })).toBe(true);
    expect(validTranslationLanguage({ kind: 'auto' }, true)).toBe(false);
    expect(sameTranslationLanguage({ kind: 'preset', code: 'zh-Hans' }, { kind: 'preset', code: 'zh-Hant' })).toBe(false);
    expect(sameTranslationLanguage({ kind: 'preset', code: 'ja' }, { kind: 'preset', code: 'ja' })).toBe(true);
    expect(languageLabel({ kind: 'preset', code: 'fr' }, 'en')).toBe('French');
  });
  test('custom names count Unicode code points and reject controls', () => {
    expect(validTranslationLanguage({ kind: 'custom', name: '𠮷'.repeat(80) })).toBe(true);
    expect(validTranslationLanguage({ kind: 'custom', name: '𠮷'.repeat(81) })).toBe(false);
    expect(validTranslationLanguage({ kind: 'custom', name: 'a\nb' })).toBe(false);
    expect(validTranslationLanguage({ kind: 'custom', name: '  ' })).toBe(false);
    expect(validTranslationLanguage({ kind: 'preset', code: 'no-such-code' })).toBe(false);
    expect(sameTranslationLanguage({ kind: 'custom', name: ' Esperanto ' }, { kind: 'custom', name: 'esperanto' })).toBe(true);
  });
});
