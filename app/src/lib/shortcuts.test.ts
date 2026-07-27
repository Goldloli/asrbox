import { describe, expect, test } from 'bun:test';
import { isEditableShortcutEvent } from './shortcuts';

describe('global shortcuts', () => {
  test.each(['INPUT', 'TEXTAREA', 'SELECT'])('ignores %s targets', (tagName: string) => {
    expect(isEditableShortcutEvent({
      isComposing: false,
      target: { tagName, isContentEditable: false },
    } as unknown as KeyboardEvent)).toBe(true);
  });

  test('ignores contenteditable and IME composition', () => {
    expect(isEditableShortcutEvent({
      isComposing: false,
      target: { tagName: 'DIV', isContentEditable: true },
    } as unknown as KeyboardEvent)).toBe(true);
    expect(isEditableShortcutEvent({
      isComposing: true,
      target: { tagName: 'DIV', isContentEditable: false },
    } as unknown as KeyboardEvent)).toBe(true);
  });

  test('keeps ordinary application targets active', () => {
    expect(isEditableShortcutEvent({
      isComposing: false,
      target: { tagName: 'BUTTON', isContentEditable: false },
    } as unknown as KeyboardEvent)).toBe(false);
  });
});
