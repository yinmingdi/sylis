import {
  type AgentContextSnapshotInput,
  type CapabilityKey,
} from '@sylis/api-client/agent';
import { Bot } from '@sylis/components';
import { Link } from 'react-router-dom';

import { agentContextHref } from '../model/composer-state';

export function AgentContextLink({
  capability,
  label,
  detail,
  contextRef,
}: {
  capability?: CapabilityKey;
  label: string;
  detail: string;
  contextRef: AgentContextSnapshotInput['refs'][number];
}) {
  return (
    <Link
      className="sy-button sy-button--secondary agent-context-link"
      to={agentContextHref({ capability, label, detail, ref: contextRef })}
    >
      <Bot aria-hidden="true" size={17} strokeWidth={1.8} />
      <span>询问 Agent</span>
    </Link>
  );
}
