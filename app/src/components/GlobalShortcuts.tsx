import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { matchesShortcut } from '../lib/shortcuts';
import { useUiStore } from '../stores/uiStore';

export const openGlobalSearchEvent = 'asrbox:open-global-search';

export function GlobalShortcuts() {
  const navigate = useNavigate();
  const shortcuts = useUiStore((state) => state.shortcuts);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, shortcuts.newTranscription)) {
        event.preventDefault();
        navigate({ to: '/' });
        return;
      }

      if (matchesShortcut(event, shortcuts.globalSearch)) {
        event.preventDefault();
        window.dispatchEvent(new Event(openGlobalSearchEvent));
        return;
      }

      if (matchesShortcut(event, shortcuts.settings)) {
        event.preventDefault();
        navigate({ to: '/settings' });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [navigate, shortcuts]);

  return null;
}
