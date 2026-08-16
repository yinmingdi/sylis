import { ModelCapabilityKind, ModelEndpointClass } from "@sylis/database";
import { describe, expect, it } from "vitest";

import {
  DEEPSEEK_V4_FLASH_ROUTE_RELEASE,
  DeepSeekProviderRouteAdapterVersion,
  DeepSeekProviderRoutePolicyVersion,
  DeepSeekProviderRoutePricingVersion,
  providerRouteReleaseDigest,
} from "../src/providers/deepseek/deepseek-v4-flash.release";
import { assertLocalDeepSeekOperation } from "../src/providers/deepseek/publish-deepseek-route";

describe("DeepSeek V4 Flash route release", () => {
  it("pins the provider contract, capabilities, and current pricing snapshot", () => {
    expect(DEEPSEEK_V4_FLASH_ROUTE_RELEASE).toMatchObject({
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
    });
    expect(providerRouteReleaseDigest(DEEPSEEK_V4_FLASH_ROUTE_RELEASE)).toBe(
      DEEPSEEK_V4_FLASH_ROUTE_RELEASE.releaseDigest,
    );
  });

  it("allows only an explicit local development runtime", () => {
    expect(() => assertLocalDeepSeekOperation({})).not.toThrow();
    expect(() =>
      assertLocalDeepSeekOperation({ NODE_ENV: "production" }),
    ).toThrow("LOCAL_DEEPSEEK_OPERATION_FORBIDDEN");
    expect(() =>
      assertLocalDeepSeekOperation({
        NODE_ENV: "development",
        RAILWAY_ENVIRONMENT_ID: "railway-environment",
      }),
    ).toThrow("LOCAL_DEEPSEEK_OPERATION_FORBIDDEN");
  });
});
