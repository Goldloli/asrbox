import { lazy, Suspense, type ComponentType } from 'react';
import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { Layout } from './components/Layout';
import { LoadingState } from './components/weiui';

const TranscribePage = lazy(() => import('./routes/TranscribePage').then((module) => ({ default: module.TranscribePage })));
const TasksPage = lazy(() => import('./routes/TasksPage').then((module) => ({ default: module.TasksPage })));
const AIPage = lazy(() => import('./routes/AIPage').then((module) => ({ default: module.AIPage })));
const ModelsPage = lazy(() => import('./routes/ModelsPage').then((module) => ({ default: module.ModelsPage })));
const SettingsPage = lazy(() => import('./routes/SettingsPage').then((module) => ({ default: module.SettingsPage })));

function withSuspense(Component: ComponentType) {
  return function RouteComponent() {
    return (
      <Suspense fallback={<LoadingState label="Loading" />}>
        <Component />
      </Suspense>
    );
  };
}

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: withSuspense(TranscribePage),
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: withSuspense(TasksPage),
});

const aiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ai',
  validateSearch: (search: Record<string, unknown>): { task?: string; mode?: 'translation' | 'chat'; run?: string } => ({
    ...(typeof search.task === 'string' ? { task: search.task } : {}),
    ...(search.mode === 'translation' ? { mode: 'translation' as const } : {}),
    ...(search.mode === 'chat' ? { mode: 'chat' as const } : {}),
    ...(typeof search.run === 'string' && search.mode === 'translation' ? { run: search.run } : {}),
  }),
  component: withSuspense(AIPage),
});

const modelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/models',
  component: withSuspense(ModelsPage),
});

const providersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/providers',
  beforeLoad: () => {
    throw redirect({ to: '/settings', search: { tab: 'providers' } });
  },
});

const exportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exports',
  beforeLoad: () => {
    throw redirect({ to: '/tasks' });
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: withSuspense(SettingsPage),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  tasksRoute,
  aiRoute,
  modelsRoute,
  providersRoute,
  exportsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
