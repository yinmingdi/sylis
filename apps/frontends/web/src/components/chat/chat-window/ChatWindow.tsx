import { Bubble, Prompts, Sender, Welcome } from '@ant-design/x';
import type { RolesType } from '@ant-design/x/es/bubble/BubbleList';
import {
  AgentMessageRole,
  AgentMessageStatus,
  agentMessagePlainText,
  type AgentMessageView,
} from '@sylis/api-client/agent';
import { Button, DotLoading, Toast } from 'antd-mobile';
import { useEffect, useState } from 'react';
import { AiOutlineCopy, AiOutlineReload } from 'react-icons/ai';

import styles from './index.module.less';
import { AgentInspector } from '../../../modules/agent/components/inspector';
import { AgentMessageBlocks } from '../../../modules/agent/components/message-blocks';
import type { AgentInspection } from '../../../modules/agent/model/inspection';
import { useChatStore } from '../../../modules/chat';
import { useAIChat } from '../hooks/useAIChat';

const SUGGESTED_QUESTIONS = [
  '帮我学习英语单词',
  '解释这个句子的语法',
  '推荐一些学习资料',
  '练习口语对话',
];
const EMPTY_MESSAGES: readonly AgentMessageView[] = [];

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
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(
    typeof navigator === 'undefined' || navigator.onLine,
  );
  const [inspection, setInspection] = useState<AgentInspection | null>(null);
  const messages = useChatStore((state) =>
    sessionId
      ? (state.messagesCache[sessionId] ?? EMPTY_MESSAGES)
      : EMPTY_MESSAGES,
  );
  const { isLoading, error, sendMessage, retryRun, cancelRun } = useAIChat({
    sessionId,
    onSessionCreated,
    onError: (cause) => Toast.show({ content: cause.message, icon: 'fail' }),
  });

  useOnlineStatus(setIsConnected);

  const submit = async (value: string | undefined) => {
    const content = value?.trim();
    if (!content || isLoading) return;
    if (!isConnected) {
      Toast.show({ content: '网络连接已断开，请检查网络后重试', icon: 'fail' });
      return;
    }
    await sendMessage(content, configId);
  };

  const copyMessage = async (message: AgentMessageView) => {
    const content = agentMessagePlainText(message).trim();
    if (!content) {
      Toast.show({ content: '内容为空，无法复制', icon: 'fail' });
      return;
    }
    try {
      await writeClipboard(content);
      Toast.show({ content: '已复制到剪贴板', icon: 'success' });
    } catch {
      Toast.show({ content: '复制失败，请手动复制', icon: 'fail' });
    }
  };

  const roles: RolesType = {
    user: { placement: 'end' },
    assistant: {
      placement: 'start',
      loadingRender: () => <DotLoading color="primary" />,
    },
    system: { placement: 'start' },
  };

  return (
    <div className={`${styles.windowContainer} ${className}`}>
      <div className={styles.content}>
        {!isConnected ? (
          <div className={styles.networkError} role="status">
            网络连接已断开，请检查网络设置
          </div>
        ) : null}
        {error ? (
          <div className={styles.errorMessage} role="alert">
            {error}
          </div>
        ) : null}
        {messages.length > 0 ? (
          <Bubble.List
            items={messages.map((message) => ({
              key: message.id,
              role: bubbleRole(message.role),
              loading:
                message.status === AgentMessageStatus.STREAMING &&
                message.blocks.length === 0,
              content: (
                <div className={styles.messageBody}>
                  <AgentMessageBlocks
                    blocks={message.blocks}
                    onInspect={setInspection}
                  />
                  {message.role === AgentMessageRole.ASSISTANT ? (
                    <div className={styles.messageActions}>
                      {message.runId ? (
                        <Button
                          size="small"
                          fill="none"
                          aria-label="重新生成"
                          disabled={isLoading}
                          onClick={() => void retryRun(message.runId!)}
                        >
                          <AiOutlineReload />
                        </Button>
                      ) : null}
                      <Button
                        size="small"
                        fill="none"
                        aria-label="复制回答"
                        onClick={() => void copyMessage(message)}
                      >
                        <AiOutlineCopy />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ),
            }))}
            roles={roles}
          />
        ) : (
          <>
            <Welcome
              variant="borderless"
              title="你好，我是你的 AI 学习助手"
              description="我可以帮助你学习英语、分析语法并生成练习。"
              className={styles.welcome}
            />
            {!error && isConnected ? (
              <Prompts
                vertical
                title="开始一个学习任务"
                items={SUGGESTED_QUESTIONS.map((question) => ({
                  key: question,
                  description: question,
                }))}
                onItemClick={(info) =>
                  void submit(info.data.description as string)
                }
                style={{ margin: '16px' }}
                styles={{ title: { fontSize: 14 } }}
              />
            ) : null}
          </>
        )}
      </div>
      <div className={styles.sender}>
        <Sender
          loading={isLoading}
          value={inputValue}
          onChange={setInputValue}
          onSubmit={() => {
            const content = inputValue;
            setInputValue('');
            void submit(content);
          }}
          onCancel={() => void cancelRun()}
          placeholder="输入你的学习问题"
        />
      </div>
      <AgentInspector
        inspection={inspection}
        onClose={() => setInspection(null)}
      />
    </div>
  );
};

function bubbleRole(role: AgentMessageRole): 'user' | 'assistant' | 'system' {
  if (role === AgentMessageRole.USER) return 'user';
  if (role === AgentMessageRole.SYSTEM) return 'system';
  return 'assistant';
}

function useOnlineStatus(update: (online: boolean) => void): void {
  useEffect(() => {
    const check = () => update(navigator.onLine);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, [update]);
}

async function writeClipboard(content: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const textArea = document.createElement('textarea');
  textArea.value = content;
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  textArea.remove();
}

export default ChatWindow;
