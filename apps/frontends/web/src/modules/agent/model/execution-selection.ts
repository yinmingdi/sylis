import {
  AgentCredentialSource,
  type AgentCapabilityView,
  type AgentExecutionSelectionInput,
  type CapabilityKey,
} from '@sylis/api-client/agent';

export interface AgentRouteOption {
  id: string;
  providerKey: string;
  modelId: string;
  platformCredentialAvailable: boolean;
}

export function availableAgentRoutes(
  capabilities: readonly AgentCapabilityView[],
  capability: CapabilityKey,
): readonly AgentRouteOption[] {
  const routes = new Map<string, AgentRouteOption>();
  for (const item of capabilities.filter(
    (candidate) => candidate.capabilityKey === capability,
  )) {
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

export function availableAgentCredentials(
  capabilities: readonly AgentCapabilityView[],
  capability: CapabilityKey,
  providerKey: string,
): readonly AgentCapabilityView['credentials'][number][] {
  const credentials = new Map<
    string,
    AgentCapabilityView['credentials'][number]
  >();
  for (const item of capabilities.filter(
    (candidate) => candidate.capabilityKey === capability,
  )) {
    for (const credential of item.credentials) {
      if (credential.providerKey === providerKey) {
        credentials.set(credential.profileId, credential);
      }
    }
  }
  return [...credentials.values()];
}

export function defaultAgentExecutionSelection(
  capabilities: readonly AgentCapabilityView[],
  capability: CapabilityKey,
): AgentExecutionSelectionInput | null {
  for (const route of availableAgentRoutes(capabilities, capability)) {
    if (route.platformCredentialAvailable) {
      return {
        providerRouteReleaseId: route.id,
        credentialSource: AgentCredentialSource.PLATFORM,
      };
    }
    const credential = availableAgentCredentials(
      capabilities,
      capability,
      route.providerKey,
    )[0];
    if (credential) {
      return {
        providerRouteReleaseId: route.id,
        credentialSource: AgentCredentialSource.USER,
        credentialProfileId: credential.profileId,
      };
    }
  }
  return null;
}
