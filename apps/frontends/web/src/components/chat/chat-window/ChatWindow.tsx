import { Bubble, Sender, Prompts, Welcome } from '@ant-design/x';
import type { RolesType } from '@ant-design/x/es/bubble/BubbleList';
import { Button, Toast, DotLoading } from 'antd-mobile';
import { useEffect, useState } from 'react';
import { AiOutlineCopy, AiOutlineReload } from 'react-icons/ai';

import styles from './index.module.less';
import { useChatStore, type ChatMessage } from '../../../modules/chat';
import { useAIChat } from '../hooks/useAIChat';
import { useMarkdown } from '../hooks/useMarkdown';

const MOCK_QUESTIONS = [
  '帮我学习英语单词',
  '解释这个句子的语法',
  '推荐一些学习资料',
  '练习口语对话',
];

// 空消息数组常量，避免每次创建新数组
const EMPTY_MESSAGES: any[] = [];

export interface ChatWindowProps {
  sessionId?: string | null;
  configId?: string;
  onSessionCreated?: (sessionId: string, title?: string) => void;
  onTitleGenerated?: (sessionId: string, title: string) => void;
  className?: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  sessionId,
  configId,
  onSessionCreated,
  onTitleGenerated,
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(true);

  const { renderMarkdown } = useMarkdown();

  // ==================== Zustand Store ====================
  // 分别订阅，避免返回新对象导致无限循环
  const loadMessages = useChatStore((state) => state.loadMessages);
  const setMessages = useChatStore((state) => state.setMessages);

  // 从 store 获取当前消息（使用常量避免创建新数组）
  const messages: ChatMessage[] = useChatStore((state) =>
    sessionId
      ? state.messagesCache[sessionId] || EMPTY_MESSAGES
      : EMPTY_MESSAGES,
  );

  // ==================== AI Chat ====================
  const { isLoading, error, sendMessageStream, refreshMessageStream, abort } =
    useAIChat({
      onMessageUpdate: (updatedMessages) => {
        // 同步消息到 zustand store
        if (sessionId) {
          setMessages(sessionId, updatedMessages);
        }
      },
      onError: (err) => {
        console.error('聊天错误:', err);
        Toast.show({
          content: err.message || '发送消息失败',
          icon: 'fail',
        });
      },
      onSessionCreated: (newSessionId, title) => {
        console.log('新会话已创建:', newSessionId, title);
        onSessionCreated?.(newSessionId, title);
      },
      onTitleGenerated: (newSessionId, title) => {
        console.log('标题已生成:', newSessionId, title);
        onTitleGenerated?.(newSessionId, title);
      },
    });

  // ==================== Effects ====================
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

  // 当 sessionId 变化时，从服务器加载消息
  useEffect(() => {
    if (!sessionId) return;

    // 只在消息为空时才加载
    if (messages.length === 0) {
      loadMessages(sessionId).catch((error) => {
        console.error('加载会话消息失败:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // 只依赖 sessionId

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

    try {
      // 如果是重新生成，显示提示
      if (isRegenerate) {
        Toast.show({
          content: '正在重新生成回答...',
          icon: 'loading',
          duration: 1000,
        });
      }

      // 发送流式请求
      await sendMessageStream(
        val,
        messages, // 传入当前消息列表
        sessionId || undefined,
        configId,
        !sessionId, // createSession: 如果没有当前会话则创建新会话
      );
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
    refreshMessageStream(messages, index, sessionId || undefined, configId);
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

  // ==================== Render Functions ====================
  const renderAssistantFooter = (content: string, info: any) => {
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
          onClick={() => handleCopyMessage(content)}
        >
          <AiOutlineCopy />
        </Button>
      </div>
    );
  };

  const roles: RolesType = {
    user: {
      placement: 'end',
    },
    assistant: {
      placement: 'start',
      footer: renderAssistantFooter,
      loadingRender: () => <DotLoading color="primary" />,
      messageRender: renderMarkdown,
      typing: { step: 5, interval: 20 },
    },
  };

  const renderNetworkStatus = () => {
    if (!isConnected) {
      return (
        <div className={styles.networkError}>
          📶 网络连接已断开，请检查网络设置
        </div>
      );
    }
    return null;
  };

  const renderErrorMessage = () => {
    if (error) {
      return <div className={styles.errorMessage}>⚠️ {error}</div>;
    }
    return null;
  };

  const renderChatMessages = () => {
    if (!messages?.length) return null;

    return (
      <Bubble.List
        items={messages.map((message, index) => ({
          ...message,
          id: `message_${index}`,
          // 根据消息内容动态应用样式
          classNames:
            message.content === ''
              ? {
                  content: styles.loadingMessage,
                }
              : undefined,
        }))}
        roles={roles}
      />
    );
  };

  const renderWelcomeSection = () => {
    if (messages?.length) return null;

    return (
      <>
        <Welcome
          variant="borderless"
          title="👋 你好，我是你的AI学习助手"
          description="我可以帮助你学习英语，解答问题，提供学习建议~"
          className={styles.welcome}
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
    );
  };

  const renderChatContent = () => {
    return (
      <div className={styles.content}>
        {renderNetworkStatus()}
        {renderErrorMessage()}
        {renderChatMessages()}
        {renderWelcomeSection()}
      </div>
    );
  };

  const renderSenderActions = (_: any, info: any) => {
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
  };

  const renderChatInput = () => {
    return (
      <div className={styles.sender}>
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
          actions={renderSenderActions}
        />
      </div>
    );
  };

  return (
    <div className={`${styles.windowContainer} ${className}`}>
      {renderChatContent()}
      {renderChatInput()}
    </div>
  );
};

export default ChatWindow;
