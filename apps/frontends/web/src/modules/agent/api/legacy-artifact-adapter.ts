import {
  AgentArtifactKind,
  CapabilityKey,
  agentClient,
  type AgentArtifactDocument,
  type AgentArtifactSummary,
  type AgentArtifactView,
} from '@sylis/api-client/agent';

import { acquireAgentSessionEvents } from './session-event-hub';
import { defaultAgentExecutionSelection } from '../model/execution-selection';

const RUN_TIMEOUT_MS = 180_000;

const currentDocument = (
  artifact: AgentArtifactView,
): AgentArtifactDocument | null => {
  const revision = artifact.currentRevisionId
    ? artifact.revisions.find(
        (candidate) => candidate.id === artifact.currentRevisionId,
      )
    : artifact.revisions.at(-1);
  return revision?.document ?? null;
};

export interface LegacyArtifactResult {
  artifact: AgentArtifactView;
  document: AgentArtifactDocument;
}

export const loadLegacyArtifact = async (
  artifact: AgentArtifactSummary | string,
): Promise<LegacyArtifactResult> => {
  const view = await agentClient.artifacts.get(
    typeof artifact === 'string' ? artifact : artifact.id,
  );
  const document = currentDocument(view);
  if (!document) throw new Error('Agent 产物没有可读取的当前版本');
  return { artifact: view, document };
};

export const runLegacyArtifact = async (input: {
  capability: CapabilityKey;
  artifactKind: AgentArtifactKind;
  sessionTitle: string;
  instruction: string;
}): Promise<LegacyArtifactResult> => {
  const capabilities = await agentClient.capabilities();
  const execution = defaultAgentExecutionSelection(
    capabilities,
    input.capability,
  );
  if (!execution) {
    throw new Error('请先在 AI 设置中配置可用的模型和密钥');
  }

  const session = await agentClient.sessions.create(input.sessionTitle);
  const events = acquireAgentSessionEvents(session.id);
  try {
    await events.ready();
    const submitted = await agentClient.sessions.submitInstruction(session.id, {
      content: input.instruction.trim(),
      requestedCapability: input.capability,
      idempotencyKey: crypto.randomUUID(),
      execution,
    });
    const completed = await events.waitForRun({
      runId: submitted.runId,
      after: submitted.eventCursor,
      timeoutMs: RUN_TIMEOUT_MS,
    });
    if (!completed.artifact || completed.artifact.kind !== input.artifactKind) {
      throw new Error('Agent 已完成，但没有生成预期的结构化产物');
    }
    return await loadLegacyArtifact(completed.artifact.artifactId);
  } finally {
    events.close();
  }
};
