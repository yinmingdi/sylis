import {
  AgentResourceKind,
  type AgentArtifactRevisionView,
  type AgentArtifactView,
} from '@sylis/api-client/agent';

import { contextItem, type AgentComposerContextItem } from './composer-state';

export function artifactContextSelection(
  artifact: AgentArtifactView,
  revision: AgentArtifactRevisionView,
): AgentComposerContextItem {
  return contextItem(artifact.title, `成果版本 ${revision.revisionNo}`, {
    kind: AgentResourceKind.AGENT_ARTIFACT_REVISION,
    id: artifact.id,
    revisionId: revision.id,
    contentHash: revision.contentHash,
  });
}
