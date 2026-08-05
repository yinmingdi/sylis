import type {
  StructuredGenerationIdentity,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "../contracts/index";
import type { StructuredGenerationPort } from "../ports/index";

export class FakeStructuredGenerationPort implements StructuredGenerationPort {
  readonly requests: StructuredGenerationRequest[] = [];
  probeCount = 0;

  constructor(
    private readonly handler: (
      request: StructuredGenerationRequest,
    ) => unknown | Promise<unknown>,
    private readonly identity: StructuredGenerationIdentity = {
      provider: "fake",
      model: "fixture",
    },
  ) {}

  async probe(): Promise<StructuredGenerationIdentity> {
    this.probeCount += 1;
    return this.identity;
  }

  async generate<T>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    this.requests.push(request);
    return {
      value: (await this.handler(request)) as T,
      provider: this.identity.provider,
      model: this.identity.model,
      providerRequestId: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 },
    };
  }
}
