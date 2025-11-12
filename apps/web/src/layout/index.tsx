import NiceModal from '@ebay/nice-modal-react';
import { SafeArea } from "antd-mobile";
import { Outlet } from "react-router-dom";

import { Tabbar } from "./tabbar";
import { useGlobalWordInteraction } from "../hooks/useGlobalWordInteraction";

const Layout = () => {

  // 启用全局单词交互功能
  useGlobalWordInteraction({
    enableClick: true,
    enableTextSelection: true,
  });

  return (
    <NiceModal.Provider>
      <SafeArea position='top' />
      <Outlet />
      <Tabbar />
    </NiceModal.Provider >
  );
};

export default Layout;
