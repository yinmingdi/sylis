import { SafeArea } from "antd-mobile";
import { Outlet, useLocation } from "react-router-dom";

import { Tabbar } from "./tabbar";
import { shouldShowTabbar } from "./tabbar/config";

const Layout = () => {
  const location = useLocation();

  return (
    <div>
      <SafeArea position='top' />
      <div style={{ paddingBottom: shouldShowTabbar(location.pathname) ? '68px' : '0' }}>
        <Outlet />
      </div>
      <Tabbar />
    </div >
  );
};

export default Layout;
