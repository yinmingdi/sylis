import React from 'react';
import { AiOutlineRobot } from 'react-icons/ai';

import styles from './index.module.less';

export interface UserAvatarProps {
  /** 用户名或昵称 */
  name?: string;
  /** 头像URL */
  avatar?: string;
  /** 头像大小 */
  size?: number;
  /** 是否为AI头像 */
  isAI?: boolean;
  /** 自定义样式类名 */
  className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  name = '用户',
  avatar,
  size = 32,
  isAI = false,
  className = '',
}) => {
  // 获取用户名首字母
  const getInitial = (name: string) => {
    if (!name || name.trim() === '') return '?';
    return name.trim().charAt(0).toUpperCase();
  };

  // AI头像
  if (isAI) {
    return (
      <div
        className={`${styles.avatar} ${styles.aiAvatar} ${className}`}
        style={{ width: size, height: size }}
      >
        <AiOutlineRobot size={size * 0.6} />
      </div>
    );
  }

  // 用户头像
  if (avatar) {
    return (
      <div
        className={`${styles.avatar} ${styles.imageAvatar} ${className}`}
        style={{ width: size, height: size }}
      >
        <img src={avatar} alt={name} />
      </div>
    );
  }

  // 默认文字头像
  return (
    <div
      className={`${styles.avatar} ${styles.textAvatar} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {getInitial(name)}
    </div>
  );
};

export default UserAvatar;
