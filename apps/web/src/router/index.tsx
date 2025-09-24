import { createBrowserRouter } from 'react-router-dom';

import { AuthGuard } from './AuthGuard';
import { routes } from './Routes';

// 根据 meta.requireAuth 包裹 AuthGuard
const finalRoutes = routes.map(route => {
  if (route.meta?.requireAuth) {
    return {
      ...route,
      element: <AuthGuard>{route.element}</AuthGuard>
    };
  }
  return route;
});

export const router = createBrowserRouter(finalRoutes);

export default router;
