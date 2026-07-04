import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import { TooltipProvider } from './components/weiui';
import { useAppEvents } from './lib/useAppEvents';

const queryClient = new QueryClient();

function AppRuntime() {
  useAppEvents();
  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppRuntime />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
