import {
  ImmutableReleaseStatus,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";

import {
  DEEPSEEK_V4_FLASH_ROUTE_RELEASE,
  providerRouteReleaseDigest,
} from "./deepseek-v4-flash.release";

export interface PublishedDeepSeekRoute {
  id: string;
  providerKey: string;
  modelId: string;
  releaseDigest: string;
  status: ImmutableReleaseStatus;
}

export async function publishLocalDeepSeekRoute(
  database: SylisDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublishedDeepSeekRoute> {
  assertLocalDeepSeekOperation(env);
  const manifest = DEEPSEEK_V4_FLASH_ROUTE_RELEASE;
  return database.$transaction(async (transaction) => {
    const existing = await transaction.providerRouteRelease.findUnique({
      where: { id: manifest.id },
    });
    if (existing) {
      const actualDigest = providerRouteReleaseDigest({
        providerKey: existing.providerKey,
        modelId: existing.modelId,
        endpointClass: existing.endpointClass,
        capabilities: existing.capabilities,
        adapterVersion: existing.adapterVersion,
        pricingVersion: existing.pricingVersion,
        pricing: existing.pricing as Readonly<Record<string, string>>,
        policyVersion: existing.policyVersion,
      });
      if (
        existing.releaseDigest !== manifest.releaseDigest ||
        actualDigest !== manifest.releaseDigest
      ) {
        throw new Error("DEEPSEEK_ROUTE_RELEASE_CONTENT_CONFLICT");
      }
      if (existing.status === ImmutableReleaseStatus.REVOKED) {
        throw new Error("DEEPSEEK_ROUTE_RELEASE_REVOKED");
      }
      if (existing.status === ImmutableReleaseStatus.DRAFT) {
        await transaction.providerRouteRelease.update({
          where: { id: existing.id },
          data: { status: ImmutableReleaseStatus.CANDIDATE },
        });
      }
      if (existing.status !== ImmutableReleaseStatus.PUBLISHED) {
        return publicRoute(
          await transaction.providerRouteRelease.update({
            where: { id: existing.id },
            data: { status: ImmutableReleaseStatus.PUBLISHED },
          }),
        );
      }
      return publicRoute(existing);
    }

    await transaction.providerRouteRelease.create({
      data: {
        id: manifest.id,
        providerKey: manifest.providerKey,
        modelId: manifest.modelId,
        endpointClass: manifest.endpointClass,
        capabilities: [...manifest.capabilities],
        adapterVersion: manifest.adapterVersion,
        pricingVersion: manifest.pricingVersion,
        pricing: manifest.pricing as PrismaTypes.InputJsonValue,
        policyVersion: manifest.policyVersion,
        releaseDigest: manifest.releaseDigest,
        status: ImmutableReleaseStatus.DRAFT,
      },
    });
    await transaction.providerRouteRelease.update({
      where: { id: manifest.id },
      data: { status: ImmutableReleaseStatus.CANDIDATE },
    });
    return publicRoute(
      await transaction.providerRouteRelease.update({
        where: { id: manifest.id },
        data: { status: ImmutableReleaseStatus.PUBLISHED },
      }),
    );
  });
}

export function assertLocalDeepSeekOperation(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const nodeEnvironment = env.NODE_ENV?.trim() || "development";
  if (nodeEnvironment !== "development" || env.RAILWAY_ENVIRONMENT_ID) {
    throw new Error("LOCAL_DEEPSEEK_OPERATION_FORBIDDEN");
  }
}

function publicRoute(route: PublishedDeepSeekRoute): PublishedDeepSeekRoute {
  return {
    id: route.id,
    providerKey: route.providerKey,
    modelId: route.modelId,
    releaseDigest: route.releaseDigest,
    status: route.status,
  };
}
