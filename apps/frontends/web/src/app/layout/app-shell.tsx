import { Outlet } from 'react-router-dom';

import { PrimaryNavigation } from './primary-navigation';

export function AppShell() {
  return (
    <div className="app-frame">
      <PrimaryNavigation />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
