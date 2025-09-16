import { AiFillOpenAI, AiOutlineBook, AiOutlineUser } from "react-icons/ai";
import { Link, useLocation } from "react-router-dom";

import styles from "./index.module.less";

const tabs = [
  {
    Icon: AiOutlineBook,
    label: "背单词",
    path: "/words",
  },
  // {
  //   Icon: AiOutlineRead,
  //   label: "阅读",
  //   path: "/reading",
  // },
  {
    Icon: AiFillOpenAI,
    label: "AI",
    path: "/ai",
  },
  {
    Icon: AiOutlineUser,
    label: "我的",
    path: "/me",
  },
];

export const Tabbar = () => {
  const location = useLocation();

  // 检查当前路径是否匹配任何一个tab路径
  const shouldShowTabbar = tabs.some(tab => location.pathname.startsWith(tab.path));

  if (!shouldShowTabbar) {
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
