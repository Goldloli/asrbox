import { Outlet } from '@tanstack/react-router';
import { AppShell } from './AppShell';

export function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
