import {
  AgentCredentialSource,
  AgentRunStatus,
  AgentSessionStatus,
  AgentWaitKind,
  AgentWaitStatus,
  CapabilityKey,
  agentClient,
  type AgentCapabilityView,
  type AgentExecutionSelectionInput,
  type AgentInstructionSubmissionView,
  type AgentRunView,
  type AgentSessionView,
} from '@sylis/api-client/agent';

import {
  type ChatConfigDto,
  type CreateConfigReqDto,
  type CreateSessionReqDto,
  type CreateSessionResDto,
  type GetConfigsResDto,
  type GetSessionsReqDto,
  type GetSessionsResDto,
  type SessionItemDto,
  type UpdateConfigReqDto,
  type UpdateSessionReqDto,
  type UpdateSessionResDto,
} from '@/legacy-dto';

import { defaultAgentExecutionSelection } from '../../agent/model/execution-selection';

export type ChatConfig = ChatConfigDto & { isPreset?: boolean };
export type CreateConfigReq = CreateConfigReqDto;

const CONFIG_STORAGE_KEY = 'sylis-legacy-chat-configs';
const response = <T>(data: T) => ({ data, message: 'ok', code: 0 });

export const agentSessionItem = (
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
  return response<CreateSessionResDto>(agentSessionItem(session));
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
  return response<GetSessionsResDto>({
    sessions: selected.map((session) => agentSessionItem(session)),
    total: sessions.length,
  });
};

export const getSessionDetail = async (id: string) => {
  const [session, messages] = await Promise.all([
    agentClient.sessions.get(id),
    agentClient.sessions.messages(id),
  ]);
  return response<SessionItemDto>(agentSessionItem(session, messages.length));
};

export const updateSession = async (id: string, data: UpdateSessionReqDto) => {
  const session = await agentClient.sessions.update(id, {
    title: data.title,
    archived: data.isArchived,
  });
  return response<UpdateSessionResDto>(agentSessionItem(session));
};

export const archiveSession = async (id: string) => {
  await agentClient.sessions.update(id, { archived: true });
  return response(undefined);
};

export const deleteSession = async (id: string) => {
  await agentClient.sessions.remove(id);
  return response(undefined);
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

export interface SubmitAgentChatInput {
  sessionId?: string;
  instruction: string;
  configId?: string;
  runs?: readonly AgentRunView[];
}

export interface SubmitAgentChatResult {
  session?: AgentSessionView;
  submission?: AgentInstructionSubmissionView;
  resumedRunId?: string;
}

export async function submitAgentChat(
  input: SubmitAgentChatInput,
): Promise<SubmitAgentChatResult> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error('请输入消息');
  const session = input.sessionId
    ? undefined
    : await agentClient.sessions.create('新对话');
  const sessionId = input.sessionId ?? session!.id;
  const pendingWait = activeLearnerInputWait(input.runs ?? []);
  if (pendingWait) {
    await agentClient.runs.respondToWait(
      pendingWait.runId,
      pendingWait.waitId,
      { value: instruction },
    );
    return { ...(session ? { session } : {}), resumedRunId: pendingWait.runId };
  }
  const capabilities = await agentClient.capabilities();
  const execution = selectionFromConfig(capabilities, input.configId);
  if (!execution) throw new Error('请先在设置中配置可用的 AI 模型');
  const submission = await agentClient.sessions.submitInstruction(sessionId, {
    content: instruction,
    requestedCapability: CapabilityKey.LEARNING_CHAT,
    idempotencyKey: crypto.randomUUID(),
    execution,
  });
  return { ...(session ? { session } : {}), submission };
}

function activeLearnerInputWait(
  runs: readonly AgentRunView[],
): { runId: string; waitId: string } | null {
  for (const run of runs) {
    if (run.status !== AgentRunStatus.WAITING) continue;
    const wait = run.waits.find(
      (candidate) =>
        candidate.status === AgentWaitStatus.ACTIVE &&
        candidate.kind === AgentWaitKind.USER_INPUT,
    );
    if (wait) return { runId: run.id, waitId: wait.id };
  }
  return null;
}
