import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { unstableSetRender } from 'antd-mobile'; // Support since version ^5.40.0
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import router from './router';

import './styles/index.less';
import './app/styles/index.css';
import './app/styles/learning-app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

// 临时兼容
unstableSetRender((node, container) => {
  // @ts-expect-error 临时兼容
  container._reactRoot ||= createRoot(container);
  // @ts-expect-error 临时兼容
  const root = container._reactRoot;
  root.render(node);
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.unmount();
  };
});

function App() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  );
}

export default App;
