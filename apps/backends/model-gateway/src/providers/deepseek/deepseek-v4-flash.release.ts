import { ModelCapabilityKind, ModelEndpointClass } from "@sylis/database";
import { canonicalJson, stableUuid } from "@sylis/utils";
import { createHash } from "node:crypto";

export enum DeepSeekProviderRouteReleaseVersion {
  V4_FLASH_2026_08_13 = "deepseek-v4-flash/2026-08-13",
}

export enum DeepSeekProviderRouteAdapterVersion {
  OPENAI_CHAT_V1 = "deepseek-chat-completions/1",
}

export enum DeepSeekProviderRoutePricingVersion {
  V4_USD_2026_08_13 = "deepseek-v4-2026-08-13-usd/1",
}

export enum DeepSeekProviderRoutePolicyVersion {
  NON_THINKING_STRICT_TOOLS_V1 = "deepseek-nonthinking-strict-tools/1",
}

export interface ProviderRouteReleaseDigestInput {
  providerKey: string;
  modelId: string;
  endpointClass: ModelEndpointClass;
  capabilities: readonly ModelCapabilityKind[];
  adapterVersion: string;
  pricingVersion: string;
  pricing: Readonly<Record<string, string>>;
  policyVersion: string;
}

export interface DeepSeekProviderRouteRelease
  extends ProviderRouteReleaseDigestInput {
  id: string;
  version: DeepSeekProviderRouteReleaseVersion;
  releaseDigest: string;
}

const releaseContent = {
  providerKey: "deepseek",
  modelId: "deepseek-v4-flash",
  endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
  capabilities: [
    ModelCapabilityKind.TEXT_GENERATION,
    ModelCapabilityKind.STRUCTURED_GENERATION,
  ],
  adapterVersion: DeepSeekProviderRouteAdapterVersion.OPENAI_CHAT_V1,
  pricingVersion: DeepSeekProviderRoutePricingVersion.V4_USD_2026_08_13,
  pricing: {
    currency: "USD",
    inputUsdPerMillion: "0.14",
    outputUsdPerMillion: "0.28",
    cacheHitUsdPerMillion: "0.0028",
  },
  policyVersion:
    DeepSeekProviderRoutePolicyVersion.NON_THINKING_STRICT_TOOLS_V1,
} as const satisfies ProviderRouteReleaseDigestInput;

const releaseDigest = providerRouteReleaseDigest(releaseContent);

export const DEEPSEEK_V4_FLASH_ROUTE_RELEASE: DeepSeekProviderRouteRelease = {
  id: stableUuid(`sylis.provider-route-release/1\u001f${releaseDigest}`),
  version: DeepSeekProviderRouteReleaseVersion.V4_FLASH_2026_08_13,
  ...releaseContent,
  releaseDigest,
};

export function providerRouteReleaseDigest(
  input: ProviderRouteReleaseDigestInput,
): string {
  return `sha256:${createHash("sha256")
    .update(
      canonicalJson({
        releaseKind: "PROVIDER_ROUTE",
        providerKey: input.providerKey,
        modelId: input.modelId,
        endpointClass: input.endpointClass,
        capabilities: [...input.capabilities].sort(),
        adapterVersion: input.adapterVersion,
        pricingVersion: input.pricingVersion,
        pricing: input.pricing,
        policyVersion: input.policyVersion,
      }),
    )
    .digest("hex")}`;
}
