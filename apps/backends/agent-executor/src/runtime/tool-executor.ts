import {
  AgentToolKey,
  type AgentToolExecutionInput,
} from "@sylis/agent-contracts";

import { PublicWebTools } from "../adapters/public-web-tools";
import { SylisTools } from "../adapters/sylis-tools";

const PUBLIC_WEB_TOOL_KEYS = new Set<AgentToolKey>([
  AgentToolKey.WEB_SEARCH,
  AgentToolKey.WEB_PAGE_READ,
]);

export class AgentToolExecutor {
  constructor(
    private readonly publicWeb: PublicWebTools,
    private readonly sylis: SylisTools,
  ) {}

  execute(
    userId: string,
    directive: AgentToolExecutionInput,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    return PUBLIC_WEB_TOOL_KEYS.has(directive.toolKey)
      ? this.publicWeb.execute(directive)
      : this.sylis.execute(userId, directive, signal);
  }
}
