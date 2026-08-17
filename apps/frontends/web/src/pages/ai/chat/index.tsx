import { Button, Space, Toast } from 'antd-mobile';
import { useEffect, useState } from 'react';
import { AiOutlinePlus, AiOutlineComment } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import { ChatSidebar, ChatWindow, ChatConfig } from '../../../components/chat';
import { PageView } from '../../../components/view';
import { useChatStore } from '../../../modules/chat';

export const Chats = () => {
  const [showSidebar, setShowSidebar] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const navigate = useNavigate();

  // ==================== Zustand Store ====================
  const sessions = useChatStore((state) => state.sessions);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const createSession = useChatStore((state) => state.createSession);
  const switchSession = useChatStore((state) => state.switchSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const updateSessionTitle = useChatStore((state) => state.updateSessionTitle);
  const archiveSession = useChatStore((state) => state.archiveSession);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);

  // ==================== Effects ====================
  // 初始化：加载会话列表（只执行一次）
  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空依赖数组，只在挂载时执行一次

  // ==================== Event Handlers ====================
  const handleNewChat = async () => {
    await createSession();
    setShowSidebar(false);
  };

  const handleSwitchSession = (sessionId: string) => {
    switchSession(sessionId);
    setShowSidebar(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const deleted = await deleteSession(sessionId);
    if (!deleted) return;
    Toast.show({
      content: '会话已删除',
      icon: 'success',
    });
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    await updateSessionTitle(sessionId, newTitle);
    Toast.show({
      content: '会话标题已更新',
      icon: 'success',
    });
  };

  const handleArchiveSession = async (sessionId: string) => {
    await archiveSession(sessionId);
  };

  const handleSessionCreated = (sessionId: string, title?: string) => {
    console.log('新会话已创建（页面层）:', sessionId, title);
    // Zustand store 会自动同步状态
    switchSession(sessionId);
  };

  const handleTitleGenerated = (sessionId: string, title: string) => {
    console.log('标题已生成（页面层）:', sessionId, title);
    updateSessionTitle(sessionId, title);
  };

  // ==================== Render ====================
  const currentSession = getCurrentSession();
  const activeSessionId = currentSession?.id ?? null;
  const title = currentSession?.title || '✨ AI学习助手';

  const headerActions = (
    <Space>
      <Button
        className={styles.actionButton}
        size="small"
        fill="none"
        aria-label="新建对话"
        onClick={handleNewChat}
      >
        <AiOutlinePlus />
      </Button>
      <Button
        className={styles.actionButton}
        size="small"
        fill="none"
        aria-label="对话历史"
        onClick={() => setShowSidebar(true)}
      >
        <AiOutlineComment />
      </Button>
    </Space>
  );

  return (
    <PageView
      className={styles.chatContainer}
      appBar={
        <AppBar
          title={title}
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
          actions={headerActions}
        />
      }
    >
      <ChatWindow
        sessionId={activeSessionId}
        onSessionCreated={handleSessionCreated}
        onTitleGenerated={handleTitleGenerated}
      />

      <ChatSidebar
        visible={showSidebar}
        onClose={() => setShowSidebar(false)}
        sessions={sessions}
        currentSessionId={activeSessionId}
        onNewChat={handleNewChat}
        onSessionSelect={handleSwitchSession}
        onSessionDelete={handleDeleteSession}
        onSessionRename={handleRenameSession}
        onSessionArchive={handleArchiveSession}
        onConfigClick={() => {
          setShowConfig(true);
        }}
      />

      <ChatConfig
        visible={showConfig}
        onClose={() => setShowConfig(false)}
        currentSessionId={activeSessionId}
      />
    </PageView>
  );
};

export default Chats;
