import { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import { TooltipProvider } from './components/weiui';
import { useAppEvents } from './lib/useAppEvents';
import { useUiStore } from './stores/uiStore';

const queryClient = new QueryClient();

function AppRuntime() {
  useAppEvents();
  return <RouterProvider router={router} />;
}

function ThemeRuntime() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
    };

    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [theme]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeRuntime />
        <AppRuntime />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
