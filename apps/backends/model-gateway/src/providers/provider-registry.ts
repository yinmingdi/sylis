import { Injectable } from "@nestjs/common";

import { AnthropicAdapter } from "./anthropic/anthropic.adapter";
import type { ProviderAdapter } from "./contracts";
import { DeepSeekAdapter } from "./deepseek/deepseek.adapter";
import { FakeProviderAdapter } from "./fake/fake.adapter";
import { GeminiAdapter } from "./gemini/gemini.adapter";
import { OpenAiAdapter } from "./openai/openai.adapter";

@Injectable()
export class ProviderRegistry {
  constructor(
    private readonly deepSeek: DeepSeekAdapter,
    private readonly openAi: OpenAiAdapter,
    private readonly anthropic: AnthropicAdapter,
    private readonly gemini: GeminiAdapter,
    private readonly fake: FakeProviderAdapter,
  ) {}

  resolve(providerKey: string): ProviderAdapter {
    if (providerKey === "deepseek") return this.deepSeek;
    if (providerKey === "openai") return this.openAi;
    if (providerKey === "anthropic") return this.anthropic;
    if (providerKey === "gemini") return this.gemini;
    if (providerKey === "fake") return this.fake;
    throw new Error(`PROVIDER_UNSUPPORTED:${providerKey}`);
  }
}
