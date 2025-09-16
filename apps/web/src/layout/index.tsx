import { SafeArea } from "antd-mobile";
import { Outlet } from "react-router-dom";

import { Tabbar } from "./tabbar";

const Layout = () => {
  return (
    <div>
      <SafeArea position='top' />
      <Outlet />
      <Tabbar />
    </div >
  );
};

export default Layout;
