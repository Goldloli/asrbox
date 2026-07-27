export type ShortcutAction = 'newTranscription' | 'globalSearch' | 'settings' | 'commandPalette';

export type ShortcutMap = Record<ShortcutAction, string>;

export const defaultShortcuts: ShortcutMap = {
  newTranscription: 'mod+n',
  globalSearch: 'mod+f',
  settings: 'mod+,',
  commandPalette: 'mod+k',
};

export function normalizeShortcut(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('cmd', 'mod')
    .replace('command', 'mod')
    .replace('ctrl', 'mod');
}

export function isEditableShortcutEvent(event: KeyboardEvent) {
  if (event.isComposing) return true;
  const target = event.target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  } | null;
  if (!target) return false;
  const tagName = target.tagName?.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.('[contenteditable="true"]'));
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = normalizeShortcut(shortcut).split('+').filter(Boolean);
  const key = parts.at(-1);
  if (!key) return false;
  if (parts.includes('mod') && !event.metaKey && !event.ctrlKey) return false;
  if (parts.includes('shift') && !event.shiftKey) return false;
  if (parts.includes('alt') && !event.altKey) return false;
  return event.key.toLowerCase() === key;
}

export function formatShortcut(shortcut: string) {
  return normalizeShortcut(shortcut);
}
