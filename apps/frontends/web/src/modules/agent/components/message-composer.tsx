import {
  AgentCredentialSource,
  CapabilityKey,
  CapabilitySelection,
} from '@sylis/api-client/agent';
import type {
  AgentAssetView,
  AgentCapabilityView,
  AgentExecutionSelectionInput,
} from '@sylis/api-client/agent';
import { Button, Select, Send } from '@sylis/components';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { AgentAssetProcessingStatus } from './asset-processing-status';
import { AgentAssetUploader } from './asset-uploader';
import { AgentContextSelection } from './context-selection';
import type { AgentComposerContextItem } from '../model/composer-state';

const capabilityOptions = [
  { value: CapabilitySelection.AUTO, label: '自动选择' },
  { value: CapabilityKey.LEARNING_CHAT, label: '学习问答' },
  { value: CapabilityKey.LEXICON_EXPLAIN, label: '词汇解释' },
  { value: CapabilityKey.GRAMMAR_ANALYZE, label: '语法分析' },
  { value: CapabilityKey.TRANSLATION_ANALYZE, label: '翻译分析' },
  { value: CapabilityKey.READING_COMPOSE, label: '生成阅读' },
  { value: CapabilityKey.PRACTICE_GENERATE, label: '生成练习' },
  { value: CapabilityKey.STUDY_COACH, label: '学习规划' },
] as const;

export type AgentCapabilitySelection = CapabilityKey | CapabilitySelection.AUTO;

export function AgentMessageComposer({
  initialCapability = CapabilitySelection.AUTO,
  initialContent = '',
  pending,
  error,
  assets,
  capabilities,
  contextItems,
  onAddContext,
  onRemoveContext,
  onAssetUploaded,
  onSubmit,
}: {
  initialCapability?: AgentCapabilitySelection;
  initialContent?: string;
  pending: boolean;
  error?: string;
  assets: readonly AgentAssetView[];
  capabilities: readonly AgentCapabilityView[];
  contextItems: readonly AgentComposerContextItem[];
  onAddContext: (item: AgentComposerContextItem) => void;
  onRemoveContext: (key: string) => void;
  onAssetUploaded: (assetId: string, revisionId: string) => void;
  onSubmit: (
    content: string,
    capability: AgentCapabilitySelection,
    execution: AgentExecutionSelectionInput,
  ) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [capability, setCapability] =
    useState<AgentCapabilitySelection>(initialCapability);
  const routes = useMemo(
    () => availableRoutes(capabilities, capability),
    [capabilities, capability],
  );
  const [routeId, setRouteId] = useState('');
  const route = routes.find((candidate) => candidate.id === routeId);
  const credentials = useMemo(
    () =>
      route
        ? availableCredentials(capabilities, capability, route.providerKey)
        : [],
    [capabilities, capability, route],
  );
  const [credentialChoice, setCredentialChoice] = useState('');

  useEffect(() => setContent(initialContent), [initialContent]);
  useEffect(() => setCapability(initialCapability), [initialCapability]);

  useEffect(() => {
    if (!routes.some((candidate) => candidate.id === routeId)) {
      setRouteId(routes[0]?.id ?? '');
    }
  }, [routeId, routes]);

  useEffect(() => {
    const choices = [
      ...(route?.platformCredentialAvailable
        ? [AgentCredentialSource.PLATFORM]
        : []),
      ...credentials.map(({ profileId }) => userCredentialChoice(profileId)),
    ];
    if (!choices.includes(credentialChoice)) {
      setCredentialChoice(choices[0] ?? '');
    }
  }, [credentialChoice, credentials, route?.platformCredentialAvailable]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = content.trim();
    if (!normalized || pending || !route || !credentialChoice) return;
    onSubmit(
      normalized,
      capability,
      credentialChoice === AgentCredentialSource.PLATFORM
        ? {
            providerRouteReleaseId: route.id,
            credentialSource: AgentCredentialSource.PLATFORM,
          }
        : {
            providerRouteReleaseId: route.id,
            credentialSource: AgentCredentialSource.USER,
            credentialProfileId: credentialChoice.slice('USER:'.length),
          },
    );
    setContent('');
  };
  return (
    <form className="agent-composer" onSubmit={submit}>
      <AgentContextSelection items={contextItems} onRemove={onRemoveContext} />
      <AgentAssetProcessingStatus
        compact
        assets={assets.slice(0, 5)}
        onSelect={onAddContext}
      />
      <textarea
        aria-label="给 Agent 的消息"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="输入消息"
      />
      <div className="agent-composer__actions">
        <div>
          <AgentAssetUploader onUploaded={onAssetUploaded} />
          <Select
            aria-label="能力"
            value={capability}
            onChange={(event) =>
              setCapability(event.target.value as AgentCapabilitySelection)
            }
          >
            {capabilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="模型"
            value={routeId}
            onChange={(event) => setRouteId(event.target.value)}
          >
            {routes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.providerKey} · {option.modelId}
              </option>
            ))}
          </Select>
          <Select
            aria-label="额度与凭证"
            value={credentialChoice}
            onChange={(event) => setCredentialChoice(event.target.value)}
          >
            {route?.platformCredentialAvailable ? (
              <option value={AgentCredentialSource.PLATFORM}>平台额度</option>
            ) : null}
            {credentials.map((credential) => (
              <option
                key={credential.profileId}
                value={userCredentialChoice(credential.profileId)}
              >
                {credential.label} · {credential.maskedHint}
              </option>
            ))}
          </Select>
        </div>
        <Button
          icon={Send}
          type="submit"
          disabled={pending || !content.trim() || !routeId || !credentialChoice}
        >
          发送
        </Button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

interface AgentRouteOption {
  id: string;
  providerKey: string;
  modelId: string;
  platformCredentialAvailable: boolean;
}

function selectedCapabilities(
  capabilities: readonly AgentCapabilityView[],
  capability: AgentCapabilitySelection,
): readonly AgentCapabilityView[] {
  return capability === CapabilitySelection.AUTO
    ? capabilities
    : capabilities.filter((item) => item.capabilityKey === capability);
}

function availableRoutes(
  capabilities: readonly AgentCapabilityView[],
  capability: AgentCapabilitySelection,
): readonly AgentRouteOption[] {
  const routes = new Map<string, AgentRouteOption>();
  for (const item of selectedCapabilities(capabilities, capability)) {
    for (const allowance of item.allowedRoutes) {
      const existing = routes.get(allowance.route.id);
      routes.set(allowance.route.id, {
        ...allowance.route,
        platformCredentialAvailable:
          allowance.platformCredentialAvailable ||
          existing?.platformCredentialAvailable === true,
      });
    }
  }
  return [...routes.values()];
}

function availableCredentials(
  capabilities: readonly AgentCapabilityView[],
  capability: AgentCapabilitySelection,
  providerKey: string,
) {
  const credentials = new Map<
    string,
    AgentCapabilityView['credentials'][number]
  >();
  for (const item of selectedCapabilities(capabilities, capability)) {
    for (const credential of item.credentials) {
      if (credential.providerKey === providerKey) {
        credentials.set(credential.profileId, credential);
      }
    }
  }
  return [...credentials.values()];
}

function userCredentialChoice(profileId: string): string {
  return `USER:${profileId}`;
}
