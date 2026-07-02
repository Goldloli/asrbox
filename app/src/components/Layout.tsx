import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

