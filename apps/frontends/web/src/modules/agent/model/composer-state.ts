import {
  AgentResourceKind,
  type AgentContextSnapshotInput,
  type CapabilityKey,
} from '@sylis/api-client/agent';

export const MAX_COMPOSER_CONTEXT_ITEMS = 64;

export interface AgentComposerContextItem {
  key: string;
  label: string;
  detail: string;
  ref: AgentContextSnapshotInput['refs'][number];
}

export function contextItem(
  label: string,
  detail: string,
  ref: AgentContextSnapshotInput['refs'][number],
): AgentComposerContextItem {
  return { key: contextRefKey(ref), label, detail, ref };
}

export function addComposerContext(
  items: readonly AgentComposerContextItem[],
  item: AgentComposerContextItem,
): readonly AgentComposerContextItem[] {
  if (items.some((candidate) => candidate.key === item.key)) return items;
  if (items.length >= MAX_COMPOSER_CONTEXT_ITEMS) {
    throw new Error('单次指令最多选择 64 项上下文');
  }
  return [...items, item];
}

export function removeComposerContext(
  items: readonly AgentComposerContextItem[],
  key: string,
): readonly AgentComposerContextItem[] {
  return items.filter((item) => item.key !== key);
}

export function instructionContext(
  items: readonly AgentComposerContextItem[],
): AgentContextSnapshotInput {
  return {
    refs: items.map((item) => item.ref),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
  };
}

export function contextSelectionFromSearchParams(
  params: URLSearchParams,
): AgentComposerContextItem | null {
  const kind = params.get('contextKind');
  const id = params.get('contextId');
  const revisionId = params.get('contextRevisionId');
  const contentHash = params.get('contextHash');
  if (
    !id ||
    !Object.values(AgentResourceKind).includes(kind as AgentResourceKind)
  ) {
    return null;
  }
  const ref = {
    kind: kind as AgentResourceKind,
    id,
    ...(revisionId ? { revisionId } : {}),
    ...(contentHash ? { contentHash } : {}),
  };
  return contextItem(
    params.get('contextLabel') ?? contextKindLabel(ref.kind),
    params.get('contextDetail') ?? contextKindLabel(ref.kind),
    ref,
  );
}

export function agentContextHref(input: {
  capability?: CapabilityKey;
  label: string;
  detail: string;
  ref: AgentContextSnapshotInput['refs'][number];
}): string {
  const params = new URLSearchParams({
    contextKind: input.ref.kind,
    contextId: input.ref.id,
    contextLabel: input.label,
    contextDetail: input.detail,
  });
  if (input.capability) params.set('capability', input.capability);
  if (input.ref.revisionId) {
    params.set('contextRevisionId', input.ref.revisionId);
  }
  if (input.ref.contentHash) params.set('contextHash', input.ref.contentHash);
  return `/agent?${params.toString()}`;
}

export function contextRefKey(
  ref: AgentContextSnapshotInput['refs'][number],
): string {
  return `${ref.kind}:${ref.id}:${ref.revisionId ?? 'current'}`;
}

function contextKindLabel(kind: AgentResourceKind): string {
  switch (kind) {
    case AgentResourceKind.AGENT_MESSAGE:
      return '会话消息';
    case AgentResourceKind.AGENT_MEMORY_CARD:
      return '长期记忆';
    case AgentResourceKind.AGENT_ARTIFACT_REVISION:
      return 'Agent 成果';
    case AgentResourceKind.AGENT_RUN_RESULT:
      return '运行结果';
    case AgentResourceKind.CONTENT_ASSET_REVISION:
      return '文件';
    case AgentResourceKind.READING_DOCUMENT_REVISION:
      return '阅读材料';
    case AgentResourceKind.LEXICON_HEADWORD:
      return '词头';
    case AgentResourceKind.LEXICON_ENTRY:
      return '词条';
    case AgentResourceKind.LEXICON_SENSE:
      return '义项';
    case AgentResourceKind.LEARNING_SUMMARY:
      return '学习摘要';
    case AgentResourceKind.NOTEBOOK:
      return 'Notebook';
  }
}
