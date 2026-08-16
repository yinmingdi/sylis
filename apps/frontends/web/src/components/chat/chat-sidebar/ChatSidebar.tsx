import { Button, Input, Popover, Popup, SearchBar } from 'antd-mobile';
import { useState } from 'react';
import {
  AiOutlineClose,
  AiOutlinePlus,
  AiOutlineEllipsis,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineInbox,
  AiOutlineSetting,
} from 'react-icons/ai';

import type { SessionItemDto } from '@/legacy-dto';

import styles from './index.module.less';

export type SessionItem = SessionItemDto;

export interface ChatSidebarProps {
  visible: boolean;
  onClose: () => void;
  sessions: SessionItem[];
  currentSessionId?: string | null;
  onNewChat: () => void;
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionRename: (sessionId: string, newTitle: string) => void;
  onSessionArchive: (sessionId: string) => void;
  onConfigClick?: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  visible,
  onClose,
  sessions,
  currentSessionId,
  onNewChat,
  onSessionSelect,
  onSessionDelete,
  onSessionRename,
  onSessionArchive,
  onConfigClick,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);

  // 过滤会话
  const filteredSessions = sessions.filter(
    (session) =>
      !session.isArchived &&
      (session.title || '').toLowerCase().includes(searchValue.toLowerCase()),
  );

  // 按时间分组
  const groupedSessions = {
    today: [] as SessionItem[],
    yesterday: [] as SessionItem[],
    thisWeek: [] as SessionItem[],
    thisMonth: [] as SessionItem[],
    older: [] as SessionItem[],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  filteredSessions.forEach((session) => {
    const sessionDate = new Date(session.updatedAt);

    if (sessionDate >= today) {
      groupedSessions.today.push(session);
    } else if (sessionDate >= yesterday) {
      groupedSessions.yesterday.push(session);
    } else if (sessionDate >= thisWeek) {
      groupedSessions.thisWeek.push(session);
    } else if (sessionDate >= thisMonth) {
      groupedSessions.thisMonth.push(session);
    } else {
      groupedSessions.older.push(session);
    }
  });

  const handleRenameStart = (session: SessionItem) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title || '');
  };

  const handleRenameSave = () => {
    if (editingSessionId && editingTitle.trim()) {
      onSessionRename(editingSessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleRenameCancel = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  // 通用 MenuItem 渲染函数
  const renderMenuItem = ({
    leftIcon,
    content,
    moreButton,
    onClick,
    active = false,
    className = '',
  }: {
    leftIcon?: React.ReactNode;
    content: string | React.ReactNode | (() => React.ReactNode);
    moreButton?: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
    className?: string;
  }) => {
    const contentNode = typeof content === 'function' ? content() : content;

    return (
      <div
        className={`${styles.menuItem} ${active ? styles.active : ''} ${className}`}
        onClick={onClick}
      >
        {leftIcon && <div className={styles.leftIcon}>{leftIcon}</div>}
        <div className={styles.content}>
          {typeof contentNode === 'string' ? (
            <div className={styles.title}>{contentNode}</div>
          ) : (
            contentNode
          )}
        </div>
        {moreButton && <div className={styles.rightAction}>{moreButton}</div>}
      </div>
    );
  };

  const renderHistoryActions = (session: SessionItem) => {
    const isPopoverOpen = activePopoverId === session.id;

    return (
      <Popover
        visible={isPopoverOpen}
        content={
          <div
            className={styles.sessionActions}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="small"
              fill="none"
              onClick={(e) => {
                e.stopPropagation();
                setActivePopoverId(null);
                handleRenameStart(session);
              }}
              className={styles.actionButton}
            >
              <AiOutlineEdit />
              <span>重命名</span>
            </Button>
            <Button
              size="small"
              fill="none"
              onClick={(e) => {
                e.stopPropagation();
                setActivePopoverId(null);
                onSessionArchive(session.id);
              }}
              className={styles.actionButton}
            >
              <AiOutlineInbox />
              <span>归档</span>
            </Button>
            <Button
              size="small"
              fill="none"
              onClick={(e) => {
                e.stopPropagation();
                setActivePopoverId(null);
                onSessionDelete(session.id);
              }}
              className={styles.actionButton}
            >
              <AiOutlineDelete />
              <span>删除</span>
            </Button>
            {onConfigClick && (
              <Button
                size="small"
                fill="none"
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePopoverId(null);
                  onConfigClick();
                }}
                className={styles.actionButton}
              >
                <AiOutlineSetting />
                <span>聊天设置</span>
              </Button>
            )}
          </div>
        }
        placement="bottom-end"
        trigger="click"
        onVisibleChange={(visible) => {
          setActivePopoverId(visible ? session.id : null);
        }}
      >
        <Button
          size="small"
          fill="none"
          className={styles.moreButton}
          aria-label={`管理会话：${session.title || '未命名会话'}`}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <AiOutlineEllipsis />
        </Button>
      </Popover>
    );
  };

  const renderHistoryItem = (session: SessionItem) => {
    const isActive = session.id === currentSessionId;
    const isEditing = editingSessionId === session.id;

    if (isEditing) {
      return (
        <div key={session.id} className={styles.menuItem}>
          <Input
            value={editingTitle}
            onChange={setEditingTitle}
            onBlur={handleRenameSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameSave();
              } else if (e.key === 'Escape') {
                handleRenameCancel();
              }
            }}
            autoFocus
            className={styles.editInput}
          />
        </div>
      );
    }

    return (
      <div key={session.id}>
        {renderMenuItem({
          content: session.title || '未命名会话',
          moreButton: renderHistoryActions(session),
          onClick: () => onSessionSelect(session.id),
          active: isActive,
        })}
      </div>
    );
  };

  const renderHistoryGroup = (title: string, sessions: SessionItem[]) => {
    if (sessions.length === 0) return null;

    return (
      <div className={styles.section}>
        {renderMenuItem({
          content: title,
          className: styles.sectionTitle,
        })}
        {sessions.map(renderHistoryItem)}
      </div>
    );
  };

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      position="left"
      bodyStyle={{
        width: '80%',
        height: '100%',
        padding: 0,
      }}
      destroyOnClose
    >
      <div className={styles.sidebarContainer}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>Sylis</span>
          </div>
          <div className={styles.headerActions}>
            {onConfigClick && (
              <Button
                size="small"
                fill="none"
                aria-label="聊天设置"
                onClick={onConfigClick}
                className={styles.settingButton}
              >
                <AiOutlineSetting />
              </Button>
            )}
            <Button
              size="small"
              fill="none"
              aria-label="关闭对话历史"
              onClick={onClose}
              className={styles.closeButton}
            >
              <AiOutlineClose />
            </Button>
          </div>
        </div>

        {renderMenuItem({
          leftIcon: <AiOutlinePlus />,
          content: '新聊天',
          onClick: onNewChat,
          className: styles.newChatButton,
        })}

        {renderMenuItem({
          content: (
            <SearchBar
              value={searchValue}
              onChange={setSearchValue}
              placeholder="搜索聊天..."
              className={styles.searchInput}
            />
          ),
          className: styles.searchContainer,
        })}

        <div className={styles.history}>
          {filteredSessions.length === 0 ? (
            <div className={styles.emptyState}>
              {searchValue ? '没有找到匹配的会话' : '暂无会话历史'}
            </div>
          ) : (
            <>
              {renderHistoryGroup('今天', groupedSessions.today)}
              {renderHistoryGroup('昨天', groupedSessions.yesterday)}
              {renderHistoryGroup('最近7天', groupedSessions.thisWeek)}
              {renderHistoryGroup('最近30天', groupedSessions.thisMonth)}
              {renderHistoryGroup('更早', groupedSessions.older)}
            </>
          )}
        </div>
      </div>
    </Popup>
  );
};

export default ChatSidebar;
