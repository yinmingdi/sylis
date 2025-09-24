import { Bubble, Sender, Prompts, Welcome } from '@ant-design/x';
import type { RolesType } from '@ant-design/x/es/bubble/BubbleList';
import { Button, Space, Toast, Popover, DotLoading } from 'antd-mobile';
import React, { useEffect, useState } from 'react';
import {
  AiOutlineCopy,
  AiOutlineReload,
  AiOutlinePlus,
  AiOutlineComment,
  AiOutlineDelete,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import { useAIChat } from './hooks/useAIChat';
import { useChatHistory } from './hooks/useChatHistory';
import { useMarkdown } from './hooks/useMarkdown';
import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { AI_CONFIG } from '../../network/ai';

const MOCK_QUESTIONS = [
  '帮我学习英语单词',
  '解释这个句子的语法',
  '推荐一些学习资料',
  '练习口语对话',
];

export const Chats = () => {
  // ==================== State ====================
  const [inputValue, setInputValue] = useState('');
  const [showSessionList, setShowSessionList] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [prevSessionId, setPrevSessionId] = useState<string | null>(null);

  const { renderMarkdown } = useMarkdown();
  const navigate = useNavigate();

  // ==================== Chat History ====================
  const {
    sessions,
    currentSessionId,
    currentSession,
    createNewSession,
    switchSession,
    addMessageToSession,
    deleteSession,
    clearAllSessions,
  } = useChatHistory();

  // ==================== AI Chat ====================
  const {
    messages,
    isLoading,
    error,
    sendMessageStream,
    refreshMessageStream,
    abort,
    setMessages,
  } = useAIChat({
    onError: (err) => {
      console.error('聊天错误:', err);
      Toast.show({
        content: err.message || '发送消息失败',
        icon: 'fail',
      });
    },
    onMessageComplete: (message) => {
      // 只有当前有活跃会话时才保存消息到历史
      if (currentSessionId) {
        addMessageToSession(currentSessionId, message);
      }
    },
  });

  // ==================== Effects ====================
  // 同步当前会话的消息到聊天组件（仅在会话切换时）
  useEffect(() => {
    if (currentSession) {
      // 只有在会话真正切换时才同步消息
      if (currentSessionId !== prevSessionId) {
        setMessages(currentSession.messages);
        setPrevSessionId(currentSessionId);
      }
    } else {
      setMessages([]);
      setPrevSessionId(null);
    }
  }, [currentSession, currentSessionId, prevSessionId, setMessages]);

  // 页面刷新后恢复会话状态
  useEffect(() => {
    // 确保在会话数据加载完成后再进行初始化
    if (sessions.length > 0 && !currentSessionId) {
      const latestSession = sessions.sort(
        (a, b) => b.updatedAt - a.updatedAt,
      )[0];
      switchSession(latestSession.id);
    }
  }, [sessions, currentSessionId, switchSession]);

  // 检查网络连接状态
  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(navigator.onLine);
    };

    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);

    return () => {
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
    };
  }, []);

  // ==================== Event Handlers ====================
  const handleUserSubmit = async (
    val: string | undefined,
    isRegenerate = false,
  ) => {
    if (!val || typeof val !== 'string' || !val.trim()) return;

    // 检查网络连接
    if (!isConnected) {
      Toast.show({
        content: '网络连接已断开，请检查网络后重试',
        icon: 'fail',
      });
      return;
    }

    // 检查AI配置
    if (!AI_CONFIG.apiKey) {
      Toast.show({
        content: 'AI服务未配置，请联系管理员',
        icon: 'fail',
      });
      return;
    }

    // 如果没有当前会话，创建新会话
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = createNewSession();
    }

    try {
      // 如果是重新生成，显示提示
      if (isRegenerate) {
        Toast.show({
          content: '正在重新生成回答...',
          icon: 'loading',
          duration: 1000,
        });
      }

      // 手动添加用户消息到会话历史
      const userMessage = { role: 'user' as const, content: val };
      addMessageToSession(sessionId, userMessage);

      // 发送流式请求（useAIChat会自动处理用户消息的添加）
      await sendMessageStream(val);
    } catch (error: any) {
      console.error('发送消息失败:', error);
      Toast.show({
        content: '发送失败，请重试',
        icon: 'fail',
      });
    }
  };

  const handleRefreshMessage = (_: any, info: { key?: string | number }) => {
    if (!info.key) return;
    const index = Number(String(info.key).split('_')[1]);
    refreshMessageStream(index);
  };

  const handleCopyMessage = async (content: any) => {
    if (!content || typeof content !== 'string' || !content.trim()) {
      Toast.show({
        content: '内容为空，无法复制',
        icon: 'fail',
      });
      return;
    }

    try {
      // 检查是否支持 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
      } else {
        // 降级到传统方法
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      Toast.show({
        content: '已复制到剪贴板',
        icon: 'success',
      });
    } catch (error) {
      console.error('复制失败:', error);
      Toast.show({
        content: '复制失败，请手动复制',
        icon: 'fail',
      });
    }
  };

  const handleNewChat = () => {
    if (isLoading) {
      abort();
    }
    setTimeout(() => {
      createNewSession();
      setInputValue('');
    }, 100);
  };

  const handleSwitchSession = (sessionId: string) => {
    if (isLoading) {
      abort();
    }

    // 立即切换会话，无需延迟
    switchSession(sessionId);
    setShowSessionList(false);

    // 清空输入框
    setInputValue('');
  };

  const handleDeleteSession = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteSession(sessionId);
    Toast.show({
      content: '会话已删除',
      icon: 'success',
    });
  };

  // ==================== Render Functions ====================
  const renderHeader = () => {
    const title = currentSession ? currentSession.title : '✨ AI学习助手';

    const actions = (
      <Space>
        <Button size="small" fill="none" onClick={handleNewChat}>
          <AiOutlinePlus />
        </Button>
        <Popover
          content={renderSessionList()}
          placement="bottom-end"
          trigger="click"
          visible={showSessionList}
          onVisibleChange={setShowSessionList}
        >
          <Button size="small" fill="none">
            <AiOutlineComment />
          </Button>
        </Popover>
      </Space>
    );

    return (
      <PageHeader
        title={title}
        showBack={true}
        onBack={() => navigate(-1)}
        actions={actions}
        className={styles.chatHeader}
      />
    );
  };

  const renderSessionList = () => {
    if (sessions.length === 0) {
      return (
        <div className={styles.sessionList}>
          <div className={styles.emptyState}>暂无会话历史</div>
        </div>
      );
    }

    return (
      <div className={styles.sessionList}>
        <div className={styles.sessionHeader}>
          <span>会话历史</span>
          <Button
            size="mini"
            fill="none"
            onClick={() => {
              clearAllSessions();
              setShowSessionList(false);
              Toast.show({
                content: '所有会话已清空',
                icon: 'success',
              });
            }}
          >
            <AiOutlineDelete />
          </Button>
        </div>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`${styles.sessionItem} ${session.id === currentSessionId ? styles.active : ''}`}
            onClick={() => handleSwitchSession(session.id)}
          >
            <div className={styles.sessionTitle}>{session.title}</div>
            <div className={styles.sessionMeta}>
              {new Date(session.updatedAt).toLocaleString()}
              <Button
                size="mini"
                fill="none"
                onClick={(e) => handleDeleteSession(session.id, e)}
                className={styles.deleteButton}
              >
                <AiOutlineDelete />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const roles: RolesType = {
    user: {
      placement: 'end',
    },
    assistant: {
      placement: 'start',
      footer: (message: any, info: any) => {
        return (
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
            <Button
              size="small"
              fill="none"
              onClick={() => handleRefreshMessage(messages, info)}
              disabled={isLoading}
            >
              <AiOutlineReload />
            </Button>
            <Button
              size="small"
              fill="none"
              onClick={() => handleCopyMessage(message.content)}
            >
              <AiOutlineCopy />
            </Button>
          </div>
        );
      },
      loadingRender: () => <DotLoading color="primary" />,
      messageRender: renderMarkdown,
    },
  };

  const renderContent = () => {
    return (
      <div className={styles.chatContent}>
        {/* 网络状态提示 */}
        {!isConnected && (
          <div className={styles.networkError}>
            📶 网络连接已断开，请检查网络设置
          </div>
        )}

        {/* 错误提示 */}
        {error && <div className={styles.errorMessage}>⚠️ {error}</div>}

        {messages?.length ? (
          <Bubble.List
            items={messages.map((message, index) => ({
              ...message,
              id: `message_${index}`,
              classNames: {
                content:
                  isLoading &&
                    index === messages.length - 1 &&
                    message.role === 'assistant'
                    ? styles.loadingMessage
                    : '',
              },
              typing:
                isLoading &&
                  index === messages.length - 1 &&
                  message.role === 'assistant'
                  ? { step: 5, interval: 20 }
                  : false,
            }))}
            roles={roles}
          />
        ) : (
          <>
            <Welcome
              variant="borderless"
              title="👋 你好，我是你的AI学习助手"
              description="我可以帮助你学习英语，解答问题，提供学习建议~"
              className={styles.chatWelcome}
            />
            {!error && isConnected && (
              <Prompts
                vertical
                title="我可以帮你："
                items={MOCK_QUESTIONS.map((q) => ({ key: q, description: q }))}
                onItemClick={(info) =>
                  handleUserSubmit(info?.data?.description as string)
                }
                style={{
                  margin: '16px',
                }}
                styles={{
                  title: { fontSize: 14 },
                }}
              />
            )}
          </>
        )}
      </div>
    );
  };

  const renderBottom = () => {
    return (
      <div className={styles.chatSender}>
        <Sender
          loading={isLoading}
          value={inputValue}
          onChange={setInputValue}
          onSubmit={() => {
            handleUserSubmit(inputValue);
            setInputValue('');
          }}
          onCancel={() => {
            abort();
          }}
          allowSpeech
          placeholder="输入消息或使用语音..."
          actions={(_, info) => {
            const { SendButton, LoadingButton, SpeechButton } = info.components;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <SpeechButton className={styles.speechButton} />
                {isLoading ? (
                  <LoadingButton type="default" />
                ) : (
                  <SendButton type="primary" />
                )}
              </div>
            );
          }}
        />
      </div>
    );
  };

  return (
    <div className={styles.chatContainer}>
      {renderHeader()}
      {renderContent()}
      {renderBottom()}
    </div>
  );
};

export default Chats;
