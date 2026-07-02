import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Layout } from './components/Layout';
import { ExportsPage } from './routes/ExportsPage';
import { ModelsPage } from './routes/ModelsPage';
import { ProvidersPage } from './routes/ProvidersPage';
import { SettingsPage } from './routes/SettingsPage';
import { TasksPage } from './routes/TasksPage';
import { TranscribePage } from './routes/TranscribePage';

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TranscribePage,
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
});

const modelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/models',
  component: ModelsPage,
});

const providersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/providers',
  component: ProvidersPage,
});

const exportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exports',
  component: ExportsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  tasksRoute,
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

