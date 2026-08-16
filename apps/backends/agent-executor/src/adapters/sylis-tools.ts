import type { AgentToolExecutionInput } from "@sylis/agent-contracts";

export class SylisTools {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async execute(
    userId: string,
    directive: AgentToolExecutionInput,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/agent-tools/executions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId,
          toolKey: directive.toolKey,
          toolCallId: directive.toolCallId,
          actionDigest: directive.actionDigest,
          arguments: {
            ...directive.input,
            __schemaVersion: directive.schemaVersion,
          },
        }),
        signal,
      },
    );
    if (!response.ok) throw new Error(`SYLIS_TOOL_HTTP_${response.status}`);
    return (await response.json()) as Readonly<Record<string, unknown>>;
  }
}
