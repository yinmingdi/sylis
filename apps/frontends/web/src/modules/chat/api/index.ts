import {
  AgentCredentialSource,
  AgentMessageRole,
  AgentSessionStatus,
  CapabilityKey,
  CapabilitySelection,
  agentMessagePlainText,
  agentClient,
  type AgentCapabilityView,
  type AgentExecutionSelectionInput,
  type AgentMessageView,
  type AgentSessionView,
} from '@sylis/api-client/agent';

import {
  MessageRole,
  type ChatConfigDto,
  type ChatMessageDto,
  type CreateConfigReqDto,
  type CreateSessionReqDto,
  type CreateSessionResDto,
  type GetConfigsResDto,
  type GetMessagesReqDto,
  type GetMessagesResDto,
  type GetSessionsReqDto,
  type GetSessionsResDto,
  type SendMessageReqDto,
  type SendMessageResDto,
  type SessionItemDto,
  type StreamChatReqDto,
  type UpdateConfigReqDto,
  type UpdateSessionReqDto,
  type UpdateSessionResDto,
} from '@/legacy-dto';

import { acquireAgentSessionEvents } from '../../agent/api/session-event-hub';
import { defaultAgentExecutionSelection } from '../../agent/model/execution-selection';

export type ChatConfig = ChatConfigDto & { isPreset?: boolean };
export type CreateConfigReq = CreateConfigReqDto;
export type ChatMessage = ChatMessageDto;

const CONFIG_STORAGE_KEY = 'sylis-legacy-chat-configs';
const response = <T>(data: T) => ({ data, message: 'ok', code: 0 });

const legacyRole = (role: AgentMessageRole): MessageRole => {
  switch (role) {
    case AgentMessageRole.USER:
      return MessageRole.user;
    case AgentMessageRole.ASSISTANT:
      return MessageRole.assistant;
    case AgentMessageRole.SYSTEM:
      return MessageRole.system;
  }
};

const sessionView = (
  session: AgentSessionView,
  messageCount?: number,
): SessionItemDto => ({
  id: session.id,
  userId: '',
  title: session.title,
  isArchived:
    session.status === AgentSessionStatus.ARCHIVED ||
    Boolean(session.archivedAt),
  messageCount,
  createdAt: new Date(session.createdAt),
  updatedAt: new Date(session.archivedAt ?? session.createdAt),
});

const messageView = (message: AgentMessageView): SendMessageResDto => ({
  id: message.id,
  sessionId: '',
  role: legacyRole(message.role),
  content: agentMessagePlainText(message),
  createdAt: new Date(message.createdAt),
  updatedAt: new Date(message.createdAt),
});

const readCustomConfigs = (): ChatConfig[] => {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? (value as ChatConfig[]) : [];
  } catch {
    return [];
  }
};

const writeCustomConfigs = (configs: ChatConfig[]) => {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
};

const routePresets = (
  capabilities: readonly AgentCapabilityView[],
): ChatConfig[] =>
  capabilities
    .filter((item) => item.capabilityKey === CapabilityKey.LEARNING_CHAT)
    .flatMap((item) =>
      item.allowedRoutes.flatMap((allowance) => {
        const credential = item.credentials.find(
          (candidate) => candidate.providerKey === allowance.route.providerKey,
        );
        if (!allowance.platformCredentialAvailable && !credential) return [];
        return [
          {
            id: `route:${allowance.route.id}`,
            roleName: `${allowance.route.providerKey} / ${allowance.route.modelId}`,
            systemPrompt: 'Sylis 英语学习助手',
            aiModel: allowance.route.modelId,
            temperature: 0.3,
            tags: [allowance.route.providerKey],
            isPreset: true,
            extraConfig: {
              providerRouteReleaseId: allowance.route.id,
              credentialSource: allowance.platformCredentialAvailable
                ? AgentCredentialSource.PLATFORM
                : AgentCredentialSource.USER,
              credentialProfileId: allowance.platformCredentialAvailable
                ? undefined
                : credential?.profileId,
            },
          } satisfies ChatConfig,
        ];
      }),
    )
    .filter(
      (item, index, values) =>
        values.findIndex((candidate) => candidate.id === item.id) === index,
    );

const selectionFromConfig = (
  capabilities: readonly AgentCapabilityView[],
  configId?: string,
): AgentExecutionSelectionInput | null => {
  const configs = [...routePresets(capabilities), ...readCustomConfigs()];
  const config = configs.find((candidate) => candidate.id === configId);
  const extra = config?.extraConfig as
    | Partial<AgentExecutionSelectionInput>
    | undefined;
  if (
    typeof extra?.providerRouteReleaseId === 'string' &&
    Object.values(AgentCredentialSource).includes(
      extra.credentialSource as AgentCredentialSource,
    )
  ) {
    return extra as AgentExecutionSelectionInput;
  }
  if (config?.aiModel) {
    for (const capability of capabilities.filter(
      (item) => item.capabilityKey === CapabilityKey.LEARNING_CHAT,
    )) {
      const allowance = capability.allowedRoutes.find(
        (candidate) => candidate.route.modelId === config.aiModel,
      );
      if (!allowance) continue;
      if (allowance.platformCredentialAvailable) {
        return {
          providerRouteReleaseId: allowance.route.id,
          credentialSource: AgentCredentialSource.PLATFORM,
        };
      }
      const credential = capability.credentials.find(
        (candidate) => candidate.providerKey === allowance.route.providerKey,
      );
      if (credential) {
        return {
          providerRouteReleaseId: allowance.route.id,
          credentialSource: AgentCredentialSource.USER,
          credentialProfileId: credential.profileId,
        };
      }
    }
  }
  return defaultAgentExecutionSelection(
    capabilities,
    CapabilityKey.LEARNING_CHAT,
  );
};

export const createSession = async (data: CreateSessionReqDto) => {
  const session = await agentClient.sessions.create(
    data.title?.trim() || '新对话',
  );
  return response<CreateSessionResDto>(sessionView(session));
};

export const getSessions = async (params: GetSessionsReqDto = {}) => {
  let sessions = await agentClient.sessions.list();
  if (!params.includeArchived) {
    sessions = sessions.filter(
      (session) => session.status !== AgentSessionStatus.ARCHIVED,
    );
  }
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, params.limit ?? (sessions.length || 1));
  const selected = sessions.slice(offset, offset + limit);
  const messageCounts = await Promise.all(
    selected.map((session) =>
      agentClient.sessions
        .messages(session.id)
        .then((messages) => messages.length),
    ),
  );
  return response<GetSessionsResDto>({
    sessions: selected.map((session, index) =>
      sessionView(session, messageCounts[index]),
    ),
    total: sessions.length,
  });
};

export const getSessionDetail = async (id: string) => {
  const [session, messages] = await Promise.all([
    agentClient.sessions.get(id),
    agentClient.sessions.messages(id),
  ]);
  return response<SessionItemDto>(sessionView(session, messages.length));
};

export const updateSession = async (id: string, data: UpdateSessionReqDto) => {
  const session = await agentClient.sessions.update(id, {
    title: data.title,
    archived: data.isArchived,
  });
  return response<UpdateSessionResDto>(sessionView(session));
};

export const archiveSession = async (id: string) => {
  await agentClient.sessions.update(id, { archived: true });
  return response(undefined);
};

export const deleteSession = async (id: string) => {
  await agentClient.sessions.remove(id);
  return response(undefined);
};

export const getMessages = async (
  sessionId: string,
  params: GetMessagesReqDto = {},
) => {
  const messages = await agentClient.sessions.messages(sessionId);
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, params.limit ?? (messages.length || 1));
  const selected = messages.slice(offset, offset + limit);
  return response<GetMessagesResDto>({
    messages: selected.map((message) => ({
      ...messageView(message),
      sessionId,
    })),
    total: messages.length,
  });
};

export const sendMessage = async (
  sessionId: string,
  data: SendMessageReqDto,
) => {
  let result: SendMessageResDto | null = null;
  await runAgentChat(sessionId, data.content, undefined, {
    onComplete: async (completed) => {
      if (completed.message) {
        result = { ...messageView(completed.message), sessionId };
      }
    },
  });
  if (!result) throw new Error('Agent 未返回消息');
  return response(result);
};

export const getConfigs = async () => {
  const presets = routePresets(await agentClient.capabilities());
  const configs = readCustomConfigs();
  return response<GetConfigsResDto>({ configs, presets });
};

export const getPresets = async () =>
  response<ChatConfigDto[]>(routePresets(await agentClient.capabilities()));

export const createConfig = async (data: CreateConfigReqDto) => {
  const config: ChatConfig = {
    ...data,
    id: crypto.randomUUID(),
    tags: data.tags ?? [],
    isPreset: false,
  };
  writeCustomConfigs([...readCustomConfigs(), config]);
  return response<ChatConfigDto>(config);
};

export const updateConfig = async (id: string, data: UpdateConfigReqDto) => {
  let updated: ChatConfig | undefined;
  const configs = readCustomConfigs().map((config) => {
    if (config.id !== id) return config;
    updated = { ...config, ...data, id, tags: data.tags ?? config.tags };
    return updated;
  });
  if (!updated) throw new Error('聊天配置不存在');
  writeCustomConfigs(configs);
  return response<ChatConfigDto>(updated);
};

export const deleteConfig = async (id: string) => {
  writeCustomConfigs(readCustomConfigs().filter((config) => config.id !== id));
  return response(undefined);
};

export const getConfigById = async (id: string) => {
  const configs = [
    ...routePresets(await agentClient.capabilities()),
    ...readCustomConfigs(),
  ];
  const config = configs.find((candidate) => candidate.id === id);
  if (!config) throw new Error('聊天配置不存在');
  return response<ChatConfigDto>(config);
};

export interface StreamChatHandlers {
  onStart?: () => void;
  onChunk?: (content: string) => void;
  onComplete?: (data: {
    content: string;
    sessionId?: string;
    userMessageId?: string;
    assistantMessageId?: string;
    message?: AgentMessageView;
  }) => void | Promise<void>;
  onError?: (error: string) => void;
  onSession?: (data: { sessionId: string; title?: string }) => void;
  onTitle?: (data: { sessionId: string; title: string }) => void;
}

export const streamChat = async (
  data: StreamChatReqDto,
  handlers: StreamChatHandlers,
): Promise<void> => {
  let sessionId = data.sessionId;
  if (!sessionId) {
    const session = await agentClient.sessions.create('新对话');
    sessionId = session.id;
    handlers.onSession?.({ sessionId, title: session.title });
  }
  const instruction = [...data.messages]
    .reverse()
    .find((message) => message.role === MessageRole.user)?.content;
  if (!instruction?.trim()) throw new Error('请输入消息');
  await runAgentChat(sessionId, instruction, data.configId, handlers);
};

async function runAgentChat(
  sessionId: string,
  instruction: string,
  configId: string | undefined,
  handlers: StreamChatHandlers,
): Promise<void> {
  const capabilities = await agentClient.capabilities();
  const execution = selectionFromConfig(capabilities, configId);
  if (!execution) throw new Error('请先在设置中配置可用的 AI 模型');
  handlers.onStart?.();
  const events = acquireAgentSessionEvents(sessionId);
  try {
    await events.ready();
    const submitted = await agentClient.sessions.submitInstruction(sessionId, {
      content: instruction.trim(),
      requestedCapability: CapabilitySelection.AUTO,
      idempotencyKey: crypto.randomUUID(),
      execution,
    });
    let emitted = '';
    const completed = await events.waitForRun({
      runId: submitted.runId,
      after: submitted.eventCursor,
      onDelta: (chunk) => {
        emitted += chunk;
        handlers.onChunk?.(chunk);
      },
    });
    const content = completed.message
      ? agentMessagePlainText(completed.message)
      : emitted;
    if (content.startsWith(emitted)) {
      const tail = content.slice(emitted.length);
      if (tail) handlers.onChunk?.(tail);
    }
    await handlers.onComplete?.({
      content,
      sessionId,
      assistantMessageId: completed.message?.id,
      message: completed.message,
    });
  } catch (error) {
    handlers.onError?.(
      error instanceof Error ? error.message : 'Agent 执行失败',
    );
  } finally {
    events.close();
  }
}
