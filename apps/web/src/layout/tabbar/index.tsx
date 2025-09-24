import { Link, useLocation } from "react-router-dom";

import { tabs, shouldShowTabbar } from "./config";
import styles from "./index.module.less";

export const Tabbar = () => {
  const location = useLocation();

  if (!shouldShowTabbar(location.pathname)) {
    return null;
  }

  return (
    <div className={styles.tabbar}>
      {tabs.map((Tab) => {
        const isActive = location.pathname.startsWith(Tab.path);
        return (
          <Link to={Tab.path} key={Tab.path} className={styles.tab + (isActive ? ' ' + styles.tabActive : '')}>
            <Tab.Icon className={styles.icon} />
            <div>{Tab.label}</div>
          </Link>
        );
      })}
    </div>
  );
};

export default Tabbar;
