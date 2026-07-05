import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const openGlobalSearchEvent = 'asrbox:open-global-search';

export function GlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        navigate({ to: '/' });
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        window.dispatchEvent(new Event(openGlobalSearchEvent));
        return;
      }

      if (event.key === ',') {
        event.preventDefault();
        navigate({ to: '/settings' });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [navigate]);

  return null;
}
