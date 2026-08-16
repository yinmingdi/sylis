import {
  AgentCredentialSource,
  AgentExecutionMode,
  CapabilityKey,
  type AgentCapabilityView,
} from '@sylis/api-client/agent';
import { describe, expect, it } from 'vitest';

import { defaultAgentExecutionSelection } from './execution-selection';

function capability(
  platformCredentialAvailable: boolean,
  credentials: AgentCapabilityView['credentials'] = [],
): AgentCapabilityView {
  return {
    capabilityKey: CapabilityKey.READING_COMPOSE,
    version: '1',
    executionMode: AgentExecutionMode.WORKFLOW,
    releaseDigest: 'sha256:test',
    allowedRoutes: [
      {
        route: { id: 'route-1', providerKey: 'deepseek', modelId: 'model-1' },
        platformCredentialAvailable,
      },
    ],
    credentials,
  };
}

describe('defaultAgentExecutionSelection', () => {
  it('uses platform quota first when the route allows it', () => {
    expect(
      defaultAgentExecutionSelection(
        [capability(true)],
        CapabilityKey.READING_COMPOSE,
      ),
    ).toEqual({
      providerRouteReleaseId: 'route-1',
      credentialSource: AgentCredentialSource.PLATFORM,
    });
  });

  it('falls back to the learner credential for the same provider', () => {
    expect(
      defaultAgentExecutionSelection(
        [
          capability(false, [
            {
              profileId: 'credential-1',
              currentRevisionId: 'revision-1',
              providerKey: 'deepseek',
              source: AgentCredentialSource.USER,
              label: 'Personal',
              maskedHint: 'sk-***',
              expiresAt: null,
              validatedAt: '2026-08-11T00:00:00.000Z',
            },
          ]),
        ],
        CapabilityKey.READING_COMPOSE,
      ),
    ).toEqual({
      providerRouteReleaseId: 'route-1',
      credentialSource: AgentCredentialSource.USER,
      credentialProfileId: 'credential-1',
    });
  });

  it('returns null when no allowed execution credential exists', () => {
    expect(
      defaultAgentExecutionSelection(
        [capability(false)],
        CapabilityKey.READING_COMPOSE,
      ),
    ).toBeNull();
  });
});
