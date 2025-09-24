import NiceModal from '@ebay/nice-modal-react';
import { unstableSetRender } from 'antd-mobile'; // Support since version ^5.40.0
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import router from './router';

import './styles/index.less';

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
      <NiceModal.Provider>
        <RouterProvider router={router} />
      </NiceModal.Provider>
    </StrictMode>
  );
}

export default App;
